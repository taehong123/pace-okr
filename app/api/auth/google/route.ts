import { env } from "cloudflare:workers";
import { googleConfigured, googleSignInAuthorizationUrl, type GoogleRuntimeEnv } from "@/lib/google-oauth";
import { createGoogleSignInState } from "@/lib/google-session";

export async function GET(request: Request) {
  const runtime = env as GoogleRuntimeEnv;
  if (!googleConfigured(runtime) || !runtime.GOOGLE_CLIENT_ID || !runtime.GOOGLE_CLIENT_SECRET) {
    const unavailable = new URL("/", request.url);
    unavailable.searchParams.set("auth", "missing_config");
    return Response.redirect(unavailable.toString(), 303);
  }
  const returnTo = new URL(request.url).searchParams.get("returnTo") || "/";
  const signIn = await createGoogleSignInState(returnTo, runtime.GOOGLE_TOKEN_ENCRYPTION_KEY!);
  return new Response(null, {
    status: 302,
    headers: {
      Location: googleSignInAuthorizationUrl(runtime, request, signIn.state),
      "Set-Cookie": signIn.cookie,
    },
  });
}
