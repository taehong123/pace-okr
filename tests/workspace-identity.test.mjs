import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import ts from "typescript";

const addressSource = await readFile(new URL("../lib/workspace-address.ts", import.meta.url), "utf8");
const identitySource = await readFile(new URL("../lib/workspace-identity.ts", import.meta.url), "utf8");
const profileSource = await readFile(new URL("../app/api/workspaces/profile/route.ts", import.meta.url), "utf8");
const openSource = await readFile(new URL("../app/api/workspaces/open/route.ts", import.meta.url), "utf8");
const migration = await readFile(new URL("../drizzle/0041_workspace_identity.sql", import.meta.url), "utf8");

function compile(source, dependencies = {}) {
  const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const loaded = { exports: {} };
  new Function("require", "module", "exports", js)((id) => {
    if (!(id in dependencies)) throw new Error(`Unexpected import ${id}`);
    return dependencies[id];
  }, loaded, loaded.exports);
  return loaded.exports;
}
const address = compile(addressSource);
const identity = compile(identitySource, { "./workspace-address": address });

function fixture(t, migrate = true) {
  const db = new DatabaseSync(":memory:");
  t.after(() => db.close());
  db.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE workspaces (id TEXT PRIMARY KEY, name TEXT, scheduled_deletion_at TEXT, updated_at TEXT);
    CREATE TABLE workspace_members (workspace_id TEXT, user_id TEXT, role TEXT, status TEXT);
    INSERT INTO workspaces VALUES ('a','우리 팀',NULL,'old'),('b','다른 팀',NULL,'old');
    INSERT INTO workspace_members VALUES ('a','owner','owner','active'),('a','admin','admin','active'),
      ('a','reader','viewer','active'),('a','member','member','active'),('b','other','owner','active');`);
  if (migrate) db.exec(migration);
  let beforeBatch = null, failure = null;
  const statement = (sql, args = []) => ({ sql, args,
    bind: (...values) => statement(sql, values),
    first: async () => db.prepare(sql).get(...args) ?? null,
    run: async () => db.prepare(sql).run(...args),
  });
  const d1 = { prepare: statement, batch: async (statements) => {
    if (beforeBatch && statements.some(({ sql }) => sql.startsWith("INSERT INTO workspace_identity_guards"))) { const fn = beforeBatch; beforeBatch = null; fn(); }
    db.exec("BEGIN");
    try {
      const results = statements.map(({ sql, args }) => {
        if (failure?.test(sql)) throw new Error("Injected write failure");
        db.prepare(sql).run(...args); return { success: true };
      });
      db.exec("COMMIT"); return results;
    } catch (error) { db.exec("ROLLBACK"); throw error; }
  } };
  return { db, d1, before: (fn) => { beforeBatch = fn; }, fail: (pattern) => { failure = pattern; } };
}

test("name and address are independent; owners/admins can edit without touching other teams", async (t) => {
  const { db, d1 } = fixture(t);
  const first = await identity.readWorkspaceIdentity(d1, "a", "owner");
  assert.equal(first.address, null);
  const saved = await identity.updateWorkspaceIdentity(d1, "a", "owner", { name: "새로운 Workspace", address: " Our-Team ", revision: 0 });
  assert.equal(saved.name, "새로운 Workspace"); assert.equal(saved.address, "our-team");
  assert.equal(saved.subdomainsEnabled, false); assert.equal(saved.url, "/api/workspaces/open?address=our-team");
  const renamed = await identity.updateWorkspaceIdentity(d1, "a", "admin", { name: "팀 이름만 변경", revision: 1 }, true);
  assert.equal(renamed.address, "our-team"); assert.equal(renamed.url, "https://our-team.okrptr.com/");
  assert.equal(db.prepare("SELECT name FROM workspaces WHERE id='b'").get().name, "다른 팀");
  const source = await readFile(new URL("../lib/pace-data.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /personalWorkspace\.name\.endsWith\(" Workspace"\)/);
});

test("old addresses still open the same workspace and can never transfer after deletion", async (t) => {
  const { db, d1 } = fixture(t);
  await identity.updateWorkspaceIdentity(d1, "a", "owner", { address: "first-team", revision: 0 });
  await identity.updateWorkspaceIdentity(d1, "a", "owner", { address: "second-team", revision: 1 });
  assert.equal((await identity.workspaceForAddress(d1, "FIRST-TEAM", "owner")).id, "a");
  assert.equal((await identity.workspaceForAddress(d1, "second-team", "admin")).id, "a");
  assert.equal(await identity.workspaceForAddress(d1, "first-team", "other"), null);
  db.exec("UPDATE workspaces SET scheduled_deletion_at='soon' WHERE id='a'");
  assert.equal(await identity.workspaceForAddress(d1, "first-team", "owner"), null);
  db.exec("DELETE FROM workspaces WHERE id='a'");
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM workspace_addresses").get().n, 2);
  await assert.rejects(identity.updateWorkspaceIdentity(d1, "b", "other", { address: "first-team", revision: 0 }), /사용 중/);
});

test("members, viewers, revoked members and cross-workspace accounts cannot rename", async (t) => {
  const { db, d1 } = fixture(t);
  for (const user of ["reader", "member", "other"]) {
    await assert.rejects(identity.updateWorkspaceIdentity(d1, "a", user, { name: "no", revision: 0 }), (e) => e.status === 403);
  }
  db.exec("UPDATE workspace_members SET status='removed' WHERE user_id='admin'");
  await assert.rejects(identity.readWorkspaceIdentity(d1, "a", "admin"), (e) => e.status === 403);
  assert.equal(db.prepare("SELECT name FROM workspaces WHERE id='a'").get().name, "우리 팀");
});

test("validation rejects reserved/invalid addresses, invalid names and missing revisions", async (t) => {
  const { d1 } = fixture(t);
  for (const value of ["www", "admin", "xn--hello", "a", "a_b", "한글", "a.b", "-hello", "hello-", "a".repeat(49), null]) {
    await assert.rejects(identity.updateWorkspaceIdentity(d1, "a", "owner", { address: value, revision: 0 }), (e) => e.status === 400);
  }
  for (const name of ["", " ", "a\nb", "a".repeat(81), null]) {
    await assert.rejects(identity.updateWorkspaceIdentity(d1, "a", "owner", { name, revision: 0 }), (e) => e.status === 400);
  }
  await assert.rejects(identity.updateWorkspaceIdentity(d1, "a", "owner", { name: "hello" }), (e) => e.status === 409);
});

test("same address concurrent claims and stale edits have exactly one winner", async (t) => {
  const { d1 } = fixture(t);
  const outcomes = await Promise.allSettled([
    identity.updateWorkspaceIdentity(d1, "a", "owner", { address: "same-team", revision: 0 }),
    identity.updateWorkspaceIdentity(d1, "b", "other", { address: "same-team", revision: 0 }),
  ]);
  assert.equal(outcomes.filter((r) => r.status === "fulfilled").length, 1);
  const current = await identity.readWorkspaceIdentity(d1, "a", "owner");
  const updates = await Promise.allSettled([
    identity.updateWorkspaceIdentity(d1, "a", "owner", { name: "one", revision: current.revision }),
    identity.updateWorkspaceIdentity(d1, "a", "admin", { name: "two", revision: current.revision }),
  ]);
  assert.equal(updates.filter((r) => r.status === "fulfilled").length, 1);
});

test("permission races and storage failures roll back name, address and revision together", async (t) => {
  const { db, d1, before, fail } = fixture(t);
  await identity.readWorkspaceIdentity(d1, "a", "owner");
  before(() => db.exec("UPDATE workspace_members SET role='viewer' WHERE user_id='owner'"));
  await assert.rejects(identity.updateWorkspaceIdentity(d1, "a", "owner", { name: "no", address: "no-race", revision: 0 }), (e) => e.status === 409);
  db.exec("UPDATE workspace_members SET role='owner' WHERE user_id='owner'");
  fail(/INSERT INTO workspace_identity_settings/);
  await assert.rejects(identity.updateWorkspaceIdentity(d1, "a", "owner", { name: "no", address: "no-partial", revision: 0 }), /Injected/);
  assert.equal(db.prepare("SELECT name FROM workspaces WHERE id='a'").get().name, "우리 팀");
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM workspace_addresses").get().n, 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM workspace_identity_guards").get().n, 0);
});

test("migration is LF and additive; guards and case-insensitive address uniqueness remain enforced", (t) => {
  const { db } = fixture(t, false);
  assert.ok(!migration.includes("\r"));
  db.exec(migration);
  db.exec("INSERT INTO workspace_addresses VALUES ('same-team','a','now')");
  assert.throws(() => db.exec("INSERT INTO workspace_addresses VALUES ('SAME-TEAM','b','now')"));
  assert.throws(() => db.exec("INSERT INTO workspace_identity_guards VALUES ('bad',0)"));
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM workspaces").get().n, 2);
});

test("subdomains route only browser entry to the canonical origin; unknown hosts and unsafe return paths cannot redirect outside", async () => {
  const config = await readFile(new URL("../vite.config.ts", import.meta.url), "utf8");
  assert.match(config, /run_worker_first:\s*\["\/",\s*"\/_vinext\/image"\]/);
  const redirect = address.workspaceSubdomainRedirect(new Request("https://our-team.okrptr.com/?view=work&project=1&code=secret"), true);
  const target = new URL(redirect.headers.get("location"));
  assert.equal(target.origin, "https://okrptr.com");
  assert.equal(target.searchParams.get("address"), "our-team");
  assert.equal(target.searchParams.get("returnTo"), "/?view=work&project=1");
  for (const input of ["//evil.example", "https://evil.example/", "/\\evil.example", "/api/auth/logout", "http://[", "/\n"]) assert.equal(address.workspaceReturnPath(input), "/");
  assert.equal(address.workspaceSubdomainRedirect(new Request("https://okrptr.com/"), true), null);
  assert.equal(address.workspaceSubdomainRedirect(new Request("https://okrptr.com.evil.example/"), true), null);
  assert.equal(address.workspaceSubdomainRedirect(new Request("https://our-team.okrptr.com/"), false).status, 503);
  assert.equal(address.workspaceSubdomainRedirect(new Request("https://a.b.okrptr.com/"), true).status, 404);
  assert.equal(address.workspaceSubdomainRedirect(new Request("https://our-team.okrptr.com/api/items"), true).status, 405);
  assert.equal(address.workspaceSubdomainRedirect(new Request("https://our-team.okrptr.com/", { method: "POST" }), true).status, 405);
});

test("profile API requires browser same-origin writes and explicit matching workspace context", async () => {
  let writes = 0;
  let auth = { ownerId: "a", userId: "owner", apiToken: false };
  const route = compile(profileSource, {
    "cloudflare:workers": { env: { DB: {} } },
    "@/lib/pace-data": { authorizeRequest: async () => auth },
    "@/lib/workspace-identity": { ...identity, updateWorkspaceIdentity: async () => { writes++; return {}; } },
  });
  const req = (headers = {}, body = {}) => new Request("https://okrptr.com/api/workspaces/profile", { method: "PATCH", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
  assert.equal((await route.PATCH(req())).status, 403);
  assert.equal((await route.PATCH(req({ origin: "https://evil.example" }))).status, 403);
  assert.equal((await route.PATCH(req({ origin: "https://okrptr.com", "x-okrptr-workspace-id": "b" }))).status, 403);
  const headers = { origin: "https://okrptr.com", "x-okrptr-workspace-id": "a" };
  auth = { ...auth, apiToken: true };
  assert.equal((await route.PATCH(req(headers))).status, 403);
  auth = { ...auth, apiToken: false };
  assert.equal((await route.PATCH(req(headers))).status, 200);
  assert.equal(writes, 1);
});

test("address entry never falls back to a different workspace; login keeps the intended address and clears stale cache", async () => {
  let auth = new Response(null, { status: 401 }), resolved = null;
  const route = compile(openSource, {
    "cloudflare:workers": { env: { DB: {} } },
    "@/lib/pace-data": { authorizeRequest: async () => auth },
    "@/lib/workspace-address": address,
    "@/lib/workspace-identity": { workspaceForAddress: async () => resolved },
  });
  const request = new Request("https://okrptr.com/api/workspaces/open?address=our-team&returnTo=" + encodeURIComponent("/?view=work"));
  const login = await route.GET(request);
  assert.equal(login.status, 302);
  assert.equal(new URL(login.headers.get("location")).pathname, "/api/auth/google");
  assert.match(new URL(login.headers.get("location")).searchParams.get("returnTo"), /our-team/);
  auth = { ownerId: "b", userId: "owner", apiToken: false };
  const denied = await route.GET(request);
  assert.equal(denied.status, 404); assert.equal(denied.headers.get("set-cookie"), null);
  resolved = { id: "a" };
  const opened = await route.GET(request);
  assert.equal(opened.status, 200);
  assert.match(opened.headers.get("set-cookie"), /^okrptr_workspace_id=a;.*HttpOnly.*Secure/);
  assert.doesNotMatch(opened.headers.get("set-cookie"), /Domain=/);
  assert.match(opened.headers.get("content-security-policy"), /frame-ancestors 'none'/);
  assert.match(await opened.text(), /localStorage.removeItem\("okrptr.bootstrap.v1"\)/);
});
