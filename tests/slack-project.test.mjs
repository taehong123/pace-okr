import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
function compile(source, dependencies = {}) {
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const loaded = { exports: {} };
  new Function("require", "module", "exports", compiled)((name) => name in dependencies ? dependencies[name] : require(name), loaded, loaded.exports);
  return loaded.exports;
}
const formApi = compile(await read("lib/slack-project-form.ts"));
const commands = compile(await read("lib/slack-summon-command.ts"));
const projectSource = await read("lib/slack-project-drafts.ts");
const paceSource = ts.createSourceFile("pace-data.ts", await read("lib/pace-data.ts"), ts.ScriptTarget.Latest, true);
const normalized = compile(paceSource.statements.filter((statement) => ts.isFunctionDeclaration(statement) && ["normalizePropertyValue", "parseOptions"].includes(statement.name?.text)).map((statement) => statement.getText(paceSource)).join("\n"));
const migration = await read("drizzle/0038_slack_summon_drafts.sql");
const baseEvent = { type: "message", channel_type: "channel", channel: "C1", user: "U1", ts: "1788310800.000001", text: "!프로젝트생성 온보딩 개선" };

function fixture(t, options = {}) {
  const db = new DatabaseSync(":memory:");
  t.after(() => db.close());
  db.exec(`PRAGMA foreign_keys = ON;
    CREATE TABLE workspaces (id TEXT PRIMARY KEY, scheduled_deletion_at TEXT);
    CREATE TABLE workspace_members (id TEXT PRIMARY KEY, workspace_id TEXT, user_id TEXT, display_name TEXT, email TEXT, role TEXT, status TEXT);
    CREATE TABLE slack_connections (owner_id TEXT, team_id TEXT, encrypted_bot_token TEXT DEFAULT 'test-token');
    CREATE TABLE slack_member_links (owner_id TEXT, team_id TEXT, slack_user_id TEXT, member_id TEXT);
    CREATE TABLE okr_cycles (id TEXT PRIMARY KEY, owner_id TEXT, name TEXT, status TEXT);
    CREATE TABLE items (id TEXT PRIMARY KEY, owner_id TEXT, cycle_id TEXT, parent_id TEXT, kind TEXT, title TEXT, description TEXT DEFAULT '', status TEXT DEFAULT 'todo', priority TEXT, cadence TEXT, progress INTEGER, due_date TEXT, source TEXT, source_ref TEXT, created_by_user_id TEXT, archived_at TEXT, created_at TEXT, updated_at TEXT);
    CREATE TABLE property_definitions (id TEXT PRIMARY KEY, owner_id TEXT, name TEXT, type TEXT, options TEXT DEFAULT '[]', default_value TEXT DEFAULT 'null', system_key TEXT, active INTEGER DEFAULT 1, updated_at TEXT DEFAULT 'version-1');
    CREATE TABLE item_property_values (id TEXT PRIMARY KEY, owner_id TEXT, item_id TEXT REFERENCES items(id), property_id TEXT REFERENCES property_definitions(id), value TEXT, updated_at TEXT, UNIQUE(owner_id, item_id, property_id));
    CREATE TABLE item_assignments (id TEXT PRIMARY KEY, owner_id TEXT, item_id TEXT REFERENCES items(id), member_id TEXT REFERENCES workspace_members(id), role TEXT, created_at TEXT, updated_at TEXT, UNIQUE(owner_id, item_id, member_id, role));
    CREATE TABLE activity_log (id TEXT PRIMARY KEY, owner_id TEXT, item_id TEXT REFERENCES items(id), action TEXT, source TEXT, payload TEXT, created_at TEXT);
    INSERT INTO workspaces VALUES ('a', NULL), ('b', NULL);
    INSERT INTO workspace_members VALUES ('me', 'a', 'caller', 'Caller', 'caller@example.test', 'member', 'active'), ('peer', 'a', 'peer-user', 'Peer', 'peer@example.test', 'member', 'active'), ('foreign', 'b', 'other-user', 'Other private member', 'other@example.test', 'owner', 'active');
    INSERT INTO slack_connections (owner_id,team_id) VALUES ('a','T1');
    INSERT INTO slack_member_links VALUES ('a','T1','U1','me');
    INSERT INTO okr_cycles VALUES ('cycle-a','a','2026 Q3','active'), ('closed','a','Closed','closed'), ('cycle-b','b','Private cycle','active');
    INSERT INTO items (id,owner_id,cycle_id,kind,title,status) VALUES ('initiative-a','a','cycle-a','initiative','Customer onboarding','in_progress'), ('initiative-closed','a','closed','initiative','Closed initiative','todo'), ('initiative-b','b','cycle-b','initiative','Private initiative','todo');
  `);
  const addProperty = (id, name, type, value, choices = [], systemKey = null) => db.prepare("INSERT INTO property_definitions (id,owner_id,name,type,default_value,options,system_key) VALUES (?, 'a', ?, ?, ?, ?, ?)").run(id, name, type, JSON.stringify(value), JSON.stringify(choices), systemKey);
  addProperty("sys-parent", "상위 Initiative", "text", "initiative-a", [], "parent_id");
  addProperty("sys-status", "상태", "select", "in_progress", [], "status");
  addProperty("sys-priority", "우선순위", "select", "high", [], "priority");
  addProperty("sys-cadence", "주기", "select", "weekly", [], "cadence");
  addProperty("sys-due", "기한", "date", "2026-10-01", [], "due_date");
  addProperty("sys-dri", "DRI", "member", "peer", [], "project_dri");
  addProperty("sys-workers", "업무자", "members", ["peer"], [], "project_workers");
  addProperty("budget", "예산", "number", 100);
  addProperty("note", "메모", "text", "기본 메모");
  addProperty("platform", "플랫폼", "select", "Web", ["Web", "Slack"]);
  addProperty("approved", "검토 완료", "checkbox", true);
  addProperty("launch", "출시일", "date", "2026-11-01");
  addProperty("reviewer", "검토자", "member", "peer");
  addProperty("watchers", "참여자", "members", ["peer"]);
  const calls = { api: [], reserve: 0, release: 0, jobs: [], definitionReads: 0, businessBatches: 0 };
  const bind = (sql, values) => ({ sql, values, async first() { return db.prepare(sql).get(...values) ?? null; }, async all() { return { results: db.prepare(sql).all(...values) }; }, async run() { return { meta: { changes: Number(db.prepare(sql).run(...values).changes) } }; } });
  const d1 = {
    prepare(sql) { return { ...bind(sql, []), bind: (...values) => bind(sql, values) }; },
    async batch(statements) {
      const business = statements.some((statement) => /INSERT INTO items \(/.test(statement.sql));
      if (business) { calls.businessBatches++; options.beforeBusinessBatch?.(db); }
      db.exec("BEGIN");
      try {
        const result = statements.map(({ sql, values }) => ({ meta: { changes: Number(db.prepare(sql).run(...values).changes) } }));
        db.exec("COMMIT");
        if (business && options.errorAfterCommit) throw new Error("Ambiguous network result after commit");
        return result;
      } catch (error) { if (db.isTransaction) db.exec("ROLLBACK"); throw error; }
    },
  };
  const connection = { ownerId: "a", teamId: "T1", botUserId: "UBOT", userId: "installer" };
  const authorization = { ownerId: "a", userId: "caller", role: "member", email: "caller@example.test", displayName: "Caller", apiToken: false };
  const data = {
    ITEM_STATUSES: ["backlog", "todo", "in_progress", "done", "blocked", "archived"], ITEM_PRIORITIES: ["low", "medium", "high", "urgent"], ITEM_CADENCES: ["daily", "weekly", "monthly", "quarterly"],
    getSlackConnectionByTeam: async (teamId) => teamId === "T1" && !options.disconnected ? connection : null,
    getWorkspaceRules: async () => ({ defaultPriority: "medium", defaultCadence: "weekly" }),
    listProjectPropertyDefinitions: async (ownerId) => {
      calls.definitionReads++;
      if (options.definitionGate) await options.definitionGate;
      return db.prepare("SELECT * FROM property_definitions WHERE owner_id = ? AND active = 1").all(ownerId).map((row) => ({ ...row, defaultValue: row.default_value, systemKey: row.system_key, updatedAt: row.updated_at }));
    },
    normalizePropertyValue: normalized.normalizePropertyValue,
    serializePropertyDefinition: (definition) => ({ ...definition, defaultValue: JSON.parse(definition.defaultValue), options: JSON.parse(definition.options) }),
  };
  class BillingLimitError extends Error {}
  const projectModule = compile(projectSource, {
    "cloudflare:workers": { env: { DB: d1 }, waitUntil: (job) => calls.jobs.push(job) },
    "@/lib/billing": { BillingLimitError, memberCanWrite: async () => options.editor !== false, reserveProjectCreation: async () => { calls.reserve++; if (options.quotaExceeded) throw new BillingLimitError("이번 달 Project 생성 한도에 도달했습니다."); return { workspaceId: "a", periodKey: "2026-09" }; }, releaseProjectCreation: async () => { calls.release++; } },
    "@/lib/pace-data": data, "@/lib/slack-summon-command": commands, "@/lib/slack-project-form": formApi,
    "@/lib/slack-daily": { slackTokenForConnection: async () => "test-token", slackApi: async (_token, method, body) => {
      calls.api.push({ method, body });
      if (options.openError && method === "views.open") throw new Error("expired_trigger");
      if (options.replyError && method === "chat.postMessage") throw new Error("reply error with secret");
      return method === "views.open" ? { ok: true, view: { id: `V${calls.api.filter((call) => call.method === "views.open").length}` } } : { ok: true };
    } },
  });
  const settle = async () => { while (calls.jobs.length) await calls.jobs.shift(); };
  const row = () => db.prepare("SELECT * FROM slack_project_drafts ORDER BY created_at LIMIT 1").get();
  const form = () => JSON.parse(row().form_json);
  async function offer(seed = { title: "온보딩 개선", description: "고객의 첫 경험 개선" }) {
    await projectModule.offerSlackProjectForm(connection, authorization, baseEvent, seed);
    return row();
  }
  async function open(overrides = {}) {
    const payload = { type: "block_actions", trigger_id: "fresh-trigger", team: { id: "T1" }, user: { id: "U1" }, actions: [{ action_id: formApi.PROJECT_OPEN_ACTION, value: row().id }], ...overrides };
    const response = await projectModule.handleSlackProjectInteraction(payload);
    await settle();
    return response;
  }
  function state(overrides = {}) {
    return Object.fromEntries(form().fields.map((field) => {
      const value = Object.hasOwn(overrides, field.key) ? overrides[field.key] : field.value;
      let entry;
      if (field.type === "select") entry = { selected_option: value === null ? null : { value: String(field.options.indexOf(value)) } };
      else if (field.type === "date") entry = { selected_date: value };
      else if (field.type === "member" || field.type === "parent") entry = { selected_option: value === null ? null : { value } };
      else if (field.type === "members") entry = { selected_options: (value ?? []).map((value) => ({ value })) };
      else if (field.type === "checkbox") entry = { selected_options: value ? [{ value: "true" }] : [] };
      else entry = { value: value === null ? null : String(value) };
      return [formApi.projectFieldBlock(field.key), { [formApi.projectFieldAction(field.key)]: entry }];
    }));
  }
  const submission = (overrides = {}) => ({ type: "view_submission", team: { id: "T1" }, user: { id: "U1" }, view: { id: row().view_id, callback_id: formApi.PROJECT_MODAL_CALLBACK, private_metadata: row().id, state: { values: state(overrides) } } });
  async function submit(overrides = {}) { const response = await projectModule.handleSlackProjectInteraction(submission(overrides)); await settle(); return response; }
  const projects = () => db.prepare("SELECT * FROM items WHERE kind = 'project'").all();
  return { db, d1, calls, module: projectModule, options, offer, open, submit, submission, settle, row, form, projects, addProperty };
}

test("Command offers a private button and opening pre-fills core and custom workspace defaults without creating a project", async (t) => {
  const f = fixture(t);
  await f.offer();
  await f.open();
  assert.equal(f.calls.api[0].method, "chat.postEphemeral");
  assert.equal(f.calls.api[0].body.thread_ts, undefined);
  assert.equal(f.calls.api[0].body.blocks[1].elements[0].action_id, formApi.PROJECT_OPEN_ACTION);
  const view = f.calls.api.find((call) => call.method === "views.update").body.view;
  assert.equal(view.submit.text, "생성");
  assert.equal(view.close.text, "취소");
  const field = (key) => view.blocks.find((block) => block.block_id === formApi.projectFieldBlock(key)).element;
  assert.equal(field("title").initial_value, "온보딩 개선");
  assert.equal(field("parent_id").initial_option.value, "initiative-a");
  assert.equal(field("status").initial_option.text.text, "진행 중");
  assert.equal(field("custom_budget").initial_value, "100");
  assert.equal(field("custom_platform").initial_option.value, "0");
  assert.equal(field("custom_approved").initial_options[0].value, "true");
  assert.equal(field("project_dri").initial_option.value, "peer");
  assert.equal(f.projects().length, 0);
});

test("Loading view consumes the trigger before slow property reads", async (t) => {
  let release;
  const f = fixture(t, { definitionGate: new Promise((resolve) => { release = resolve; }) });
  await f.offer();
  const opening = f.open();
  while (!f.calls.definitionReads) await new Promise((resolve) => setImmediate(resolve));
  assert.ok(f.calls.api.some((call) => call.method === "views.open"));
  assert.ok(!f.calls.api.some((call) => call.method === "views.update"));
  release();
  await opening;
});

test("Modal submissions create the Project, every property, assignments and activity atomically with the parent's cycle", async (t) => {
  const f = fixture(t);
  await f.offer(); await f.open();
  const response = await f.submit({ custom_budget: 250, custom_platform: "Slack", due_date: null, project_dri: null, project_workers: [], custom_approved: false });
  assert.equal(response.status, 200);
  assert.equal(f.projects().length, 1);
  const project = f.projects()[0];
  assert.equal(project.cycle_id, "cycle-a");
  assert.equal(project.parent_id, "initiative-a");
  assert.equal(project.due_date, null, "Clearing a default must not restore it");
  assert.equal(project.created_by_user_id, "caller");
  assert.equal(project.source, "slack");
  assert.equal(project.status, "in_progress");
  const properties = f.db.prepare("SELECT property_id,value FROM item_property_values").all();
  assert.equal(properties.length, 7);
  assert.equal(properties.find((property) => property.property_id === "budget").value, "250");
  assert.equal(properties.find((property) => property.property_id === "approved").value, "false");
  assert.equal(f.db.prepare("SELECT count(*) AS n FROM item_assignments").get().n, 0);
  assert.equal(f.db.prepare("SELECT count(*) AS n FROM activity_log").get().n, 1);
  assert.equal(f.row().status, "done");
  assert.equal(f.calls.reserve, 1);
  const reply = f.calls.api.find((call) => call.method === "chat.postMessage");
  assert.equal(reply.body.thread_ts, baseEvent.ts);
  assert.equal(new URL(reply.body.blocks[1].elements[0].url).searchParams.get("project"), project.id);
});

test("Selected DRI and workers are relational assignments", async (t) => {
  const f = fixture(t); await f.offer(); await f.open(); await f.submit();
  assert.deepEqual(f.db.prepare("SELECT member_id,role FROM item_assignments ORDER BY role").all().map((row) => ({ ...row })), [{ member_id: "peer", role: "project_dri" }, { member_id: "peer", role: "project_worker" }]);
});

test("Submission ACK does not wait for project validation and storage", async (t) => {
  const f = fixture(t); await f.offer(); await f.open();
  let release;
  f.options.definitionGate = new Promise((resolve) => { release = resolve; });
  const response = await f.module.handleSlackProjectInteraction(f.submission());
  assert.equal(response.status, 200);
  assert.equal(f.calls.businessBatches, 0);
  assert.equal(f.row().status, "processing");
  release(); await f.settle();
  assert.equal(f.projects().length, 1);
});

test("Duplicate submissions and reopening a completed command cannot create a second project", async (t) => {
  const f = fixture(t); await f.offer(); await f.open();
  const payload = f.submission();
  await Promise.all([f.module.handleSlackProjectInteraction(payload), f.module.handleSlackProjectInteraction(payload)]);
  await f.settle(); await f.open();
  assert.equal(f.projects().length, 1);
  assert.equal(f.calls.reserve, 1);
  assert.equal(f.calls.api.filter((call) => call.method === "chat.postMessage").length, 1);
  assert.ok(f.calls.api.at(-1).body.view.blocks[0].elements[0].url.includes("project="));
});

test("Required values and invalid number/date/select input return field errors with no writes", async (t) => {
  const f = fixture(t); await f.offer(); await f.open();
  const response = await f.submit({ title: " ", parent_id: null, custom_budget: "NaN", custom_launch: "2026-02-30", custom_platform: "unknown" });
  const result = await response.json();
  assert.equal(result.response_action, "errors");
  for (const key of ["title", "parent_id", "custom_budget", "custom_launch", "custom_platform"]) assert.ok(result.errors[formApi.projectFieldBlock(key)]);
  assert.equal(f.projects().length, 0); assert.equal(f.calls.reserve, 0);
});

test("Cancellation never writes business data or spends a creation quota", async (t) => {
  const f = fixture(t); await f.offer(); await f.open();
  const payload = f.submission(); payload.type = "view_closed";
  assert.equal((await f.module.handleSlackProjectInteraction(payload)).status, 200);
  assert.equal(f.projects().length, 0); assert.equal(f.calls.reserve, 0);
});

test("External selects expose only the caller's active workspace members and non-closed Initiatives", async (t) => {
  const f = fixture(t); await f.offer(); await f.open();
  for (const [key, expected] of [["parent_id", ["initiative-a"]], ["project_dri", ["me", "peer"]]]) {
    const payload = f.submission(); payload.type = "block_suggestion"; payload.action_id = formApi.projectFieldAction(key); payload.value = "";
    const response = await f.module.handleSlackProjectInteraction(payload);
    assert.deepEqual((await response.json()).options.map((option) => option.value), expected);
    payload.value = "%";
    assert.deepEqual((await (await f.module.handleSlackProjectInteraction(payload)).json()).options, []);
  }
});

for (const [name, change] of [
  ["viewer", (f) => f.db.exec("UPDATE workspace_members SET role = 'viewer' WHERE id = 'me'")],
  ["removed caller", (f) => f.db.exec("UPDATE workspace_members SET status = 'removed' WHERE id = 'me'")],
  ["deleted workspace", (f) => f.db.exec("UPDATE workspaces SET scheduled_deletion_at = '2026-09-03' WHERE id = 'a'")],
  ["revoked editor", (f) => { f.options.editor = false; }],
]) test(`${name} cannot create after a form was opened`, async (t) => {
  const f = fixture(t); await f.offer(); await f.open(); change(f); await f.submit();
  assert.equal(f.projects().length, 0);
});

test("Another Slack user/team or a superseded modal cannot submit the draft", async (t) => {
  const f = fixture(t); await f.offer(); await f.open();
  const original = f.submission();
  const otherUser = structuredClone(original); otherUser.user.id = "UOTHER";
  const otherTeam = structuredClone(original); otherTeam.team.id = "TOTHER";
  await f.open();
  for (const payload of [original, otherUser, otherTeam]) {
    const response = await f.module.handleSlackProjectInteraction(payload);
    assert.equal((await response.json()).response_action, "update");
  }
  assert.equal(f.projects().length, 0);
});

for (const [name, patch] of [["foreign parent", { parent_id: "initiative-b" }], ["closed parent", { parent_id: "initiative-closed" }], ["foreign DRI", { project_dri: "foreign" }], ["foreign custom member", { custom_reviewer: "foreign" }]]) {
  test(`${name} is rejected before any project is created`, async (t) => {
    const f = fixture(t); await f.offer(); await f.open(); await f.submit(patch);
    assert.equal(f.projects().length, 0); assert.equal(f.calls.reserve, 0);
    assert.equal(f.row().status, "draft");
  });
}

test("Schema changes between opening and submission fail without partial saved data", async (t) => {
  const f = fixture(t); await f.offer(); await f.open();
  f.db.exec("UPDATE property_definitions SET updated_at = 'version-2' WHERE id = 'budget'");
  await f.submit({ custom_budget: 999 });
  assert.equal(f.projects().length, 0);
  await f.open();
  assert.equal(f.form().fields.find((field) => field.key === "custom_budget").value, 999, "Keep prior input on retry");
  await f.submit();
  assert.equal(f.projects().length, 1);
});

test("An SQL property failure rolls back the Project, assignments and activity, and releases its quota", async (t) => {
  const f = fixture(t); await f.offer(); await f.open();
  f.db.exec("CREATE TRIGGER fail_property BEFORE INSERT ON item_property_values BEGIN SELECT RAISE(ABORT, 'private SQL error'); END");
  await f.submit();
  assert.equal(f.projects().length, 0);
  assert.equal(f.db.prepare("SELECT count(*) AS n FROM item_property_values").get().n, 0);
  assert.equal(f.db.prepare("SELECT count(*) AS n FROM activity_log").get().n, 0);
  assert.equal(f.calls.release, 1); assert.equal(f.row().status, "draft");
  assert.doesNotMatch(JSON.stringify(f.calls.api), /private SQL error/);
  f.db.exec("DROP TRIGGER fail_property");
  await f.open(); await f.submit();
  assert.equal(f.projects().length, 1);
});

for (const [name, sql] of [["caller revoked", "UPDATE workspace_members SET status = 'removed' WHERE id = 'me'"], ["assignee removed", "UPDATE workspace_members SET status = 'removed' WHERE id = 'peer'"], ["parent archived", "UPDATE items SET archived_at = 'now' WHERE id = 'initiative-a'"], ["property changed", "UPDATE property_definitions SET updated_at = 'v2' WHERE id = 'budget'"], ["Slack disconnected", "DELETE FROM slack_connections"], ["Slack account relinked", "UPDATE slack_member_links SET member_id = 'peer'"], ["property type changed", "UPDATE property_definitions SET type = 'text' WHERE id = 'budget'"]]) {
  test(`Atomic insert guards against ${name} immediately before commit`, async (t) => {
    const f = fixture(t, { beforeBusinessBatch: (db) => db.exec(sql) }); await f.offer(); await f.open(); await f.submit();
    assert.equal(f.projects().length, 0);
    assert.equal(f.db.prepare("SELECT count(*) AS n FROM item_property_values").get().n, 0);
    assert.equal(f.calls.release, 1);
  });
}

test("An ambiguous response after a committed batch recovers the single project without releasing its spent quota", async (t) => {
  const f = fixture(t, { errorAfterCommit: true }); await f.offer(); await f.open(); await f.submit();
  assert.equal(f.projects().length, 1); assert.equal(f.calls.release, 0); assert.equal(f.row().status, "done");
});

test("A stalled uncommitted request can be reopened after its processing lease without losing input", async (t) => {
  const f = fixture(t); await f.offer(); await f.open();
  f.db.prepare("UPDATE slack_project_drafts SET status = 'processing', operation_id = 'old-operation', updated_at = ?, input_json = ?").run(new Date(Date.now() - 121_000).toISOString(), JSON.stringify({ title: "Retry title" }));
  await f.open();
  assert.equal(f.row().status, "draft");
  assert.equal(f.form().fields.find((field) => field.key === "title").value, "Retry title");
  await f.submit();
  assert.equal(f.projects().length, 1);
});

test("Slack block limits do not silently discard properties", async (t) => {
  const f = fixture(t);
  for (let index = 0; index < 80; index++) f.addProperty(`extra-${index}`, `Extra ${index}`, "text", null);
  await f.offer(); await f.open();
  assert.match(JSON.stringify(f.calls.api.at(-1).body), /속성 수를 초과/);
  assert.equal(f.projects().length, 0);
});

test("Project quota failures keep the entered values and do not create rows", async (t) => {
  const f = fixture(t, { quotaExceeded: true }); await f.offer(); await f.open(); await f.submit({ title: "입력값 유지" });
  assert.equal(f.projects().length, 0); assert.equal(f.row().status, "draft");
  assert.match(f.row().last_error, /한도/);
  f.options.quotaExceeded = false; await f.open();
  assert.equal(f.form().fields.find((field) => field.key === "title").value, "입력값 유지");
});

test("Expired drafts and workspaces without Initiatives cannot create fabricated hierarchy", async (t) => {
  const f = fixture(t); await f.offer();
  f.db.exec("UPDATE items SET archived_at = 'now' WHERE kind = 'initiative'");
  await f.open();
  assert.match(JSON.stringify(f.calls.api.at(-1).body), /선택할 Initiative가 없습니다/);
  f.db.exec("UPDATE slack_project_drafts SET expires_at = '2000-01-01'");
  await f.open();
  assert.match(JSON.stringify(f.calls.api.at(-1).body), /만료/);
  assert.equal(f.projects().length, 0);
});

test("Oversized select catalogs use searchable choices and arbitrary property names remain plain text", async (t) => {
  const f = fixture(t); f.addProperty("large", "<@UOTHER> 선택", "select", "option-149", Array.from({ length: 150 }, (_, index) => `option-${index}`));
  await f.offer(); await f.open();
  const view = f.calls.api.at(-1).body.view;
  const field = view.blocks.find((block) => block.block_id === formApi.projectFieldBlock("custom_large"));
  assert.equal(field.element.type, "external_select"); assert.equal(field.label.type, "plain_text");
  const payload = f.submission(); payload.type = "block_suggestion"; payload.action_id = formApi.projectFieldAction("custom_large"); payload.value = "option-149";
  assert.equal((await (await f.module.handleSlackProjectInteraction(payload)).json()).options[0].value, "149");
});

test("Slack open/reply failures give private guidance and cannot undo or duplicate creation", async (t) => {
  const f = fixture(t, { openError: true }); await f.offer(); await f.open();
  assert.equal(f.calls.api.at(-1).method, "chat.postEphemeral");
  f.options.openError = false; f.options.replyError = true; await f.open(); await f.submit();
  assert.equal(f.projects().length, 1); assert.equal(f.calls.api.at(-1).method, "chat.postEphemeral");
  assert.match(f.calls.api.at(-1).body.text, /프로젝트는 생성됐지만/);
});

test("Generated migration matches runtime draft schema, is idempotent and cascades on workspace deletion", async (t) => {
  const f = fixture(t);
  f.db.exec(migration); await f.module.ensureSlackProjectDrafts(); f.db.exec(migration);
  await f.offer();
  assert.equal(f.db.prepare("SELECT count(*) AS n FROM slack_project_drafts").get().n, 1);
  f.db.exec("DELETE FROM workspaces WHERE id = 'a'");
  assert.equal(f.db.prepare("SELECT count(*) AS n FROM slack_project_drafts").get().n, 0);
  const plan = f.db.prepare("EXPLAIN QUERY PLAN SELECT id FROM slack_project_drafts WHERE owner_id = ? AND source_ref = ?").all("a", "test");
  assert.match(plan.map((row) => row.detail).join(" "), /idx_slack_project_drafts_source/);
});
