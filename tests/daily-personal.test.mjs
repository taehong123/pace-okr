import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import ts from "typescript";
import { serverLanguage } from "./helpers/language-fixture.mjs";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
function compile(source, deps = {}) {
  const loaded = { exports: {} };
  const output = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  new Function("require", "module", "exports", output)((name) => {
    assert.ok(name in deps, `Unmocked import ${name}`); return deps[name];
  }, loaded, loaded.exports);
  return loaded.exports;
}
const work = compile(await read("../lib/daily-work.ts"));
const form = compile(await read("../lib/slack-daily-form.ts"));
const matching = compile(await read("../lib/slack-member-matching.ts"));
const dailySource = await read("../lib/daily-bot.ts");
const schema = JSON.parse(await read("../drizzle/meta/0038_snapshot.json"));
const migration = await read("../drizzle/0045_daily_work_selection.sql");
const date = "2026-09-04";
const authorization = { ownerId: "w", userId: "u", role: "owner", apiToken: false };
function fixture(t) {
  const db = new DatabaseSync(":memory:");
  t.after(() => db.close());
  db.exec("PRAGMA foreign_keys=ON");
  for (const table of Object.values(schema.tables)) {
    const columns = Object.values(table.columns).map((c) => `${c.name} ${c.type}${c.primaryKey ? " PRIMARY KEY" : ""}${c.notNull ? " NOT NULL" : ""}${c.default !== undefined ? ` DEFAULT ${c.default}` : ""}`);
    for (const fk of Object.values(table.foreignKeys)) columns.push(`FOREIGN KEY (${fk.columnsFrom}) REFERENCES ${fk.tableTo} (${fk.columnsTo}) ON DELETE ${fk.onDelete}`);
    db.exec(`CREATE TABLE ${table.name} (${columns.join(",")})`);
    for (const index of Object.values(table.indexes)) db.exec(`CREATE ${index.isUnique ? "UNIQUE " : ""}INDEX ${index.name} ON ${table.name} (${index.columns})${index.where ? ` WHERE ${index.where}` : ""}`);
  }
  assert.ok(!migration.includes("\r"));
  db.exec(migration.replaceAll("--> statement-breakpoint", ""));
  const raw = { prepare(sql) {
    const statement = db.prepare(sql); let args = [];
    return { bind(...values) { args = values; return this; }, async first() { return statement.get(...args) ?? null; },
      async all() { return { results: statement.all(...args) }; }, async run() { return { meta: { changes: Number(statement.run(...args).changes) } }; } };
  }, async batch(statements) {
    db.exec("BEGIN");
    try { const results = []; for (const s of statements) results.push(await s.run()); db.exec("COMMIT"); return results; }
    catch (error) { db.exec("ROLLBACK"); throw error; }
  } };
  db.exec(`INSERT INTO workspaces (id,name,owner_user_id) VALUES ('w','Workspace','u'),('other','Other','other-user');
    INSERT INTO workspace_members (id,workspace_id,user_id,email,display_name,role,status) VALUES
      ('me','w','u','me@example.test','Me','owner','active'),('colleague','w','c','colleague@example.test','Same name','member','active'),
      ('foreign','other','other-user','foreign@example.test','Same name','owner','active');
    INSERT INTO items (id,owner_id,kind,title,status) VALUES
      ('project','w','project','My project','backlog'),('worker','w','project','Worker project','in_progress'),
      ('task','w','task','My task','todo'),('not-mine','w','task','Colleague task','todo'),
      ('done','w','task','Finished','done'),('foreign-task','other','task','Foreign task','todo');
    INSERT INTO item_assignments (id,owner_id,item_id,member_id,role) VALUES
      ('a1','w','project','me','project_dri'),('a2','w','worker','me','project_worker'),
      ('a3','w','task','me','task_assignee'),('a4','w','not-mine','colleague','task_assignee'),
      ('a5','w','done','me','task_assignee'),('a6','other','foreign-task','foreign','task_assignee');
    INSERT INTO routines (id,owner_id,title,assignee_member_id) VALUES ('routine','w','My routine','me'),('other-routine','w','Other routine','colleague');
    INSERT INTO slack_connections (id,owner_id,user_id,team_id,encrypted_bot_token) VALUES ('slack','w','u','T','mock');`);
  const ormSchema = { workspaceMembers: new Proxy({}, { get: (_, key) => key }) };
  const api = compile(dailySource, {
    "cloudflare:workers": { env: { DB: raw } }, "@/db/schema": ormSchema,
    "drizzle-orm": { eq: (key, value) => ({ key, value }), and: (...args) => args },
    "@/db": { getDb: () => ({ select: () => ({ from: () => ({ where: (conditions) => ({ limit: async () => {
      const rows = db.prepare("SELECT * FROM workspace_members").all().map((row) => Object.fromEntries(Object.entries(row).map(([k, v]) => [k.replace(/_([a-z])/g, (_, x) => x.toUpperCase()), v])));
      return rows.filter((row) => conditions.every(({ key, value }) => row[key] === value)).slice(0, 1);
    } }) }) }) }) },
    "@/lib/daily-work": work, "@/lib/pace-data": { ensureWorkspace: async () => {}, createItem: () => { throw new Error("Must never invent tasks"); } },
  });
  return { db, raw, api };
}

