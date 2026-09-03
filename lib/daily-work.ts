export type DailyWorkKind = "project" | "task" | "routine";
export type DailyWork = {
  id: string; key: string; kind: DailyWorkKind; title: string; status: string;
  priority: string; dueDate: string | null; parentTitle: string;
};

export function parseDailyWorkKeys(raw: unknown): string[] {
  const value: unknown = typeof raw === "string" ? JSON.parse(raw) : raw;
  if (!Array.isArray(value) || value.some((key) => typeof key !== "string" || !/^(project|task|routine):[^:]{1,150}$/.test(key))) {
    throw new Error("오늘 할 업무 선택을 다시 확인해 주세요.");
  }
  const keys = [...new Set(value as string[])];
  if (keys.length > 50) throw new Error("오늘 할 업무는 최대 50개까지 선택할 수 있습니다.");
  return keys;
}

export async function listDailyWork(db: D1Database, ownerId: string, memberId: string, date: string): Promise<DailyWork[]> {
  const rows = await db.prepare(`SELECT * FROM (SELECT DISTINCT item.id, item.kind, item.title, item.status, item.priority,
      item.due_date AS dueDate, COALESCE(parent.title, routine.title, 'General') AS parentTitle
    FROM items item JOIN item_assignments a ON a.item_id = item.id AND a.owner_id = item.owner_id
    LEFT JOIN items parent ON parent.id = item.parent_id AND parent.owner_id = item.owner_id
    LEFT JOIN routines routine ON routine.id = item.routine_id AND routine.owner_id = item.owner_id
    WHERE item.owner_id = ? AND a.member_id = ? AND item.archived_at IS NULL
      AND item.status NOT IN ('done','development_done','archived')
      AND ((item.kind = 'task' AND a.role = 'task_assignee')
        OR (item.kind = 'project' AND a.role IN ('project_dri','project_worker')))
    UNION ALL
    SELECT r.id, 'routine', r.title, 'todo', 'medium', NULL, 'Routine'
    FROM routines r WHERE r.owner_id = ? AND r.assignee_member_id = ? AND r.active = 1 AND r.system_key IS NULL
      AND NOT EXISTS (SELECT 1 FROM routine_completions c WHERE c.routine_id = r.id AND c.owner_id = r.owner_id AND c.completion_date = ?))
    ORDER BY dueDate IS NULL, dueDate, title`).bind(ownerId, memberId, ownerId, memberId, date).all<Omit<DailyWork, "key">>();
  return rows.results.map((work) => ({ ...work, key: `${work.kind}:${work.id}` }));
}

export async function validateDailyWork(db: D1Database, ownerId: string, memberId: string, date: string, keys: string[]) {
  const requested = parseDailyWorkKeys(keys);
  if (!requested.length) return [];
  const available = new Map((await listDailyWork(db, ownerId, memberId, date)).map((work) => [work.key, work]));
  const selected = requested.map((key) => available.get(key));
  if (selected.some((work) => !work)) throw new Error("업무의 할당 또는 완료 상태가 변경됐습니다. 내 업무를 다시 확인해 주세요.");
  return selected as DailyWork[];
}

export function dailyWorkSnapshots(raw: string | undefined): DailyWork[] {
  const parsed: unknown = JSON.parse(raw || "[]");
  return Array.isArray(parsed) ? parsed as DailyWork[] : [];
}
