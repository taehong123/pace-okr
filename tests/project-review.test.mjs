import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
function compile(source, dependencies = {}) {
  const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const loaded = { exports: {} };
  new Function("require", "module", "exports", js)((name) => name in dependencies ? dependencies[name] : require(name), loaded, loaded.exports);
  return loaded.exports;
}
const core = compile(await readFile(new URL("../lib/project-review.ts", import.meta.url), "utf8"));
const writerSource = await readFile(new URL("../lib/project-review-writer.ts", import.meta.url), "utf8");
const serviceSource = await readFile(new URL("../lib/project-review-service.ts", import.meta.url), "utf8");
const reviewRouteSource = await readFile(new URL("../app/api/project-reviews/route.ts", import.meta.url), "utf8");
const billingSource = await readFile(new URL("../lib/billing.ts", import.meta.url), "utf8");
const billingAst = ts.createSourceFile("billing.ts", billingSource, ts.ScriptTarget.Latest, true);
const quotaSource = billingAst.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "prepareReviewedProjectQuota").getText(billingAst);
const permissionSource = billingAst.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "reviewedProjectPermissionGuard").getText(billingAst);
const editorPolicySource = billingAst.statements.filter((node) => ts.isFunctionDeclaration(node) && ["memberCanWrite", "getEditorEnforcementState"].includes(node.name?.text)).map((node) => node.getText(billingAst)).join("\n");
const paceSource = await readFile(new URL("../lib/pace-data.ts", import.meta.url), "utf8");
const paceAst = ts.createSourceFile("pace-data.ts", paceSource, ts.ScriptTarget.Latest, true);
const documentHelpers = compile(paceAst.statements.filter((node) => ts.isFunctionDeclaration(node) && ["prepareProjectTemplateDocument", "normalizeBlockContent", "parseBlockArray", "blocksFromPlainText", "normalizeDocumentText"].includes(node.name?.text)).map((node) => node.getText(paceAst)).join("\n"));
const migrations = await Promise.all((await readdir(new URL("../drizzle/", import.meta.url))).filter((name) => name.endsWith(".sql")).sort().map((name) => readFile(new URL(`../drizzle/${name}`, import.meta.url), "utf8")));
const identity = { ownerId: "a", userId: "user", apiToken: false, role: "owner" };

