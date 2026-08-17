import { env } from "cloudflare:workers";
import { authorizeRequest, createGoogleOAuthState, ensureWorkspace } from "@/lib/pace-data";
import { googleAuthorizationUrl, googleConfigured, type GoogleRuntimeEnv } from "@/lib/google-oauth";

export async function GET(request: Request) {
  const authorization = await authorizeRequest(request, { allowViewerWrite: true });
  if (authorization instanceof Response) return authorization;
  await ensureWorkspace(authorization.ownerId);

  const runtime = env as GoogleRuntimeEnv;
  if (!googleConfigured(runtime)) {
    return Response.json({ error: "Google OAuth is not configured", code: "missing_google_config" }, { status: 503 });
  }

  const url = new URL(request.url);
  const state = await createGoogleOAuthState(authorization.ownerId, authorization.userId, url.searchParams.get("returnTo") || "/");
  return Response.redirect(googleAuthorizationUrl(runtime, request, state), 302);
}
