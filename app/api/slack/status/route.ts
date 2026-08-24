import { env } from "cloudflare:workers";
import { authorizeRequest, ensureWorkspace, getSlackConnection, serializeSlackConnection } from "@/lib/pace-data";
import { slackCommandUrl, slackConfigured, slackRedirectUri, type SlackRuntimeEnv } from "@/lib/slack-oauth";

export async function GET(request: Request) {
  const authorization = await authorizeRequest(request, { allowViewerWrite: true });
  if (authorization instanceof Response) return authorization;
  await ensureWorkspace(authorization.ownerId);
  const runtime = env as SlackRuntimeEnv;
  const connection = await getSlackConnection(authorization.ownerId);
  return Response.json({
    slack: serializeSlackConnection(connection, slackConfigured(runtime), {
      redirectUrl: slackRedirectUri(runtime, request),
      commandUrl: slackCommandUrl(request),
    }),
  });
}
