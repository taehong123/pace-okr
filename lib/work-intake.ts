/** Shared, model-independent intake contract. No extra LLM request is needed. */
export const WORK_KINDS = ["task", "project", "routine", "objective", "key_result", "initiative", "unsure"] as const;
export type WorkKind = (typeof WORK_KINDS)[number];

export const WORK_CLASSIFICATION = {
  task: "한 가지 완료 결과를 가진 실행. 내부 순서는 체크리스트. 소요 시간이나 제목의 '개선/개발'만으로 Project로 올리지 않는다.",
  project: "여러 독립 Task를 묶어 달성하는 종료 가능한 결과물. 범위/완료 기준이 있고 담당·기한·상태를 별도로 관리할 필요가 있다.",
  routine: "같은 행동을 시간·사건·상태를 계기로 반복한다. OKR 계층과 독립적이며 Task를 담을 수 있다.",
  objective: "달성하고 싶은 질적인 변화/방향. 실행 목록이나 숫자 지표 자체가 아니다.",
  key_result: "Objective 달성을 증명하는 측정 가능한 결과. 활동량을 성과로 바꾸거나 목표 수치를 지어내지 않는다.",
  initiative: "KR을 움직일 전략적 접근. 종료 가능한 구체적 결과물과 범위가 생기면 그 아래 Project로 실행한다.",
} as const;

export const WORK_FIELDS = {
  task: {
    required: ["title"],
    recommended: ["parent_id 또는 routine_id", "assignee_member_id", "due_date"],
    optional: ["description(완료 기준)", "priority", "cadence"],
    placement: "Project 또는 Routine 중 하나. 연결을 모르면 General에 보관 가능. Task에 Project 전용 속성을 붙이지 않는다.",
    tool: "create_item; 미분류 단건은 capture_item; 동일 컨테이너의 여러 Task는 create_tasks",
  },
  project: {
    required: ["title", "parent_id(기존 Initiative)"],
    recommended: ["description(결과물·범위·완료 기준)", "dri_member_id", "due_date"],
    optional: ["worker_member_ids", "properties", "template_id", "priority", "cadence"],
    placement: "Initiative 아래. 부모가 없으면 기존 후보를 고르게 하거나 초안을 대화에 유지한다. 가짜 OKR/Task로 우회 저장하지 않는다.",
    tool: "create_item",
  },
  routine: {
    required: ["title"],
    recommended: ["cadence", "triggerPoint", "actionPlace", "actionSteps"],
    optional: ["description"],
    placement: "독립 컨테이너. 실제 반복 행동인지 확인하고 일회성 Task와 구분한다.",
    tool: "create_routine",
  },
  objective: {
    required: ["title", "cycle_id(선택한 OKR 파일)"],
    recommended: ["description(원하는 변화)"],
    optional: [],
    placement: "OKR 최상위. 여러 Objective를 임의로 합치지 않는다.",
    tool: "create_item",
  },
  key_result: {
    required: ["title", "parent_id(Objective)"],
    recommended: ["시작값·목표값·단위·측정 기간"],
    optional: ["description(측정 출처)", "due_date"],
    placement: "Objective 아래. 수치가 빠지면 미확정으로 표시하고 만들어내지 않는다.",
    tool: "create_item",
  },
  initiative: {
    required: ["title", "parent_id(Key Result)"],
    recommended: ["description(KR에 기여하는 방식)"],
    optional: [],
    placement: "Key Result 아래. Project와 같은 추상적 제목을 중복 생성하지 않는다.",
    tool: "create_item",
  },
} as const;

