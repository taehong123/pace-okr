import { env, waitUntil } from "cloudflare:workers";
import { z } from "zod";
import type { SlackConnection } from "@/db/schema";
import { BillingLimitError, memberCanWrite, reserveProjectCreation, releaseProjectCreation } from "@/lib/billing";
import { getSlackConnectionByTeam, getWorkspaceRules, listProjectPropertyDefinitions, normalizePropertyValue, serializePropertyDefinition, ITEM_STATUSES, ITEM_PRIORITIES, ITEM_CADENCES, type PropertyValue, type RequestAuthorization } from "@/lib/pace-data";
import { slackApi, slackTokenForConnection } from "@/lib/slack-daily";
import { slackSummonSourceRef, type SlackSummonMessage } from "@/lib/slack-summon-command";
import { buildProjectModal, formOption, parseProjectForm, plainText, projectFieldAction, projectStatusView, PROJECT_MODAL_CALLBACK, PROJECT_OPEN_ACTION, type ProjectForm, type ProjectFormField, type SlackFormState } from "@/lib/slack-project-form";

export const SLACK_PROJECT_DRAFT_SCHEMA = `CREATE TABLE IF NOT EXISTS slack_project_drafts (
  id TEXT PRIMARY KEY NOT NULL,
  owner_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  team_id TEXT NOT NULL, slack_user_id TEXT NOT NULL, user_id TEXT NOT NULL,
  channel_id TEXT NOT NULL, message_ts TEXT NOT NULL, thread_ts TEXT,
  source_ref TEXT NOT NULL, seed_json TEXT NOT NULL, form_json TEXT NOT NULL DEFAULT '{}', input_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'draft', view_id TEXT, operation_id TEXT, item_id TEXT, last_error TEXT NOT NULL DEFAULT '',
  expires_at TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
)`;
let schemaReady: Promise<unknown> | undefined;
export async function ensureSlackProjectDrafts() {
  schemaReady ??= env.DB.batch([
    env.DB.prepare(SLACK_PROJECT_DRAFT_SCHEMA),
    env.DB.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_slack_project_drafts_source ON slack_project_drafts(owner_id, source_ref)"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_slack_project_drafts_expiry ON slack_project_drafts(expires_at)"),
  ]).catch((error) => { schemaReady = undefined; throw error; });
  await schemaReady;
}

type ProjectDraft = {
  id: string; owner_id: string; team_id: string; slack_user_id: string; user_id: string;
  channel_id: string; message_ts: string; thread_ts: string | null; source_ref: string;
  seed_json: string; form_json: string; input_json: string; status: string; view_id: string | null;
  operation_id: string | null; item_id: string | null; last_error: string; expires_at: string; updated_at: string; role: string;
};
class ProjectFormError extends Error {}
const projectUrl = (id?: string) => {
  const runtime = env as unknown as { OKRI_APP_URL?: string; OKRPTR_APP_URL?: string };
  const url = new URL("/", runtime.OKRI_APP_URL || runtime.OKRPTR_APP_URL || "https://okri.ai");
  url.searchParams.set("view", "work");
  if (id) url.searchParams.set("project", id);
  return url.toString();
};
const openButton = (id: string) => ({ type: "button", action_id: PROJECT_OPEN_ACTION, text: plainText("속성 입력"), value: id });
const projectLink = (id?: string) => ({ type: "button", action_id: "okri_summon_open", text: plainText(id ? "프로젝트 열기" : "OKRI 열기"), url: projectUrl(id) });

