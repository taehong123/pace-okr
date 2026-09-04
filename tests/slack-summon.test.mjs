import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
function compile(source, dependencies = {}) {
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const loaded = { exports: {} };
  new Function("require", "module", "exports", compiled)((name) => name in dependencies ? dependencies[name] : require(name), loaded, loaded.exports);
  return loaded.exports;
}
const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const commands = compile(await read("lib/slack-summon-command.ts"));
const oauth = compile(await read("lib/slack-oauth.ts"), { "@/lib/slack-summon-command": commands });
const handlerSource = await read("lib/slack-summon.ts");
const routeSource = await read("app/api/slack/events/route.ts");
const interactionsSource = await read("app/api/slack/interactions/route.ts");
const signingSecret = "test-signing-secret";
const baseEvent = { type: "message", channel_type: "channel", channel: "C123", user: "U123", text: "!테스크생성 고객 인터뷰 정리", ts: "1788310800.000001" };

test("Slack OAuth keeps callback cookies on both official domains", () => {
  const runtime = { SLACK_OAUTH_REDIRECT_URI: "https://okri.ai/api/slack/callback" };
  assert.equal(oauth.slackRedirectUri(runtime, new Request("https://okri.ai/api/slack/auth")), "https://okri.ai/api/slack/callback");
  assert.equal(oauth.slackRedirectUri(runtime, new Request("https://okrptr.com/api/slack/auth")), "https://okrptr.com/api/slack/callback");
  assert.equal(oauth.slackRedirectUri(runtime, new Request("http://localhost/api/slack/auth")), "https://okri.ai/api/slack/callback");
});

function signedRequest(body, options = {}) {
  const rawBody = typeof body === "string" ? body : JSON.stringify(body);
  const timestamp = options.timestamp ?? String(Math.floor(Date.now() / 1000));
  const signature = options.signature ?? `v0=${createHmac("sha256", signingSecret).update(`v0:${timestamp}:${rawBody}`).digest("hex")}`;
  return new Request("https://okri.ai/api/slack/events", {
    method: "POST", headers: { "x-slack-request-timestamp": timestamp, "x-slack-signature": signature }, body: rawBody,
  });
}

function fixture(t, options = {}) {
  const db = new DatabaseSync(":memory:");
  t.after(() => db.close());
  db.exec(`CREATE TABLE slack_event_receipts (event_id TEXT PRIMARY KEY, team_id TEXT, event_type TEXT, received_at TEXT);
    CREATE TABLE items (id TEXT PRIMARY KEY, owner_id TEXT, kind TEXT, title TEXT, source_ref TEXT);`);
  const d1 = { prepare(sql) {
    const bind = (...values) => ({
      async first() { return db.prepare(sql).get(...values) ?? null; },
      async run() { return { meta: { changes: Number(db.prepare(sql).run(...values).changes) } }; },
    });
    return { bind, ...bind() };
  } };
  const connection = { ownerId: "workspace-a", teamId: "T123", botUserId: "UBOT", userId: "installer" };
  const jobs = [];
  const calls = { creates: [], replies: [], links: [], delivered: [], reconciled: [], writeChecks: [], projectForms: [], connectionLookups: 0 };
  const env = { DB: d1, SLACK_SIGNING_SECRET: signingSecret, SLACK_CLIENT_ID: "test", SLACK_CLIENT_SECRET: "test", SLACK_TOKEN_ENCRYPTION_KEY: "test" };
  const cloudflare = { env, waitUntil: (job) => jobs.push(job) };
  const daily = {
    slackTokenForConnection: async () => "test-token",
    dailyMemberBySlack: async () => options.unlinked ? null : { memberId: "member-a", authorization: { ownerId: options.ownerId ?? "workspace-a", userId: "caller", role: options.role ?? "member" } },
    createSlackMemberLinkUrl: async (...args) => { calls.links.push(args); return "https://okri.ai/?slack_link=PRIVATE_LINK_TOKEN"; },
    slackApi: async (_token, method, body) => {
      calls.replies.push({ method, body });
      if (options.replyError && method === "chat.postMessage") throw new Error("internal Slack error with secret");
      if (options.denialReplyError && body.text.includes("생성할 권한")) throw new Error("permission reply failed");
      return { ok: true };
    },
    handleDeliveredDailyReminder: async (input) => { calls.delivered.push(input); },
    reconcileDailyReminders: async (ownerId) => { calls.reconciled.push(ownerId); },
  };
  const data = {
    async getSlackConnectionByTeam(teamId) {
      calls.connectionLookups++;
      if (options.connectionGate) await options.connectionGate;
      return options.disconnected || teamId !== connection.teamId ? null : connection;
    },
    async createItem(ownerId, input) {
      calls.creates.push({ ownerId, input });
      if (options.createError === "before") throw new Error("private database error");
      const item = { id: `task-${calls.creates.length}`, title: input.title };
      db.prepare("INSERT INTO items VALUES (?, ?, ?, ?, ?)").run(item.id, ownerId, input.kind, item.title, input.sourceRef);
      if (options.createError === "after") throw new Error("notification failed after insert");
      return item;
    },
  };
  const billing = { memberCanWrite: async (...args) => { calls.writeChecks.push(args); return options.editor !== false; } };
  const projectForms = { handleSlackProjectInteraction: async () => null, offerSlackProjectForm: async (...args) => { calls.projectForms.push(args); } };
  const dependencies = { "cloudflare:workers": cloudflare, "@/lib/pace-data": data, "@/lib/billing": billing, "@/lib/slack-daily": daily, "@/lib/slack-summon-command": commands, "@/lib/slack-oauth": oauth, "@/lib/slack-project-drafts": projectForms };
  const handler = compile(handlerSource, dependencies);
  const route = compile(routeSource, { ...dependencies, "@/lib/slack-summon": handler });
  const interactions = compile(interactionsSource, { ...dependencies, "@/lib/daily-bot": {} });
  const envelope = (event = {}, eventId = "Ev1", teamId = "T123") => ({ type: "event_callback", event_id: eventId, team_id: teamId, event: { ...baseEvent, ...event } });
  async function settle() { while (jobs.length) await jobs.shift(); }
  async function deliver(event = {}, eventId = "Ev1", teamId = "T123") {
    const response = await route.POST(signedRequest(envelope(event, eventId, teamId)));
    await settle();
    assert.equal(response.status, 200);
    return response;
  }
  return { db, d1, env, jobs, calls, route, interactions, deliver, settle, envelope };
}

