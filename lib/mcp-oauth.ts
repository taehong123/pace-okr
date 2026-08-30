import { env } from "cloudflare:workers";
import { createIntegrationToken, type RequestAuthorization } from "@/lib/pace-data";
import { mcpResourceUrl, oauthIssuer } from "@/lib/mcp-oauth-metadata";

export { mcpResourceUrl, oauthIssuer };

const OAUTH_CODE_TTL_MS = 5 * 60 * 1000;
const ALLOWED_SCOPES = new Set(["okrptr:read", "okrptr:write"]);

type McpOAuthClientRow = {
  client_id: string;
  redirect_uris: string;
  client_name: string;
  created_at: string;
};

type McpOAuthCodeRow = {
  code_hash: string;
  authorization_json: string;
  client_id: string;
  redirect_uri: string;
  code_challenge: string;
  resource: string;
  scope: string;
  expires_at: string;
  used_at: string | null;
};

export type McpOAuthClient = {
  clientId: string;
  redirectUris: string[];
  clientName: string;
  createdAt: string;
};

let oauthSchemaReady: Promise<void> | null = null;

export function normalizeOAuthScope(value: string | null | undefined) {
  const requested = (value ?? "okrptr:read okrptr:write").split(/\s+/).filter(Boolean);
  const scopes = [...new Set(requested.filter((scope) => ALLOWED_SCOPES.has(scope)))];
  return scopes.length ? scopes.join(" ") : "";
}

export function isAllowedChatGptRedirectUri(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "chatgpt.com" && (
      url.pathname === "/connector_platform_oauth_redirect"
      || url.pathname.startsWith("/connector/oauth/")
    );
  } catch {
    return false;
  }
}

export async function registerMcpOAuthClient(input: {
  redirectUris: string[];
  clientName?: string;
}) {
  await ensureMcpOAuthSchema();
  const clientId = `okrptr_chatgpt_${randomHex(24)}`;
  const createdAt = new Date().toISOString();
  await database().prepare(`
    INSERT INTO mcp_oauth_clients (client_id, redirect_uris, client_name, created_at)
    VALUES (?, ?, ?, ?)
  `).bind(clientId, JSON.stringify(input.redirectUris), (input.clientName ?? "ChatGPT").slice(0, 120), createdAt).run();
  return { clientId, redirectUris: input.redirectUris, clientName: input.clientName ?? "ChatGPT", createdAt };
}

export async function getMcpOAuthClient(clientId: string): Promise<McpOAuthClient | null> {
  await ensureMcpOAuthSchema();
  const row = await database().prepare(`
    SELECT client_id, redirect_uris, client_name, created_at
    FROM mcp_oauth_clients
    WHERE client_id = ?
  `).bind(clientId).first<McpOAuthClientRow>();
  if (!row) return null;
  try {
    const redirectUris = JSON.parse(row.redirect_uris) as unknown;
    if (!Array.isArray(redirectUris) || !redirectUris.every((entry) => typeof entry === "string")) return null;
    return { clientId: row.client_id, redirectUris, clientName: row.client_name, createdAt: row.created_at };
  } catch {
    return null;
  }
}

export async function createMcpOAuthAuthorizationCode(
  authorization: RequestAuthorization,
  input: {
    clientId: string;
    redirectUri: string;
    codeChallenge: string;
    resource: string;
    scope: string;
  },
) {
  await ensureMcpOAuthSchema();
  const code = `okrptr_oauth_code_${randomHex(32)}`;
  const now = new Date();
  await database().prepare(`
    INSERT INTO mcp_oauth_codes (
      code_hash, authorization_json, client_id, redirect_uri, code_challenge,
      resource, scope, created_at, expires_at, used_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
  `).bind(
    await sha256Hex(code),
    JSON.stringify(authorization),
    input.clientId,
    input.redirectUri,
    input.codeChallenge,
    input.resource,
    input.scope,
    now.toISOString(),
    new Date(now.getTime() + OAUTH_CODE_TTL_MS).toISOString(),
  ).run();
  return code;
}

export async function exchangeMcpOAuthAuthorizationCode(input: {
  code: string;
  clientId: string;
  redirectUri: string;
  codeVerifier: string;
  resource: string;
}) {
  await ensureMcpOAuthSchema();
  const codeHash = await sha256Hex(input.code);
  const row = await database().prepare(`
    SELECT code_hash, authorization_json, client_id, redirect_uri, code_challenge,
           resource, scope, expires_at, used_at
    FROM mcp_oauth_codes
    WHERE code_hash = ?
  `).bind(codeHash).first<McpOAuthCodeRow>();
  if (!row || row.used_at || Date.parse(row.expires_at) <= Date.now()) throw new Error("invalid_grant");
  if (row.client_id !== input.clientId || row.redirect_uri !== input.redirectUri || row.resource !== input.resource) {
    throw new Error("invalid_grant");
  }
  if (!/^[A-Za-z0-9._~-]{43,128}$/.test(input.codeVerifier)) throw new Error("invalid_grant");
  if (await sha256Base64Url(input.codeVerifier) !== row.code_challenge) throw new Error("invalid_grant");

  let authorization: RequestAuthorization;
  try {
    authorization = JSON.parse(row.authorization_json) as RequestAuthorization;
  } catch {
    throw new Error("invalid_grant");
  }
  if (!authorization.ownerId || !authorization.userId || !authorization.role) throw new Error("invalid_grant");

  const consumedAt = new Date().toISOString();
  const consumed = await database().prepare(`
    UPDATE mcp_oauth_codes
    SET used_at = ?
    WHERE code_hash = ? AND used_at IS NULL AND expires_at > ?
  `).bind(consumedAt, codeHash, consumedAt).run();
  if ((consumed.meta.changes ?? 0) !== 1) throw new Error("invalid_grant");

  const { token } = await createIntegrationToken({ ...authorization, apiToken: false }, "ChatGPT OAuth");
  return { accessToken: token, scope: row.scope };
}

async function ensureMcpOAuthSchema() {
  if (!oauthSchemaReady) {
    oauthSchemaReady = database().batch([
      database().prepare(`CREATE TABLE IF NOT EXISTS mcp_oauth_clients (
        client_id TEXT PRIMARY KEY,
        redirect_uris TEXT NOT NULL,
        client_name TEXT NOT NULL DEFAULT 'ChatGPT',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`),
      database().prepare(`CREATE TABLE IF NOT EXISTS mcp_oauth_codes (
        code_hash TEXT PRIMARY KEY,
        authorization_json TEXT NOT NULL,
        client_id TEXT NOT NULL,
        redirect_uri TEXT NOT NULL,
        code_challenge TEXT NOT NULL,
        resource TEXT NOT NULL,
        scope TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        expires_at TEXT NOT NULL,
        used_at TEXT
      )`),
      database().prepare("CREATE INDEX IF NOT EXISTS idx_mcp_oauth_codes_expires ON mcp_oauth_codes(expires_at)"),
    ]).then(() => undefined).catch((error) => {
      oauthSchemaReady = null;
      throw error;
    });
  }
  await oauthSchemaReady;
}

function database() {
  return (env as typeof env & { DB: D1Database }).DB;
}

function randomHex(byteLength: number) {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256Base64Url(value: string) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  let binary = "";
  digest.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}
