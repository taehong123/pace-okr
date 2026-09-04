import { env } from "cloudflare:workers";
import { createItem, ensureWorkspace, getSlackConnectionByTeam, serializeItem } from "@/lib/pace-data";
import { createSlackMemberLinkUrl, dailyMemberBySlack, openDailyModal, reconcileDailyReminders } from "@/lib/slack-daily";
import { slackConfigured, verifySlackRequest, type SlackRuntimeEnv } from "@/lib/slack-oauth";

export async function POST(request: Request) {
  const runtime = env as SlackRuntimeEnv;
  if (!slackConfigured(runtime)) return slackMessage("OKRI Slack 설정이 아직 완료되지 않았습니다.");
  const rawBody = await request.text();
  if (!await verifySlackRequest(request, rawBody, runtime.SLACK_SIGNING_SECRET!)) {
    return new Response("invalid Slack signature", { status: 401 });
  }
  const body = new URLSearchParams(rawBody);
  const text = body.get("text")?.trim() ?? "";
  const teamId = body.get("team_id") ?? "";
  const slackUserId = body.get("user_id") ?? "";
  const connection = teamId ? await getSlackConnectionByTeam(teamId) : null;
  if (!connection) return slackMessage("이 Slack 워크스페이스는 아직 OKRI에 연결되지 않았습니다.");
  await ensureWorkspace(connection.ownerId);

  if (["daily", "데일리", "daily 작성", "데일리 작성"].includes(text.toLocaleLowerCase())) {
    const linked = await dailyMemberBySlack(teamId, slackUserId);
    if (!linked) {
      const link = await createSlackMemberLinkUrl(connection.ownerId, teamId, slackUserId, request);
      return slackMessage(`OKRI 계정 연결이 필요합니다. 15분 안에 로그인해 연결해 주세요.\n${link}`);
    }
    const triggerId = body.get("trigger_id") ?? "";
    if (!triggerId) return slackMessage("Slack 데일리 창을 열 수 없습니다. 다시 시도해 주세요.");
    await openDailyModal(triggerId, linked.authorization);
    void reconcileDailyReminders(connection.ownerId);
    return new Response(null, { status: 200 });
  }

  if (!text || text === "help") {
    return slackMessage("사용법\n• `/okri daily` — 개인 데일리 작성\n• `/okri <문장>` — 문장을 General Task로 수집");
  }

  const userName = body.get("user_name") || slackUserId || "Slack";
  const channelName = body.get("channel_name") || body.get("channel_id") || "Slack";
  const item = await createItem(connection.ownerId, {
    title: text.slice(0, 240),
    description: `Captured from Slack by ${userName} in #${channelName}`,
    kind: "task",
    source: "slack",
    sourceRef: `${teamId}:${body.get("channel_id") ?? ""}:${slackUserId}`,
    createdByUserId: connection.userId,
  });
  return Response.json({ response_type: "ephemeral", text: `Task로 저장했습니다: ${serializeItem(item).title}` });
}

function slackMessage(text: string) {
  return Response.json({ response_type: "ephemeral", text });
}
