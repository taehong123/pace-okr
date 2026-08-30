import { env } from "cloudflare:workers";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { items, routines, workspaceMembers, type WorkspaceMember } from "@/db/schema";
import {
  createItem,
  ensureWorkspace,
  replaceItemAssignmentRole,
  type RequestAuthorization,
} from "@/lib/pace-data";

export const MAX_DAILY_TASKS = 50;
const completedStatuses = new Set(["done", "development_done", "archived"]);

export type DailyTaskCandidate = {
  id: string;
  title: string;
  status: string;
  dueDate: string | null;
  parentKind: "project" | "routine" | "general";
  parentId: string | null;
  parentTitle: string;
};

export type DailyTaskSnapshotValue = {
  id: string;
  taskId: string | null;
  taskTitle: string;
  parentKind: string;
  parentId: string | null;
  parentTitle: string;
  status: string;
  isNew: boolean;
  sortOrder: number;
};

export type DailySubmissionValue = {
  id: string;
  memberId: string | null;
  memberName: string;
  memberEmail: string;
  date: string;
  version: number;
  yesterdayNote: string;
  todayNote: string;
  blockersNote: string;
  noPlannedTasks: boolean;
  source: string;
  submittedAt: string;
  tasks: DailyTaskSnapshotValue[];
};

type DraftRow = {
  id: string;
  member_id: string | null;
  scrum_date: string;
  yesterday_note: string;
  today_note: string;
  blockers_note: string;
  no_planned_tasks: number;
  source: string;
  updated_at: string;
};

type CandidateRow = {
  id: string;
  title: string;
  status: string;
  due_date: string | null;
  parent_kind: "project" | "routine" | "general";
  parent_id: string | null;
  parent_title: string;
};

type SubmissionRow = {
  id: string;
  member_id: string | null;
  member_name: string;
  member_email: string;
  scrum_date: string;
  version: number;
  yesterday_note: string;
  today_note: string;
  blockers_note: string;
  no_planned_tasks: number;
  source: string;
  submitted_at: string;
};

type SnapshotRow = {
  id: string;
  submission_id: string;
  task_id: string | null;
  task_title: string;
  parent_kind: string;
  parent_id: string | null;
  parent_title: string;
  status: string;
  is_new: number;
  sort_order: number;
};

export async function currentDailyMember(authorization: RequestAuthorization) {
  await ensureWorkspace(authorization.ownerId);
  const [member] = await getDb().select().from(workspaceMembers).where(and(
    eq(workspaceMembers.workspaceId, authorization.ownerId),
    eq(workspaceMembers.userId, authorization.userId),
    eq(workspaceMembers.status, "active"),
  )).limit(1);
  if (member) return member;
  if (authorization.apiToken) {
    const [owner] = await getDb().select().from(workspaceMembers).where(and(
      eq(workspaceMembers.workspaceId, authorization.ownerId),
      eq(workspaceMembers.role, "owner"),
      eq(workspaceMembers.status, "active"),
    )).limit(1);
    if (owner) return owner;
  }
  throw new Error("현재 워크스페이스 멤버를 확인할 수 없습니다.");
}

