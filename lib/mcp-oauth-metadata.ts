export function mcpResourceUrl(request: Request) {
  return new URL("/mcp", request.url).toString();
}

export function oauthIssuer(request: Request) {
  return new URL(request.url).origin;
}