export const WORKFLOW_INSTRUCTIONS = [
  "OKRPTR fast intake: understand and classify in the current conversation; do not call another LLM or create placeholder records to classify work.",
  "Task = one independently completable action/result (small internal steps are a checklist). Project = a finite deliverable with scope/completion criteria and multiple independently managed Tasks. Routine = repeated work triggered by time/event/state, independent of OKR. Classify by completion boundary, not duration, keywords, or number of verbs. Respect a user's explicit type; explain a structural conflict instead of silently changing it.",
  "Objective = qualitative desired change; Key Result = measurable evidence; Initiative = strategic approach; Project = bounded delivery. The hierarchy is Objective > Key Result > Initiative > Project > Task, or independent Routine > Task. Tasks use one assignee; Project DRI/workers, managed properties and block documents are Project-only.",
  "When the user asks to organize/save work and relationship IDs or required context are missing, use prepare_work once with the likely kind (unsure if ambiguous). It returns rules, parent paths, member IDs, and type-specific fields together. Query is a short parent/topic phrase, not the entire user sentence. Reuse current-conversation context; do not follow it with redundant rule/team/property/list calls. If required IDs and fields are already known, go straight to the relevant write tool.",
  "Give the likely type and a one-sentence reason immediately. Ask only what blocks a correct next action: at most one compact question round containing up to three missing details. If Task vs Project is ambiguous, ask whether this is one completion or a deliverable containing independently managed tasks; offer your recommendation and let the user choose. Do not recite the whole hierarchy or ask for already supplied facts.",
  "Distinguish required fields from helpful optional fields. Carry stated dates, owners, scope, and priority into the same write. Apply workspace defaults for omitted priority/cadence; leave unknown owners/dates unset. Resolve people and parents to returned IDs; never choose the first candidate merely because it is first. For truncated parents/members, narrow query/member_query; for truncated properties use list_properties only if the needed field is absent. Do not claim absence from a partial list. Do not auto-invite people or create property definitions/templates. Fetch list_project_templates only when applying a user-requested template.",
  "A clear save request authorizes that scoped save, not invented work. For an ambiguous structure follow reviewBeforeCreate and ask once. A clear single Task can be captured to General without demanding an OKR. Legacy 'inbox/unclassified' rules mean this same General fallback, not an obsolete status. A Project missing its Initiative stays a conversation draft; ask for the parent, do not manufacture ancestors or downgrade it into a Task.",
  "Use create_tasks once for explicitly supplied Tasks sharing a container and common fields. Otherwise use create_item with all known fields together. Never generate extra Tasks from a Project idea unless asked. Routine children use routine_id, not parent_id. Children inherit the selected parent's cycle_id; do not guess the active cycle. Link changes preserve status unless the user changes it.",
  "After a successful write, use the returned record as confirmation: do not list everything again. Reply briefly with saved type/title, actual container, owner/date when present, and important unset fields. Never claim a draft was saved or a notification delivered. On an uncertain write failure, look for the saved record before retrying. Read-only planning must not create data. Deletions, invitations and external actions retain their own permission/confirmation rules.",
].join("\n");

export type WorkContextInput = {
  kind?: WorkKind;
  query?: string;
  memberQuery?: string;
  limit?: number;
  includeMembers?: boolean;
};

// MCP uses POST even for reads. Unknown tools and JSON-RPC batches stay write-gated.
export const READ_ONLY_MCP_TOOLS = new Set([
  "prepare_work", "get_workspace_rules", "list_items", "review_period", "list_properties",
  "get_project_document", "list_project_templates", "list_checklist_items", "get_daily_scrum",
  "get_recommendations", "list_routines", "list_team_members", "list_groups", "list_group_members",
]);

export function isReadOnlyMcpRequest(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return false;
  const { method, params } = payload as { method?: unknown; params?: { name?: unknown } };
  if (["initialize", "notifications/initialized", "ping", "tools/list", "resources/list", "resources/templates/list", "prompts/list"].includes(String(method))) return true;
  return method === "tools/call" && typeof params?.name === "string" && READ_ONLY_MCP_TOOLS.has(params.name);
}

type ContextRow = {
  id: string; kind: string; title: string; cycleId: string | null;
  parentTitle: string | null; grandparentTitle: string | null; ancestorTitle: string | null;
};

function likePattern(value: string) {
  return `%${value.trim().replace(/[\\%_]/g, "\\$&")}%`;
}