export async function getDailyDashboard(authorization: RequestAuthorization, rawDate: string) {
  const date = normalizeDailyDate(rawDate);
  const member = await currentDailyMember(authorization);
  const d1 = env.DB;
  const [draft, selectedRows, candidates, projectTargets, routineTargets, teamRows, legacy] = await Promise.all([
    d1.prepare(`SELECT id, member_id, scrum_date, yesterday_note, today_note, blockers_note,
        no_planned_tasks, source, updated_at
      FROM daily_scrums WHERE owner_id = ? AND member_id = ? AND scrum_date = ? LIMIT 1`)
      .bind(authorization.ownerId, member.id, date).first<DraftRow>(),
    d1.prepare(`SELECT selection.task_id AS id
      FROM daily_scrum_task_selections AS selection
      INNER JOIN daily_scrums AS draft ON draft.id = selection.daily_scrum_id
      WHERE selection.owner_id = ? AND selection.member_id = ? AND draft.scrum_date = ?`)
      .bind(authorization.ownerId, member.id, date).all<{ id: string }>(),
    listAssignedTaskCandidates(authorization.ownerId, member.id),
    listDriProjectTargets(authorization.ownerId, member.id),
    listRoutineTargets(authorization.ownerId, member.id),
    d1.prepare(`SELECT member.id, member.display_name, member.email, member.role,
        draft.id AS draft_id, link.id AS slack_link_id,
        submission.id AS submission_id, submission.member_name, submission.member_email,
        submission.scrum_date, submission.version, submission.yesterday_note, submission.today_note,
        submission.blockers_note, submission.no_planned_tasks, submission.source, submission.submitted_at
      FROM workspace_members AS member
      LEFT JOIN daily_scrums AS draft
        ON draft.owner_id = member.workspace_id AND draft.member_id = member.id AND draft.scrum_date = ?
      LEFT JOIN slack_member_links AS link
        ON link.owner_id = member.workspace_id AND link.member_id = member.id
      LEFT JOIN daily_submissions AS submission ON submission.id = (
        SELECT latest.id FROM daily_submissions AS latest
        WHERE latest.owner_id = member.workspace_id AND latest.member_id = member.id AND latest.scrum_date = ?
        ORDER BY latest.version DESC LIMIT 1
      )
      WHERE member.workspace_id = ? AND member.status = 'active'
      ORDER BY CASE member.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, member.created_at`)
      .bind(date, date, authorization.ownerId).all<Record<string, string | number | null>>(),
    d1.prepare(`SELECT id, member_id, scrum_date, yesterday_note, today_note, blockers_note,
        no_planned_tasks, source, updated_at
      FROM daily_scrums WHERE owner_id = ? AND member_id IS NULL AND scrum_date = ? LIMIT 1`)
      .bind(authorization.ownerId, date).first<DraftRow>(),
  ]);

  const submissionIds = teamRows.results.flatMap((row) => typeof row.submission_id === "string" ? [row.submission_id] : []);
  const snapshots = await snapshotsForSubmissions(submissionIds);
  const snapshotsBySubmission = new Map<string, SnapshotRow[]>();
  for (const snapshot of snapshots) {
    const values = snapshotsBySubmission.get(snapshot.submission_id) ?? [];
    values.push(snapshot);
    snapshotsBySubmission.set(snapshot.submission_id, values);
  }
  const team = teamRows.results.map((row) => {
    const submission = row.submission_id ? serializeSubmission(row as unknown as SubmissionRow, snapshotsBySubmission.get(String(row.submission_id)) ?? []) : null;
    return {
      memberId: String(row.id),
      displayName: String(row.display_name || row.email || "멤버"),
      email: String(row.email || ""),
      role: String(row.role || "member"),
      status: submission ? "submitted" : row.draft_id ? "writing" : "missing",
      slackConnected: Boolean(row.slack_link_id),
      submission,
    };
  });
  const currentSubmission = team.find((entry) => entry.memberId === member.id)?.submission ?? null;

  return {
    date,
    member: serializeMember(member),
    draft: {
      id: draft?.id ?? null,
      date,
      yesterdayNote: draft?.yesterday_note ?? "",
      todayNote: draft?.today_note ?? "",
      blockersNote: draft?.blockers_note ?? "",
      noPlannedTasks: Boolean(draft?.no_planned_tasks),
      selectedTaskIds: selectedRows.results.map((row) => row.id),
      source: draft?.source ?? "web",
      updatedAt: draft?.updated_at ?? null,
    },
    latestSubmission: currentSubmission,
    candidates: {
      tasks: candidates,
      groups: groupCandidates(candidates),
    },
    createTargets: {
      projects: projectTargets,
      routines: routineTargets,
      allowGeneral: projectTargets.length === 0 && routineTargets.length === 0,
    },
    team,
    legacyWorkspaceNote: legacy ? {
      yesterdayNote: legacy.yesterday_note,
      todayNote: legacy.today_note,
      blockersNote: legacy.blockers_note,
      updatedAt: legacy.updated_at,
    } : null,
  };
}