function fixture() {
  const db = new DatabaseSync(":memory:");
  for (const migration of migrations) db.exec(migration);
  db.exec(`PRAGMA foreign_keys = ON;
    INSERT INTO workspaces (id,name,owner_user_id) VALUES ('a','Team A','user'),('b','Private B','other');
    INSERT INTO okr_cycles (id,owner_id,name,start_date,end_date,status) VALUES ('cycle','a','Q3','2026-07-01','2026-09-30','active');
    INSERT INTO workspace_members (id,workspace_id,user_id,display_name,email,role,status) VALUES
      ('me','a','user','태홍','me@example.com','owner','active'),('peer','a','peer','민지','peer@example.com','member','active'),('other','b','other','다른 팀','other@example.com','owner','active');
    INSERT INTO items (id,owner_id,kind,title,description,parent_id,cycle_id,status,updated_at) VALUES
      ('o','a','objective','고객 경험','고객의 가입 경험을 개선',NULL,'cycle','todo','2026-09-02'),
      ('kr','a','key_result','활성화 40%','첫 핵심행동 완료율','o','cycle','todo','2026-09-02'),
      ('i','a','initiative','첫 경험 단순화','온보딩 이탈 감소','kr','cycle','todo','2026-09-02'),
      ('i2','a','initiative','결제 경험 개선','결제 실패를 줄임','kr','cycle','todo','2026-09-02'),
      ('orphan','a','initiative','고아','',NULL,'cycle','todo','2026-09-02'),
      ('private','b','initiative','비밀 연결','Private',NULL,NULL,'todo','2026-09-02');
    INSERT INTO property_definitions (id,owner_id,name,type,options,default_value,updated_at) VALUES ('budget','a','예산','number','[]','7','2026-09-02');
    INSERT INTO project_templates (id,owner_id,name,content,plain_text,updated_at) VALUES ('template','a','개발 계획','[]','승인한 본문','2026-09-02');
  `);
  const stats = { batches: 0, beforeBatch: null, loseResponse: false, lastBatchError: null, billingEnabled: true };
  const d1 = {
    prepare(sql) {
      const bind = (...values) => ({ sql, values,
        async first() { return db.prepare(sql).get(...values) ?? null; },
        async all() { return { results: db.prepare(sql).all(...values) }; },
        async run() { const result = db.prepare(sql).run(...values); return { meta: { changes: Number(result.changes) } }; },
      });
      return { ...bind(), bind };
    },
    async batch(statements) {
      stats.batches++;
      stats.beforeBatch?.();
      db.exec("BEGIN");
      let committed = false;
      try {
        const results = statements.map((statement) => ({ meta: { changes: Number(db.prepare(statement.sql).run(...statement.values).changes) } }));
        db.exec("COMMIT");
        committed = true;
        if (stats.loseResponse) throw new Error("lost response after commit");
        return results;
      } catch (error) { stats.lastBatchError = error; if (!committed) db.exec("ROLLBACK"); throw error; }
    },
  };
  const propertyRows = () => db.prepare("SELECT * FROM property_definitions WHERE owner_id = 'a' AND active = 1").all().map((row) => ({
    id: row.id, name: row.name, type: row.type, options: row.options, defaultValue: row.default_value, systemKey: row.system_key, updatedAt: row.updated_at,
  }));
  const pace = {
    ...documentHelpers,
    getWorkspaceRules: async () => ({ defaultPriority: "medium", defaultCadence: "weekly" }),
    listProjectPropertyDefinitions: async () => propertyRows(),
    getProjectTemplate: async (_owner, id) => { const row = db.prepare("SELECT * FROM project_templates WHERE id = ?").get(id); return row ? { id: row.id, name: row.name, content: row.content, plainText: row.plain_text, updatedAt: row.updated_at } : null; },
    validateItemPropertiesByName: async (_owner, values) => Object.entries(values).map(([name, value]) => {
      const property = propertyRows().find((row) => row.name === name);
      if (!property || property.systemKey) throw new Error("Property not found");
      return { property, value };
    }),
  };
  const quotaContext = { billingEnforcementEnabled: () => stats.billingEnabled, getWorkspaceSubscription: async () => db.prepare("SELECT plan FROM workspace_subscriptions WHERE workspace_id = 'a'").get() ?? { plan: "free" },
    validPlan: (plan) => ["free", "team", "business"].includes(plan), BILLING_PLANS: { free: { projectLimit: 3, editorLimit: 3 }, team: { projectLimit: 100, editorLimit: 10 }, business: { projectLimit: null, editorLimit: null } }, kstPeriod: () => ({ key: "2026-09", resetsAt: "2026-10-01" }) };
  const runtime = { DB: d1 };
  const quota = compile(`const { env } = require('cloudflare:workers'); const { billingEnforcementEnabled, getWorkspaceSubscription, validPlan, BILLING_PLANS, kstPeriod } = require('quota-context');\n${quotaSource}\n${permissionSource}\n${editorPolicySource}`, { "cloudflare:workers": { env: runtime }, "quota-context": quotaContext });
  class BillingLimitError extends Error { constructor(code, message, details) { super(message); this.code = code; this.details = details; } }
  const dependencies = { "cloudflare:workers": { env: { DB: d1 } }, "@/lib/project-review": core, "@/lib/pace-data": pace, "@/lib/billing": { ...quota, BillingLimitError } };
  const writer = compile(writerSource, dependencies);
  const service = compile(serviceSource, dependencies);
  const approve = async (review, parentId = "i2") => {
    const parent = await core.getReviewInitiative(d1, "a", parentId);
    try {
      return await core.approveProjectReview(d1, identity, { id: review.id, version: review.version, initiativeId: parentId, initiativeFingerprint: parent?.fingerprint ?? "wrong" },
        (draft, selected, completed) => writer.writeReviewedProject(identity, draft, selected, completed));
    } catch (error) { error.cause = stats.lastBatchError; throw error; }
  };
  const propose = async (input = {}) => {
    const staged = await service.stageProjectReview(identity, { title: "결제 개편", dueDate: "2026-09-15", driMemberId: "me", workerMemberIds: ["peer"], templateId: "template", ...input }, [{ initiativeId: "i", reason: "검토할 AI 후보" }], "https://okrptr.com");
    return core.getProjectReview(d1, identity, staged.id);
  };
  const route = (auth = identity) => compile(reviewRouteSource, { ...dependencies,
    "@/lib/pace-data": { ...pace, authorizeRequest: async () => auth, ensureWorkspace: async () => {} },
    "@/lib/project-review-writer": writer,
  });
  return { db, d1, stats, writer, service, propose, approve, route, quota, runtime };
}

