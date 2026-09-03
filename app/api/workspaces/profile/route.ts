import { env } from "cloudflare:workers";
import { authorizeRequest } from "@/lib/pace-data";
import { readWorkspaceIdentity, updateWorkspaceIdentity, WorkspaceIdentityError } from "@/lib/workspace-identity";

export async function GET(request: Request) {
  const auth = await authorizeRequest(request, { allowViewerWrite: true });
  if (auth instanceof Response) return auth;
  if (request.headers.get("x-okrptr-workspace-id") !== auth.ownerId) return denied();
  try {
    return result(await readWorkspaceIdentity(env.DB, auth.ownerId, auth.userId, enabled()));
  } catch (error) { return failure(error); }
}

export async function PATCH(request: Request) {
  const origin = request.headers.get("origin");
  if (origin !== new URL(request.url).origin || request.headers.get("sec-fetch-site") === "cross-site") {
    return Response.json({ error: "이 사이트에서 다시 시도해 주세요." }, { status: 403 });
  }
  const auth = await authorizeRequest(request, { allowViewerWrite: true });
  if (auth instanceof Response) return auth;
  if (request.headers.get("x-okrptr-workspace-id") !== auth.ownerId) return denied();
  if (auth.apiToken) return Response.json({ error: "워크스페이스 설정에서 변경해 주세요." }, { status: 403 });
  try {
    const input = await request.json();
    if (!input || typeof input !== "object" || Array.isArray(input)) return Response.json({ error: "입력 내용을 확인해 주세요." }, { status: 400 });
    return result(await updateWorkspaceIdentity(env.DB, auth.ownerId, auth.userId, input as Record<string, unknown>, enabled()));
  } catch (error) { return failure(error); }
}

function enabled() { return (env as typeof env & { WORKSPACE_SUBDOMAINS_ENABLED?: string }).WORKSPACE_SUBDOMAINS_ENABLED === "true"; }
function denied() { return Response.json({ error: "워크스페이스를 다시 선택해 주세요." }, { status: 403 }); }
function result(profile: Awaited<ReturnType<typeof readWorkspaceIdentity>>) {
  return Response.json({ profile }, { headers: { "Cache-Control": "private, no-store" } });
}
function failure(error: unknown) {
  return Response.json({ error: error instanceof WorkspaceIdentityError ? error.message : "워크스페이스 정보를 처리하지 못했습니다. 다시 시도해 주세요." },
    { status: error instanceof WorkspaceIdentityError ? error.status : error instanceof SyntaxError ? 400 : 500, headers: { "Cache-Control": "no-store" } });
}
