import { authorizeRequest, getTeam } from "@/lib/pace-data";
import { matchesOAuthRedirect, oauthProviderForRedirect } from "@/lib/integration-providers";
import { approvalContentSecurityPolicy, approvalCookieName, approvalPage, consumeOAuthApproval, createOAuthApproval } from "@/lib/mcp-oauth-approval";
import {
  createMcpOAuthAuthorizationCode,
  getMcpOAuthClient,
  mcpResourceUrl,
  normalizeOAuthScope,
  limitOAuthScopeForRole,
  oauthIssuer,
} from "@/lib/mcp-oauth";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const clientId = url.searchParams.get("client_id") ?? "";
  const redirectUri = url.searchParams.get("redirect_uri") ?? "";
  const state = url.searchParams.get("state");
  const client = clientId ? await getMcpOAuthClient(clientId) : null;
  if (!client || !matchesOAuthRedirect(client.redirectUris, redirectUri)) {
    return oauthJsonError("invalid_request", "The OAuth client or redirect URI is not registered.");
  }

  if (url.searchParams.get("response_type") !== "code") {
    return oauthRedirectError(redirectUri, state, request, "unsupported_response_type", "Only response_type=code is supported.");
  }
  const resource = url.searchParams.get("resource") ?? "";
  if (resource !== mcpResourceUrl(request)) {
    return oauthRedirectError(redirectUri, state, request, "invalid_target", "The OAuth resource does not match the OKRI MCP server.");
  }
  const codeChallenge = url.searchParams.get("code_challenge") ?? "";
  if (url.searchParams.get("code_challenge_method") !== "S256" || !/^[A-Za-z0-9_-]{43,128}$/.test(codeChallenge)) {
    return oauthRedirectError(redirectUri, state, request, "invalid_request", "A valid S256 PKCE code challenge is required.");
  }
  const requestedScopes = (url.searchParams.get("scope") ?? "okri:read okri:write").split(/\s+/).filter(Boolean);
  let scope = normalizeOAuthScope(url.searchParams.get("scope"));
  if (!scope || requestedScopes.some((entry) => !scope.split(" ").includes(entry))) {
    return oauthRedirectError(redirectUri, state, request, "invalid_scope", "Requested scopes are not supported.");
  }

  const authorization = await authorizeRequest(request, { allowViewerWrite: true });
  if (authorization instanceof Response) {
    if (authorization.status === 401) {
      const signInUrl = new URL("/api/auth/google", request.url);
      signInUrl.searchParams.set("returnTo", `${url.pathname}${url.search}`);
      return Response.redirect(signInUrl.toString(), 303);
    }
    return oauthRedirectError(redirectUri, state, request, "access_denied", "This account cannot access an active OKRI workspace.");
  }

  if (authorization.apiToken) return oauthJsonError("access_denied", "Sign in with your OKRI account to authorize a connection.");
  scope = limitOAuthScopeForRole(scope, authorization.role);
  if (!scope) return oauthRedirectError(redirectUri, state, request, "invalid_scope", "This role can only approve read access.");
  if (oauthProviderForRedirect(redirectUri) !== "chatgpt") {
    const input = { clientId, redirectUri, codeChallenge, resource, scope, state };
    const team = await getTeam(authorization.ownerId, authorization.userId);
    const approval = await createOAuthApproval(authorization, input);
    const nonce = crypto.randomUUID().replaceAll("-", "");
    return new Response(approvalPage(input, authorization, team.workspace.name, approval.id, approval.csrf, nonce), { headers: {
      "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Frame-Options": "DENY",
      "Content-Security-Policy": approvalContentSecurityPolicy(nonce),
      "Set-Cookie": `${approvalCookieName(approval.id)}=${approval.csrf}; Path=/oauth/authorize; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
    } });
  }

  if (authorization.apiToken) return oauthJsonError("access_denied", "Sign in with your OKRI account to authorize a connection.");
  scope = limitOAuthScopeForRole(scope, authorization.role);
  if (!scope) return oauthRedirectError(redirectUri, state, request, "invalid_scope", "This role can only approve read access.");
  if (oauthProviderForRedirect(redirectUri) !== "chatgpt") {
    const input = { clientId, redirectUri, codeChallenge, resource, scope, state };
    const team = await getTeam(authorization.ownerId, authorization.userId);
    const approval = await createOAuthApproval(authorization, input);
    const nonce = crypto.randomUUID().replaceAll("-", "");
    return new Response(approvalPage(input, authorization, team.workspace.name, approval.id, approval.csrf, nonce), { headers: {
      "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Frame-Options": "DENY",
      "Content-Security-Policy": approvalContentSecurityPolicy(nonce),
      "Set-Cookie": `${approvalCookieName(approval.id)}=${approval.csrf}; Path=/oauth/authorize; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
    } });
  }

  const code = await createMcpOAuthAuthorizationCode(authorization, {
    clientId,
    redirectUri,
    codeChallenge,
    resource,
    scope,
  });
  const callback = new URL(redirectUri);
  callback.searchParams.set("code", code);
  if (state) callback.searchParams.set("state", state);
  callback.searchParams.set("iss", oauthIssuer(request));
  return Response.redirect(callback.toString(), 303);
}

