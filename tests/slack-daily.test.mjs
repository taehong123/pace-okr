import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import ts from "typescript";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const source = await read("../lib/slack-daily.ts");
function compile(source, dependencies = {}) {
  const output = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const loaded = { exports: {} };
  new Function("require", "module", "exports", output)((name) => {
    if (!(name in dependencies)) throw new Error(`Unmocked import ${name}`);
    return dependencies[name];
  }, loaded, loaded.exports);
  return loaded.exports;
}
const status = compile(await read("../lib/slack-daily-status.ts"));
const snake = (key) => key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
const camel = (row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key.replace(/_([a-z])/g, (_, c) => c.toUpperCase()), value]));

function harness(t) {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE workspaces(id TEXT PRIMARY KEY, scheduled_deletion_at TEXT);
    CREATE TABLE workspace_members(id TEXT PRIMARY KEY, workspace_id TEXT, status TEXT);
    CREATE TABLE slack_daily_settings(owner_id TEXT PRIMARY KEY, enabled INTEGER, weekdays TEXT, reminder_time TEXT, timezone TEXT, install_status TEXT, onboarding_completed_at TEXT, last_error TEXT, updated_at TEXT);
    CREATE TABLE slack_daily_preferences(owner_id TEXT, member_id TEXT, enabled INTEGER, reminder_time TEXT, timezone TEXT);
    CREATE TABLE slack_member_links(id TEXT PRIMARY KEY, owner_id TEXT, member_id TEXT, slack_user_id TEXT, dm_channel_id TEXT);
    CREATE TABLE slack_daily_reminders(id TEXT PRIMARY KEY, owner_id TEXT, member_id TEXT, slack_user_id TEXT, dm_channel_id TEXT, scheduled_message_id TEXT, post_at INTEGER, block_id TEXT, bot_user_id TEXT, status TEXT, last_error TEXT, created_at TEXT, updated_at TEXT, UNIQUE(owner_id,member_id));
    INSERT INTO workspaces VALUES('workspace',NULL);
    INSERT INTO workspace_members VALUES('member','workspace','active');
    INSERT INTO slack_daily_settings VALUES('workspace',1,'[0,1,2,3,4,5,6]','09:00','Asia/Seoul','connected','2026-09-02T00:00:00Z','old error','2026-09-02T00:00:00Z');
    INSERT INTO slack_member_links VALUES('link','workspace','member','U-member','D-member');
    INSERT INTO slack_daily_preferences VALUES('workspace','member',1,NULL,NULL);`);
  const raw = { prepare(sql) {
    let args = [];
    const prepared = db.prepare(sql);
    return { bind(...values) { args = values; return this; },
      async first() { return prepared.get(...args) ?? null; },
      async all() { return { results: prepared.all(...args) }; },
      async run() { const result = prepared.run(...args); return { meta: { changes: Number(result.changes) } }; },
    };
  } };
  const schema = Object.fromEntries(["slackDailySettings", "slackDailyPreferences", "slackMemberLinks", "workspaceMembers", "slackDailyChannels"].map((name) => [name, new Proxy({ table: snake(name) }, { get: (target, key) => key === "table" ? target.table : key })]));
  const orm = {
    select() {
      let table, predicate = () => true;
      const rows = () => db.prepare(`SELECT * FROM ${table}`).all().map(camel).filter(predicate);
      return { from(target) { table = target.table; return this; }, where(value) { predicate = value; return this; }, async limit(n) { return rows().slice(0, n); }, then(resolve, reject) { return Promise.resolve(rows()).then(resolve, reject); } };
    },
    insert(target) { return { values(value) { return { async onConflictDoUpdate({ set }) {
      const columns = Object.keys(set); db.prepare(`UPDATE ${target.table} SET ${columns.map((key) => `${snake(key)}=?`).join(",")} WHERE owner_id=?`).run(...columns.map((key) => typeof set[key] === "boolean" ? Number(set[key]) : set[key]), value.ownerId);
    } }; } }; },
    update(target) { return { set(value) { return { async where(predicate) {
      for (const row of db.prepare(`SELECT * FROM ${target.table}`).all().map(camel).filter(predicate)) {
        // This harness only needs the DM cache field from link updates.
        if (target.table === "slack_member_links") db.prepare("UPDATE slack_member_links SET dm_channel_id=? WHERE id=?").run(value.dmChannelId, row.id);
      }
    } }; } }; },
  };
  const connection = { ownerId: "workspace", botUserId: "U-bot", encryptedBotToken: "mock", teamId: "T-team" };
  const api = compile(source, {
    "cloudflare:workers": { env: { DB: raw, SLACK_TOKEN_ENCRYPTION_KEY: "mock" } },
    "drizzle-orm": { eq: (key, value) => (row) => row[key] === value, and: (...conditions) => (row) => conditions.every((condition) => condition(row)) },
    "@/db": { getDb: () => orm }, "@/db/schema": schema, "@/lib/daily-bot": {},
    "@/lib/pace-data": { getSlackConnection: async () => connection, getSlackConnectionByTeam: async () => connection, ensureWorkspace: async () => {} },
    "@/lib/slack-oauth": { decryptSlackSecret: async () => "mock-token", slackScopes: [] },
    "@/lib/slack-daily-status": status,
  });
  const calls = [], pending = [];
  const behavior = { rejectSchedule: false, loseResponse: false, rejectCancellation: false };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    assert.ok(url.startsWith("https://slack.com/api/"), "only mocked Slack requests are allowed");
    const method = url.split("/").at(-1), body = JSON.parse(options.body);
    calls.push({ method, body });
    if (method === "chat.scheduledMessages.list") return Response.json({ ok: true, scheduled_messages: pending.filter((entry) => entry.channel_id === body.channel && entry.post_at > Number(body.oldest) && entry.post_at < Number(body.latest)) });
    if (method === "chat.scheduleMessage") {
      const ids = body.blocks.flatMap((block) => block.block_id ? [block.block_id] : []);
      assert.equal(new Set(ids).size, ids.length, "Slack block IDs must be unique");
      if (behavior.rejectSchedule) return Response.json({ ok: false, error: "invalid_blocks", response_metadata: { messages: ["duplicate block_id"] } });
      const id = `Q-${calls.length}`;
      pending.push({ id, channel_id: body.channel, post_at: body.post_at, text: body.text });
      if (behavior.loseResponse) { behavior.loseResponse = false; throw new Error("response lost"); }
      return Response.json({ ok: true, scheduled_message_id: id });
    }
    if (method === "chat.deleteScheduledMessage") {
      if (behavior.rejectCancellation) return Response.json({ ok: false, error: "ratelimited" });
      const index = pending.findIndex((entry) => entry.id === body.scheduled_message_id);
      if (index >= 0) pending.splice(index, 1);
      return Response.json({ ok: true });
    }
    throw new Error(`Unexpected mock API ${method}`);
  };
  t.after(() => { globalThis.fetch = originalFetch; db.close(); });
  const reminder = () => db.prepare("SELECT * FROM slack_daily_reminders WHERE owner_id='workspace' AND member_id='member'").get();
  return { api, db, calls, pending, behavior, reminder };
}

test("scheduled, manual and test reminders have unique block IDs and keep the delivery marker", (t) => {
  const { api } = harness(t);
  for (const marker of ["okrptr_daily_reminder:uuid", "okrptr_daily_reminder:manual:uuid", "okrptr_daily_reminder:test:uuid"]) {
    const blocks = api.dailyReminderBlocks(marker);
    const ids = blocks.flatMap((block) => block.block_id ? [block.block_id] : []);
    assert.equal(new Set(ids).size, ids.length);
    assert.equal(blocks.find((block) => block.type === "actions").block_id, marker);
  }
});

test("failed/missing/overdue/partial reservations never appear as ready", () => {
  const settings = { enabled: true, onboardingCompletedAt: "configured", installStatus: "connected" };
  const member = { linked: true, preference: { enabled: true }, reminder: null };
  for (const reminder of [null, { status: "failed", postAt: 2000, error: "failure" }, { status: "scheduled", postAt: 999, error: "" }]) {
    assert.equal(status.dailyDeliveryHealth(settings, [{ ...member, reminder }], 1_000_000).status, "failed");
  }
  const ready = { ...member, reminder: { status: "scheduled", postAt: 2000, error: "" } };
  assert.equal(status.dailyDeliveryHealth(settings, [ready], 1_000_000).status, "ready");
  assert.equal(status.dailyDeliveryHealth(settings, [ready, member], 1_000_000).failedCount, 1);
  assert.equal(status.dailyDeliveryHealth({ ...settings, enabled: false }, [member]).status, "paused");
  assert.equal(status.dailyDeliveryHealth(settings, []).status, "failed");
});

test("concurrent repair creates exactly one confirmed future reservation", async (t) => {
  const { api, calls, reminder } = harness(t);
  await Promise.all([api.scheduleMemberReminder("workspace", "member"), api.scheduleMemberReminder("workspace", "member")]);
  assert.equal(calls.filter((call) => call.method === "chat.scheduleMessage").length, 1);
  assert.equal(reminder().status, "scheduled");
  assert.ok(reminder().post_at > Date.now() / 1000);
  await api.scheduleMemberReminder("workspace", "member");
  assert.equal(calls.filter((call) => call.method === "chat.scheduleMessage").length, 1);
});

test("Slack rejection is durable and successful repair clears the failure", async (t) => {
  const { api, behavior, reminder, db } = harness(t);
  behavior.rejectSchedule = true;
  assert.equal((await api.reconcileDailyReminders("workspace")).failed, 1);
  assert.equal(reminder().status, "failed");
  assert.match(reminder().last_error, /invalid_blocks.*duplicate block_id/);
  behavior.rejectSchedule = false;
  await api.reconcileDailyReminders("workspace");
  assert.equal(reminder().status, "scheduled");
  assert.equal(db.prepare("SELECT last_error FROM slack_daily_settings").get().last_error, "");
});

test("a lost Slack response recovers its existing receipt without duplicate delivery", async (t) => {
  const { api, behavior, calls, pending, reminder } = harness(t);
  behavior.loseResponse = true;
  await assert.rejects(api.scheduleMemberReminder("workspace", "member"), /response lost/);
  assert.equal(reminder().status, "failed");
  await api.scheduleMemberReminder("workspace", "member");
  assert.equal(reminder().scheduled_message_id, pending[0].id);
  assert.equal(calls.filter((call) => call.method === "chat.scheduleMessage").length, 1);
});

test("transient cancellation failure does not forget or replace the existing reservation", async (t) => {
  const { api, behavior, db, calls, reminder } = harness(t);
  await api.scheduleMemberReminder("workspace", "member");
  const id = reminder().scheduled_message_id;
  db.prepare("UPDATE slack_daily_settings SET reminder_time='11:15'").run();
  behavior.rejectCancellation = true;
  await assert.rejects(api.scheduleMemberReminder("workspace", "member", { force: true }), /ratelimited/);
  assert.equal(reminder().scheduled_message_id, id);
  assert.equal(calls.filter((call) => call.method === "chat.scheduleMessage").length, 1);
});

test("automatic repair respects disabled recipients, workspace boundaries and retries after cooldown", async (t) => {
  const { api, behavior, db, calls, reminder } = harness(t);
  db.prepare("UPDATE slack_daily_preferences SET enabled=0").run();
  await api.repairSlackDailyReminders("workspace");
  assert.equal(calls.length, 0);
  db.prepare("UPDATE slack_daily_preferences SET enabled=1").run();
  await api.repairSlackDailyReminders("other-workspace");
  assert.equal(calls.length, 0);
  behavior.rejectSchedule = true;
  await api.repairSlackDailyReminders("workspace");
  const count = calls.length;
  await api.repairSlackDailyReminders("workspace");
  assert.equal(calls.length, count);
  db.prepare("UPDATE slack_daily_reminders SET updated_at='2026-01-01T00:00:00.000Z'").run();
  behavior.rejectSchedule = false;
  await api.runDueSlackDailyReminders();
  assert.equal(reminder().status, "scheduled");
});

test("delivered reminder schedules the following day and ignores unrelated events", async (t) => {
  const { api, calls, reminder, pending } = harness(t);
  await api.scheduleMemberReminder("workspace", "member");
  const marker = reminder().block_id;
  const previousPostAt = reminder().post_at;
  t.mock.timers.enable({ apis: ["Date"], now: previousPostAt * 1000 + 1000 });
  pending.splice(0);
  assert.equal(await api.handleDeliveredDailyReminder({ teamId: "T-team", channelId: "D-member", botId: "wrong", blockIds: [marker] }), false);
  assert.equal(await api.handleDeliveredDailyReminder({ teamId: "T-team", channelId: "D-member", botId: "U-bot", blockIds: [marker] }), true);
  assert.equal(reminder().status, "scheduled");
  assert.equal(reminder().post_at, previousPostAt + 86_400);
  assert.equal(calls.filter((call) => call.method === "chat.scheduleMessage").length, 2);
  assert.ok(calls.every((call) => call.method !== "chat.postMessage"));
});

test("recovery is off the bootstrap critical path and independently registered in maintenance", async () => {
  assert.match(await read("../app/api/bootstrap/route.ts"), /waitUntil\(import\("@\/lib\/slack-daily"\)/);
  assert.match(await read("../worker/index.ts"), /ctx.waitUntil\(import\("@\/lib\/slack-daily"\)/);
  const route = await read("../app/api/slack/daily/settings/route.ts");
  assert.ok(route.indexOf("if (!canManageTeam(authorization))") < route.indexOf('payload.action === "repair"'));
  assert.match(source, /setupComplete: scheduleResults.length === memberIds.length/);
});
