import { env } from "cloudflare:workers";
import { authorizeRequest, canManageTeam, createSlackOAuthState, ensureWorkspace } from "@/lib/pace-data";
import { slackAuthorizationUrl, slackConfigured, type SlackRuntimeEnv } from "@/lib/slack-oauth";

export async function GET(request: Request) {
  const authorization = await authorizeRequest(request, { allowViewerWrite: true });
  if (authorization instanceof Response) return authorization;
  if (!canManageTeam(authorization)) return Response.json({ error: "Workspace admin access is required" }, { status: 403 });
  await ensureWorkspace(authorization.ownerId);

  const runtime = env as SlackRuntimeEnv;
  if (!slackConfigured(runtime)) {
    return Response.json({ error: "Slack OAuth is not configured", code: "missing_slack_config" }, { status: 503 });
  }

  const url = new URL(request.url);
  const state = await createSlackOAuthState(authorization.ownerId, authorization.userId, url.searchParams.get("returnTo") || "/");
  return Response.redirect(slackAuthorizationUrl(runtime, request, state), 302);
}
