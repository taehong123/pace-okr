import { authorizeRequest } from "@/lib/pace-data";
import {
  createMcpOAuthAuthorizationCode,
  getMcpOAuthClient,
  mcpResourceUrl,
  normalizeOAuthScope,
  oauthIssuer,
} from "@/lib/mcp-oauth";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const clientId = url.searchParams.get("client_id") ?? "";
  const redirectUri = url.searchParams.get("redirect_uri") ?? "";
  const state = url.searchParams.get("state");
  const client = clientId ? await getMcpOAuthClient(clientId) : null;
  if (!client || !client.redirectUris.includes(redirectUri)) {
    return oauthJsonError("invalid_request", "The OAuth client or redirect URI is not registered.");
  }

  if (url.searchParams.get("response_type") !== "code") {
    return oauthRedirectError(redirectUri, state, request, "unsupported_response_type", "Only response_type=code is supported.");
  }
  const resource = url.searchParams.get("resource") ?? "";
  if (resource !== mcpResourceUrl(request)) {
    return oauthRedirectError(redirectUri, state, request, "invalid_target", "The OAuth resource does not match the OKRPTR MCP server.");
  }
  const codeChallenge = url.searchParams.get("code_challenge") ?? "";
  if (url.searchParams.get("code_challenge_method") !== "S256" || !/^[A-Za-z0-9_-]{43,128}$/.test(codeChallenge)) {
    return oauthRedirectError(redirectUri, state, request, "invalid_request", "A valid S256 PKCE code challenge is required.");
  }
  const requestedScopes = (url.searchParams.get("scope") ?? "okrptr:read okrptr:write").split(/\s+/).filter(Boolean);
  const scope = normalizeOAuthScope(url.searchParams.get("scope"));
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
    return oauthRedirectError(redirectUri, state, request, "access_denied", "This account cannot access an active OKRPTR workspace.");
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
