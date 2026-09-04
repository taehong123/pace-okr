import { normalizeWorkspaceAddress, WORKSPACE_DOMAIN, workspaceEntryPath } from "./workspace-address";
import { isLanguage } from "./language";

export class WorkspaceIdentityError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

type IdentityRow = { id: string; name: string; address: string | null; revision: number; role: string; message_language: string };

export async function readWorkspaceIdentity(db: D1Database, workspaceId: string, userId: string, subdomainsEnabled = false) {
  const row = await db.prepare(`SELECT w.id, w.name, w.message_language, s.address, COALESCE(s.revision, 0) AS revision, m.role
    FROM workspaces w JOIN workspace_members m ON m.workspace_id = w.id
    LEFT JOIN workspace_identity_settings s ON s.workspace_id = w.id
    WHERE w.id = ? AND m.user_id = ? AND m.status = 'active' AND w.scheduled_deletion_at IS NULL`)
    .bind(workspaceId, userId).first<IdentityRow>();
  if (!row) throw new WorkspaceIdentityError("이 워크스페이스에 접근할 수 없습니다.", 403);
  return {
    id: row.id, name: row.name, address: row.address, revision: row.revision,
    messageLanguage: isLanguage(row.message_language) ? row.message_language : "ko" as const,
    canManage: row.role === "owner" || row.role === "admin",
    subdomainsEnabled,
    url: row.address ? subdomainsEnabled ? `https://${row.address}.${WORKSPACE_DOMAIN}/` : workspaceEntryPath(row.address) : null,
  };
}

export async function updateWorkspaceIdentity(db: D1Database, workspaceId: string, userId: string, input: Record<string, unknown>, subdomainsEnabled = false) {
  const current = await readWorkspaceIdentity(db, workspaceId, userId, subdomainsEnabled);
  if (!current.canManage) throw new WorkspaceIdentityError("소유자 또는 관리자만 변경할 수 있습니다.", 403);
  if (!Number.isSafeInteger(input.revision) || input.revision !== current.revision) {
    throw new WorkspaceIdentityError("다른 곳에서 변경된 정보입니다. 다시 불러온 뒤 저장해 주세요.", 409);
  }
  const hasName = Object.hasOwn(input, "name"), hasAddress = Object.hasOwn(input, "address"), hasLanguage = Object.hasOwn(input, "messageLanguage");
  if (!hasName && !hasAddress && !hasLanguage) throw new WorkspaceIdentityError("변경할 정보를 입력해 주세요.");
  if (hasLanguage && !isLanguage(input.messageLanguage)) throw new WorkspaceIdentityError("지원하는 언어를 선택해 주세요.");
  const messageLanguage = hasLanguage && isLanguage(input.messageLanguage) ? input.messageLanguage : current.messageLanguage;
  const name = hasName && typeof input.name === "string" ? input.name.trim() : current.name;
  if (hasName && (typeof input.name !== "string" || !name || name.length > 80 || Array.from(name).some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127))) {
    throw new WorkspaceIdentityError("이름은 줄바꿈 없이 1~80자로 입력해 주세요.");
  }
  let address = current.address;
  if (hasAddress) {
    try { address = normalizeWorkspaceAddress(input.address); }
    catch (error) { throw new WorkspaceIdentityError(error instanceof Error ? error.message : "주소를 확인해 주세요."); }
    const owner = await db.prepare("SELECT workspace_id FROM workspace_addresses WHERE address = ?").bind(address).first<{ workspace_id: string }>();
    if (owner && owner.workspace_id !== workspaceId) throw new WorkspaceIdentityError("이미 사용 중인 주소입니다.", 409);
    const count = await db.prepare("SELECT COUNT(*) AS count FROM workspace_addresses WHERE workspace_id = ?").bind(workspaceId).first<{ count: number }>();
    if (!owner && (count?.count ?? 0) >= 20) throw new WorkspaceIdentityError("주소 변경 한도에 도달했습니다. 기존 주소를 사용해 주세요.", 409);
  }
  if (name === current.name && address === current.address && messageLanguage === current.messageLanguage) return current;
  const now = new Date().toISOString(), guardId = crypto.randomUUID();
  // The guard, unique address claim and rename commit together, including permission/version rechecks.
  const statements = [db.prepare(`INSERT INTO workspace_identity_guards (id, valid)
    SELECT ?, CASE WHEN EXISTS (SELECT 1 FROM workspaces w
      JOIN workspace_members m ON m.workspace_id = w.id
      LEFT JOIN workspace_identity_settings s ON s.workspace_id = w.id
      WHERE w.id = ? AND w.name = ? AND w.scheduled_deletion_at IS NULL
        AND m.user_id = ? AND m.status = 'active' AND m.role IN ('owner','admin')
        AND COALESCE(s.revision, 0) = ?) THEN 1 ELSE 0 END`)
    .bind(guardId, workspaceId, current.name, userId, current.revision)];
  if (address) {
    statements.push(db.prepare(`INSERT INTO workspace_addresses (address, workspace_id, created_at) VALUES (?, ?, ?)
      ON CONFLICT(address) DO NOTHING`).bind(address, workspaceId, now));
    statements.push(db.prepare(`INSERT INTO workspace_identity_guards (id, valid)
      SELECT ?, CASE WHEN EXISTS (SELECT 1 FROM workspace_addresses WHERE address = ? AND workspace_id = ?)
        THEN 1 ELSE 0 END`).bind(`${guardId}-address`, address, workspaceId));
  }
  statements.push(
    db.prepare("UPDATE workspaces SET name = ?, message_language = ?, updated_at = ? WHERE id = ?").bind(name, messageLanguage, now, workspaceId),
    db.prepare(`INSERT INTO workspace_identity_settings (workspace_id, address, revision, updated_at) VALUES (?, ?, 1, ?)
      ON CONFLICT(workspace_id) DO UPDATE SET address = excluded.address,
        revision = workspace_identity_settings.revision + 1, updated_at = excluded.updated_at`).bind(workspaceId, address, now),
    db.prepare("DELETE FROM workspace_identity_guards WHERE id IN (?, ?)").bind(guardId, `${guardId}-address`),
  );
  try { await db.batch(statements); }
  catch (error) {
    if (/constraint|unique/i.test(error instanceof Error ? error.message : String(error))) {
      throw new WorkspaceIdentityError("주소나 권한이 변경되었습니다. 다시 불러온 뒤 확인해 주세요.", 409);
    }
    throw error;
  }
  return readWorkspaceIdentity(db, workspaceId, userId, subdomainsEnabled);
}

export async function workspaceForAddress(db: D1Database, value: unknown, userId: string) {
  let address: string;
  try { address = normalizeWorkspaceAddress(value); } catch { return null; }
  return db.prepare(`SELECT w.id FROM workspace_addresses a JOIN workspaces w ON w.id = a.workspace_id
    JOIN workspace_members m ON m.workspace_id = w.id
    WHERE a.address = ? AND w.scheduled_deletion_at IS NULL AND m.user_id = ? AND m.status = 'active'`)
    .bind(address, userId).first<{ id: string }>();
}
