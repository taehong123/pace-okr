import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { accountRegistrations } from "@/db/schema";
import { encryptPrivateValue } from "@/lib/secret-crypto";
import { checkPhoneVerification, phoneVerificationConfigured, startPhoneVerification, type PhoneVerificationRuntimeEnv } from "@/lib/phone-verification";

export const ACCOUNT_CONSENT_VERSION = "2026-09-01";
const VERIFICATION_TTL_MS = 10 * 60 * 1_000;

export type AccountRegistrationRuntimeEnv = PhoneVerificationRuntimeEnv & {
  DB: D1Database;
  ACCOUNT_REGISTRATION_REQUIRED?: string;
  ACCOUNT_DATA_ENCRYPTION_KEY?: string;
  GOOGLE_TOKEN_ENCRYPTION_KEY?: string;
};

export type AccountRegistrationStatus = {
  required: boolean;
  completed: boolean;
  legacy: boolean;
  verificationConfigured: boolean;
  maskedPhone: string | null;
  phoneVerifiedAt: string | null;
  marketingDataConsent: boolean;
  electronicMarketingConsent: boolean;
  marketingEligible: boolean;
  consentVersion: string;
};

export function accountRegistrationRequired(runtime: AccountRegistrationRuntimeEnv) {
  return runtime.ACCOUNT_REGISTRATION_REQUIRED?.trim().toLowerCase() === "true";
}

export function registrationEncryptionSecret(runtime: AccountRegistrationRuntimeEnv) {
  return runtime.ACCOUNT_DATA_ENCRYPTION_KEY || runtime.GOOGLE_TOKEN_ENCRYPTION_KEY || "";
}

export function normalizePhoneNumber(input: string) {
  const compact = input.trim().replace(/[\s().-]/g, "");
  let normalized = compact;
  if (/^010\d{8}$/.test(compact)) normalized = `+82${compact.slice(1)}`;
  else if (/^82\d{9,10}$/.test(compact)) normalized = `+${compact}`;
  if (!/^\+[1-9]\d{7,14}$/.test(normalized)) throw new Error("국가번호를 포함한 올바른 휴대전화 번호를 입력해 주세요.");
  return normalized;
}

export async function hashPhoneNumber(phone: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(phone));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function getAccountRegistrationStatus(runtime: AccountRegistrationRuntimeEnv, userId: string): Promise<AccountRegistrationStatus> {
  const [registration] = await getDb().select().from(accountRegistrations).where(eq(accountRegistrations.userId, userId)).limit(1);
  const marketingDataConsent = Boolean(registration?.marketingDataConsent);
  const electronicMarketingConsent = Boolean(registration?.electronicMarketingConsent);
  const electronicConsentTime = registration?.electronicMarketingConsentAt ? Date.parse(registration.electronicMarketingConsentAt) : NaN;
  const withinTwoYears = Number.isFinite(electronicConsentTime) && Date.now() - electronicConsentTime < 2 * 365 * 24 * 60 * 60 * 1_000;
  return {
    required: accountRegistrationRequired(runtime),
    completed: Boolean(registration?.completedAt),
    legacy: registration?.verificationProvider === "legacy",
    verificationConfigured: phoneVerificationConfigured(runtime) && Boolean(registrationEncryptionSecret(runtime)),
    maskedPhone: registration?.phoneLastFour ? `•••-••••-${registration.phoneLastFour}` : null,
    phoneVerifiedAt: registration?.phoneVerifiedAt ?? null,
    marketingDataConsent,
    electronicMarketingConsent,
    marketingEligible: marketingDataConsent && electronicMarketingConsent && withinTwoYears,
    consentVersion: registration?.consentVersion ?? ACCOUNT_CONSENT_VERSION,
  };
}

