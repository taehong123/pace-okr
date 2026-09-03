import { env, waitUntil } from "cloudflare:workers";
import { createExplicitDailyTask, currentDailyMember, normalizeDailySkipReason, saveDailyDraft, submitDailyDraft } from "@/lib/daily-bot";
import { getSlackConnectionByTeam } from "@/lib/pace-data";
import { createSlackMemberLinkUrl, dailyMemberBySlack, externalTaskOptions, openDailyModal, publishDailySubmission, reconcileDailyReminders } from "@/lib/slack-daily";
import { slackConfigured, verifySlackRequest, type SlackRuntimeEnv } from "@/lib/slack-oauth";
import { memberMessageLanguage, workspaceMessageLanguage } from "@/lib/language-preferences";
import { serverTranslator, type Translator } from "@/lib/server-language";

type SlackInteraction = {
  type?: string;
  trigger_id?: string;
  team?: { id?: string };
  user?: { id?: string };
  action_id?: string;
  value?: string;
  actions?: Array<{ action_id?: string }>;
  view?: {
    callback_id?: string;
    private_metadata?: string;
    state?: { values?: Record<string, Record<string, Record<string, unknown>>> };
  };
};

export async function POST(request: Request) {
  const runtime = env as SlackRuntimeEnv;
  if (!slackConfigured(runtime)) return new Response("Slack is not configured", { status: 503 });
  const rawBody = await request.text();
  if (!await verifySlackRequest(request, rawBody, runtime.SLACK_SIGNING_SECRET!)) return new Response("invalid Slack signature", { status: 401 });
  const encoded = new URLSearchParams(rawBody).get("payload") ?? "{}";
  let payload: SlackInteraction;
  try { payload = JSON.parse(encoded) as SlackInteraction; } catch { return new Response("invalid payload", { status: 400 }); }
  const teamId = payload.team?.id ?? "";
  const slackUserId = payload.user?.id ?? "";
  const connection = teamId ? await getSlackConnectionByTeam(teamId) : null;
  if (!connection) return Response.json({ error: "Slack workspace is not connected" }, { status: 403 });
  const workspaceT = await serverTranslator(await workspaceMessageLanguage(env.DB, connection.ownerId));
  const linked = await dailyMemberBySlack(teamId, slackUserId);
  if (!linked) {
    const link = await createSlackMemberLinkUrl(connection.ownerId, teamId, slackUserId, request);
    return Response.json({ response_type: "ephemeral", text: workspaceT("OKRPTR 계정을 먼저 연결해 주세요: {link}", { link }) });
  }
  const t = await serverTranslator(await memberMessageLanguage(env.DB, linked.authorization.ownerId, linked.memberId));

  if (payload.type === "block_suggestion") {
    return Response.json({ options: await externalTaskOptions(linked.authorization, payload.value ?? "", payload.action_id === "selected_more_work", parseMetadata(payload.view?.private_metadata).date) });
  }
  if (payload.type === "block_actions" && payload.actions?.some((action) => action.action_id === "daily_open")) {
    if (payload.trigger_id) await openDailyModal(payload.trigger_id, linked.authorization);
    return new Response(null, { status: 200 });
  }
  if (payload.type === "view_submission" && payload.view?.callback_id === "daily_submit") {
    return submitFromModal(payload, linked.authorization, t);
  }
  return new Response(null, { status: 200 });
}