test("personal daily includes assigned DRI/worker projects, tasks and routines only", async (t) => {
  const { raw, db } = fixture(t);
  assert.deepEqual((await work.listDailyWork(raw, "w", "me", date)).map((w) => w.key).sort(),
    ["project:project", "project:worker", "routine:routine", "task:task"]);
  db.exec("INSERT INTO routine_completions (id,owner_id,routine_id,completion_date) VALUES ('done-routine','w','routine','2026-09-04')");
  assert.ok(!(await work.listDailyWork(raw, "w", "me", date)).some((w) => w.kind === "routine"));
  assert.ok((await work.listDailyWork(raw, "w", "me", "2026-09-05")).some((w) => w.kind === "routine"));
});

test("project and routine selection submits snapshots without creating tasks or changing work", async (t) => {
  const { raw, db, api } = fixture(t);
  const before = db.prepare("SELECT * FROM items ORDER BY id").all();
  await api.saveDailyDraft(authorization, { date, selectedWorkIds: ["project:project", "routine:routine"] }, false);
  const submitted = await api.submitDailyDraft(authorization, date, "slack");
  assert.deepEqual(submitted.work.map((w) => w.key), ["project:project", "routine:routine"]);
  assert.deepEqual(submitted.tasks, []);
  assert.deepEqual(db.prepare("SELECT * FROM items ORDER BY id").all(), before);
  db.exec("UPDATE items SET title='Renamed' WHERE id='project'");
  assert.equal(work.dailyWorkSnapshots(db.prepare("SELECT work_snapshot_json FROM daily_submissions").get().work_snapshot_json)[0].title, "My project");
  const dashboard = await api.getDailyDashboard(authorization, date);
  assert.equal(dashboard.team.find((m) => m.memberId === "me").submission.work.length, 2);
  assert.equal((await work.validateDailyWork(raw, "w", "me", date, [])).length, 0);
});

test("foreign, unassigned and changed work are rejected before submission", async (t) => {
  const { raw, db, api } = fixture(t);
  for (const key of ["task:not-mine", "task:foreign-task", "routine:other-routine", "task:done"]) {
    await assert.rejects(work.validateDailyWork(raw, "w", "me", date, [key]));
    await assert.rejects(api.saveDailyDraft(authorization, { date, selectedWorkIds: [key] }, false));
  }
  await api.saveDailyDraft(authorization, { date, selectedWorkIds: ["project:project"] }, false);
  db.exec("DELETE FROM item_assignments WHERE id='a1'");
  await assert.rejects(api.submitDailyDraft(authorization, date));
  assert.equal(db.prepare("SELECT COUNT(*) n FROM daily_submissions").get().n, 0);
});

test("skip clears work; old task-only clients retain selected project and routine", async (t) => {
  const { api } = fixture(t);
  await api.saveDailyDraft(authorization, { date, selectedWorkIds: ["project:worker"] }, false);
  await api.saveDailyDraft(authorization, { date, selectedTaskIds: ["task"] }, false);
  let draft = await api.getDailyDashboard(authorization, date);
  assert.deepEqual(draft.draft.selectedWorkIds.sort(), ["project:worker", "task:task"]);
  await api.saveDailyDraft(authorization, { date, skipReason: "vacation" }, false);
  const submitted = await api.submitDailyDraft(authorization, date);
  assert.deepEqual(submitted.work, []); assert.deepEqual(submitted.tasks, []);
});

test("work parsing bounds selection and rejects forged kinds", () => {
  for (const input of ['"bad"', ["owner:me"], ["project:"], Array.from({ length: 51 }, (_, i) => `project:${i}`)]) assert.throws(() => work.parseDailyWorkKeys(input));
  assert.deepEqual(work.parseDailyWorkKeys(["task:t", "task:t"]), ["task:t"]);
});