export async function createPhoneVerification(runtime: AccountRegistrationRuntimeEnv, userId: string, phoneInput: string, localDevelopment: boolean) {
  const phone = normalizePhoneNumber(phoneInput);
  const phoneHash = await hashPhoneNumber(phone);
  const now = new Date();
  const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1_000).toISOString();
  const hourAgo = new Date(now.getTime() - 60 * 60 * 1_000).toISOString();
  const [userCount, phoneCount] = await Promise.all([
    runtime.DB.prepare("SELECT count(*) AS count FROM phone_verification_requests WHERE user_id = ? AND requested_at >= ?").bind(userId, tenMinutesAgo).first<{ count: number }>(),
    runtime.DB.prepare("SELECT count(*) AS count FROM phone_verification_requests WHERE phone_hash = ? AND requested_at >= ?").bind(phoneHash, hourAgo).first<{ count: number }>(),
  ]);
  if (Number(userCount?.count ?? 0) >= 3 || Number(phoneCount?.count ?? 0) >= 5) throw new Error("인증번호 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.");
  const secret = registrationEncryptionSecret(runtime);
  if (!secret || (!localDevelopment && !phoneVerificationConfigured(runtime))) throw new Error("휴대전화 인증 서비스가 아직 설정되지 않았습니다.");
  const verification = await startPhoneVerification(runtime, phone, localDevelopment);
  const requestedAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + VERIFICATION_TTL_MS).toISOString();
  await runtime.DB.prepare(`INSERT INTO phone_verification_requests
    (id, user_id, encrypted_phone, phone_hash, phone_last_four, provider_sid, status, requested_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)`)
    .bind(crypto.randomUUID(), userId, await encryptPrivateValue(phone, secret), phoneHash, phone.slice(-4), verification.sid, requestedAt, expiresAt)
    .run();
  return { expiresAt, developmentCode: localDevelopment && !phoneVerificationConfigured(runtime) ? "000000" : undefined };
}

export async function completeAccountRegistration(runtime: AccountRegistrationRuntimeEnv, input: {
  userId: string;
  phoneInput: string;
  code: string;
  requiredPrivacyConsent: boolean;
  age14Confirmed: boolean;
  marketingDataConsent: boolean;
  electronicMarketingConsent: boolean;
  localDevelopment: boolean;
}) {
  if (!input.requiredPrivacyConsent || !input.age14Confirmed) throw new Error("필수 동의와 만 14세 이상 확인이 필요합니다.");
  if (!/^\d{4,10}$/.test(input.code.trim())) throw new Error("인증번호를 확인해 주세요.");
  const phone = normalizePhoneNumber(input.phoneInput);
  const phoneHash = await hashPhoneNumber(phone);
  const requestResult = await runtime.DB.prepare(`SELECT id, encrypted_phone, phone_last_four, expires_at
    FROM phone_verification_requests WHERE user_id = ? AND phone_hash = ? AND status = 'pending'
    ORDER BY requested_at DESC LIMIT 1`).bind(input.userId, phoneHash).all<{ id: string; encrypted_phone: string; phone_last_four: string; expires_at: string }>();
  const request = requestResult.results[0];
  if (!request || Date.parse(request.expires_at) < Date.now()) throw new Error("인증번호가 만료되었습니다. 새 인증번호를 받아 주세요.");
  if (!await checkPhoneVerification(runtime, phone, input.code.trim(), input.localDevelopment)) throw new Error("인증번호가 올바르지 않습니다.");
  const now = new Date().toISOString();
  const marketingAt = input.marketingDataConsent ? now : null;
  const electronicAt = input.electronicMarketingConsent ? now : null;
  const events = [
    ["required_privacy", 1],
    ["age_14", 1],
    ["marketing_data", input.marketingDataConsent ? 1 : 0],
    ["electronic_marketing", input.electronicMarketingConsent ? 1 : 0],
  ] as const;
  await runtime.DB.batch([
    runtime.DB.prepare(`INSERT INTO account_registrations
      (user_id, encrypted_phone, phone_hash, phone_last_four, verification_provider, phone_verified_at,
       required_privacy_consent_at, age_14_confirmed_at, marketing_data_consent, marketing_data_consent_at,
       electronic_marketing_consent, electronic_marketing_consent_at, consent_version, completed_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'twilio_verify', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET encrypted_phone = excluded.encrypted_phone, phone_hash = excluded.phone_hash,
       phone_last_four = excluded.phone_last_four, verification_provider = excluded.verification_provider,
       phone_verified_at = excluded.phone_verified_at, required_privacy_consent_at = excluded.required_privacy_consent_at,
       age_14_confirmed_at = excluded.age_14_confirmed_at, marketing_data_consent = excluded.marketing_data_consent,
       marketing_data_consent_at = excluded.marketing_data_consent_at, electronic_marketing_consent = excluded.electronic_marketing_consent,
       electronic_marketing_consent_at = excluded.electronic_marketing_consent_at, consent_version = excluded.consent_version,
       completed_at = excluded.completed_at, updated_at = excluded.updated_at`)
      .bind(input.userId, request.encrypted_phone, phoneHash, request.phone_last_four, now, now, now,
        input.marketingDataConsent ? 1 : 0, marketingAt, input.electronicMarketingConsent ? 1 : 0, electronicAt,
        ACCOUNT_CONSENT_VERSION, now, now, now),
    runtime.DB.prepare("UPDATE phone_verification_requests SET status = 'approved', verified_at = ? WHERE id = ?").bind(now, request.id),
    ...events.map(([type, granted]) => runtime.DB.prepare(`INSERT INTO account_consent_events
      (id, user_id, consent_type, granted, policy_version, source, occurred_at) VALUES (?, ?, ?, ?, ?, 'signup', ?)`)
      .bind(crypto.randomUUID(), input.userId, type, granted, ACCOUNT_CONSENT_VERSION, now)),
  ]);
  return getAccountRegistrationStatus(runtime, input.userId);
}