test("Summon aliases share one command and preserve multiline descriptions", () => {
  for (const alias of commands.slackSummonAliases) {
    assert.deepEqual(commands.parseSlackSummonCommand(` ${alias} A &amp; B\n상세 설명\n두 번째 줄 `), { kind: "create_task", title: "A & B", description: "상세 설명\n두 번째 줄" });
  }
  assert.equal(commands.parseSlackSummonCommand("!TASK English title").title, "English title");
  assert.equal(commands.parseSlackSummonCommand("<@UBOT> !task hi", "UBOT").title, "hi");
  assert.equal(commands.parseSlackSummonCommand("<@UOTHER> !task hi", "UBOT"), null);
});

test("Only an explicit leading command creates a task", () => {
  for (const input of ["normal chatter", "please !task hi", "`!task hi`", "> !task hi", "```\n!task hi\n```", "!taskforce hi", "!task생성 hi", "!unknown hi"]) assert.equal(commands.parseSlackSummonCommand(input), null, input);
  for (const input of ["!task", "!테스크생성", "!task\nNo title", "!소환봇", "!okri"]) assert.equal(commands.parseSlackSummonCommand(input).kind, "help");
  assert.equal(commands.parseSlackSummonCommand(`!task ${"a".repeat(241)}`).kind, "invalid");
  assert.equal(commands.parseSlackSummonCommand(`!task ${"가".repeat(240)}`).kind, "create_task");
  assert.equal(commands.parseSlackSummonCommand(`!task title\n${"a".repeat(8001)}`).kind, "invalid");
  assert.equal(commands.parseSlackSummonCommand("!task bad\u0000title").kind, "invalid");
});

test("Authentic signed challenge is accepted; forged, old and malformed requests are rejected", async (t) => {
  const f = fixture(t);
  const response = await f.route.POST(signedRequest({ type: "url_verification", challenge: "verified" }));
  assert.deepEqual(await response.json(), { challenge: "verified" });
  assert.equal((await f.route.POST(signedRequest(f.envelope(), { signature: "v0=forged" }))).status, 401);
  assert.equal((await f.route.POST(signedRequest(f.envelope(), { timestamp: String(Math.floor(Date.now() / 1000) - 301) }))).status, 401);
  for (const raw of ["{", "null", "[]", '{"type":"event_callback","event":{"type":"message","text":123}}']) assert.equal((await f.route.POST(signedRequest(raw))).status, 400);
  assert.equal(f.jobs.length, 0);
  assert.equal(f.calls.connectionLookups, 0);
  f.env.SLACK_CLIENT_ID = "";
  assert.equal((await f.route.POST(signedRequest(f.envelope()))).status, 503);
});