test("failed selection writes roll back both notes and previous selections", async (t) => {
  const { db, api } = fixture(t);
  await api.saveDailyDraft(authorization, { date, todayNote: "Original", selectedWorkIds: ["project:project"] }, false);
  db.exec("CREATE TRIGGER fail_selection BEFORE INSERT ON daily_scrum_task_selections BEGIN SELECT RAISE(ABORT,'mock failure'); END");
  await assert.rejects(api.saveDailyDraft(authorization, { date, todayNote: "Unsaved", selectedWorkIds: ["task:task"] }, false));
  const original = db.prepare("SELECT today_note,work_selection_json FROM daily_scrums").get();
  assert.equal(original.today_note, "Original");
  assert.equal(original.work_selection_json, '["project:project"]');
});

test("Slack modal lists checkboxes before notes, never preselects new work or invents tasks", () => {
  const entries = Array.from({ length: 75 }, (_, i) => ({ key: `task:${i}`, id: String(i), title: "Long title ".repeat(20), kind: "task", parentTitle: "Project", dueDate: null }));
  const modal = form.dailyForm({ work: entries, memberName: "Me", date, selected: ["task:72"], todayNote: "", blockersNote: "", skipReason: null, skipNote: "", metadata: "{}", noPlannedTasks: false });
  const inputs = modal.blocks.filter((b) => b.type === "input");
  assert.equal(inputs[0].element.type, "checkboxes");
  assert.ok(!inputs[0].element.initial_options);
  for (const block of inputs.filter((b) => b.block_id.startsWith("daily_work_task"))) {
    assert.ok(block.element.options.length <= 10);
    assert.ok(block.element.options.every((o) => o.text.text.length <= 75));
  }
  assert.equal(inputs.find((b) => b.block_id === "daily_work_more").element.initial_options[0].value, "task:72");
  assert.ok(!JSON.stringify(modal).includes("new_task"));
  assert.ok(modal.blocks.length < 100);
});

test("Slack modal translates system copy per recipient without translating user-authored work", async () => {
  const translate = await serverLanguage.serverTranslator("en");
  const modal = form.dailyForm({
    work: [{ key: "task:user", id: "user", title: "고객이 작성한 제목", kind: "task", parentTitle: "사용자 Project", dueDate: null }],
    memberName: "Taeho", date, selected: [], todayNote: "", blockersNote: "", skipReason: null, skipNote: "", metadata: "{}", noPlannedTasks: false,
  }, translate);
  const rendered = JSON.stringify(modal);
  assert.equal(modal.title.text, "Today's work");
  assert.equal(modal.close.text, "Cancel");
  assert.match(rendered, /고객이 작성한 제목/);
  assert.match(rendered, /사용자 Project/);
  assert.doesNotMatch(rendered, /오늘 할 업무|오늘 메모|데일리 스킵/);
});

test("Slack email matching preserves explicit links and does not match people by name", () => {
  const members = [{ id: "me", email: " ME@example.test ", display_name: "Same" }, { id: "other", email: "other@example.test", display_name: "Same" }];
  const users = [{ id: "U1", profile: { email: "me@example.test", display_name: "Same" } }, { id: "U2", profile: { display_name: "Same" } }];
  let plan = matching.planSlackMemberMatches(members, users, [], "T");
  assert.equal(plan[0].reason, "email_match_pending"); assert.equal(plan[1].reason, "email_not_found");
  plan = matching.planSlackMemberMatches(members, users, [{ member_id: "other", slack_user_id: "U1", matched_by: "manual", team_id: "T" }], "T");
  assert.equal(plan[0].reason, "already_linked"); assert.equal(plan[1].reason, "connected");
  assert.equal(matching.planSlackMemberMatches(members, [...users, { id: "U3", profile: { email: "me@example.test" } }], [], "T")[0].reason, "email_ambiguous");
  assert.equal(matching.planSlackMemberMatches(members, users.map((u) => ({ ...u, deleted: true })), [{ member_id: "me", slack_user_id: "U1", team_id: "T" }], "T")[0].reason, "slack_account_inactive");
});

test("linking cannot overwrite another member, cross workspace or erase manual links on resync", async (t) => {
  const { db, raw } = fixture(t);
  const users = [{ id: "U1", profile: { email: "me@example.test" } }, { id: "U2", profile: { email: "colleague@example.test" } }];
  await matching.attachSlackMember(raw, "w", "T", "colleague", users[0], "admin");
  await assert.rejects(matching.attachSlackMember(raw, "w", "T", "me", users[0], "email"));
  await assert.rejects(matching.attachSlackMember(raw, "w", "T", "foreign", users[1], "admin"));
  await matching.synchronizeSlackMembers(raw, "w", "T", users);
  const links = db.prepare("SELECT member_id, slack_user_id, matched_by FROM slack_member_links").all();
  assert.equal(links.length, 1); assert.equal(links[0].member_id, "colleague"); assert.equal(links[0].matched_by, "admin");
});