test("Proposal is not creation; defaults are visible and same-request retries reuse the pending review", async () => {
  const f = fixture();
  try {
    const review = await f.propose();
    assert.equal(review.state, "pending"); assert.equal(review.selectedParent, null);
    assert.deepEqual(review.proposal.properties, { 예산: 7 });
    assert.equal(review.fieldLabels.dri, "태홍");
    assert.equal((await f.propose()).id, review.id);
    assert.equal(f.db.prepare("SELECT count(*) AS n FROM items WHERE kind = 'project'").get().n, 0);
    assert.equal(f.db.prepare("SELECT count(*) AS n FROM project_monthly_usage").get().n, 0);
    const choices = await core.listReviewInitiatives(f.d1, "a", "가입 경험");
    assert.deepEqual(choices.choices.map((row) => row.id), ["i", "i2"]);
    assert.equal(await core.getReviewInitiative(f.d1, "a", "private"), null);
    assert.equal(await core.getReviewInitiative(f.d1, "a", "orphan"), null);
  } finally { f.db.close(); }
});

test("User can reject a recommendation and select another Initiative; all data and receipt commit once", async () => {
  const f = fixture();
  try {
    const review = await f.propose();
    const result = await f.approve(review, "i2");
    assert.equal(result.state, "created");
    assert.equal(result.selectedParent.id, "i2");
    const item = f.db.prepare("SELECT * FROM items WHERE id = ?").get(review.projectId);
    assert.equal(item.parent_id, "i2"); assert.equal(item.cycle_id, "cycle"); assert.equal(item.due_date, "2026-09-15");
    assert.equal(f.db.prepare("SELECT count(*) AS n FROM item_assignments WHERE item_id = ?").get(item.id).n, 2);
    assert.equal(f.db.prepare("SELECT value FROM item_property_values WHERE item_id = ?").get(item.id).value, "7");
    assert.equal(f.db.prepare("SELECT plain_text FROM project_documents WHERE project_id = ?").get(item.id).plain_text, "승인한 본문");
    assert.equal((await core.getProjectReview(f.d1, identity, review.id)).state, "created");
    await f.approve(review, "i2");
    assert.equal(f.db.prepare("SELECT count(*) AS n FROM items WHERE kind = 'project'").get().n, 1);
    assert.equal(f.db.prepare("SELECT created_count FROM project_monthly_usage").get().created_count, 1);
  } finally { f.db.close(); }
});

test("Every write-stage failure rolls back Project, assignments, properties, document, activity and quota", async () => {
  for (const table of ["items", "item_assignments", "item_property_values", "project_documents", "activity_log", "assistant_drafts"]) {
    const f = fixture();
    try {
      const review = await f.propose();
      const operation = table === "assistant_drafts" ? "UPDATE" : "INSERT";
      const condition = table === "assistant_drafts" ? "WHEN json_extract(NEW.payload_json, '$.state') = 'created'" : table === "items" ? "WHEN NEW.kind = 'project'" : "";
      f.db.exec(`CREATE TRIGGER forced_failure BEFORE ${operation} ON ${table} ${condition} BEGIN SELECT RAISE(ABORT, 'test failure'); END`);
      await assert.rejects(() => f.approve(review), /전체 생성을 취소/);
      for (const target of ["item_assignments", "item_property_values", "project_documents", "activity_log", "project_monthly_usage"]) {
        assert.equal(f.db.prepare(`SELECT count(*) AS n FROM ${target}`).get().n, 0, `${table} -> ${target}`);
      }
      assert.equal(f.db.prepare("SELECT count(*) AS n FROM items WHERE kind = 'project'").get().n, 0, table);
      assert.equal((await core.getProjectReview(f.d1, identity, review.id)).state, "failed");
      await assert.rejects(() => f.approve(review), /이미 처리/);
    } finally { f.db.close(); }
  }
});