test("ACK does not wait for database or Slack I/O", async (t) => {
  let release;
  const f = fixture(t, { connectionGate: new Promise((resolve) => { release = resolve; }) });
  const response = await f.route.POST(signedRequest(f.envelope()));
  assert.equal(response.status, 200);
  assert.equal(f.calls.creates.length, 0);
  assert.equal(f.jobs.length, 1);
  release();
  await f.settle();
  assert.equal(f.calls.creates.length, 1);
});

test("Channel command records caller, source and description, and replies in the source thread", async (t) => {
  const f = fixture(t);
  await f.deliver({ text: "!테스크생성 인터뷰 정리\n참여자 의견 기록" });
  assert.deepEqual(f.calls.creates, [{ ownerId: "workspace-a", input: {
    kind: "task", title: "인터뷰 정리", description: "참여자 의견 기록", source: "slack",
    sourceRef: "slack:summon:T123:C123:1788310800.000001", createdByUserId: "caller",
  } }]);
  const { method, body } = f.calls.replies[0];
  assert.equal(method, "chat.postMessage");
  assert.equal(body.thread_ts, baseEvent.ts);
  assert.equal(body.channel, "C123");
  assert.equal(body.unfurl_links, false);
  assert.equal(body.blocks[0].text.type, "plain_text");
  const taskUrl = new URL(body.blocks[1].elements[0].url);
  assert.equal(taskUrl.origin, "https://okri.ai");
  assert.equal(taskUrl.searchParams.get("task"), "task-1");
  assert.equal(taskUrl.searchParams.get("view"), "work");
  assert.equal(f.calls.reconciled.length, 0);
});

test("Project command offers a form rather than creating an incomplete item", async (t) => {
  for (const alias of commands.slackProjectAliases) {
    assert.deepEqual(commands.parseSlackSummonCommand(alias), { kind: "create_project", title: "", description: "" });
    assert.equal(commands.parseSlackSummonCommand(`${alias} 온보딩 개선`).title, "온보딩 개선");
  }
  const f = fixture(t);
  await f.deliver({ text: "!프로젝트생성 온보딩 개선" });
  assert.equal(f.calls.creates.length, 0);
  assert.equal(f.calls.projectForms.length, 1);
  assert.equal(f.calls.projectForms[0][1].userId, "caller");
});

test("Private channels, existing threads, mentions and bot DMs use the same creation path", async (t) => {
  const f = fixture(t);
  for (const [index, event] of [
    { channel: "G123", channel_type: "group", thread_ts: "1788310000.000009" },
    { channel: "D123", channel_type: "im" },
    { type: "app_mention", text: "<@UBOT> !task Mentioned task" },
  ].entries()) await f.deliver({ ...event, ts: `1788310800.00000${index + 2}` }, `Ev${index + 2}`);
  assert.equal(f.calls.creates.length, 3);
  assert.equal(f.calls.replies[0].body.thread_ts, "1788310000.000009");
  assert.equal(f.calls.replies[1].body.channel, "D123");
});

test("Retries and overlapping message/app_mention events cannot create a second task", async (t) => {
  const f = fixture(t);
  const text = "<@UBOT> !task Exactly one";
  const first = f.route.POST(signedRequest(f.envelope({ text }, "Ev1")));
  const second = f.route.POST(signedRequest(f.envelope({ type: "app_mention", text }, "Ev2")));
  await Promise.all([first, second]);
  await f.settle();
  await f.deliver({ text }, "Ev1");
  assert.equal(f.calls.creates.length, 1);
  assert.equal(f.calls.replies.length, 1);
  assert.equal(f.db.prepare("SELECT count(*) AS n FROM slack_event_receipts").get().n, 1);
  await f.deliver({ text, ts: "1788310800.000099" }, "Ev3");
  assert.equal(f.calls.creates.length, 2, "A new intentional command may have the same title");
});

test("Ordinary channel messages, bots, edits, deleted and malformed messages are ignored", async (t) => {
  const f = fixture(t);
  for (const [index, event] of [
    { text: "normal channel chatter" }, { bot_id: "B123" }, { subtype: "message_changed" },
    { subtype: "message_deleted" }, { hidden: true }, { ts: "" }, { user: "" },
    { type: "reaction_added" }, { text: "<@UOTHER> !task hi" }, { user: "UBOT" },
  ].entries()) await f.deliver(event, `Ev${index}`);
  assert.equal(f.calls.creates.length, 0);
  assert.equal(f.calls.replies.length, 0);
  assert.equal(f.calls.reconciled.length, 0);
  assert.equal(f.db.prepare("SELECT count(*) AS n FROM slack_event_receipts").get().n, 0);
});