export async function saveDailyDraft(
  authorization: RequestAuthorization,
  input: {
    date: string;
    yesterdayNote?: string;
    todayNote?: string;
    blockersNote?: string;
    selectedTaskIds?: string[];
    noPlannedTasks?: boolean;
    source?: "web" | "slack";
  },
) {
  const date = normalizeDailyDate(input.date);
  const member = await currentDailyMember(authorization);
  const requestedIds = uniqueIds(input.selectedTaskIds ?? []);
  if (requestedIds.length > MAX_DAILY_TASKS) throw new Error(`오늘 Task는 최대 ${MAX_DAILY_TASKS}개까지 선택할 수 있습니다.`);
  const noPlannedTasks = Boolean(input.noPlannedTasks);
  const selectedTaskIds = noPlannedTasks ? [] : requestedIds;
  await assertAssignedTaskIds(authorization.ownerId, member.id, selectedTaskIds);
  const d1 = env.DB;
  const existing = await d1.prepare(`SELECT id FROM daily_scrums
    WHERE owner_id = ? AND member_id = ? AND scrum_date = ? LIMIT 1`)
    .bind(authorization.ownerId, member.id, date).first<{ id: string }>();
  const draftId = existing?.id ?? crypto.randomUUID();
  const now = new Date().toISOString();
  if (!existing) {
    await d1.prepare(`INSERT INTO daily_scrums
      (id, owner_id, member_id, scrum_date, yesterday_note, today_note, blockers_note, no_planned_tasks, source, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(draftId, authorization.ownerId, member.id, date, cleanNote(input.yesterdayNote), cleanNote(input.todayNote), cleanNote(input.blockersNote), noPlannedTasks ? 1 : 0, input.source ?? "web", now, now).run();
  } else {
    await d1.prepare(`UPDATE daily_scrums SET yesterday_note = ?, today_note = ?, blockers_note = ?,
      no_planned_tasks = ?, source = ?, updated_at = ? WHERE id = ? AND owner_id = ? AND member_id = ?`)
      .bind(cleanNote(input.yesterdayNote), cleanNote(input.todayNote), cleanNote(input.blockersNote), noPlannedTasks ? 1 : 0, input.source ?? "web", now, draftId, authorization.ownerId, member.id).run();
  }
  await d1.batch([
    d1.prepare("DELETE FROM daily_scrum_task_selections WHERE daily_scrum_id = ? AND owner_id = ?").bind(draftId, authorization.ownerId),
    ...selectedTaskIds.map((taskId) => d1.prepare(`INSERT INTO daily_scrum_task_selections
      (id, owner_id, daily_scrum_id, member_id, task_id, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
      .bind(crypto.randomUUID(), authorization.ownerId, draftId, member.id, taskId, now)),
  ]);
  return getDailyDashboard(authorization, date);
}

export async function createExplicitDailyTask(
  authorization: RequestAuthorization,
  input: { date: string; title: string; parentKind?: "project" | "routine" | "general"; parentId?: string | null; requestId?: string },
) {
  const date = normalizeDailyDate(input.date);
  const title = input.title.trim();
  if (!title) throw new Error("새 Task 제목을 입력해 주세요.");
  if (title.length > 240) throw new Error("Task 제목은 240자 이하로 입력해 주세요.");
  const member = await currentDailyMember(authorization);
  const sourceRef = `daily:${member.id}:${date}:${normalizeRequestId(input.requestId)}`;
  const [existing] = await getDb().select().from(items).where(and(
    eq(items.ownerId, authorization.ownerId),
    eq(items.sourceRef, sourceRef),
  )).limit(1);
  if (existing) {
    await selectTaskInDraft(authorization, member, date, existing.id);
    return existing;
  }

  const parentKind = input.parentKind ?? "general";
  const parentId = input.parentId?.trim() || null;
  const allowed = await validateCreateTarget(authorization.ownerId, member.id, parentKind, parentId);
  const created = await createItem(authorization.ownerId, {
    title,
    kind: "task",
    parentId: allowed.parentKind === "project" ? allowed.parentId : null,
    routineId: allowed.parentKind === "routine" ? allowed.parentId : null,
    status: "todo",
    dueDate: date,
    source: "daily",
    sourceRef,
    createdByUserId: authorization.userId,
  });
  await replaceItemAssignmentRole(authorization.ownerId, created.id, "task_assignee", [member.id]);
  await selectTaskInDraft(authorization, member, date, created.id);
  return created;
}