test("Stale parent, inactive member race, changed template/property, wrong user and forged approval cannot create", async () => {
  const f = fixture();
  try {
    const review = await f.propose();
    await assert.rejects(() => core.getProjectReview(f.d1, { ownerId: "a", userId: "peer" }, review.id), /찾을 수 없습니다/);
    const parent = await core.getReviewInitiative(f.d1, "a", "i2");
    f.db.prepare("UPDATE items SET updated_at = 'changed' WHERE id = 'kr'").run();
    await assert.rejects(() => core.approveProjectReview(f.d1, identity, { id: review.id, version: review.version, initiativeId: "i2", initiativeFingerprint: parent.fingerprint }, async () => assert.fail()), /변경/);
    f.stats.beforeBatch = () => f.db.exec("UPDATE workspace_members SET status = 'removed' WHERE id = 'peer'");
    await assert.rejects(() => f.approve(review), /전체 생성을 취소/);
    assert.equal(f.db.prepare("SELECT count(*) AS n FROM items WHERE kind = 'project'").get().n, 0);
  } finally { f.db.close(); }
  for (const mutation of ["UPDATE project_templates SET updated_at = 'changed'", "UPDATE property_definitions SET updated_at = 'changed'"]) {
    const f = fixture();
    try { const review = await f.propose(); f.db.exec(mutation); await assert.rejects(() => f.approve(review), /변경/); assert.equal(f.db.prepare("SELECT count(*) AS n FROM items WHERE kind = 'project'").get().n, 0); }
    finally { f.db.close(); }
  }
  for (const [request, token] of [
    [new Request("https://okrptr.com/api/project-reviews", { method: "POST", headers: { Origin: "https://okrptr.com", Authorization: "Bearer forged" } }), true],
    [new Request("https://okrptr.com/api/project-reviews", { method: "POST", headers: { Origin: "https://evil.example" } }), false],
    [new Request("https://okrptr.com/api/project-reviews", { method: "POST" }), false],
  ]) assert.throws(() => core.assertProjectReviewBrowserRequest(request, { apiToken: token }));
});

test("A committed save with a lost response returns its receipt instead of creating again", async () => {
  const f = fixture();
  try { const review = await f.propose(); f.stats.loseResponse = true; assert.equal((await f.approve(review)).state, "created"); assert.equal((await f.approve(review)).state, "created"); assert.equal(f.db.prepare("SELECT created_count FROM project_monthly_usage").get().created_count, 1); }
  finally { f.db.close(); }
});

test("Concurrent approvals claim one request and consume quota only once", async () => {
  const f = fixture();
  try {
    const review = await f.propose();
    const results = await Promise.allSettled([f.approve(review), f.approve(review)]);
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(f.db.prepare("SELECT count(*) AS n FROM items WHERE kind = 'project'").get().n, 1);
    assert.equal(f.db.prepare("SELECT created_count FROM project_monthly_usage").get().created_count, 1);
  } finally { f.db.close(); }
});