test("email synchronization adds new members once and preserves cached DM channels", async (t) => {
  const { db, raw } = fixture(t);
  const users = [{ id: "U1", profile: { email: "me@example.test" } }, { id: "U2", profile: { email: "colleague@example.test" } }];
  assert.equal((await matching.synchronizeSlackMembers(raw, "w", "T", users)).linked, 2);
  db.exec("UPDATE slack_member_links SET dm_channel_id='D-cache' WHERE member_id='me'");
  assert.equal((await matching.synchronizeSlackMembers(raw, "w", "T", users)).linked, 0);
  assert.equal(db.prepare("SELECT dm_channel_id FROM slack_member_links WHERE member_id='me'").get().dm_channel_id, "D-cache");
  db.exec("DELETE FROM slack_member_links WHERE member_id='me'; UPDATE workspace_members SET email='changed@example.test' WHERE id='me'");
  await assert.rejects(matching.attachSlackMember(raw, "w", "T", "me", users[0], "email"));
});

test("one-time Slack links never take over a colleague's existing account and cannot be replayed", async (t) => {
  const { db, raw } = fixture(t);
  db.exec("INSERT INTO slack_link_tokens (token_hash,owner_id,team_id,slack_user_id,expires_at) VALUES ('hash','w','T','U1','2099-01-01T00:00:00Z')");
  const source = ts.createSourceFile("slack-daily.ts", await read("../lib/slack-daily.ts"), ts.ScriptTarget.Latest, true);
  const fn = source.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "consumeSlackMemberLink").getFullText(source);
  const api = compile('const { env, sha256, currentMemberForSlackPreference, getSlackConnection, slackTokenForConnection, slackApi, scheduleMemberReminder } = require("fixture");\n' + fn, {
    fixture: { env: { DB: raw }, sha256: async () => "hash", currentMemberForSlackPreference: async () => ({ id: "me", displayName: "Me" }),
      getSlackConnection: async () => ({ teamId: "T" }), slackTokenForConnection: async () => "mock",
      slackApi: async () => ({ user: { id: "U1", profile: { email: "me@example.test" } } }), scheduleMemberReminder: async () => {} },
  });
  await matching.attachSlackMember(raw, "w", "T", "colleague", { id: "U1" }, "admin");
  await assert.rejects(api.consumeSlackMemberLink(authorization, "mock"));
  assert.equal(db.prepare("SELECT member_id FROM slack_member_links").get().member_id, "colleague");
  assert.equal(db.prepare("SELECT used_at FROM slack_link_tokens").get().used_at, null);
  db.exec("DELETE FROM slack_member_links");
  assert.equal((await api.consumeSlackMemberLink(authorization, "mock")).linked, true);
  await assert.rejects(api.consumeSlackMemberLink(authorization, "mock"));
  assert.equal(db.prepare("SELECT count(*) n FROM slack_member_links").get().n, 1);
});

test("member diagnostics and manual linking enforce admin, CSRF and explicit confirmation", async () => {
  const calls = [];
  let auth = { ...authorization };
  const route = compile(await read("../app/api/slack/members/route.ts"), {
    "@/lib/pace-data": { authorizeRequest: async () => auth, canManageTeam: (a) => ["owner", "admin"].includes(a.role) },
    "@/lib/slack-daily": { manageSlackMemberConnections: async (...args) => { calls.push(args); return {}; } },
    "@/lib/slack-display": { slackErrorMessage: () => "Failed" },
  });
  const request = (body, origin = "https://example.test") => new Request("https://example.test/api/slack/members", { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body) });
  auth.role = "member"; assert.equal((await route.GET(new Request("https://example.test"))).status, 403);
  auth.role = "owner"; assert.equal((await route.POST(request({ action: "link", memberId: "me", slackUserId: "U1" }))).status, 400);
  assert.equal((await route.POST(request({ action: "sync" }, "https://attacker.test"))).status, 403);
  auth.apiToken = true; assert.equal((await route.POST(request({ action: "sync" }))).status, 403);
  assert.equal(calls.length, 0);
  auth.apiToken = false; assert.equal((await route.POST(request({ action: "link", memberId: "me", slackUserId: "U1", confirmed: true }))).status, 200);
  assert.equal(calls[0][0].ownerId, "w");
});

