import { env } from "cloudflare:workers";
import type { RequestAuthorization } from "@/lib/pace-data";
import { providerLabels, oauthProviderForRedirect } from "@/lib/integration-providers";
import { themeCss, themeBootstrapScript } from "@/lib/themes";

export type ApprovalRequest = {
  clientId: string; redirectUri: string; codeChallenge: string; resource: string; scope: string; state: string | null;
};
type ApprovalRow = { id: string; workspace_id: string; user_id: string; request_json: string; csrf_hash: string; expires_at: string; used_at: string | null };
const TTL = 10 * 60 * 1000;
const db = () => (env as typeof env & { DB: D1Database }).DB;
const random = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, "0")).join("");
const hash = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))), (byte) => byte.toString(16).padStart(2, "0")).join("");
export const approvalCookieName = (id: string) => `okri_mcp_approval_${id}`;

export async function createOAuthApproval(authorization: RequestAuthorization, input: ApprovalRequest) {
  const id = random();
  const csrf = random();
  const now = new Date();
  await db().batch([
    db().prepare("DELETE FROM mcp_oauth_approvals WHERE expires_at <= ?").bind(now.toISOString()),
    db().prepare("INSERT INTO mcp_oauth_approvals (id, workspace_id, user_id, request_json, csrf_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(id, authorization.ownerId, authorization.userId, JSON.stringify(input), await hash(csrf), now.toISOString(), new Date(now.getTime() + TTL).toISOString()),
  ]);
  return { id, csrf };
}

export async function consumeOAuthApproval(authorization: RequestAuthorization, id: string, csrf: string, cookie: string): Promise<ApprovalRequest | null> {
  if (authorization.apiToken || !/^[a-f0-9]{64}$/.test(id) || !/^[a-f0-9]{64}$/.test(csrf) || csrf !== cookie) return null;
  const row = await db().prepare("SELECT * FROM mcp_oauth_approvals WHERE id = ?").bind(id).first<ApprovalRow>();
  if (!row || row.used_at || row.workspace_id !== authorization.ownerId || row.user_id !== authorization.userId
    || Date.parse(row.expires_at) <= Date.now() || row.csrf_hash !== await hash(csrf)) return null;
  const now = new Date().toISOString();
  const result = await db().prepare("UPDATE mcp_oauth_approvals SET used_at = ? WHERE id = ? AND used_at IS NULL AND expires_at > ? AND user_id = ? AND workspace_id = ?")
    .bind(now, id, now, authorization.userId, authorization.ownerId).run();
  if (result.meta.changes !== 1) return null;
  return JSON.parse(row.request_json) as ApprovalRequest;
}

export function approvalContentSecurityPolicy(nonce: string) {
  return `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'`;
}

export function approvalPage(input: ApprovalRequest, authorization: RequestAuthorization, workspaceName: string, id: string, csrf: string, nonce: string) {
  const provider = oauthProviderForRedirect(input.redirectUri)!;
  const label = providerLabels[provider];
  const canWrite = authorization.role !== "viewer"
    && input.scope.split(" ").some((scope) => scope === "okri:write" || scope === "okrptr:write");
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${label}에 OKRI 연결 승인</title><script nonce="${nonce}">${themeBootstrapScript}</script><style nonce="${nonce}">${themeCss}
    *{box-sizing:border-box}html{font-size:100%}@media(min-width:1800px){html{font-size:112.5%}}body{margin:0;background:var(--bg-page);color:var(--text-primary);font:1rem/1.6 system-ui,sans-serif}main{max-width:44rem;margin:6vh auto;padding:28px;background:var(--bg-raised);border:1px solid var(--border-default);border-radius:14px}h1{font-size:1.75rem;line-height:1.25}h2{font-size:1.25rem;line-height:1.25}dl{display:grid;grid-template-columns:7rem minmax(0,1fr);gap:12px}dt,p{color:var(--text-secondary)}dd{margin:0;overflow-wrap:anywhere}code{overflow-wrap:anywhere}.actions{display:flex;gap:12px;margin-top:24px}button,a{min-height:2.75rem}button{flex:1;padding:12px;border:1px solid var(--border-control);border-radius:7px;background:var(--button-secondary-bg);color:var(--button-secondary-fg);font:inherit;cursor:pointer}button:hover{background:var(--button-secondary-hover-bg);color:var(--button-secondary-hover-fg)}button:active{background:var(--button-secondary-active-bg);color:var(--button-secondary-active-fg)}button[value=approve]{background:var(--button-primary-bg);color:var(--button-primary-fg)}button[value=approve]:hover{background:var(--button-primary-hover-bg);color:var(--button-primary-hover-fg)}button[value=approve]:active{background:var(--button-primary-active-bg);color:var(--button-primary-active-fg)}button:disabled,button[value=approve]:disabled{background:var(--button-disabled-bg);color:var(--button-disabled-fg);cursor:default}button:focus-visible,a:focus-visible{outline:3px solid var(--focus-ring);outline-offset:3px}@media(max-width:600px){main{margin:16px;padding:20px}dl{grid-template-columns:1fr;gap:4px}dd{margin-bottom:10px}}
    </style></head><body><main><div>OKRI · AI 연결</div><h1>${label}에 연결하시겠어요?</h1>
    <p>아래 계정과 워크스페이스에 대한 접근을 승인합니다. 다른 워크스페이스는 연결되지 않습니다.</p>
    <dl><dt>OKRI 계정</dt><dd>${escapeHtml(authorization.displayName)}<br>${escapeHtml(authorization.email ?? "")}</dd><dt>워크스페이스</dt><dd>${escapeHtml(workspaceName)}</dd><dt>현재 역할</dt><dd>${escapeHtml(authorization.role)}</dd></dl>
    <h2>허용할 권한</h2><ul><li>이 워크스페이스의 업무와 팀 정보 조회</li>${canWrite ? "<li>현재 역할이 허용하는 업무 생성·수정·삭제</li>" : "<li>읽기 전용: 업무를 변경할 수 없습니다.</li>"}</ul>
    ${provider === "claude_code" ? `<h2>Claude Code 로컬 인증 대상</h2><code>${escapeHtml(input.redirectUri)}</code><p>현재 컴퓨터에서 시작한 Claude Code 연결인지 확인하세요.</p>` : ""}
    <p>연결 후에도 현재 역할과 요금제의 편집 권한이 적용됩니다. 앱의 AI 연결에서 이 서비스만 언제든 해제할 수 있습니다. 승인 요청은 10분 후 만료됩니다.</p>
    <form method="post" action="/oauth/authorize"><input type="hidden" name="request_id" value="${id}"><input type="hidden" name="csrf" value="${csrf}"><div class="actions"><button type="submit" name="decision" value="cancel">취소</button><button type="submit" name="decision" value="approve">${label} 연결 승인</button></div></form></main></body></html>`;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}
