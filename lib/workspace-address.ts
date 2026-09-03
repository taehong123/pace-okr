export const WORKSPACE_DOMAIN = "okrptr.com";
const RESERVED_ADDRESSES = new Set("www api app admin auth login logout account accounts billing mail email smtp imap pop webmail ftp ns1 ns2 dns cdn static assets files uploads status support help docs blog careers legal privacy terms oauth mcp slack google calendar localhost staging dev test preview production okrptr".split(" "));

export function normalizeWorkspaceAddress(value: unknown) {
  if (typeof value !== "string") throw new Error("주소를 입력해 주세요.");
  const address = value.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{1,46}[a-z0-9]$/.test(address)) {
    throw new Error("주소는 영문 소문자, 숫자, 하이픈으로 3~48자이며 처음과 끝은 영문 또는 숫자여야 합니다.");
  }
  if (RESERVED_ADDRESSES.has(address) || address.startsWith("xn--")) throw new Error("서비스에서 사용하는 주소입니다. 다른 주소를 입력해 주세요.");
  return address;
}

export function workspaceEntryPath(address: string, returnTo = "/") {
  const params = new URLSearchParams({ address });
  if (returnTo !== "/") params.set("returnTo", workspaceReturnPath(returnTo));
  return `/api/workspaces/open?${params}`;
}

export function workspaceReturnPath(value: unknown) {
  if (typeof value !== "string" || value.length > 2048 || /[\\\r\n]/.test(value)) return "/";
  let url: URL;
  try { url = new URL(value, `https://${WORKSPACE_DOMAIN}`); } catch { return "/"; }
  if (url.origin !== `https://${WORKSPACE_DOMAIN}` || url.pathname !== "/") return "/";
  // Only app navigation survives an external entry. OAuth codes and auth flags do not.
  const params = new URLSearchParams();
  for (const key of ["view", "project", "task", "group", "settings", "tab", "bot"]) {
    const part = url.searchParams.get(key);
    if (part) params.set(key, part);
  }
  return params.size ? `/?${params}` : "/";
}

export function workspaceSubdomainRedirect(request: Request, enabled: boolean): Response | null {
  const url = new URL(request.url);
  if (!url.hostname.endsWith(`.${WORKSPACE_DOMAIN}`)) return null;
  const address = url.hostname.slice(0, -(`.${WORKSPACE_DOMAIN}`.length));
  const headers = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };
  if (!enabled) return new Response("Workspace addresses are not available yet.", { status: 503, headers });
  try { normalizeWorkspaceAddress(address); } catch { return new Response("Workspace not found.", { status: 404, headers }); }
  if (!["GET", "HEAD"].includes(request.method) || url.pathname !== "/") {
    return new Response("Use okrptr.com for API and account operations.", { status: 405, headers });
  }
  const target = new URL(workspaceEntryPath(address, workspaceReturnPath(url.pathname + url.search)), `https://${WORKSPACE_DOMAIN}`);
  return new Response(null, { status: 302, headers: { ...headers, Location: target.toString() } });
}
