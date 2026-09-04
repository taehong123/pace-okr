import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../lib/marketing-consent.ts", import.meta.url), "utf8");
const routeSource = await readFile(new URL("../app/api/account/marketing-consent/route.ts", import.meta.url), "utf8");
const migration = await readFile(new URL("../drizzle/0039_marketing_prompt_state.sql", import.meta.url), "utf8");
function compile(code, dependencies) {
  const js = ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const loaded = { exports: {} };
  new Function("require", "module", "exports", js)((id) => {
    if (!(id in dependencies)) throw new Error(`Unexpected dependency ${id}`);
    return dependencies[id];
  }, loaded, loaded.exports);
  return loaded.exports;
}

function fixture(t) {
  const db = new DatabaseSync(":memory:");
  t.after(() => db.close());
  db.exec(`PRAGMA foreign_keys = ON;
    CREATE TABLE users (id TEXT PRIMARY KEY);
    INSERT INTO users VALUES ('a'), ('b'), ('legacy');
    CREATE TABLE account_consent_events (user_id TEXT, consent_type TEXT, granted INTEGER);
    CREATE TABLE account_registrations (user_id TEXT PRIMARY KEY, marketing_data_consent INTEGER, electronic_marketing_consent INTEGER);
    CREATE TABLE email_marketing_consents (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      marketing_data_consent INTEGER NOT NULL DEFAULT 0, marketing_data_consent_at TEXT,
      advertising_email_consent INTEGER NOT NULL DEFAULT 0, advertising_email_consent_at TEXT,
      policy_version TEXT NOT NULL, reaffirm_after TEXT, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE email_marketing_consent_events (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      consent_type TEXT NOT NULL, granted INTEGER NOT NULL, policy_version TEXT NOT NULL,
      source TEXT NOT NULL, occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);`);
  let failure = null;
  const statement = (sql, args = []) => ({
    bind: (...values) => statement(sql, values),
    first: async () => db.prepare(sql).get(...args) ?? null,
    run: async () => db.prepare(sql).run(...args),
    sql, args,
  });
  const d1 = { prepare: statement, batch: async (statements) => {
    db.exec("BEGIN");
    try {
      const results = statements.map(({ sql, args }) => {
        if (failure && failure.test(sql)) throw new Error("Injected failure");
        db.prepare(sql).run(...args);
        return { success: true };
      });
      db.exec("COMMIT");
      return results;
    } catch (error) { db.exec("ROLLBACK"); throw error; }
  } };
  const domain = compile(source, { "cloudflare:workers": { env: { DB: d1, EMAIL_UNSUBSCRIBE_SECRET: "test-only-secret" } }, "@/lib/billing": { ensureBillingSchema: async () => undefined } });
  return { db, domain, fail: (pattern) => { failure = pattern; } };
}

test("one account receives only one claim across concurrent tabs/devices; no consent is inferred", async (t) => {
  const { db, domain } = fixture(t);
  const results = await Promise.all(Array.from({ length: 8 }, () => domain.claimEmailMarketingPrompt("a")));
  assert.equal(results.filter((result) => result.showPrompt).length, 1);
  const consent = await domain.getEmailMarketingConsent("a");
  assert.equal(consent.marketingDataConsent, false);
  assert.equal(consent.advertisingEmailConsent, false);
  assert.equal(consent.marketingEligible, false);
  assert.ok(consent.promptShownAt);
  assert.equal(consent.promptRespondedAt, null);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM email_marketing_consent_events").get().count, 0);
  assert.equal((await domain.claimEmailMarketingPrompt("b")).showPrompt, true);
});

test("skip and imported browser dismissal persist without changing consent or eligibility", async (t) => {
  const { db, domain } = fixture(t);
  await domain.saveEmailMarketingConsent("a", { marketingDataConsent: true, advertisingEmailConsent: true });
  const before = db.prepare("SELECT * FROM email_marketing_consents WHERE user_id = 'a'").get();
  await domain.dismissEmailMarketingPrompt("a");
  assert.deepEqual(db.prepare("SELECT * FROM email_marketing_consents WHERE user_id = 'a'").get(), before);
  await domain.dismissEmailMarketingPrompt("b");
  const b = await domain.getEmailMarketingConsent("b");
  assert.ok(b.promptRespondedAt);
  assert.equal(b.marketingEligible, false);
  assert.equal((await domain.claimEmailMarketingPrompt("b")).showPrompt, false);
});

test("explicit first rejection is audited, while a mere display is not", async (t) => {
  const { db, domain } = fixture(t);
  await domain.claimEmailMarketingPrompt("a");
  const saved = await domain.saveEmailMarketingConsent("a", { marketingDataConsent: false, advertisingEmailConsent: false, source: "onboarding" });
  assert.ok(saved.promptRespondedAt);
  const rows = db.prepare("SELECT granted, source FROM email_marketing_consent_events WHERE user_id = 'a'").all();
  assert.equal(rows.length, 2);
  assert.ok(rows.every((row) => row.granted === 0 && row.source === "onboarding"));
  assert.equal((await domain.claimEmailMarketingPrompt("a")).showPrompt, false);
});

