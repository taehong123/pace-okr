import { env } from "cloudflare:workers";
import { authorizeRequest, canManageTeam, consumeSlackOAuthState, hasWorkspaceAdminAccess, saveSlackConnection, SlackWorkspaceConnectionError } from "@/lib/pace-data";
import { classifySlackOAuthError, decryptSlackSecret, encryptSlackSecret, exchangeSlackCode, redirectWithSlackStatus, revokeSlackToken, SlackOAuthExchangeError, slackConfigured, slackScopes, type SlackRuntimeEnv } from "@/lib/slack-oauth";
import { disconnectSlackDaily, syncSlackDailyInstallation } from "@/lib/slack-daily";

export async function GET(request: Request) {
  try {
    return await handleSlackCallback(request);
  } catch (error) {
    console.error("Slack OAuth callback failed", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return redirectWithSlackStatus(request, "/?settings=workspace&tab=integrations", "oauth_exchange_failed");
  }
}

async function handleSlackCallback(request: Request) {
  const requestUrl = new URL(request.url);
  const stateValue = requestUrl.searchParams.get("state") ?? "";
  const state = await consumeSlackOAuthState(stateValue);
  const returnTo = state?.returnTo ?? "/?settings=workspace&tab=integrations";

  if (!state) return redirectWithSlackStatus(request, returnTo, "oauth_exchange_failed");
  const callbackHeaders = new Headers(request.headers);
  callbackHeaders.set("x-okrptr-workspace-id", state.ownerId);
  const callbackRequest = new Request(request.url, { method: "GET", headers: callbackHeaders });
  const callbackAuthorization = await authorizeRequest(callbackRequest, { allowViewerWrite: true });
  const stateStillAuthorized = await hasWorkspaceAdminAccess(state.ownerId, state.userId);
  if (
    callbackAuthorization instanceof Response
    || callbackAuthorization.ownerId !== state.ownerId
    || callbackAuthorization.userId !== state.userId
    || !canManageTeam(callbackAuthorization)
    || !stateStillAuthorized
  ) return redirectWithSlackStatus(request, returnTo, "workspace_admin_required");
  const authorizationError = requestUrl.searchParams.get("error");
  if (authorizationError) return redirectWithSlackStatus(request, returnTo, classifySlackOAuthError(authorizationError, requestUrl.searchParams.get("error_description") ?? ""));

  const runtime = env as SlackRuntimeEnv;
  if (!slackConfigured(runtime)) {
    return redirectWithSlackStatus(request, returnTo, "service_unavailable");
  }

  const code = requestUrl.searchParams.get("code");
  if (!code) return redirectWithSlackStatus(request, returnTo, "oauth_exchange_failed");

  try {
    const install = await exchangeSlackCode(runtime, request, code);
    const botToken = install.access_token ?? "";
    const teamId = install.team?.id ?? "";
    if (!botToken || !teamId) return redirectWithSlackStatus(request, returnTo, "oauth_exchange_failed");
    const { previousConnection } = await saveSlackConnection({
      ownerId: state.ownerId,
      userId: state.userId,
      teamId,
      teamName: install.team?.name ?? "",
      botUserId: install.bot_user_id ?? "",
      appId: install.app_id ?? "",
      encryptedBotToken: await encryptSlackSecret(botToken, runtime.SLACK_TOKEN_ENCRYPTION_KEY!),
      scope: install.scope ?? "",
    });
    const grantedScopes = new Set((install.scope ?? "").split(/[ ,]/).map((scope) => scope.trim()).filter(Boolean));
    const missingScopes = slackScopes.filter((scope) => !grantedScopes.has(scope));
    await finalizeSlackInstallation(state.ownerId, teamId, previousConnection, runtime);
    return redirectWithSlackStatus(request, returnTo, missingScopes.length ? "missing_scope" : "setup_required");
  } catch (error) {
    if (error instanceof SlackWorkspaceConnectionError) return redirectWithSlackStatus(request, returnTo, error.code);
    if (error instanceof SlackOAuthExchangeError) return redirectWithSlackStatus(request, returnTo, classifySlackOAuthError(error.slackCode));
    return redirectWithSlackStatus(request, returnTo, "oauth_exchange_failed");
  }
}

async function finalizeSlackInstallation(ownerId: string, teamId: string, previousConnection: Awaited<ReturnType<typeof saveSlackConnection>>["previousConnection"], runtime: SlackRuntimeEnv) {
  if (previousConnection && previousConnection.teamId !== teamId) {
    try { await disconnectSlackDaily(ownerId, previousConnection); } catch { /* The new connection remains valid even if old schedules cannot be cancelled. */ }
    try {
      const previousToken = await decryptSlackSecret(previousConnection.encryptedBotToken, runtime.SLACK_TOKEN_ENCRYPTION_KEY!);
      await revokeSlackToken(previousToken);
    } catch { /* Old-token revocation is best effort after the atomic swap. */ }
  }
  await syncSlackDailyInstallation(ownerId);
}