export async function updateMarketingConsents(runtime: AccountRegistrationRuntimeEnv, userId: string, marketingDataConsent: boolean, electronicMarketingConsent: boolean) {
  const [current] = await getDb().select().from(accountRegistrations).where(eq(accountRegistrations.userId, userId)).orderBy(desc(accountRegistrations.updatedAt)).limit(1);
  if (!current?.completedAt) throw new Error("가입 확인을 먼저 완료해 주세요.");
  const now = new Date().toISOString();
  const statements: D1PreparedStatement[] = [runtime.DB.prepare(`UPDATE account_registrations SET
    marketing_data_consent = ?, marketing_data_consent_at = ?, electronic_marketing_consent = ?,
    electronic_marketing_consent_at = ?, updated_at = ? WHERE user_id = ?`).bind(
    marketingDataConsent ? 1 : 0,
    marketingDataConsent ? (current.marketingDataConsentAt ?? now) : null,
    electronicMarketingConsent ? 1 : 0,
    electronicMarketingConsent ? (current.electronicMarketingConsentAt ?? now) : null,
    now,
    userId,
  )];
  if (Boolean(current.marketingDataConsent) !== marketingDataConsent) statements.push(runtime.DB.prepare(`INSERT INTO account_consent_events
    (id, user_id, consent_type, granted, policy_version, source, occurred_at) VALUES (?, ?, 'marketing_data', ?, ?, 'settings', ?)`)
    .bind(crypto.randomUUID(), userId, marketingDataConsent ? 1 : 0, ACCOUNT_CONSENT_VERSION, now));
  if (Boolean(current.electronicMarketingConsent) !== electronicMarketingConsent) statements.push(runtime.DB.prepare(`INSERT INTO account_consent_events
    (id, user_id, consent_type, granted, policy_version, source, occurred_at) VALUES (?, ?, 'electronic_marketing', ?, ?, 'settings', ?)`)
    .bind(crypto.randomUUID(), userId, electronicMarketingConsent ? 1 : 0, ACCOUNT_CONSENT_VERSION, now));
  await runtime.DB.batch(statements);
  return getAccountRegistrationStatus(runtime, userId);
}
