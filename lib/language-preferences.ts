import { guestLanguage, isLanguage, isLanguagePreference, requestLanguage, type Language, type LanguagePreferences } from "./language";

type PreferenceRow = { language_preference: string; resolved_language: string; language_revision: number };
export class LanguagePreferenceError extends Error {
  constructor(public code: "invalid_language" | "preference_conflict" | "account_missing", public status = 400) { super(code); }
}

export async function readLanguagePreferences(db: D1Database, userId: string): Promise<LanguagePreferences> {
  const row = await db.prepare("SELECT language_preference, resolved_language, language_revision FROM users WHERE id = ?").bind(userId).first<PreferenceRow>();
  return { language: isLanguagePreference(row?.language_preference) ? row.language_preference : "ko",
    resolvedLanguage: isLanguage(row?.resolved_language) ? row.resolved_language : "ko", revision: row?.language_revision ?? 0 };
}

export async function saveLanguagePreferences(db: D1Database, userId: string, input: Record<string, unknown>, request: Request) {
  if (!isLanguagePreference(input.language)) throw new LanguagePreferenceError("invalid_language");
  if (!Number.isSafeInteger(input.revision) || Number(input.revision) < 0) throw new LanguagePreferenceError("preference_conflict", 409);
  const resolved = input.language === "auto" ? requestLanguage(request) : input.language;
  const saved = await db.prepare(`UPDATE users SET language_preference = ?, resolved_language = ?, language_revision = language_revision + 1
    WHERE id = ? AND language_revision = ?`).bind(input.language, resolved, userId, input.revision).run();
  if (!saved.meta.changes) throw new LanguagePreferenceError("preference_conflict", 409);
  return readLanguagePreferences(db, userId);
}

export function newAccountLanguage(request: Request) {
  const explicit = guestLanguage(request);
  return { languagePreference: explicit ?? "auto" as const, resolvedLanguage: explicit ?? requestLanguage(request) };
}

export async function languageForBootstrap(db: D1Database, userId: string, request: Request): Promise<LanguagePreferences> {
  const current = await readLanguagePreferences(db, userId);
  if (current.language !== "auto") return { ...current, resolvedLanguage: current.language };
  const displayLanguage = request.headers.get("x-okrptr-display-language");
  const resolvedLanguage = isLanguage(displayLanguage) ? displayLanguage : requestLanguage(request);
  if (resolvedLanguage === current.resolvedLanguage) return current;
  // The automatic result is notification context, not a new explicit preference.
  const changed = await db.prepare("UPDATE users SET resolved_language = ? WHERE id = ? AND language_preference = 'auto' AND language_revision = ?")
    .bind(resolvedLanguage, userId, current.revision).run();
  if (!changed.meta.changes) return readLanguagePreferences(db, userId);
  return { ...current, resolvedLanguage };
}

export async function workspaceMessageLanguage(db: D1Database, ownerId: string): Promise<Language> {
  const row = await db.prepare("SELECT message_language FROM workspaces WHERE id = ?").bind(ownerId).first<{ message_language: string }>();
  return isLanguage(row?.message_language) ? row.message_language : "ko";
}

export async function memberMessageLanguage(db: D1Database, ownerId: string, memberId: string): Promise<Language> {
  const row = await db.prepare(`SELECT u.language_preference, u.resolved_language, w.message_language FROM workspace_members m
    JOIN workspaces w ON w.id = m.workspace_id LEFT JOIN users u ON u.id = m.user_id
    WHERE m.workspace_id = ? AND m.id = ? AND m.status = 'active'`).bind(ownerId, memberId)
    .first<{ language_preference: string | null; resolved_language: string | null; message_language: string }>();
  const language = row?.language_preference === "auto" ? row.resolved_language : row?.language_preference;
  return isLanguage(language) ? language : isLanguage(row?.message_language) ? row.message_language : "ko";
}
