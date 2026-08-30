import { oauthIssuer } from "@/lib/mcp-oauth-metadata";

export async function GET(request: Request) {
  const issuer = oauthIssuer(request);
  if (new URL(request.url).pathname !== "/.well-known/oauth-authorization-server") {
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  return Response.json(
    {
      issuer,
      authorization_endpoint: `${issuer}/oauth/authorize`,
      token_endpoint: `${issuer}/oauth/token`,
      registration_endpoint: `${issuer}/oauth/register`,
      authorization_response_iss_parameter_supported: true,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code"],
      token_endpoint_auth_methods_supported: ["none"],
      code_challenge_methods_supported: ["S256"],
      scopes_supported: ["okrptr:read", "okrptr:write"],
    },
    {
      headers: {
        "Cache-Control": "public, max-age=300",
      },
    },
  );
}