export async function submitDailyDraft(authorization: RequestAuthorization, rawDate: string, source: "web" | "slack" = "web") {
  const date = normalizeDailyDate(rawDate);
  const member = await currentDailyMember(authorization);
  const d1 = env.DB;
  const draft = await d1.prepare(`SELECT id, member_id, scrum_date, yesterday_note, today_note, blockers_note,
      no_planned_tasks, source, updated_at FROM daily_scrums
    WHERE owner_id = ? AND member_id = ? AND scrum_date = ? LIMIT 1`)
    .bind(authorization.ownerId, member.id, date).first<DraftRow>();
  if (!draft) throw new Error("먼저 데일리 초안을 저장해 주세요.");
  const selected = await selectedTaskRows(authorization.ownerId, member.id, draft.id, date);
  const selectionCount = await d1.prepare("SELECT COUNT(*) AS count FROM daily_scrum_task_selections WHERE daily_scrum_id = ?")
    .bind(draft.id).first<{ count: number }>();
  if (selected.length !== Number(selectionCount?.count ?? 0)) {
    throw new Error("선택한 Task의 상태 또는 할당이 변경되었습니다. 초안을 새로고침해 다시 선택해 주세요.");
  }
  if (!draft.no_planned_tasks && selected.length === 0 && !draft.today_note.trim()) {
    throw new Error("오늘 Task를 선택하거나 ‘오늘 예정 없음’을 선택해 주세요.");
  }
  if (selected.length > MAX_DAILY_TASKS) throw new Error(`오늘 Task는 최대 ${MAX_DAILY_TASKS}개까지 선택할 수 있습니다.`);

  const versionRow = await d1.prepare(`SELECT COALESCE(MAX(version), 0) AS version FROM daily_submissions
    WHERE owner_id = ? AND member_id = ? AND scrum_date = ?`)
    .bind(authorization.ownerId, member.id, date).first<{ version: number }>();
  const submissionId = crypto.randomUUID();
  const version = Number(versionRow?.version ?? 0) + 1;
  const submittedAt = new Date().toISOString();
  const channels = await d1.prepare("SELECT channel_id FROM slack_daily_channels WHERE owner_id = ? ORDER BY channel_name")
    .bind(authorization.ownerId).all<{ channel_id: string }>();
  await d1.batch([
    d1.prepare(`INSERT INTO daily_submissions
      (id, owner_id, member_id, member_name, member_email, scrum_date, version, yesterday_note, today_note,
       blockers_note, no_planned_tasks, source, submitted_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(submissionId, authorization.ownerId, member.id, member.displayName || member.email || "멤버", member.email || "", date, version,
        draft.yesterday_note, draft.today_note, draft.blockers_note, draft.no_planned_tasks, source, submittedAt),
    ...selected.map((task, index) => d1.prepare(`INSERT INTO daily_task_snapshots
      (id, owner_id, submission_id, task_id, task_title, parent_kind, parent_id, parent_title, status, is_new, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(crypto.randomUUID(), authorization.ownerId, submissionId, task.id, task.title, task.parent_kind, task.parent_id, task.parent_title,
        task.status, task.is_new, index)),
    ...channels.results.map((channel) => d1.prepare(`INSERT INTO slack_daily_publications
      (id, owner_id, member_id, submission_id, scrum_date, channel_id, status, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`)
      .bind(crypto.randomUUID(), authorization.ownerId, member.id, submissionId, date, channel.channel_id, submittedAt)),
  ]);
  const snapshots = await snapshotsForSubmissions([submissionId]);
  const submission = await d1.prepare("SELECT * FROM daily_submissions WHERE id = ?").bind(submissionId).first<SubmissionRow>();
  if (!submission) throw new Error("데일리 제출 결과를 확인할 수 없습니다.");
  return serializeSubmission(submission, snapshots);
}

export async function dailyMemberBySlack(teamId: string, slackUserId: string) {
  await ensureWorkspaceForSlackTeam(teamId);
  const row = await env.DB.prepare(`SELECT link.owner_id, link.member_id, member.user_id, member.email,
      member.display_name, member.role, member.status
    FROM slack_member_links AS link
    INNER JOIN workspace_members AS member ON member.id = link.member_id
    WHERE link.team_id = ? AND link.slack_user_id = ? AND member.status = 'active' LIMIT 1`)
    .bind(teamId, slackUserId).first<Record<string, string>>();
  if (!row) return null;
  return {
    authorization: {
      ownerId: row.owner_id,
      userId: row.user_id || `slack:${slackUserId}`,
      email: row.email || null,
      displayName: row.display_name || row.email || "Slack member",
      role: (row.role || "member") as RequestAuthorization["role"],
      apiToken: false,
    } satisfies RequestAuthorization,
    memberId: row.member_id,
  };
}

async function ensureWorkspaceForSlackTeam(teamId: string) {
  const row = await env.DB.prepare("SELECT owner_id FROM slack_connections WHERE team_id = ? LIMIT 1").bind(teamId).first<{ owner_id: string }>();
  if (row) await ensureWorkspace(row.owner_id);
}

async function listAssignedTaskCandidates(ownerId: string, memberId: string) {
  const rows = await env.DB.prepare(`SELECT task.id, task.title, task.status, task.due_date,
      CASE WHEN project.id IS NOT NULL THEN 'project'
           WHEN routine.system_key = 'general' OR (task.parent_id IS NULL AND routine.id IS NULL) THEN 'general'
           ELSE 'routine' END AS parent_kind,
      CASE WHEN project.id IS NOT NULL THEN project.id
           WHEN routine.system_key = 'general' THEN NULL ELSE routine.id END AS parent_id,
      CASE WHEN project.id IS NOT NULL THEN project.title
           WHEN routine.system_key = 'general' OR routine.id IS NULL THEN 'General' ELSE routine.title END AS parent_title
    FROM item_assignments AS assignment
    INNER JOIN items AS task ON task.id = assignment.item_id AND task.owner_id = assignment.owner_id
    LEFT JOIN items AS project ON project.id = task.parent_id AND project.owner_id = task.owner_id AND project.kind = 'project'
    LEFT JOIN routines AS routine ON routine.id = task.routine_id AND routine.owner_id = task.owner_id
    WHERE assignment.owner_id = ? AND assignment.member_id = ? AND assignment.role = 'task_assignee'
      AND task.kind = 'task' AND task.archived_at IS NULL
      AND task.status NOT IN ('done', 'development_done', 'archived')
    ORDER BY CASE WHEN task.due_date IS NULL THEN 1 ELSE 0 END, task.due_date, task.updated_at DESC, task.title`)
    .bind(ownerId, memberId).all<CandidateRow>();
  return rows.results.map(serializeCandidate);
}

async function listDriProjectTargets(ownerId: string, memberId: string) {
  const rows = await env.DB.prepare(`SELECT project.id, project.title,
      NOT EXISTS (
        SELECT 1 FROM items AS task WHERE task.owner_id = project.owner_id AND task.parent_id = project.id
          AND task.kind = 'task' AND task.archived_at IS NULL
          AND task.status NOT IN ('done', 'development_done', 'archived')
      ) AS needs_task
    FROM item_assignments AS assignment
    INNER JOIN items AS project ON project.id = assignment.item_id AND project.owner_id = assignment.owner_id
    WHERE assignment.owner_id = ? AND assignment.member_id = ? AND assignment.role = 'project_dri'
      AND project.kind = 'project' AND project.archived_at IS NULL
      AND project.status NOT IN ('backlog', 'done', 'development_done', 'archived')
    ORDER BY project.title`)
    .bind(ownerId, memberId).all<{ id: string; title: string; needs_task: number }>();
  return rows.results.map((row) => ({ id: row.id, title: row.title, needsTask: Boolean(row.needs_task) }));
}

async function listRoutineTargets(ownerId: string, memberId: string) {
  const rows = await env.DB.prepare(`SELECT id, title FROM routines
    WHERE owner_id = ? AND assignee_member_id = ? AND active = 1 AND system_key IS NULL ORDER BY sort_order, title`)
    .bind(ownerId, memberId).all<{ id: string; title: string }>();
  return rows.results;
}

async function validateCreateTarget(ownerId: string, memberId: string, kind: "project" | "routine" | "general", id: string | null) {
  if (kind === "project" && id) {
    const row = await env.DB.prepare(`SELECT project.id FROM items AS project
      INNER JOIN item_assignments AS assignment ON assignment.item_id = project.id AND assignment.owner_id = project.owner_id
      WHERE project.owner_id = ? AND project.id = ? AND project.kind = 'project' AND project.archived_at IS NULL
        AND assignment.member_id = ? AND assignment.role = 'project_dri' LIMIT 1`)
      .bind(ownerId, id, memberId).first<{ id: string }>();
    if (row) return { parentKind: "project" as const, parentId: row.id };
  }
  if (kind === "routine" && id) {
    const [row] = await getDb().select({ id: routines.id }).from(routines).where(and(
      eq(routines.ownerId, ownerId), eq(routines.id, id), eq(routines.assigneeMemberId, memberId), eq(routines.active, true),
    )).limit(1);
    if (row) return { parentKind: "routine" as const, parentId: row.id };
  }
  if (kind === "general") {
    const [projects, routinesForMember] = await Promise.all([listDriProjectTargets(ownerId, memberId), listRoutineTargets(ownerId, memberId)]);
    if (projects.length === 0 && routinesForMember.length === 0) return { parentKind: "general" as const, parentId: null };
    throw new Error("DRI Project 또는 담당 Routine을 선택해 주세요.");
  }
  throw new Error("본인이 담당한 Project 또는 Routine만 선택할 수 있습니다.");
}

async function assertAssignedTaskIds(ownerId: string, memberId: string, taskIds: string[]) {
  if (!taskIds.length) return;
  const placeholders = taskIds.map(() => "?").join(",");
  const rows = await env.DB.prepare(`SELECT task.id FROM item_assignments AS assignment
    INNER JOIN items AS task ON task.id = assignment.item_id AND task.owner_id = assignment.owner_id
    WHERE assignment.owner_id = ? AND assignment.member_id = ? AND assignment.role = 'task_assignee'
      AND task.id IN (${placeholders}) AND task.kind = 'task' AND task.archived_at IS NULL
      AND task.status NOT IN ('done', 'development_done', 'archived')`)
    .bind(ownerId, memberId, ...taskIds).all<{ id: string }>();
  if (rows.results.length !== taskIds.length) throw new Error("본인에게 할당된 미완료 Task만 선택할 수 있습니다.");
}

async function ensureDraftId(ownerId: string, memberId: string, date: string, source = "web") {
  const existing = await env.DB.prepare(`SELECT id FROM daily_scrums WHERE owner_id = ? AND member_id = ? AND scrum_date = ? LIMIT 1`)
    .bind(ownerId, memberId, date).first<{ id: string }>();
  if (existing) return existing.id;
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await env.DB.prepare(`INSERT INTO daily_scrums
    (id, owner_id, member_id, scrum_date, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .bind(id, ownerId, memberId, date, source, now, now).run();
  return id;
}

async function selectTaskInDraft(authorization: RequestAuthorization, member: WorkspaceMember, date: string, taskId: string) {
  const draftId = await ensureDraftId(authorization.ownerId, member.id, date);
  const count = await env.DB.prepare("SELECT COUNT(*) AS count FROM daily_scrum_task_selections WHERE daily_scrum_id = ?")
    .bind(draftId).first<{ count: number }>();
  if (Number(count?.count ?? 0) >= MAX_DAILY_TASKS) throw new Error(`오늘 Task는 최대 ${MAX_DAILY_TASKS}개까지 선택할 수 있습니다.`);
  await env.DB.prepare(`INSERT OR IGNORE INTO daily_scrum_task_selections
    (id, owner_id, daily_scrum_id, member_id, task_id) VALUES (?, ?, ?, ?, ?)`)
    .bind(crypto.randomUUID(), authorization.ownerId, draftId, member.id, taskId).run();
  await env.DB.prepare("UPDATE daily_scrums SET no_planned_tasks = 0, updated_at = ? WHERE id = ?")
    .bind(new Date().toISOString(), draftId).run();
}

async function selectedTaskRows(ownerId: string, memberId: string, draftId: string, date: string) {
  const rows = await env.DB.prepare(`SELECT task.id, task.title, task.status,
      CASE WHEN project.id IS NOT NULL THEN 'project'
           WHEN routine.system_key = 'general' OR routine.id IS NULL THEN 'general' ELSE 'routine' END AS parent_kind,
      CASE WHEN project.id IS NOT NULL THEN project.id
           WHEN routine.system_key = 'general' THEN NULL ELSE routine.id END AS parent_id,
      CASE WHEN project.id IS NOT NULL THEN project.title
           WHEN routine.system_key = 'general' OR routine.id IS NULL THEN 'General' ELSE routine.title END AS parent_title,
      CASE WHEN task.source = 'daily' AND task.source_ref LIKE ? THEN 1 ELSE 0 END AS is_new
    FROM daily_scrum_task_selections AS selection
    INNER JOIN items AS task ON task.id = selection.task_id AND task.owner_id = selection.owner_id
    INNER JOIN item_assignments AS assignment ON assignment.owner_id = task.owner_id AND assignment.item_id = task.id
      AND assignment.member_id = ? AND assignment.role = 'task_assignee'
    LEFT JOIN items AS project ON project.id = task.parent_id AND project.owner_id = task.owner_id
    LEFT JOIN routines AS routine ON routine.id = task.routine_id AND routine.owner_id = task.owner_id
    WHERE selection.owner_id = ? AND selection.daily_scrum_id = ? AND selection.member_id = ?
      AND task.archived_at IS NULL AND task.status NOT IN ('done', 'development_done', 'archived')
    ORDER BY selection.created_at`)
    .bind(`daily:${memberId}:${date}:%`, memberId, ownerId, draftId, memberId).all<{
      id: string; title: string; status: string; parent_kind: string; parent_id: string | null; parent_title: string; is_new: number;
    }>();
  return rows.results;
}

async function snapshotsForSubmissions(submissionIds: string[]) {
  if (!submissionIds.length) return [] as SnapshotRow[];
  const placeholders = submissionIds.map(() => "?").join(",");
  const rows = await env.DB.prepare(`SELECT * FROM daily_task_snapshots WHERE submission_id IN (${placeholders}) ORDER BY sort_order`)
    .bind(...submissionIds).all<SnapshotRow>();
  return rows.results;
}

function serializeSubmission(row: SubmissionRow, snapshots: SnapshotRow[]): DailySubmissionValue {
  return {
    id: row.id,
    memberId: row.member_id,
    memberName: row.member_name,
    memberEmail: row.member_email,
    date: row.scrum_date,
    version: Number(row.version),
    yesterdayNote: row.yesterday_note,
    todayNote: row.today_note,
    blockersNote: row.blockers_note,
    noPlannedTasks: Boolean(row.no_planned_tasks),
    source: row.source,
    submittedAt: row.submitted_at,
    tasks: snapshots.map((snapshot) => ({
      id: snapshot.id,
      taskId: snapshot.task_id,
      taskTitle: snapshot.task_title,
      parentKind: snapshot.parent_kind,
      parentId: snapshot.parent_id,
      parentTitle: snapshot.parent_title,
      status: snapshot.status,
      isNew: Boolean(snapshot.is_new),
      sortOrder: Number(snapshot.sort_order),
    })),
  };
}

function serializeCandidate(row: CandidateRow): DailyTaskCandidate {
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    dueDate: row.due_date,
    parentKind: row.parent_kind,
    parentId: row.parent_id,
    parentTitle: row.parent_title,
  };
}

function groupCandidates(tasks: DailyTaskCandidate[]) {
  const groups = new Map<string, { key: string; kind: string; id: string | null; title: string; tasks: DailyTaskCandidate[] }>();
  for (const task of tasks) {
    const key = `${task.parentKind}:${task.parentId ?? "general"}`;
    const group = groups.get(key) ?? { key, kind: task.parentKind, id: task.parentId, title: task.parentTitle, tasks: [] };
    group.tasks.push(task);
    groups.set(key, group);
  }
  return [...groups.values()];
}

function serializeMember(member: WorkspaceMember) {
  return { id: member.id, displayName: member.displayName || member.email || "멤버", email: member.email || "", role: member.role };
}

function uniqueIds(values: string[]) {
  return [...new Set(values.filter((value): value is string => typeof value === "string" && Boolean(value.trim())).map((value) => value.trim()))];
}

function cleanNote(value: string | undefined) {
  return (value ?? "").trim().slice(0, 4000);
}

function normalizeRequestId(value: string | undefined) {
  const cleaned = (value ?? crypto.randomUUID()).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80);
  return cleaned || crypto.randomUUID();
}

export function normalizeDailyDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("올바른 날짜를 입력해 주세요.");
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new Error("올바른 날짜를 입력해 주세요.");
  return value;
}

export function isCompletedDailyStatus(status: string) {
  return completedStatuses.has(status);
}
