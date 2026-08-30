import { exchangeMcpOAuthAuthorizationCode, mcpResourceUrl } from "@/lib/mcp-oauth";

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLocaleLowerCase().includes("application/x-www-form-urlencoded")) {
    return tokenError("invalid_request", "The token request must use application/x-www-form-urlencoded.");
  }
  const body = new URLSearchParams(await request.text());
  if (body.get("grant_type") !== "authorization_code") {
    return tokenError("unsupported_grant_type", "Only the authorization_code grant is supported.");
  }

  const code = body.get("code") ?? "";
  const clientId = body.get("client_id") ?? "";
  const redirectUri = body.get("redirect_uri") ?? "";
  const codeVerifier = body.get("code_verifier") ?? "";
  const resource = body.get("resource") ?? "";
  if (!code || !clientId || !redirectUri || !codeVerifier || resource !== mcpResourceUrl(request)) {
    return tokenError("invalid_request", "code, client_id, redirect_uri, code_verifier, and the OKRPTR resource are required.");
  }

  try {
    const result = await exchangeMcpOAuthAuthorizationCode({ code, clientId, redirectUri, codeVerifier, resource });
    return Response.json({
      access_token: result.accessToken,
      token_type: "Bearer",
      scope: result.scope,
    }, { headers: tokenHeaders() });
  } catch (error) {
    const oauthError = error instanceof Error && error.message === "invalid_grant" ? "invalid_grant" : "server_error";
    return tokenError(oauthError, oauthError === "invalid_grant"
      ? "The authorization code is invalid, expired, already used, or failed PKCE verification."
      : "OKRPTR could not complete the token exchange.", oauthError === "server_error" ? 500 : 400);
  }
}

function tokenError(error: string, description: string, status = 400) {
  return Response.json({ error, error_description: description }, { status, headers: tokenHeaders() });
}

function tokenHeaders() {
  return { "Cache-Control": "no-store", Pragma: "no-cache" };
}
