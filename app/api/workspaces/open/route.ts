import { env } from "cloudflare:workers";
import { authorizeRequest } from "@/lib/pace-data";
import { workspaceForAddress } from "@/lib/workspace-identity";
import { normalizeWorkspaceAddress, workspaceEntryPath, workspaceReturnPath } from "@/lib/workspace-address";

export async function GET(request: Request) {
  const url = new URL(request.url);
  let address: string;
  try { address = normalizeWorkspaceAddress(url.searchParams.get("address")); }
  catch { return unavailable(); }
  const returnTo = workspaceReturnPath(url.searchParams.get("returnTo") ?? "/");
  const auth = await authorizeRequest(request, { allowViewerWrite: true });
  if (auth instanceof Response) {
    if (auth.status !== 401) return unavailable();
    const signIn = new URL("/api/auth/google", request.url);
    signIn.searchParams.set("returnTo", workspaceEntryPath(address, returnTo));
    return new Response(null, { status: 302, headers: { Location: signIn.toString(), "Cache-Control": "no-store" } });
  }
  if (auth.apiToken) return unavailable();
  try {
    const workspace = await workspaceForAddress(env.DB, address, auth.userId);
    if (!workspace) return unavailable();
    const nonce = crypto.randomUUID();
    const target = JSON.stringify(returnTo).replaceAll("<", "\\u003c");
    // Clear the old workspace's local snapshot before the new app's preload starts.
    const html = `<!doctype html><html lang="ko"><meta charset="utf-8"><title>OKRI</title><body><p>워크스페이스로 이동 중입니다.</p><script nonce="${nonce}">try{localStorage.removeItem("okri.bootstrap.v1")}catch{}location.replace(${target})</script></body></html>`;
    return new Response(html, { headers: {
      "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer",
      "Content-Security-Policy": `default-src 'none'; script-src 'nonce-${nonce}'; frame-ancestors 'none'; base-uri 'none'`,
      "Set-Cookie": `okri_workspace_id=${encodeURIComponent(workspace.id)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${url.protocol === "https:" ? "; Secure" : ""}`,
    } });
  } catch {
    return new Response("워크스페이스를 열지 못했습니다. 잠시 후 다시 시도해 주세요.", { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

function unavailable() {
  return new Response("워크스페이스가 없거나 접근 권한이 없습니다. 초대받은 계정으로 로그인해 주세요.", {
    status: 404, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}
