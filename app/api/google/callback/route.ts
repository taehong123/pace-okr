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

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const stateValue = requestUrl.searchParams.get("state") ?? "";
  const state = await consumeGoogleOAuthState(stateValue);
  const returnTo = state?.returnTo ?? "/";

  if (!state || requestUrl.searchParams.get("error")) {
    return redirectWithGoogleStatus(request, returnTo, "failed");
  }

  const runtime = env as GoogleRuntimeEnv;
  if (!googleConfigured(runtime)) {
    return redirectWithGoogleStatus(request, returnTo, "missing_config");
  }

  const code = requestUrl.searchParams.get("code");
  if (!code) return redirectWithGoogleStatus(request, returnTo, "failed");

  try {
    const tokens = await exchangeGoogleCode(runtime, request, code);
    const existing = await getGoogleConnection(state.ownerId, state.userId);
    const refreshToken = tokens.refresh_token
      ?? (existing ? await decryptSecret(existing.encryptedRefreshToken, runtime.GOOGLE_TOKEN_ENCRYPTION_KEY!) : "");
    if (!refreshToken) return redirectWithGoogleStatus(request, returnTo, "no_refresh_token");

    const profile = await fetchGoogleProfile(tokens.access_token);
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
    return redirectWithGoogleStatus(request, returnTo, "failed");
  }
}

function redirectWithGoogleStatus(request: Request, returnTo: string, status: string) {
  const url = new URL(returnTo, request.url);
  url.searchParams.set("google", status);
  return Response.redirect(url.toString(), 303);
}
