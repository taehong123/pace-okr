import { env } from "cloudflare:workers";
import {
  consumeGoogleOAuthState,
  getGoogleConnection,
  saveGoogleConnection,
} from "@/lib/pace-data";
import {
  decryptSecret,
  encryptSecret,
  exchangeGoogleCode,
  fetchGoogleProfile,
  googleConfigured,
  type GoogleRuntimeEnv,
} from "@/lib/google-oauth";
import { createGoogleSessionCookie, GOOGLE_SIGN_IN_STATE_OWNER } from "@/lib/google-session";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const stateValue = requestUrl.searchParams.get("state") ?? "";
  const state = await consumeGoogleOAuthState(stateValue);
  const returnTo = state?.returnTo ?? "/";
  const signingIn = state?.ownerId === GOOGLE_SIGN_IN_STATE_OWNER;

  if (!state || requestUrl.searchParams.get("error")) {
    return signingIn ? redirectWithAuthStatus(request, returnTo, "failed") : redirectWithGoogleStatus(request, returnTo, "failed");
  }

  const runtime = env as GoogleRuntimeEnv;
  if (!googleConfigured(runtime)) {
    return signingIn ? redirectWithAuthStatus(request, returnTo, "missing_config") : redirectWithGoogleStatus(request, returnTo, "missing_config");
  }

  const code = requestUrl.searchParams.get("code");
  if (!code) return signingIn ? redirectWithAuthStatus(request, returnTo, "failed") : redirectWithGoogleStatus(request, returnTo, "failed");

  try {
    const tokens = await exchangeGoogleCode(runtime, request, code);
    const profile = await fetchGoogleProfile(tokens.access_token);
    if (state.ownerId === GOOGLE_SIGN_IN_STATE_OWNER) {
      const response = Response.redirect(new URL(returnTo, request.url).toString(), 303);
      response.headers.append("Set-Cookie", await createGoogleSessionCookie(profile, runtime.GOOGLE_TOKEN_ENCRYPTION_KEY!));
      return response;
    }
    const existing = await getGoogleConnection(state.ownerId, state.userId);
    const refreshToken = tokens.refresh_token
      ?? (existing ? await decryptSecret(existing.encryptedRefreshToken, runtime.GOOGLE_TOKEN_ENCRYPTION_KEY!) : "");
    if (!refreshToken) return redirectWithGoogleStatus(request, returnTo, "no_refresh_token");

    await saveGoogleConnection({
      ownerId: state.ownerId,
      userId: state.userId,
      googleAccountId: profile.sub,
      email: profile.email,
      displayName: profile.name || profile.email,
      encryptedRefreshToken: await encryptSecret(refreshToken, runtime.GOOGLE_TOKEN_ENCRYPTION_KEY!),
      scope: tokens.scope ?? "",
    });
    return redirectWithGoogleStatus(request, returnTo, "connected");
  } catch {
    return signingIn ? redirectWithAuthStatus(request, returnTo, "failed") : redirectWithGoogleStatus(request, returnTo, "failed");
  }
}

function redirectWithAuthStatus(request: Request, returnTo: string, status: string) {
  const url = new URL(returnTo, request.url);
  url.searchParams.set("auth", status);
  return Response.redirect(url.toString(), 303);
}

function redirectWithGoogleStatus(request: Request, returnTo: string, status: string) {
  const url = new URL(returnTo, request.url);
  url.searchParams.set("google", status);
  return Response.redirect(url.toString(), 303);
}
