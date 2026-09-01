import { env } from "cloudflare:workers";
import { authorizeRequest, canManageTeam, createSlackOAuthState, ensureWorkspace } from "@/lib/pace-data";
import { redirectWithSlackStatus, slackAuthorizationUrl, slackConfigured, type SlackRuntimeEnv } from "@/lib/slack-oauth";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const returnTo = url.searchParams.get("returnTo") || "/?settings=workspace&tab=integrations";
  const authorization = await authorizeRequest(request, { allowViewerWrite: true });
  if (authorization instanceof Response) return authorization;
  if (!canManageTeam(authorization)) return redirectWithSlackStatus(request, returnTo, "workspace_admin_required");
  await ensureWorkspace(authorization.ownerId);

  const runtime = env as SlackRuntimeEnv;
  if (!slackConfigured(runtime)) {
    return redirectWithSlackStatus(request, returnTo, "service_unavailable");
  }

  const state = await createSlackOAuthState(authorization.ownerId, authorization.userId, returnTo);
  return Response.redirect(slackAuthorizationUrl(runtime, request, state), 302);
}