export async function offerSlackProjectForm(connection: SlackConnection, authorization: RequestAuthorization, event: SlackSummonMessage, seed: { title: string; description: string }) {
  await ensureSlackProjectDrafts();
  const now = new Date().toISOString();
  await env.DB.prepare("DELETE FROM slack_project_drafts WHERE expires_at < ? AND status = 'draft'").bind(now).run();
  const sourceRef = slackSummonSourceRef(connection.teamId, event);
  await env.DB.prepare(`INSERT OR IGNORE INTO slack_project_drafts
    (id, owner_id, team_id, slack_user_id, user_id, channel_id, message_ts, thread_ts, source_ref, seed_json, expires_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(crypto.randomUUID(), connection.ownerId, connection.teamId, event.user, authorization.userId, event.channel, event.ts, event.thread_ts ?? null,
      sourceRef, JSON.stringify(seed), new Date(Date.now() + 24 * 60 * 60_000).toISOString(), now, now).run();
  const draft = await env.DB.prepare("SELECT id FROM slack_project_drafts WHERE owner_id = ? AND source_ref = ?").bind(connection.ownerId, sourceRef).first<{ id: string }>();
  if (!draft) throw new Error("Project form could not be stored");
  const token = await slackTokenForConnection(connection);
  await slackApi(token, "chat.postEphemeral", {
    channel: event.channel, user: event.user, ...(event.thread_ts ? { thread_ts: event.thread_ts } : {}), text: "프로젝트 속성을 입력해 주세요.",
    blocks: [{ type: "section", text: plainText(seed.title ? `새 프로젝트: ${seed.title}` : "새 프로젝트") }, { type: "actions", elements: [openButton(draft.id)] }],
  });
}

async function loadDraft(id: string, teamId: string, slackUserId: string) {
  return env.DB.prepare(`SELECT draft.*, member.role FROM slack_project_drafts draft
    INNER JOIN workspaces workspace ON workspace.id = draft.owner_id AND workspace.scheduled_deletion_at IS NULL
    INNER JOIN slack_connections connection ON connection.owner_id = draft.owner_id AND connection.team_id = draft.team_id
    INNER JOIN slack_member_links link ON link.owner_id = draft.owner_id AND link.team_id = draft.team_id AND link.slack_user_id = draft.slack_user_id
    INNER JOIN workspace_members member ON member.id = link.member_id AND member.workspace_id = draft.owner_id
      AND member.user_id = draft.user_id AND member.status = 'active' AND member.role IN ('owner','admin','member')
    WHERE draft.id = ? AND draft.team_id = ? AND draft.slack_user_id = ? AND draft.expires_at > ? LIMIT 1`)
    .bind(id, teamId, slackUserId, new Date().toISOString()).first<ProjectDraft>();
}

async function parentOptions(ownerId: string, query: string, ids?: string[]) {
  const pattern = `%${query.trim().replace(/[\\%_]/g, "\\$&")}%`;
  const rows = await env.DB.prepare(`SELECT item.id, item.title, cycle.name AS cycle_name FROM items item
    LEFT JOIN okr_cycles cycle ON cycle.id = item.cycle_id AND cycle.owner_id = item.owner_id
    WHERE item.owner_id = ? AND item.kind = 'initiative' AND item.archived_at IS NULL AND item.status <> 'archived'
      AND (item.cycle_id IS NULL OR cycle.status IN ('active','planned'))
      AND ${ids ? "item.id IN (SELECT value FROM json_each(?))" : "item.title LIKE ? ESCAPE '\\'"}
    ORDER BY item.title, item.id LIMIT 100`).bind(ownerId, ids ? JSON.stringify(ids) : pattern).all<{ id: string; title: string; cycle_name: string | null }>();
  return rows.results.map((row) => formOption(`${row.title}${row.cycle_name ? ` · ${row.cycle_name}` : ""}`, row.id));
}

async function memberOptions(ownerId: string, query: string, ids?: string[]) {
  const pattern = `%${query.trim().replace(/[\\%_]/g, "\\$&")}%`;
  const rows = await env.DB.prepare(`SELECT id, display_name, email FROM workspace_members
    WHERE workspace_id = ? AND status = 'active' AND ${ids ? "id IN (SELECT value FROM json_each(?))" : "(display_name LIKE ? ESCAPE '\\' OR email LIKE ? ESCAPE '\\')"}
    ORDER BY display_name, id LIMIT 100`).bind(ownerId, ...(ids ? [JSON.stringify(ids)] : [pattern, pattern])).all<{ id: string; display_name: string; email: string | null }>();
  return rows.results.map((row) => formOption(`${row.display_name}${row.email ? ` · ${row.email}` : ""}`, row.id));
}

async function loadProjectForm(draft: ProjectDraft): Promise<ProjectForm> {
  const definitions = (await listProjectPropertyDefinitions(draft.owner_id)).map((definition) => ({ ...serializePropertyDefinition(definition), updatedAt: definition.updatedAt }));
  const rules = await getWorkspaceRules(draft.owner_id);
  const seed = JSON.parse(draft.seed_json) as { title: string; description: string };
  const previous = JSON.parse(draft.input_json) as Record<string, PropertyValue>;
  const system = (key: string) => definitions.find((definition) => definition.systemKey === key);
  const fields: ProjectFormField[] = [
    { key: "title", name: "프로젝트 이름", type: "text", value: seed.title, required: true },
    { key: "description", name: "설명", type: "text", value: seed.description },
    { key: "parent_id", name: "상위 Initiative", type: "parent", value: system("parent_id")?.defaultValue ?? null, required: true },
    { key: "status", name: "상태", type: "select", value: system("status")?.defaultValue ?? "todo", options: ITEM_STATUSES.filter((status) => status !== "archived"), required: true },
    { key: "priority", name: "우선순위", type: "select", value: system("priority")?.defaultValue ?? rules.defaultPriority, options: [...ITEM_PRIORITIES], required: true },
    { key: "cadence", name: "주기", type: "select", value: system("cadence")?.defaultValue ?? rules.defaultCadence, options: [...ITEM_CADENCES], required: true },
    { key: "due_date", name: "기한", type: "date", value: system("due_date")?.defaultValue ?? null },
    { key: "project_dri", name: "DRI", type: "member", value: system("project_dri")?.defaultValue ?? null },
    { key: "project_workers", name: "하위 업무자", type: "members", value: system("project_workers")?.defaultValue ?? null },
    ...definitions.filter((definition) => !definition.systemKey).map((definition) => ({ key: `custom_${definition.id}`, name: definition.name, type: definition.type as ProjectFormField["type"], value: definition.defaultValue, options: definition.options, propertyId: definition.id, updatedAt: definition.updatedAt })),
  ];
  if (!(await parentOptions(draft.owner_id, "")).length) throw new ProjectFormError("선택할 Initiative가 없습니다. OKRI에서 상위 Initiative를 만든 뒤 다시 열어 주세요.");
  for (const field of fields) {
    if (!field.propertyId && system(field.key)) field.name = system(field.key)!.name;
    if (Object.hasOwn(previous, field.key)) field.value = previous[field.key];
    const ids = Array.isArray(field.value) ? field.value : typeof field.value === "string" && field.value ? [field.value] : [];
    if (field.type === "members" && ids.length > 100) throw new ProjectFormError("멤버 기본값이 Slack의 100명 제한을 초과했습니다. 웹에서 확인해 주세요.");
    if (ids.length && field.type === "parent") field.initialOptions = await parentOptions(draft.owner_id, "", ids);
    if (ids.length && (field.type === "member" || field.type === "members")) field.initialOptions = await memberOptions(draft.owner_id, "", ids);
  }
  return { fields };
}

const interactionSchema = z.object({
  type: z.string(), trigger_id: z.string().optional(), team: z.object({ id: z.string() }), user: z.object({ id: z.string() }),
  action_id: z.string().optional(), value: z.string().optional(), actions: z.array(z.object({ action_id: z.string(), value: z.string().optional() })).optional(),
  view: z.object({ id: z.string(), callback_id: z.string().optional(), private_metadata: z.string().optional(), state: z.object({ values: z.record(z.string(), z.record(z.string(), z.object({
    value: z.string().nullable().optional(), selected_date: z.string().nullable().optional(), selected_option: z.object({ value: z.string() }).nullable().optional(), selected_options: z.array(z.object({ value: z.string() })).nullable().optional(),
  }))) }).optional() }).optional(),
});
type ProjectInteraction = z.infer<typeof interactionSchema>;

export async function handleSlackProjectInteraction(raw: unknown): Promise<Response | null> {
  const candidate = raw as Partial<ProjectInteraction> | null;
  const opens = candidate?.type === "block_actions" && Array.isArray(candidate.actions) && candidate.actions.some((action) => action?.action_id === PROJECT_OPEN_ACTION);
  const belongs = candidate?.view?.callback_id === PROJECT_MODAL_CALLBACK;
  if (!opens && !belongs) return null;
  const parsed = interactionSchema.safeParse(raw);
  if (!parsed.success) return new Response("invalid project interaction", { status: 400 });
  const payload = parsed.data;
  if (opens) {
    if (!payload.trigger_id) return new Response("missing trigger", { status: 400 });
    waitUntil(openProjectModal(payload).catch(() => console.error("Slack project modal could not be opened")));
    return new Response(null, { status: 200 });
  }
  if (payload.type === "view_closed") return new Response(null, { status: 200 });
  const draft = await loadDraft(payload.view?.private_metadata ?? "", payload.team.id, payload.user.id);
  if (!draft || draft.view_id !== payload.view?.id) {
    return payload.type === "block_suggestion" ? Response.json({ options: [] }) : Response.json({ response_action: "update", view: projectStatusView("이 입력창은 만료되었거나 접근 권한이 없습니다. 소환 봇에서 다시 열어 주세요.") });
  }
  const form = JSON.parse(draft.form_json) as ProjectForm;
  if (payload.type === "block_suggestion") {
    const field = form.fields.find((entry) => projectFieldAction(entry.key) === payload.action_id);
    if (!field) return Response.json({ options: [] });
    const query = payload.value ?? "";
    const options = field.type === "parent" ? await parentOptions(draft.owner_id, query)
      : field.type === "member" || field.type === "members" ? await memberOptions(draft.owner_id, query)
        : field.type === "select" ? (field.options ?? []).flatMap((label, index) => label.toLocaleLowerCase().includes(query.toLocaleLowerCase()) ? [formOption(label, String(index))] : []).slice(0, 100) : [];
    return Response.json({ options });
  }
  if (payload.type !== "view_submission") return new Response(null, { status: 200 });
  if (draft.status !== "draft") return new Response(null, { status: 200 });
  const result = parseProjectForm(form, payload.view?.state?.values as SlackFormState ?? {});
  if (Object.keys(result.errors).length) return Response.json({ response_action: "errors", errors: result.errors });
  const operation = crypto.randomUUID();
  const claimed = await env.DB.prepare(`UPDATE slack_project_drafts SET status = 'processing', input_json = ?, operation_id = ?, updated_at = ?, last_error = ''
    WHERE id = ? AND status = 'draft' AND view_id = ?`).bind(JSON.stringify(result.values), operation, new Date().toISOString(), draft.id, draft.view_id).run();
  if (claimed.meta.changes) waitUntil(completeProjectDraft({ ...draft, input_json: JSON.stringify(result.values), operation_id: operation }).catch(() => console.error("Slack project submission could not be completed")));
  return new Response(null, { status: 200 });
}

async function openProjectModal(payload: ProjectInteraction) {
  // A known installation already has its schema. Avoid cold-start repair work on the 3-second trigger path.
  const connection = await env.DB.prepare(`SELECT connection.owner_id AS ownerId, connection.encrypted_bot_token AS encryptedBotToken
    FROM slack_connections connection INNER JOIN workspaces workspace ON workspace.id = connection.owner_id
    WHERE connection.team_id = ? AND workspace.scheduled_deletion_at IS NULL LIMIT 1`)
    .bind(payload.team.id).first<Pick<SlackConnection, "ownerId" | "encryptedBotToken">>();
  if (!connection) return;
  const token = await slackTokenForConnection(connection);
  // Spend the short-lived trigger before loading the workspace's property definitions.
  let opened: { view?: { id: string } };
  try {
    opened = await slackApi<{ ok: boolean; view?: { id: string } }>(token, "views.open", { trigger_id: payload.trigger_id, view: projectStatusView("프로젝트 속성을 불러오는 중입니다.") });
  } catch {
    const draft = await loadDraft(payload.actions?.find((action) => action.action_id === PROJECT_OPEN_ACTION)?.value ?? "", payload.team.id, payload.user.id);
    if (draft) await slackApi(token, "chat.postEphemeral", { channel: draft.channel_id, user: draft.slack_user_id, text: "입력창을 열지 못했습니다. 속성 입력 버튼을 다시 눌러 주세요." });
    return;
  }
  const viewId = opened.view?.id;
  if (!viewId) return;
  const update = (view: unknown) => slackApi(token, "views.update", { view_id: viewId, view });
  try {
    const id = payload.actions?.find((action) => action.action_id === PROJECT_OPEN_ACTION)?.value ?? "";
    const draft = await loadDraft(id, payload.team.id, payload.user.id);
    if (!draft || draft.owner_id !== connection.ownerId || !await memberCanWrite(draft.owner_id, draft.user_id, draft.role)) throw new ProjectFormError("입력창이 만료되었거나 프로젝트 생성 권한이 없습니다.");
    if (draft.status === "done") {
      await update({ ...projectStatusView("이미 생성한 프로젝트입니다."), blocks: [{ type: "actions", elements: [projectLink(draft.item_id ?? draft.id)] }] });
      return;
    }
    if (draft.status === "processing" && Date.now() - Date.parse(draft.updated_at) < 120_000) {
      await update(projectStatusView("등록을 처리 중입니다. 결과는 Slack 메시지로 보내드립니다."));
      return;
    }
    const form = await loadProjectForm(draft);
    let view;
    try { view = buildProjectModal(draft.id, form, draft.last_error); }
    catch (error) { throw new ProjectFormError(error instanceof Error ? error.message : "Slack에서 입력할 수 없는 속성이 있습니다. 웹에서 확인해 주세요."); }
    const saved = await env.DB.prepare(`UPDATE slack_project_drafts SET form_json = ?, view_id = ?, status = 'draft', operation_id = NULL, updated_at = ?
      WHERE id = ? AND status <> 'done' AND (status <> 'processing' OR updated_at < ?)`)
      .bind(JSON.stringify(form), viewId, new Date().toISOString(), draft.id, new Date(Date.now() - 120_000).toISOString()).run();
    await update(saved.meta.changes ? view : projectStatusView("다른 입력창에서 등록을 처리 중입니다."));
  } catch (error) {
    const message = error instanceof ProjectFormError ? error.message : "프로젝트 속성을 불러오지 못했습니다. 잠시 후 다시 열어 주세요.";
    await update({ ...projectStatusView(message), blocks: [{ type: "section", text: plainText(message) }, { type: "actions", elements: [projectLink()] }] });
  }
}

async function completeProjectDraft(draft: ProjectDraft) {
  const connection = await getSlackConnectionByTeam(draft.team_id);
  if (!connection || connection.ownerId !== draft.owner_id) return;
  const token = await slackTokenForConnection(connection);
  let reservation: Awaited<ReturnType<typeof reserveProjectCreation>> = null;
  let created = false;
  try {
    const current = await loadDraft(draft.id, draft.team_id, draft.slack_user_id);
    if (!current || current.operation_id !== draft.operation_id || !await memberCanWrite(current.owner_id, current.user_id, current.role)) throw new ProjectFormError("프로젝트 생성 권한이 변경되었습니다.");
    const existing = await env.DB.prepare("SELECT id FROM items WHERE id = ? AND owner_id = ? AND source_ref = ?").bind(draft.id, draft.owner_id, draft.source_ref).first<{ id: string }>();
    if (existing) { created = true; }
    else {
      const values = JSON.parse(draft.input_json) as Record<string, PropertyValue>;
      const form = JSON.parse(draft.form_json) as ProjectForm;
      const parent = await env.DB.prepare(`SELECT item.cycle_id FROM items item LEFT JOIN okr_cycles cycle ON cycle.id = item.cycle_id AND cycle.owner_id = item.owner_id
        WHERE item.id = ? AND item.owner_id = ? AND item.kind = 'initiative' AND item.archived_at IS NULL AND item.status <> 'archived'
        AND (item.cycle_id IS NULL OR cycle.status IN ('active','planned'))`).bind(values.parent_id, draft.owner_id).first<{ cycle_id: string | null }>();
      if (!parent) throw new ProjectFormError("상위 Initiative를 다시 선택해 주세요. 삭제되었거나 종료된 주기일 수 있습니다.");
      const definitions = await listProjectPropertyDefinitions(draft.owner_id);
      const properties = form.fields.filter((field) => field.propertyId).map((field) => {
        const definition = definitions.find((property) => property.id === field.propertyId && !property.systemKey && property.updatedAt === field.updatedAt);
        if (!definition) throw new ProjectFormError("워크스페이스 속성이 변경되었습니다. 입력창을 다시 열어 확인해 주세요.");
        return { definition, value: normalizePropertyValue(definition, values[field.key] ?? null) };
      });
      const assignments = [
        ...(typeof values.project_dri === "string" ? [{ memberId: values.project_dri, role: "project_dri" }] : []),
        ...(Array.isArray(values.project_workers) ? values.project_workers.map((memberId) => ({ memberId, role: "project_worker" })) : []),
      ];
      const memberIds = [...new Set([...assignments.map((entry) => entry.memberId), ...properties.flatMap(({ definition, value }) => definition.type === "member" && typeof value === "string" ? [value] : definition.type === "members" && Array.isArray(value) ? value : [])])];
      const count = await env.DB.prepare("SELECT count(*) AS n FROM workspace_members WHERE workspace_id = ? AND status = 'active' AND id IN (SELECT value FROM json_each(?))").bind(draft.owner_id, JSON.stringify(memberIds)).first<{ n: number }>();
      if (count?.n !== memberIds.length) throw new ProjectFormError("선택한 멤버의 상태가 변경되었습니다. 담당자와 멤버 속성을 다시 확인해 주세요.");
      reservation = await reserveProjectCreation(draft.owner_id);
      const now = new Date().toISOString();
      const propertyVersions = properties.map(({ definition }) => ({ id: definition.id, updatedAt: definition.updatedAt, type: definition.type, options: definition.options }));
      const statements = [
        env.DB.prepare(`INSERT INTO items (id, owner_id, cycle_id, parent_id, kind, title, description, status, priority, cadence, progress, due_date, source, source_ref, created_by_user_id, created_at, updated_at)
          SELECT ?, ?, ?, ?, 'project', ?, ?, ?, ?, ?, 0, ?, 'slack', ?, ?, ?, ?
          WHERE EXISTS (SELECT 1 FROM slack_project_drafts WHERE id = ? AND status = 'processing' AND operation_id = ?)
          AND EXISTS (SELECT 1 FROM workspace_members WHERE workspace_id = ? AND user_id = ? AND status = 'active' AND role IN ('owner','admin','member'))
          AND EXISTS (SELECT 1 FROM workspaces WHERE id = ? AND scheduled_deletion_at IS NULL)
          AND EXISTS (SELECT 1 FROM slack_connections WHERE owner_id = ? AND team_id = ?)
          AND EXISTS (SELECT 1 FROM slack_member_links link INNER JOIN workspace_members member ON member.id = link.member_id
            WHERE link.owner_id = ? AND link.team_id = ? AND link.slack_user_id = ? AND member.workspace_id = ? AND member.user_id = ?)
          AND EXISTS (SELECT 1 FROM items parent LEFT JOIN okr_cycles cycle ON cycle.id = parent.cycle_id AND cycle.owner_id = parent.owner_id
            WHERE parent.id = ? AND parent.owner_id = ? AND parent.kind = 'initiative' AND parent.archived_at IS NULL AND parent.status <> 'archived' AND parent.cycle_id IS ?
            AND (parent.cycle_id IS NULL OR cycle.status IN ('active','planned')))
          AND (SELECT count(*) FROM workspace_members WHERE workspace_id = ? AND status = 'active' AND id IN (SELECT value FROM json_each(?))) = ?
          AND NOT EXISTS (SELECT 1 FROM json_each(?) expected WHERE NOT EXISTS (SELECT 1 FROM property_definitions property
            WHERE property.id = json_extract(expected.value, '$.id') AND property.owner_id = ? AND property.active = 1 AND property.system_key IS NULL
              AND property.updated_at = json_extract(expected.value, '$.updatedAt') AND property.type = json_extract(expected.value, '$.type') AND property.options = json_extract(expected.value, '$.options')))`)
          .bind(draft.id, draft.owner_id, parent.cycle_id, values.parent_id, values.title, values.description ?? "", values.status, values.priority, values.cadence, values.due_date,
            draft.source_ref, draft.user_id, now, now, draft.id, draft.operation_id, draft.owner_id, draft.user_id, draft.owner_id,
            draft.owner_id, draft.team_id, draft.owner_id, draft.team_id, draft.slack_user_id, draft.owner_id, draft.user_id, values.parent_id, draft.owner_id, parent.cycle_id,
            draft.owner_id, JSON.stringify(memberIds), memberIds.length, JSON.stringify(propertyVersions), draft.owner_id),
        ...properties.map(({ definition, value }) => env.DB.prepare(`INSERT INTO item_property_values (id, owner_id, item_id, property_id, value, updated_at)
          SELECT ?, ?, id, ?, ?, ? FROM items WHERE id = ? AND owner_id = ?`).bind(crypto.randomUUID(), draft.owner_id, definition.id, JSON.stringify(value), now, draft.id, draft.owner_id)),
        ...assignments.map((assignment) => env.DB.prepare(`INSERT INTO item_assignments (id, owner_id, item_id, member_id, role, created_at, updated_at)
          SELECT ?, ?, id, ?, ?, ?, ? FROM items WHERE id = ? AND owner_id = ?`).bind(crypto.randomUUID(), draft.owner_id, assignment.memberId, assignment.role, now, now, draft.id, draft.owner_id)),
        env.DB.prepare(`INSERT INTO activity_log (id, owner_id, item_id, action, source, payload, created_at)
          SELECT ?, ?, id, 'created', 'slack', ?, ? FROM items WHERE id = ? AND owner_id = ?`).bind(crypto.randomUUID(), draft.owner_id, JSON.stringify({ kind: "project", status: values.status, origin: "slack_summon" }), now, draft.id, draft.owner_id),
        env.DB.prepare(`UPDATE slack_project_drafts SET status = 'done', item_id = ?, updated_at = ? WHERE id = ? AND operation_id = ? AND EXISTS (SELECT 1 FROM items WHERE id = ? AND owner_id = ?)`)
          .bind(draft.id, now, draft.id, draft.operation_id, draft.id, draft.owner_id),
      ];
      const result = await env.DB.batch(statements);
      if (!result[0].meta.changes) throw new ProjectFormError("등록 직전에 권한이나 상위 항목이 변경되었습니다. 입력창을 다시 열어 주세요.");
      created = true;
    }
  } catch (error) {
    const saved = await env.DB.prepare("SELECT id FROM items WHERE id = ? AND owner_id = ? AND source_ref = ?").bind(draft.id, draft.owner_id, draft.source_ref).first<{ id: string }>().catch(() => undefined);
    if (saved) created = true;
    else {
      if (saved === null) await releaseProjectCreation(reservation);
      const message = error instanceof ProjectFormError || error instanceof BillingLimitError ? error.message : "프로젝트 등록을 확인하지 못했습니다. 잠시 후 입력창을 다시 열어 주세요.";
      if (saved === null) await env.DB.prepare("UPDATE slack_project_drafts SET status = 'draft', last_error = ?, updated_at = ? WHERE id = ? AND operation_id = ? AND status = 'processing'").bind(message, new Date().toISOString(), draft.id, draft.operation_id).run();
      await slackApi(token, "chat.postEphemeral", { channel: draft.channel_id, user: draft.slack_user_id, ...(draft.thread_ts ? { thread_ts: draft.thread_ts } : {}), text: message,
        blocks: [{ type: "section", text: plainText(message) }, { type: "actions", elements: [openButton(draft.id)] }] });
      return;
    }
  }
  if (created) {
    await env.DB.prepare("UPDATE slack_project_drafts SET status = 'done', item_id = ?, updated_at = ? WHERE id = ? AND operation_id = ?").bind(draft.id, new Date().toISOString(), draft.id, draft.operation_id).run();
    const values = JSON.parse(draft.input_json) as Record<string, PropertyValue>;
    try {
      await slackApi(token, "chat.postMessage", { channel: draft.channel_id, thread_ts: draft.thread_ts || draft.message_ts, text: "프로젝트를 만들었습니다.", parse: "none", unfurl_links: false, unfurl_media: false,
        blocks: [{ type: "section", text: plainText(`프로젝트를 만들었습니다.\n${values.title}`) }, { type: "actions", elements: [projectLink(draft.id)] }] });
    } catch {
      await slackApi(token, "chat.postEphemeral", { channel: draft.channel_id, user: draft.slack_user_id, text: "프로젝트는 생성됐지만 스레드 알림을 보내지 못했습니다.", blocks: [{ type: "actions", elements: [projectLink(draft.id)] }] });
    }
  }
}