/** Bounded projections in one D1 batch, never full documents or workspace property values. */
export async function readWorkContext(db: D1Database, ownerId: string, userId: string, input: WorkContextInput = {}) {
  const kind = input.kind ?? "unsure";
  if (!WORK_KINDS.includes(kind)) throw new Error("Unsupported work kind");
  const limit = Math.max(1, Math.min(20, Math.trunc(input.limit || 6)));
  const query = input.query?.trim().slice(0, 120) ?? "";
  const memberQuery = input.memberQuery?.trim().slice(0, 120) ?? "";
  const parentKinds = kind === "unsure" ? ["project", "initiative"]
    : ({ task: ["project"], project: ["initiative"], key_result: ["objective"], initiative: ["key_result"], objective: [], routine: [] } as const)[kind];
  const statements: D1PreparedStatement[] = [];
  const keys: string[] = [];
  const add = (key: string, statement: D1PreparedStatement) => { keys.push(key); statements.push(statement); };
  add("workspace", db.prepare("SELECT id, name, kind FROM workspaces WHERE id = ?").bind(ownerId));
  for (const parentKind of parentKinds) {
    add(parentKind, db.prepare(`SELECT i.id, i.kind, i.title, i.cycle_id AS cycleId,
      p.title AS parentTitle, g.title AS grandparentTitle, a.title AS ancestorTitle
      FROM items i
      LEFT JOIN items p ON p.id = i.parent_id AND p.owner_id = i.owner_id
      LEFT JOIN items g ON g.id = p.parent_id AND g.owner_id = i.owner_id
      LEFT JOIN items a ON a.id = g.parent_id AND a.owner_id = i.owner_id
      LEFT JOIN okr_cycles c ON c.id = i.cycle_id AND c.owner_id = i.owner_id
      WHERE i.owner_id = ? AND i.kind = ? AND i.archived_at IS NULL AND i.status != 'archived'
        AND (c.status IS NULL OR c.status != 'closed')
        AND (p.id IS NULL OR (p.archived_at IS NULL AND p.status != 'archived'))
        AND (g.id IS NULL OR (g.archived_at IS NULL AND g.status != 'archived'))
        AND (a.id IS NULL OR (a.archived_at IS NULL AND a.status != 'archived'))
        AND (? = '' OR i.title LIKE ? ESCAPE '\\')
      ORDER BY CASE WHEN c.status = 'active' THEN 0 ELSE 1 END, i.updated_at DESC, i.id
      LIMIT ?`).bind(ownerId, parentKind, query, likePattern(query), limit + 1));
  }
  if (kind === "task" || kind === "unsure") {
    add("routines", db.prepare(`SELECT id, title, system_key AS systemKey FROM routines
      WHERE owner_id = ? AND active = 1 AND (system_key IS NULL OR system_key != 'general')
        AND (? = '' OR title LIKE ? ESCAPE '\\') ORDER BY updated_at DESC, id LIMIT ?`)
      .bind(ownerId, query, likePattern(query), limit + 1));
    add("general", db.prepare("SELECT id, title FROM routines WHERE owner_id = ? AND system_key = 'general' AND active = 1 LIMIT 1").bind(ownerId));
  }
  if ((input.includeMembers ?? true) && ["task", "project", "unsure"].includes(kind)) {
    add("members", db.prepare(`SELECT id, display_name AS displayName, role, user_id = ? AS isCurrent
      FROM workspace_members WHERE workspace_id = ? AND status = 'active'
        AND (? = '' OR display_name LIKE ? ESCAPE '\\' OR email LIKE ? ESCAPE '\\')
      ORDER BY CASE WHEN user_id = ? THEN 0 ELSE 1 END, display_name, id LIMIT ?`)
      .bind(userId, ownerId, memberQuery, likePattern(memberQuery), likePattern(memberQuery), userId, limit + 1));
  }
  if (kind === "objective" || kind === "unsure") {
    add("cycles", db.prepare(`SELECT id, name, status, start_date AS startDate, end_date AS endDate
      FROM okr_cycles WHERE owner_id = ? AND status != 'closed'
      ORDER BY CASE WHEN status = 'active' THEN 0 ELSE 1 END, updated_at DESC, id LIMIT ?`).bind(ownerId, limit + 1));
  }
  if (kind === "project") {
    add("properties", db.prepare(`SELECT id, name, type, options, default_value AS defaultValue, system_key AS systemKey
      FROM property_definitions WHERE owner_id = ? AND active = 1
        AND (system_key IS NOT NULL OR LOWER(TRIM(name)) NOT IN
          ('dri','owner','assignee','담당','담당자','worker','workers','하위 업무자','업무자','작업자','참여자'))
      ORDER BY sort_order, id LIMIT 41`).bind(ownerId));
  }
  const results = await db.batch(statements);
  const rows = Object.fromEntries(keys.map((key, index) => [key, results[index].results])) as Record<string, Record<string, unknown>[]>;
  if (!rows.workspace?.[0]) throw new Error("Workspace not found");
  const truncated = Object.fromEntries(keys.filter((key) => !["workspace", "general"].includes(key))
    .map((key) => [key, rows[key].length > (key === "properties" ? 40 : limit)]));
  const parents = parentKinds.flatMap((parentKind) => (rows[parentKind].slice(0, limit) as unknown as ContextRow[]).map((row) => ({
    id: row.id, kind: row.kind, title: row.title, cycleId: row.cycleId,
    path: [row.ancestorTitle, row.grandparentTitle, row.parentTitle, row.title].filter((title): title is string => Boolean(title)),
  })));
  return {
    kind,
    workspace: rows.workspace[0],
    classification: kind === "unsure" ? WORK_CLASSIFICATION : { [kind]: WORK_CLASSIFICATION[kind] },
    fields: kind === "unsure" ? { task: WORK_FIELDS.task, project: WORK_FIELDS.project, routine: WORK_FIELDS.routine } : { [kind]: WORK_FIELDS[kind] },
    parents,
    routines: (rows.routines ?? []).slice(0, limit),
    fallback: rows.general?.[0] ?? null,
    members: (rows.members ?? []).slice(0, limit).map((row) => ({ ...row, isCurrent: Boolean(row.isCurrent) })),
    cycles: (rows.cycles ?? []).slice(0, limit),
    projectProperties: (rows.properties ?? []).slice(0, 40).map((row) => ({ ...row,
      options: JSON.parse(String(row.options)), defaultValue: JSON.parse(String(row.defaultValue)),
    })),
    truncated,
    nextStep: "후보를 사용자 의도와 대조하고 필수 누락만 한 번에 묻는다. systemKey가 있는 속성은 create/update_item의 전용 필드로 적용한다. 잘린 부모/담당자는 query/member_query로 좁히고, 필요한 속성이 잘렸을 때만 list_properties를 사용한다. 저장 성공 응답을 재조회하지 않는다.",
  };
}