export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin || !request.headers.get("content-type")?.startsWith("application/x-www-form-urlencoded")) {
    return oauthJsonError("invalid_request", "The approval origin or content type is invalid.");
  }
  const authorization = await authorizeRequest(request, { allowViewerWrite: true });
  if (authorization instanceof Response) return authorization;
  if (authorization.apiToken) return oauthJsonError("access_denied", "An authenticated browser session is required.");
  const form = await request.formData();
  const id = String(form.get("request_id") ?? "");
  const csrf = String(form.get("csrf") ?? "");
  const decision = form.get("decision");
  if (decision !== "approve" && decision !== "cancel") return oauthJsonError("invalid_request", "Choose approve or cancel.");
  const cookie = (request.headers.get("cookie") ?? "").split(";").map((entry) => entry.trim()).find((entry) => entry.startsWith(`${approvalCookieName(id)}=`))?.split("=")[1] ?? "";
  const input = await consumeOAuthApproval(authorization, id, csrf, cookie);
  if (!input) return oauthJsonError("invalid_request", "Approval expired, was already used, or does not match this account and workspace. Restart the connection.");
  const client = await getMcpOAuthClient(input.clientId);
  if (!client || !matchesOAuthRedirect(client.redirectUris, input.redirectUri) || input.resource !== mcpResourceUrl(request)) {
    return oauthJsonError("invalid_request", "The registered client, callback or resource no longer matches.");
  }
  let response: Response;
  if (decision === "cancel") response = oauthRedirectError(input.redirectUri, input.state, request, "access_denied", "The user cancelled this connection.");
  else {
    const scope = limitOAuthScopeForRole(input.scope, authorization.role);
    if (!scope) return oauthJsonError("invalid_scope", "Your current role cannot approve this scope. Restart the connection.");
    const code = await createMcpOAuthAuthorizationCode(authorization, { ...input, scope });
    const callback = new URL(input.redirectUri);
    callback.searchParams.set("code", code);
    if (input.state) callback.searchParams.set("state", input.state);
    callback.searchParams.set("iss", oauthIssuer(request));
    response = Response.redirect(callback.toString(), 303);
  }
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "no-store");
  headers.set("Set-Cookie", `${approvalCookieName(id)}=; Path=/oauth/authorize; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
  return new Response(null, { status: response.status, headers });
}

function oauthRedirectError(
  redirectUri: string,
  state: string | null,
  request: Request,
  error: string,
  description: string,
) {
  const callback = new URL(redirectUri);
  callback.searchParams.set("error", error);
  callback.searchParams.set("error_description", description);
  if (state) callback.searchParams.set("state", state);
  callback.searchParams.set("iss", oauthIssuer(request));
  return Response.redirect(callback.toString(), 303);
}

function oauthJsonError(error: string, description: string) {
  return Response.json({ error, error_description: description }, {
    status: 400,
    headers: { "Cache-Control": "no-store" },
  });
}