test("signed Slack submission passes every personal checklist and rejects other-member metadata", async () => {
  const saved = [], submitted = [], pending = [];
  const state = { memberId: "me", fail: false, signature: true, role: "owner", language: "en" };
  const route = compile(await read("../app/api/slack/interactions/route.ts"), {
    "cloudflare:workers": { env: { SLACK_SIGNING_SECRET: "mock", DB: { prepare: () => ({ bind: () => ({ first: async () => ({ yesterday_note: "Yesterday" }) }) }) } }, waitUntil: (p) => pending.push(p) },
    "@/lib/pace-data": { getSlackConnectionByTeam: async () => ({ ownerId: "w" }) },
    "@/lib/slack-oauth": { slackConfigured: () => true, verifySlackRequest: async () => state.signature },
    "@/lib/language-preferences": { memberMessageLanguage: async () => state.language, workspaceMessageLanguage: async () => "ko" },
    "@/lib/server-language": serverLanguage,
    "@/lib/slack-daily": { dailyMemberBySlack: async () => ({ authorization: { ...authorization, role: state.role } }), publishDailySubmission: async () => {}, reconcileDailyReminders: async () => {} },
    "@/lib/daily-bot": { currentDailyMember: async () => ({ id: "me" }), normalizeDailySkipReason: (v) => v || null,
      saveDailyDraft: async (...args) => { if (state.fail) throw new Error("저장 실패"); saved.push(args); },
      submitDailyDraft: async (...args) => { submitted.push(args); return { id: "submission" }; } },
  });
  const request = () => new Request("https://example.test/api/slack/interactions", { method: "POST", body: new URLSearchParams({ payload: JSON.stringify({
    type: "view_submission", team: { id: "T" }, user: { id: "U" }, view: { callback_id: "daily_submit",
      private_metadata: JSON.stringify({ ownerId: "w", memberId: state.memberId, date, workVersion: 1, requestId: "request" }),
      state: { values: {
        daily_work_project_0: { selected_work: { selected_options: [{ value: "project:p" }] } },
        daily_work_task_0: { selected_work: { selected_options: [{ value: "task:t" }] } },
        daily_work_more: { selected_more_work: { selected_options: [{ value: "routine:r" }] } },
      } },
    },
  }) }) });
  assert.equal((await route.POST(request())).status, 200);
  assert.deepEqual(saved[0][1].selectedWorkIds, ["project:p", "task:t", "routine:r"]);
  assert.equal(saved[0][1].yesterdayNote, "Yesterday"); assert.equal(saved[0][2], false);
  await Promise.all(pending);
  state.memberId = "colleague";
  assert.equal((await (await route.POST(request())).json()).response_action, "errors");
  assert.equal(submitted.length, 1);
  state.memberId = "me"; state.fail = true;
  assert.equal((await (await route.POST(request())).json()).response_action, "errors");
  assert.equal(submitted.length, 1);
  state.role = "viewer";
  const viewerError = await (await route.POST(request())).json();
  assert.equal(viewerError.response_action, "errors");
  assert.match(Object.values(viewerError.errors).join(" "), /Read-only members/);
  state.signature = false; assert.equal((await route.POST(request())).status, 401);
});

test("Slack slash commands use the linked member language and preserve authored Task titles", async () => {
  const created = [];
  const route = compile(await read("../app/api/slack/commands/route.ts"), {
    "cloudflare:workers": { env: { SLACK_SIGNING_SECRET: "mock", DB: {} } },
    "@/lib/pace-data": {
      ensureWorkspace: async () => {}, getSlackConnectionByTeam: async () => ({ ownerId: "w", userId: "creator" }),
      createItem: async (_ownerId, input) => { created.push(input); return { title: input.title }; }, serializeItem: (item) => item,
    },
    "@/lib/slack-daily": { dailyMemberBySlack: async () => ({ authorization, memberId: "me" }), reconcileDailyReminders: async () => {} },
    "@/lib/slack-oauth": { slackConfigured: () => true, verifySlackRequest: async () => true },
    "@/lib/language-preferences": { memberMessageLanguage: async () => "en", workspaceMessageLanguage: async () => "ko" },
    "@/lib/server-language": serverLanguage,
  });
  const request = (text) => new Request("https://example.test/api/slack/commands", { method: "POST", body: new URLSearchParams({
    team_id: "T", user_id: "U", user_name: "Me", channel_id: "C", channel_name: "general", text,
  }) });
  const help = await (await route.POST(request("help"))).json();
  assert.match(help.text, /How to use/);
  const task = await (await route.POST(request("고객 인터뷰 정리"))).json();
  assert.equal(task.text, "Saved as a Task: 고객 인터뷰 정리");
  assert.equal(created[0].title, "고객 인터뷰 정리");
});
