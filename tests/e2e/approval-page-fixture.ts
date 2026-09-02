import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
import type { approvalPage, approvalContentSecurityPolicy } from "../../lib/mcp-oauth-approval";

const requireModule = createRequire(import.meta.url);
function compile(path: string, mocks: Record<string, unknown> = {}) {
  const source = readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const loaded = { exports: {} };
  new Function("require", "module", "exports", output)((name: string) => name in mocks ? mocks[name] : requireModule(name), loaded, loaded.exports);
  return loaded.exports;
}
// Exercise the production renderer and CSP without opening a real OAuth grant.
const renderer = compile("lib/mcp-oauth-approval.ts", {
  "cloudflare:workers": { env: {} },
  "@/lib/integration-providers": compile("lib/integration-providers.ts"),
  "@/lib/themes": compile("lib/themes.ts"),
}) as { approvalPage: typeof approvalPage; approvalContentSecurityPolicy: typeof approvalContentSecurityPolicy };

export function approvalFixture() {
  const nonce = "0123456789abcdef";
  return {
    body: renderer.approvalPage({
      clientId: "test-only", redirectUri: "http://127.0.0.1:54321/callback",
      codeChallenge: "test-only", resource: "https://okrptr.com/api/mcp", scope: "okrptr:read okrptr:write", state: null,
    }, { ownerId: "test-workspace", userId: "test-user", displayName: "테스트 사용자", email: "test@example.com", role: "owner", apiToken: false },
    "테스트 워크스페이스", "test-only", "test-only", nonce),
    headers: { "Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": renderer.approvalContentSecurityPolicy(nonce) },
  };
}
