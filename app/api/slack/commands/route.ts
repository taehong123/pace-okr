import { env } from "cloudflare:workers";
import {
  createItem,
  ensureWorkspace,
  getSlackConnectionByTeam,
  serializeItem,
} from "@/lib/pace-data";
import { slackConfigured, verifySlackRequest, type SlackRuntimeEnv } from "@/lib/slack-oauth";

export async function POST(request: Request) {
  const runtime = env as SlackRuntimeEnv;
  if (!slackConfigured(runtime)) {
    return slackMessage("OKRPTR Slack 설정이 아직 완료되지 않았습니다.");
  }

  const rawBody = await request.text();
  const verified = await verifySlackRequest(request, rawBody, runtime.SLACK_SIGNING_SECRET!);
  if (!verified) return new Response("invalid Slack signature", { status: 401 });

  const body = new URLSearchParams(rawBody);
  const text = body.get("text")?.trim() ?? "";
  const teamId = body.get("team_id") ?? "";
  const userName = body.get("user_name") || body.get("user_id") || "Slack";
  const channelName = body.get("channel_name") || body.get("channel_id") || "Slack";

  if (!text || text === "help") {
    return slackMessage("사용법: /okrptr 고객 인터뷰 질문지 정리\n입력한 내용은 OKRPTR 인박스 Task로 저장됩니다.");
  }

  const connection = teamId ? await getSlackConnectionByTeam(teamId) : null;
  if (!connection) return slackMessage("이 Slack 워크스페이스는 아직 OKRPTR에 연결되지 않았습니다.");

  await ensureWorkspace(connection.ownerId);
  const item = await createItem(connection.ownerId, {
    title: text.slice(0, 240),
    description: `Captured from Slack by ${userName} in #${channelName}`,
    kind: "task",
    status: "inbox",
    source: "slack",
    sourceRef: `${teamId}:${body.get("channel_id") ?? ""}:${body.get("user_id") ?? ""}`,
  });

  return Response.json({
    response_type: "ephemeral",
    text: `OKRPTR 인박스에 저장했습니다: ${serializeItem(item).title}`,
  });
}

function slackMessage(text: string) {
  return Response.json({ response_type: "ephemeral", text });
}
