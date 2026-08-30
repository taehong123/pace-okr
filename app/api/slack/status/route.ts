import { env } from "cloudflare:workers";
import { authorizeRequest, ensureWorkspace, getSlackConnection, serializeSlackConnection } from "@/lib/pace-data";
import { slackCommandUrl, slackConfigured, slackEventsUrl, slackInteractionUrl, slackRedirectUri, slackScopes, type SlackRuntimeEnv } from "@/lib/slack-oauth";
import { reconcileDailyReminders } from "@/lib/slack-daily";

export async function GET(request: Request) {
  const authorization = await authorizeRequest(request, { allowViewerWrite: true });
  if (authorization instanceof Response) return authorization;
  await ensureWorkspace(authorization.ownerId);
  const runtime = env as SlackRuntimeEnv;
  const connection = await getSlackConnection(authorization.ownerId);
  if (connection) void reconcileDailyReminders(authorization.ownerId);
  const configured = slackConfigured(runtime);
  const grantedScopes = new Set((connection?.scope ?? "").split(/[ ,]/).map((scope) => scope.trim()).filter(Boolean));
  const missingScopes = connection ? slackScopes.filter((scope) => !grantedScopes.has(scope)) : [];
  const state = !configured
    ? "platform_unavailable"
    : !connection
      ? "workspace_disconnected"
      : missingScopes.length
        ? "reauthorization_required"
        : "connected";
  const statusMessage = state === "platform_unavailable"
    ? "Slack 연결 설정이 아직 완료되지 않았습니다. 현재 이용자가 입력할 기술 설정은 없습니다."
    : state === "workspace_disconnected"
      ? "Owner 또는 Admin이 Slack 승인 한 번으로 워크스페이스를 연결할 수 있습니다."
      : state === "reauthorization_required"
        ? "새 데일리 기능에 필요한 Slack 권한을 다시 승인해 주세요."
        : `${connection?.teamName || "Slack"}과 연결되어 데일리 알림을 설정할 수 있습니다.`;
  return Response.json({
    slack: {
      ...serializeSlackConnection(connection, configured, {
      redirectUrl: slackRedirectUri(runtime, request),
      commandUrl: slackCommandUrl(request),
      interactionUrl: slackInteractionUrl(request),
      eventsUrl: slackEventsUrl(request),
      }),
      state,
      statusMessage,
      missingScopes,
    },
  });
}
