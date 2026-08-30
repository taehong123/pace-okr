import { env } from "cloudflare:workers";
import { authorizeRequest, canManageTeam, createSlackOAuthState, ensureWorkspace } from "@/lib/pace-data";
import { redirectWithSlackStatus, slackAuthorizationUrl, slackConfigured, type SlackRuntimeEnv } from "@/lib/slack-oauth";

export async function GET(request: Request) {
  const authorization = await authorizeRequest(request, { allowViewerWrite: true });
  if (authorization instanceof Response) return authorization;
  if (!canManageTeam(authorization)) return redirectWithSlackStatus(request, "/?view=integrations", "workspace_admin_required");
  await ensureWorkspace(authorization.ownerId);

  const runtime = env as SlackRuntimeEnv;
  if (!slackConfigured(runtime)) {
    return redirectWithSlackStatus(request, "/?view=integrations", "missing_config");
  }

  const url = new URL(request.url);
  const state = await createSlackOAuthState(authorization.ownerId, authorization.userId, url.searchParams.get("returnTo") || "/?view=integrations");
  return Response.redirect(slackAuthorizationUrl(runtime, request, state), 302);
}