test("historical grant, partial consent and withdrawal suppress prompts without changing original data", async (t) => {
  const { db, domain } = fixture(t);
  db.exec(`INSERT INTO email_marketing_consents (user_id, marketing_data_consent, advertising_email_consent, policy_version)
    VALUES ('a',1,1,'old'), ('b',1,0,'old'), ('legacy',0,0,'old');
    INSERT INTO email_marketing_consent_events (id,user_id,consent_type,granted,policy_version,source)
    VALUES ('e','legacy','advertising_email',0,'old','unsubscribe');`);
  const before = db.prepare("SELECT * FROM email_marketing_consents ORDER BY user_id").all();
  for (const id of ["a", "b", "legacy"]) assert.equal((await domain.claimEmailMarketingPrompt(id)).showPrompt, false);
  assert.deepEqual(db.prepare("SELECT * FROM email_marketing_consents ORDER BY user_id").all(), before);
});

test("migration is LF, additive, idempotent and cascades only with the account", async (t) => {
  const { db } = fixture(t);
  db.exec(`INSERT INTO email_marketing_consents (user_id, marketing_data_consent, advertising_email_consent, policy_version)
    VALUES ('a',1,1,'old'), ('b',0,0,'old');`);
  const before = db.prepare("SELECT * FROM email_marketing_consents ORDER BY user_id").all();
  assert.ok(!migration.includes("\r"));
  db.exec(migration);
  db.exec(migration);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM email_marketing_prompt_state").get().count, 1);
  assert.deepEqual(db.prepare("SELECT * FROM email_marketing_consents ORDER BY user_id").all(), before);
  db.exec("DELETE FROM users WHERE id = 'a'");
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM email_marketing_prompt_state").get().count, 0);
});

test("legacy marketing responses are recognized, but mandatory privacy agreement is not a marketing response", async (t) => {
  const { db, domain } = fixture(t);
  db.exec(`INSERT INTO account_consent_events VALUES ('a','electronic_marketing',0), ('b','required_privacy',1);
    INSERT INTO account_registrations VALUES ('legacy',1,0);`);
  assert.equal((await domain.claimEmailMarketingPrompt("a")).showPrompt, false);
  assert.equal((await domain.claimEmailMarketingPrompt("b")).showPrompt, true);
  assert.equal((await domain.getEmailMarketingConsent("a")).marketingEligible, false);
  assert.equal((await domain.claimEmailMarketingPrompt("legacy")).showPrompt, false);
  assert.equal(db.prepare("SELECT marketing_data_consent FROM account_registrations WHERE user_id = 'legacy'").get().marketing_data_consent, 1);
});

test("failed save rolls back both consent choices, audit and response marker", async (t) => {
  const { db, domain, fail } = fixture(t);
  await domain.claimEmailMarketingPrompt("a");
  fail(/INSERT INTO email_marketing_consent_events/);
  await assert.rejects(domain.saveEmailMarketingConsent("a", { marketingDataConsent: true, advertisingEmailConsent: true }));
  const current = await domain.getEmailMarketingConsent("a");
  assert.equal(current.marketingEligible, false);
  assert.equal(current.promptRespondedAt, null);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM email_marketing_consent_events").get().count, 0);
});

test("expiry still blocks marketing and signed unsubscribe remains usable without re-prompting", async (t) => {
  const { db, domain } = fixture(t);
  await domain.saveEmailMarketingConsent("a", { marketingDataConsent: true, advertisingEmailConsent: true });
  db.exec("UPDATE email_marketing_consents SET reaffirm_after = '2020-01-01T00:00:00.000Z' WHERE user_id = 'a'");
  assert.equal((await domain.getEmailMarketingConsent("a")).marketingEligible, false);
  assert.equal((await domain.claimEmailMarketingPrompt("a")).showPrompt, false);
  const token = await domain.createEmailUnsubscribeToken("a");
  assert.equal(await domain.consumeEmailUnsubscribeToken(token), "a");
  const response = await domain.saveEmailMarketingConsent("a", { marketingDataConsent: false, advertisingEmailConsent: false, source: "unsubscribe" });
  assert.equal(response.marketingEligible, false);
  assert.equal((await domain.claimEmailMarketingPrompt("a")).showPrompt, false);
});

test("API uses authenticated account, permits personal Viewer settings, and rejects malformed/cross-origin writes", async (t) => {
  const { domain } = fixture(t);
  let loggedIn = true;
  const route = compile(routeSource, { "@/lib/marketing-consent": domain, "@/lib/pace-data": {
    authorizeRequest: async (_request, options) => {
      assert.equal(options.allowViewerWrite, true);
      return loggedIn ? { userId: "a", ownerId: "workspace", role: "viewer" } : new Response(null, { status: 401 });
    },
  } });
  const request = (body, method = "POST", origin = "https://okri.test") => new Request("https://okri.test/api/account/marketing-consent", {
    method, headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  assert.equal((await route.POST(request({ action: "claim" }, "POST", "https://other.test"))).status, 403);
  assert.equal((await route.POST(request({ action: "invalid" }))).status, 400);
  const response = await route.POST(request({ action: "claim", userId: "b" }));
  assert.equal((await response.json()).showPrompt, true);
  assert.equal((await domain.getEmailMarketingConsent("b")).promptShownAt, null);
  assert.equal((await route.PATCH(request({ marketingDataConsent: true }, "PATCH"))).status, 400);
  assert.equal((await route.PATCH(request({ marketingDataConsent: true, advertisingEmailConsent: true, source: "unsubscribe" }, "PATCH"))).status, 400);
  loggedIn = false;
  assert.equal((await route.POST(request({ action: "dismiss" }))).status, 401);
});
