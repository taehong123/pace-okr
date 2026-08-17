import { env } from "cloudflare:workers";
import { consumeSlackOAuthState, saveSlackConnection } from "@/lib/pace-data";
import { encryptSlackSecret, exchangeSlackCode, slackConfigured, type SlackRuntimeEnv } from "@/lib/slack-oauth";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const stateValue = requestUrl.searchParams.get("state") ?? "";
  const state = await consumeSlackOAuthState(stateValue);
  const returnTo = state?.returnTo ?? "/";

  if (!state || requestUrl.searchParams.get("error")) {
    return redirectWithSlackStatus(request, returnTo, "failed");
  }

  const runtime = env as SlackRuntimeEnv;
  if (!slackConfigured(runtime)) {
    return redirectWithSlackStatus(request, returnTo, "missing_config");
  }

  const code = requestUrl.searchParams.get("code");
  if (!code) return redirectWithSlackStatus(request, returnTo, "failed");

  try {
    const install = await exchangeSlackCode(runtime, request, code);
    const botToken = install.access_token ?? "";
    const teamId = install.team?.id ?? "";
    if (!botToken || !teamId) return redirectWithSlackStatus(request, returnTo, "failed");
    await saveSlackConnection({
      ownerId: state.ownerId,
      userId: state.userId,
      teamId,
      teamName: install.team?.name ?? "",
      botUserId: install.bot_user_id ?? "",
      appId: install.app_id ?? "",
      encryptedBotToken: await encryptSlackSecret(botToken, runtime.SLACK_TOKEN_ENCRYPTION_KEY!),
      scope: install.scope ?? "",
    });
    return redirectWithSlackStatus(request, returnTo, "connected");
  } catch {
    return redirectWithSlackStatus(request, returnTo, "failed");
  }
}

function redirectWithSlackStatus(request: Request, returnTo: string, status: string) {
  const url = new URL(returnTo, request.url);
  url.searchParams.set("slack", status);
  return Response.redirect(url.toString(), 303);
}
