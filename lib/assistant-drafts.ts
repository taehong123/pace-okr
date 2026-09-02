import { env } from "cloudflare:workers";

const MAX_DRAFT_BYTES = 240_000;

export async function getAssistantDraft(ownerId: string, userId: string, draftKey: string) {
  const row = await env.DB.prepare(`SELECT payload_json, updated_at
    FROM assistant_drafts
    WHERE owner_id = ? AND user_id = ? AND draft_key = ?`)
    .bind(ownerId, userId, normalizeDraftKey(draftKey))
    .first<{ payload_json: string; updated_at: string }>();
  if (!row) return null;
  try {
    return { payload: JSON.parse(row.payload_json) as unknown, updatedAt: row.updated_at };
  } catch {
    return null;
  }
}

export async function saveAssistantDraft(ownerId: string, userId: string, draftKey: string, payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("임시저장 내용이 올바르지 않습니다.");
  const key = normalizeDraftKey(draftKey);
  const payloadJson = JSON.stringify(payload);
  if (new TextEncoder().encode(payloadJson).byteLength > MAX_DRAFT_BYTES) throw new Error("대화 초안이 너무 큽니다.");
  const now = new Date().toISOString();
  await env.DB.prepare(`INSERT INTO assistant_drafts
    (id, owner_id, user_id, draft_key, payload_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(owner_id, user_id, draft_key) DO UPDATE SET
      payload_json = excluded.payload_json,
      updated_at = excluded.updated_at`)
    .bind(crypto.randomUUID(), ownerId, userId, key, payloadJson, now, now)
    .run();
  return { updatedAt: now };
}

export async function deleteAssistantDraft(ownerId: string, userId: string, draftKey: string) {
  await env.DB.prepare("DELETE FROM assistant_drafts WHERE owner_id = ? AND user_id = ? AND draft_key = ?")
    .bind(ownerId, userId, normalizeDraftKey(draftKey))
    .run();
  return { deleted: true };
}

function normalizeDraftKey(value: string) {
  const key = value.trim();
  if (key.toLowerCase().startsWith("system:project-review:")) throw new Error("시스템 확인 요청은 일반 임시저장 API로 변경할 수 없습니다.");
  if (!key || key.length > 200 || !/^[\p{L}\p{N}:._-]+$/u.test(key)) throw new Error("임시저장 키가 올바르지 않습니다.");
  return key;
}
