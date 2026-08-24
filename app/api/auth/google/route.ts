import { env } from "cloudflare:workers";
import { createGoogleOAuthState } from "@/lib/pace-data";
import { googleConfigured, googleSignInAuthorizationUrl, type GoogleRuntimeEnv } from "@/lib/google-oauth";
import { GOOGLE_SIGN_IN_STATE_OWNER, GOOGLE_SIGN_IN_STATE_USER } from "@/lib/google-session";

export async function GET(request: Request) {
  const runtime = env as GoogleRuntimeEnv;
  if (!googleConfigured(runtime) || !runtime.GOOGLE_CLIENT_ID || !runtime.GOOGLE_CLIENT_SECRET) {
    const unavailable = new URL("/", request.url);
    unavailable.searchParams.set("auth", "missing_config");
    return Response.redirect(unavailable.toString(), 303);
  }
  const returnTo = new URL(request.url).searchParams.get("returnTo") || "/";
  const state = await createGoogleOAuthState(GOOGLE_SIGN_IN_STATE_OWNER, GOOGLE_SIGN_IN_STATE_USER, returnTo);
  return Response.redirect(googleSignInAuthorizationUrl(runtime, request, state), 302);
}