test("Approval route requires browser identity, same origin, explicit choice and checked confirmation", async () => {
  const f = fixture();
  try {
    const review = await f.propose();
    const parent = await core.getReviewInitiative(f.d1, "a", "i2");
    const payload = { decision: "approve", id: review.id, version: review.version, initiativeId: parent.id, initiativeFingerprint: parent.fingerprint, confirmed: true };
    const request = (body = payload, origin = "https://okrptr.com") => new Request("https://okrptr.com/api/project-reviews", { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    assert.equal((await f.route({ ...identity, apiToken: true }).POST(request())).status, 403);
    assert.equal((await f.route().POST(request(payload, "https://evil.example"))).status, 403);
    assert.equal((await f.route().POST(request({ ...payload, confirmed: false }))).status, 400);
    assert.equal((await f.route().POST(request({ ...payload, initiativeId: "" }))).status, 400);
    assert.equal((await f.route({ ...identity, ownerId: "b" }).POST(request())).status, 404);
    assert.equal((await f.route(Response.json({ error: "forbidden" }, { status: 403 })).POST(request())).status, 403);
    assert.equal(f.db.prepare("SELECT count(*) AS n FROM items WHERE kind = 'project'").get().n, 0);
    const response = await f.route().POST(request());
    assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal((await response.json()).review.state, "created");
    assert.equal((await f.route().POST(request())).status, 200);
    assert.equal(f.db.prepare("SELECT count(*) AS n FROM items WHERE kind = 'project'").get().n, 1);
  } finally { f.db.close(); }
});

test("Closed cycle and an ancestor changing between validation and commit cannot be attached", async () => {
  for (const mutation of ["UPDATE okr_cycles SET status = 'closed' WHERE id = 'cycle'", "UPDATE items SET updated_at = 'changed', title = '다른 목적' WHERE id = 'o'"]) {
    const f = fixture();
    try {
      const review = await f.propose(); f.stats.beforeBatch = () => f.db.exec(mutation);
      await assert.rejects(() => f.approve(review), /전체 생성을 취소/);
      assert.equal(f.db.prepare("SELECT count(*) AS n FROM items WHERE kind = 'project'").get().n, 0);
      assert.equal(f.db.prepare("SELECT count(*) AS n FROM project_monthly_usage").get().n, 0);
    } finally { f.db.close(); }
  }
});

test("Approver membership, role, editor selection and plan are rechecked inside the atomic batch", async () => {
  for (const mutation of [
    "UPDATE workspace_members SET status = 'removed' WHERE id = 'me'",
    "UPDATE workspace_members SET role = 'viewer' WHERE id = 'me'",
    "INSERT INTO workspace_editor_selections (workspace_id,member_id,selected) VALUES ('a','peer',1)",
    "INSERT INTO workspace_subscriptions (workspace_id,billing_owner_user_id,plan) VALUES ('a','user','team')",
    "UPDATE workspaces SET scheduled_deletion_at = '2026-09-03' WHERE id = 'a'",
  ]) {
    const f = fixture();
    try {
      // The approver is NOT an assignee: this tests their authority independently.
      const review = await f.propose({ driMemberId: null, workerMemberIds: [] });
      f.stats.beforeBatch = () => f.db.exec(mutation);
      await assert.rejects(() => f.approve(review), /전체 생성을 취소/);
      assert.equal(f.db.prepare("SELECT count(*) AS n FROM items WHERE kind = 'project'").get().n, 0);
      assert.equal(f.db.prepare("SELECT count(*) AS n FROM project_monthly_usage").get().n, 0);
    } finally { f.db.close(); }
  }
});

test("Atomic editor guard matches the existing policy for plans, explicit selection, fallback order and grace", async () => {
  for (const plan of ["free", "team", "business", "unknown"]) for (const selected of [false, true]) for (const grace of [false, true]) {
    const f = fixture();
    try {
      f.db.prepare("INSERT INTO workspace_subscriptions (workspace_id,billing_owner_user_id,plan) VALUES ('a','user',?)").run(plan);
      for (let index = 0; index < 4; index++) f.db.prepare("INSERT INTO workspace_members (id,workspace_id,user_id,role,status) VALUES (?,'a',?,'member','active')").run(`test-${index}`, `test-${index}`);
      if (selected) f.db.exec("INSERT INTO workspace_editor_selections (workspace_id,member_id,selected) VALUES ('a','peer',1)");
      if (grace) { f.runtime.BILLING_ENFORCEMENT_STARTED_AT = new Date().toISOString(); f.db.exec("UPDATE workspaces SET created_at = '2020-01-01' WHERE id = 'a'"); }
      for (const member of f.db.prepare("SELECT user_id,role FROM workspace_members WHERE workspace_id='a'").all()) {
        const guard = f.quota.reviewedProjectPermissionGuard("a", member.user_id);
        const actual = Boolean(f.db.prepare(`SELECT ${guard.sql} AS allowed`).get(...guard.bindings).allowed);
        assert.equal(actual, await f.quota.memberCanWrite("a", member.user_id, member.role), `${plan}/${selected}/${grace}/${member.user_id}`);
      }
    } finally { f.db.close(); }
  }
});

test("Template precedes the approved description, with fresh block IDs and synchronized plain text", async () => {
  const f = fixture();
  try {
    const blocks = [{ id: "template-block", type: "paragraph", content: "승인된 본문", children: [{ id: "nested-block", type: "paragraph", content: "세부" }] }];
    f.db.prepare("UPDATE project_templates SET content = ?, plain_text = '승인된 본문' WHERE id = 'template'").run(JSON.stringify(blocks));
    const review = await f.propose({ description: "# 완료 기준\n결제 이탈 감소", requestedCycleId: "cycle" });
    assert.equal(review.fieldLabels.cycle, "Q3"); assert.equal(review.templatePreview, "승인된 본문");
    await f.approve(review);
    const doc = f.db.prepare("SELECT content, plain_text FROM project_documents WHERE project_id = ?").get(review.projectId);
    const saved = JSON.parse(doc.content);
    assert.equal(saved[0].content, "승인된 본문"); assert.equal(saved[1].type, "heading"); assert.equal(saved[2].content, "결제 이탈 감소");
    assert.notEqual(saved[0].id, "template-block"); assert.notEqual(saved[0].children[0].id, "nested-block");
    assert.equal(new Set([saved[0].id, saved[0].children[0].id, saved[1].id, saved[2].id]).size, 4);
    assert.equal(doc.plain_text, "승인된 본문\n\n# 완료 기준\n결제 이탈 감소");
    assert.equal(f.db.prepare("SELECT description FROM items WHERE id = ?").get(review.projectId).description, doc.plain_text);
  } finally { f.db.close(); }
});

test("Cancel and expiry never create; quota failure also rolls back the complete save", async () => {
  const f = fixture();
  try {
    const review = await f.propose();
    await core.cancelProjectReview(f.d1, identity, review.id, review.version);
    await assert.rejects(() => f.approve(review), /이미 처리/);
    const expired = await f.propose({ title: "만료 요청" });
    f.db.prepare("UPDATE assistant_drafts SET payload_json = json_set(payload_json, '$.expiresAt', '2000-01-01') WHERE id = ?").run(expired.id);
    await assert.rejects(() => f.approve(expired), /만료/);
    const limited = await f.propose({ title: "한도 요청" });
    f.db.exec("INSERT INTO project_monthly_usage (workspace_id, period_key, created_count) VALUES ('a','2026-09',3)");
    await assert.rejects(() => f.approve(limited), /한도/);
    assert.equal(f.db.prepare("SELECT created_count FROM project_monthly_usage").get().created_count, 3);
    assert.equal(f.db.prepare("SELECT count(*) AS n FROM items WHERE kind = 'project'").get().n, 0);
  } finally { f.db.close(); }
});

test("Generic drafts API cannot forge or overwrite system review state", async () => {
  const f = fixture();
  try {
    const draftApi = compile(await readFile(new URL("../lib/assistant-drafts.ts", import.meta.url), "utf8"), { "cloudflare:workers": { env: { DB: f.d1 } } });
    await assert.rejects(() => draftApi.saveAssistantDraft("a", "user", "system:project-review:fake", { state: "created" }), /시스템/);
    await assert.rejects(() => draftApi.deleteAssistantDraft("a", "user", "SYSTEM:PROJECT-REVIEW:fake"), /시스템/);
  } finally { f.db.close(); }
});

test("REST integration token cannot bypass Project review by claiming source=web", async () => {
  let created = 0;
  const route = compile(await readFile(new URL("../app/api/items/route.ts", import.meta.url), "utf8"), {
    "@/lib/pace-data": { authorizeRequest: async () => ({ ...identity, apiToken: true }), ensureWorkspace: async () => {}, createItem: async () => { created++; }, ITEM_STATUSES: ["todo"] },
    "@/lib/billing": { BillingLimitError: class extends Error {} },
    "@/lib/project-review-service": { stageProjectReview: async () => ({ state: "awaiting_user_confirmation" }) },
  });
  const response = await route.POST(new Request("https://okrptr.com/api/items", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "임의 생성 시도", kind: "project", parentId: "i", source: "web" }) }));
  assert.equal(response.status, 202); assert.equal((await response.json()).created, false); assert.equal(created, 0);
});

test("Bulk OKR plan cannot bypass Project review or create ancestors before rejecting", async () => {
  let creates = 0;
  const route = compile(await readFile(new URL("../app/api/okr-plan/route.ts", import.meta.url), "utf8"), {
    "@/lib/pace-data": { authorizeRequest: async () => ({ ...identity, apiToken: true }), ensureWorkspace: async () => {}, createOkrPlan: async () => { creates++; } },
    "@/lib/billing": { BillingLimitError: class extends Error {} },
  });
  const response = await route.POST(new Request("https://okrptr.com/api/okr-plan", { method: "POST", body: JSON.stringify({ cycleId: "cycle", objective: "임의 목적", keyResult: "임의 KR", initiative: "임의 연결", project: "우회 생성" }) }));
  assert.equal(response.status, 409); assert.equal((await response.json()).created, false); assert.equal(creates, 0);
});