test("Unlinked users get a private one-time link, never a public token or task", async (t) => {
  const f = fixture(t, { unlinked: true });
  await f.deliver();
  assert.equal(f.calls.creates.length, 0);
  assert.equal(f.calls.links.length, 1);
  const reply = f.calls.replies[0];
  assert.equal(reply.method, "chat.postEphemeral");
  assert.equal(reply.body.user, "U123");
  assert.equal(reply.body.thread_ts, undefined, "Do not hide the link in a thread that does not exist yet");
  assert.match(reply.body.blocks[1].elements[0].url, /PRIVATE_LINK_TOKEN/);
  assert.ok(!f.calls.replies.some((entry) => entry.method === "chat.postMessage"));
});

test("Private help replies preserve an already active thread", async (t) => {
  const f = fixture(t);
  await f.deliver({ text: "!소환봇", thread_ts: "1788310000.000009" });
  assert.equal(f.calls.replies[0].method, "chat.postEphemeral");
  assert.equal(f.calls.replies[0].body.thread_ts, "1788310000.000009");
});

for (const [name, options] of [["Viewer", { role: "viewer" }], ["Unknown role", { role: "guest" }], ["Other workspace member", { ownerId: "workspace-b" }]]) {
  test(`${name} cannot create or receive task details`, async (t) => {
    const f = fixture(t, options);
    await f.deliver();
    assert.equal(f.calls.creates.length, 0);
    assert.equal(f.calls.replies[0].method, "chat.postEphemeral");
    assert.match(f.calls.replies[0].body.text, /권한/);
  });
}

test("A failed permission-denied reply cannot fall through to saved task recovery", async (t) => {
  const f = fixture(t, { role: "viewer", denialReplyError: true });
  f.db.prepare("INSERT INTO items VALUES (?, ?, ?, ?, ?)").run("old-task", "workspace-a", "task", "private saved title", commands.slackSummonSourceRef("T123", baseEvent));
  await f.deliver();
  assert.equal(f.calls.creates.length, 0);
  assert.ok(f.calls.replies.every((reply) => reply.method === "chat.postEphemeral"));
  assert.doesNotMatch(JSON.stringify(f.calls.replies), /private saved title/);
});

test("Plan-level read-only editor cannot bypass the web/API policy through Slack", async (t) => {
  const f = fixture(t, { editor: false });
  await f.deliver();
  assert.deepEqual(f.calls.writeChecks, [["workspace-a", "caller", "member"]]);
  assert.equal(f.calls.creates.length, 0);
  assert.equal(f.calls.replies[0].method, "chat.postEphemeral");
  assert.match(f.calls.replies[0].body.text, /플랜에서 읽기 전용/);
});

for (const role of ["owner", "admin"]) {
  test(`Linked ${role} with editor access can create a task`, async (t) => {
    const f = fixture(t, { role });
    await f.deliver();
    assert.deepEqual(f.calls.writeChecks, [["workspace-a", "caller", role]]);
    assert.equal(f.calls.creates.length, 1);
  });
}

test("Uninstalled/unknown Slack workspace cannot create or claim a task", async (t) => {
  const f = fixture(t, { disconnected: true });
  await f.deliver();
  assert.equal(f.calls.creates.length, 0);
  assert.equal(f.db.prepare("SELECT count(*) AS n FROM slack_event_receipts").get().n, 0);
});

test("Bare command gives usage and validation failures never write tasks", async (t) => {
  const f = fixture(t, { unlinked: true });
  await f.deliver({ text: "!테스크생성" });
  assert.match(f.calls.replies[0].body.text, /!테스크생성 고객 인터뷰 정리/);
  await f.deliver({ text: `!task ${"a".repeat(241)}`, ts: "1788310800.000002" }, "Ev2");
  assert.match(f.calls.replies[1].body.text, /240/);
  assert.equal(f.calls.creates.length, 0);
  assert.equal(f.calls.links.length, 0);
});

test("Post-insert failures and an expired receipt never repeat a persisted insert", async (t) => {
  const f = fixture(t, { createError: "after" });
  await f.deliver();
  assert.equal(f.calls.creates.length, 1);
  assert.equal(f.calls.replies[0].method, "chat.postMessage");
  f.db.exec("DELETE FROM slack_event_receipts");
  await f.deliver({}, "Ev2");
  assert.equal(f.calls.creates.length, 1);
  assert.equal(f.db.prepare("SELECT count(*) AS n FROM items").get().n, 1);
});

