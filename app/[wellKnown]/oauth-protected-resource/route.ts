import { mcpResourceUrl, oauthIssuer } from "@/lib/mcp-oauth-metadata";

function isMetadataRequest(request: Request) {
  return new URL(request.url).pathname === "/.well-known/oauth-protected-resource";
}

export async function GET(request: Request) {
  if (!isMetadataRequest(request)) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  return Response.json(
    {
      resource: mcpResourceUrl(request),
      authorization_servers: [oauthIssuer(request)],
      scopes_supported: ["okrptr:read", "okrptr:write"],
      bearer_methods_supported: ["header"],
      resource_documentation: `${oauthIssuer(request)}/#integrations`,
    },
    {
      headers: {
        "Cache-Control": "public, max-age=300",
      },
    },
  );
}
