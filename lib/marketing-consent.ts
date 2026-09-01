import { env } from "cloudflare:workers";
import { ensureBillingSchema } from "@/lib/billing";

export const EMAIL_MARKETING_POLICY_VERSION = "2026-09-01";
const TWO_YEARS_MS = 2 * 365 * 24 * 60 * 60_000;

type MarketingRuntimeEnv = typeof env & {
  EMAIL_UNSUBSCRIBE_SECRET?: string;
  INTERNAL_BILLING_SECRET?: string;
};

type ConsentRow = {
  marketing_data_consent: number;
  marketing_data_consent_at: string | null;
  advertising_email_consent: number;
  advertising_email_consent_at: string | null;
  policy_version: string;
  reaffirm_after: string | null;
  updated_at: string;
};

export async function getEmailMarketingConsent(userId: string) {
  await ensureBillingSchema();
  const d1 = (env as MarketingRuntimeEnv).DB;
  await d1.prepare(`INSERT OR IGNORE INTO email_marketing_consents
    (user_id, marketing_data_consent, advertising_email_consent, policy_version, updated_at)
    VALUES (?, 0, 0, ?, CURRENT_TIMESTAMP)`).bind(userId, EMAIL_MARKETING_POLICY_VERSION).run();
  const row = await d1.prepare("SELECT * FROM email_marketing_consents WHERE user_id = ? LIMIT 1").bind(userId).first<ConsentRow>();
  if (!row) throw new Error("이메일 마케팅 동의 정보를 불러오지 못했습니다.");
  return serialize(row);
}

export async function saveEmailMarketingConsent(userId: string, input: {
  marketingDataConsent: boolean;
  advertisingEmailConsent: boolean;
  source?: "settings" | "onboarding" | "unsubscribe";
}) {
  await ensureBillingSchema();
  const d1 = (env as MarketingRuntimeEnv).DB;
  const current = await getEmailMarketingConsent(userId);
  const now = new Date();
  const reaffirmAfter = input.marketingDataConsent && input.advertisingEmailConsent
    ? new Date(now.getTime() + TWO_YEARS_MS).toISOString()
    : null;
  const statements = [
    d1.prepare(`INSERT INTO email_marketing_consents
      (user_id, marketing_data_consent, marketing_data_consent_at, advertising_email_consent,
       advertising_email_consent_at, policy_version, reaffirm_after, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        marketing_data_consent = excluded.marketing_data_consent,
        marketing_data_consent_at = excluded.marketing_data_consent_at,
        advertising_email_consent = excluded.advertising_email_consent,
        advertising_email_consent_at = excluded.advertising_email_consent_at,
        policy_version = excluded.policy_version,
        reaffirm_after = excluded.reaffirm_after,
        updated_at = excluded.updated_at`)
      .bind(
        userId,
        input.marketingDataConsent ? 1 : 0,
        input.marketingDataConsent ? now.toISOString() : null,
        input.advertisingEmailConsent ? 1 : 0,
        input.advertisingEmailConsent ? now.toISOString() : null,
        EMAIL_MARKETING_POLICY_VERSION,
        reaffirmAfter,
        now.toISOString(),
      ),
  ];
  if (current.marketingDataConsent !== input.marketingDataConsent) {
    statements.push(d1.prepare(`INSERT INTO email_marketing_consent_events
      (id, user_id, consent_type, granted, policy_version, source, occurred_at)
      VALUES (?, ?, 'marketing_data', ?, ?, ?, ?)`)
      .bind(crypto.randomUUID(), userId, input.marketingDataConsent ? 1 : 0, EMAIL_MARKETING_POLICY_VERSION, input.source ?? "settings", now.toISOString()));
  }
  if (current.advertisingEmailConsent !== input.advertisingEmailConsent) {
    statements.push(d1.prepare(`INSERT INTO email_marketing_consent_events
      (id, user_id, consent_type, granted, policy_version, source, occurred_at)
      VALUES (?, ?, 'advertising_email', ?, ?, ?, ?)`)
      .bind(crypto.randomUUID(), userId, input.advertisingEmailConsent ? 1 : 0, EMAIL_MARKETING_POLICY_VERSION, input.source ?? "settings", now.toISOString()));
  }
  await d1.batch(statements);
  return getEmailMarketingConsent(userId);
}

export async function createEmailUnsubscribeToken(userId: string, expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60_000)) {
  const payload = `${userId}.${Math.floor(expiresAt.getTime() / 1000)}`;
  const signature = await sign(payload);
  return `${toBase64Url(new TextEncoder().encode(payload))}.${signature}`;
}

export async function consumeEmailUnsubscribeToken(token: string) {
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;
  try {
    const payload = new TextDecoder().decode(fromBase64Url(encoded));
    if (!(await verify(payload, signature))) return null;
    const delimiter = payload.lastIndexOf(".");
    const userId = payload.slice(0, delimiter);
    const expiresAt = Number(payload.slice(delimiter + 1));
    if (!userId || !Number.isFinite(expiresAt) || expiresAt <= Date.now() / 1000) return null;
    return userId;
  } catch {
    return null;
  }
}

function serialize(row: ConsentRow) {
  const marketingDataConsent = Boolean(row.marketing_data_consent);
  const advertisingEmailConsent = Boolean(row.advertising_email_consent);
  const needsReaffirmation = Boolean(row.reaffirm_after && row.reaffirm_after <= new Date().toISOString());
  return {
    marketingDataConsent,
    marketingDataConsentAt: row.marketing_data_consent_at,
    advertisingEmailConsent,
    advertisingEmailConsentAt: row.advertising_email_consent_at,
    policyVersion: row.policy_version,
    reaffirmAfter: row.reaffirm_after,
    needsReaffirmation,
    marketingEligible: marketingDataConsent && advertisingEmailConsent && !needsReaffirmation,
    updatedAt: row.updated_at,
  };
}

async function sign(payload: string) {
  const key = await signingKey();
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return toBase64Url(new Uint8Array(digest));
}

async function verify(payload: string, signature: string) {
  try {
    return crypto.subtle.verify("HMAC", await signingKey(), fromBase64Url(signature), new TextEncoder().encode(payload));
  } catch {
    return false;
  }
}

async function signingKey() {
  const runtime = env as MarketingRuntimeEnv;
  const secret = runtime.EMAIL_UNSUBSCRIBE_SECRET || runtime.INTERNAL_BILLING_SECRET;
  if (!secret) throw new Error("이메일 수신거부 서명 키가 설정되지 않았습니다.");
  return crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

function toBase64Url(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}

function fromBase64Url(value: string) {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(atob(normalized), (char) => char.charCodeAt(0));
}