async function submitFromModal(payload: SlackInteraction, authorization: Awaited<ReturnType<typeof dailyMemberBySlack>> extends infer T ? T extends { authorization: infer A } ? A : never : never, t: Translator) {
  const metadata = parseMetadata(payload.view?.private_metadata);
  const state = payload.view?.state?.values ?? {};
  const selectedTaskIds = selectedOptions(state, "daily_tasks", "selected_tasks");
  const selectedWorkIds = metadata.workVersion === 1 ? [...new Set(Object.keys(state).filter((id) => id.startsWith("daily_work_"))
    .flatMap((id) => selectedOptions(state, id, id === "daily_work_more" ? "selected_more_work" : "selected_work")))] : undefined;
  const workErrorBlock = Object.keys(state).find((id) => id.startsWith("daily_work_")) || "no_planned";
  if (authorization.role === "viewer") return Response.json({ response_action: "errors", errors: { [workErrorBlock]: t("읽기 전용 멤버는 데일리를 제출할 수 없습니다.") } });
  const todayNote = stringValue(state, "today_note", "value");
  const blockersNote = stringValue(state, "blockers_note", "value");
  const noPlannedTasks = selectedOptions(state, "no_planned", "value").includes("yes");
  const rawSkipReason = selectedValue(state, "skip_reason", "value").replace(/^none$/, "");
  let skipReason;
  try {
    skipReason = normalizeDailySkipReason(rawSkipReason);
  } catch {
    return Response.json({ response_action: "errors", errors: { skip_reason: t("올바른 데일리 스킵 사유를 선택해 주세요.") } });
  }
  const skipNote = stringValue(state, "skip_note", "value").trim();
  const newTaskTitle = stringValue(state, "new_task_title", "value").trim();
  const parentValue = selectedValue(state, "new_task_parent", "value");
  if (newTaskTitle && !parentValue) {
    return Response.json({ response_action: "errors", errors: { new_task_parent: t("새 Task의 상위 항목을 선택해 주세요.") } });
  }
  if (skipReason && newTaskTitle) {
    return Response.json({ response_action: "errors", errors: { new_task_title: t("스킵하는 날에는 새 Task를 함께 만들 수 없습니다.") } });
  }
  if (skipReason === "other" && !skipNote) {
    return Response.json({ response_action: "errors", errors: { skip_note: t("기타 스킵 사유를 입력해 주세요.") } });
  }
  if ((selectedWorkIds?.length ?? selectedTaskIds.length) > 50) {
    return Response.json({ response_action: "errors", errors: { [workErrorBlock]: t("오늘 할 업무는 최대 50개까지 선택할 수 있습니다.") } });
  }
  if (!skipReason && !noPlannedTasks && (selectedWorkIds?.length ?? selectedTaskIds.length) === 0 && !newTaskTitle && !todayNote.trim()) {
    return Response.json({ response_action: "errors", errors: { [metadata.workVersion === 1 ? workErrorBlock : "daily_tasks"]: t("오늘 할 업무 또는 ‘오늘 예정 없음’을 선택해 주세요.") } });
  }
  try {
    const member = await currentDailyMember(authorization);
    if ((metadata.ownerId && metadata.ownerId !== authorization.ownerId) || (metadata.memberId && metadata.memberId !== member.id)) {
      throw new Error("daily_recipient_mismatch");
    }
    const draft = await env.DB.prepare("SELECT yesterday_note FROM daily_scrums WHERE owner_id = ? AND member_id = ? AND scrum_date = ?")
      .bind(authorization.ownerId, member.id, metadata.date).first<{ yesterday_note: string }>();
    await saveDailyDraft(authorization, {
      date: metadata.date,
      yesterdayNote: draft?.yesterday_note || "",
      todayNote,
      blockersNote,
      selectedTaskIds,
      selectedWorkIds,
      noPlannedTasks,
      skipReason,
      skipNote,
      source: "slack",
    }, false);
    if (newTaskTitle) {
      const [parentKind, parentId = ""] = parentValue.split(":", 2);
      await createExplicitDailyTask(authorization, {
        date: metadata.date,
        title: newTaskTitle,
        parentKind: parentKind === "project" || parentKind === "routine" ? parentKind : "general",
        parentId: parentId || null,
        requestId: metadata.requestId,
      });
    }
    const submission = await submitDailyDraft(authorization, metadata.date, "slack");
    waitUntil(Promise.all([publishDailySubmission(authorization.ownerId, submission.id), reconcileDailyReminders(authorization.ownerId)]).then(() => undefined));
    return new Response(null, { status: 200 });
  } catch {
    return Response.json({ response_action: "errors", errors: { [metadata.workVersion === 1 ? workErrorBlock : "daily_tasks"]: t("데일리를 저장하지 못했습니다.") } });
  }
}

function action(state: Record<string, Record<string, Record<string, unknown>>>, blockId: string, actionId: string) {
  return state[blockId]?.[actionId] ?? {};
}

function stringValue(state: Record<string, Record<string, Record<string, unknown>>>, blockId: string, actionId: string) {
  const value = action(state, blockId, actionId).value;
  return typeof value === "string" ? value : "";
}

function selectedValue(state: Record<string, Record<string, Record<string, unknown>>>, blockId: string, actionId: string) {
  const selected = action(state, blockId, actionId).selected_option as { value?: unknown } | undefined;
  return typeof selected?.value === "string" ? selected.value : "";
}

function selectedOptions(state: Record<string, Record<string, Record<string, unknown>>>, blockId: string, actionId: string) {
  const selected = action(state, blockId, actionId).selected_options;
  if (!Array.isArray(selected)) return [];
  return selected.flatMap((option) => option && typeof option === "object" && typeof (option as { value?: unknown }).value === "string" ? [(option as { value: string }).value] : []);
}

function parseMetadata(value: string | undefined) {
  try {
    const parsed = JSON.parse(value ?? "{}") as { date?: string; requestId?: string; workVersion?: number; ownerId?: string; memberId?: string };
    return { ...parsed, date: parsed.date ?? new Date().toISOString().slice(0, 10), requestId: parsed.requestId ?? crypto.randomUUID() };
  } catch {
    return { date: new Date().toISOString().slice(0, 10), requestId: crypto.randomUUID() };
  }
}