test("Creation errors are private and do not expose internal exceptions", async (t) => {
  const f = fixture(t, { createError: "before" });
  await f.deliver();
  assert.equal(f.calls.replies[0].method, "chat.postEphemeral");
  assert.match(f.calls.replies[0].body.text, /등록을 확인하지 못/);
  assert.doesNotMatch(JSON.stringify(f.calls.replies), /private database error/);
});

test("Reply failure reports the saved task without retrying creation", async (t) => {
  const f = fixture(t, { replyError: true });
  await f.deliver();
  assert.equal(f.calls.creates.length, 1);
  assert.equal(f.calls.replies[1].method, "chat.postEphemeral");
  assert.match(f.calls.replies[1].body.text, /Task는 등록됐지만/);
  assert.doesNotMatch(JSON.stringify(f.calls.replies), /internal Slack error/);
});

test("Slack mention syntax is rendered as plain text, not as a notification", async (t) => {
  const f = fixture(t);
  await f.deliver({ text: "!task <!channel> <@UOTHER> &lt;script&gt;" });
  const body = f.calls.replies[0].body;
  assert.equal(body.parse, "none");
  assert.doesNotMatch(body.text, /<!channel>|<@UOTHER>/);
  assert.equal(body.blocks[0].text.type, "plain_text");
  assert.match(body.blocks[0].text.text, /<!channel>/);
});

test("Daily bot delivery and human DM reconciliation remain intact", async (t) => {
  const f = fixture(t);
  await f.deliver({ channel_type: "im", channel: "D123", user: "UBOT", bot_id: "B123", subtype: "bot_message", text: "Daily reminder", blocks: [{ block_id: "daily-1" }] });
  assert.deepEqual(f.calls.delivered, [{ teamId: "T123", channelId: "D123", botId: "UBOT", blockIds: ["daily-1"] }]);
  await f.deliver({ channel_type: "im", text: "hello", ts: "1788310800.000002" }, "Ev2");
  assert.deepEqual(f.calls.reconciled, ["workspace-a"]);
  assert.equal(f.calls.creates.length, 0);
});

test("Summon URL button interactions ACK immediately without member lookup or link regeneration", async (t) => {
  const f = fixture(t, { unlinked: true });
  for (const action_id of ["okri_summon_link", "okri_summon_open"]) {
    const body = new URLSearchParams({ payload: JSON.stringify({ type: "block_actions", actions: [{ action_id }] }) }).toString();
    assert.equal((await f.interactions.POST(signedRequest(body))).status, 200);
  }
  assert.equal(f.calls.connectionLookups, 0);
  assert.equal(f.calls.links.length, 0);
});

test("Manifest and OAuth request the same summon scopes and all required events", async () => {
  const manifest = await read("slack-app-manifest.yml");
  for (const scope of commands.slackSummonScopes) {
    assert.ok(oauth.slackScopes.includes(scope));
    assert.ok(manifest.includes(`- ${scope}`));
  }
  for (const event of ["message.im", "message.channels", "message.groups", "app_mention"]) assert.ok(manifest.includes(`- ${event}`));
});

test("New summon scopes do not block an existing daily bot installation", async () => {
  assert.ok(oauth.slackDailyScopes.includes("im:history"));
  assert.ok(oauth.slackDailyScopes.includes("chat:write"));
  for (const scope of commands.slackSummonScopes) assert.ok(!oauth.slackDailyScopes.includes(scope));
  const daily = await read("lib/slack-daily.ts");
  assert.doesNotMatch(daily, /\bslackScopes\b/);
  assert.equal((daily.match(/slackDailyScopes\.filter/g) ?? []).length, 3);
});

test("Settings panel includes real commands, copy controls, placement and permission information", async () => {
  const panel = compile(await read("app/slack-summon-bot.tsx"), { "@/lib/slack-summon-command": commands, "./slack-summon-bot.css": {} });
  const { createElement } = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const html = renderToStaticMarkup(createElement(panel.default, { onNotice() {} }));
  assert.match(html, /!테스크생성 고객 인터뷰 정리/);
  assert.match(html, /!소환봇/);
  assert.match(html, /aria-label="Task 생성 명령 복사"/);
  assert.match(html, /일반 루틴/);
  assert.match(html, /Owner/);
  const page = await read("app/page.tsx");
  assert.match(page, /id="summon" icon=\{AtSign\} title="소환 봇"/);
  assert.match(page, /canManageSlack && slackConnected && <button className="slack-primary-action" onClick=\{connectSlack\}/);
});
