export const INTEGRATION_PROVIDERS = ["chatgpt", "claude", "claude_code", "other"] as const;
export type IntegrationProvider = (typeof INTEGRATION_PROVIDERS)[number];
export const providerLabels: Record<IntegrationProvider, string> = {
  chatgpt: "ChatGPT", claude: "Claude", claude_code: "Claude Code", other: "기타",
};
export const PUBLIC_MCP_URL = "https://okrptr.com/api/mcp";
export const CLAUDE_CODE_COMMAND = `claude mcp add --transport http --scope user okrptr ${PUBLIC_MCP_URL}`;

export function isIntegrationProvider(value: unknown): value is IntegrationProvider {
  return typeof value === "string" && INTEGRATION_PROVIDERS.some((provider) => provider === value);
}

// NULL identifies historical records. Never reclassify an explicitly tagged token.
export function effectiveIntegrationProvider(record: { provider?: string | null; name: string }): IntegrationProvider {
  if (isIntegrationProvider(record.provider)) return record.provider;
  return record.name === "ChatGPT OAuth" ? "chatgpt" : "other";
}

export function claudeInstallUrl(organization = false) {
  const url = new URL(organization ? "https://claude.ai/admin-settings/connectors" : "https://claude.ai/customize/connectors");
  url.searchParams.set("modal", "add-custom-connector");
  url.searchParams.set("connectorName", "OKRPTR");
  url.searchParams.set("connectorUrl", PUBLIC_MCP_URL);
  return url.toString();
}

export function oauthProviderForRedirect(value: string): Exclude<IntegrationProvider, "other"> | null {
  if (value.length > 2048) return null;
  try {
    const url = new URL(value);
    if (url.username || url.password || url.hash) return null;
    if (url.protocol === "https:" && !url.port && url.hostname === "chatgpt.com"
      && (url.pathname === "/connector_platform_oauth_redirect" || url.pathname.startsWith("/connector/oauth/"))) return "chatgpt";
    if (url.href === "https://claude.ai/api/mcp/auth_callback") return "claude";
    if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?\/callback$/.test(value) && url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname)
      && url.pathname === "/callback" && !url.search) return "claude_code";
  } catch { /* Reject malformed redirect URIs. */ }
  return null;
}

export function registeredOAuthProvider(redirectUris: string[]) {
  const provider = redirectUris.length ? oauthProviderForRedirect(redirectUris[0]) : null;
  return provider && redirectUris.every((uri) => oauthProviderForRedirect(uri) === provider) ? provider : null;
}

export function matchesOAuthRedirect(registered: string[], requested: string) {
  const provider = registeredOAuthProvider(registered);
  if (!provider || oauthProviderForRedirect(requested) !== provider) return false;
  if (provider !== "claude_code") return registered.includes(requested);
  // RFC 8252: only the loopback port may vary. Bind the actual URI to the code.
  const target = new URL(requested);
  return registered.some((uri) => {
    const allowed = new URL(uri);
    return target.protocol === allowed.protocol && target.hostname === allowed.hostname && target.pathname === allowed.pathname;
  });
}
