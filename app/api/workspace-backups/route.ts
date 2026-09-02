import { env } from "cloudflare:workers";
import { authorizeRequest } from "@/lib/pace-data";
import { BackupError, createWorkspaceBackup, listWorkspaceBackups, previewWorkspaceBackup, restoreWorkspaceBackup } from "@/lib/workspace-backups";

const headers = { "Cache-Control": "private, no-store" };

async function authorize(request: Request) {
  const auth = await authorizeRequest(request);
  if (auth instanceof Response) return auth;
  const requested = request.headers.get("x-okrptr-workspace-id");
  if (requested && requested !== auth.ownerId) return Response.json({ error: "워크스페이스 접근 권한이 없습니다." }, { status: 403, headers });
  if (auth.role !== "owner" && auth.role !== "admin") return Response.json({ error: "백업은 Owner 또는 Admin만 관리할 수 있습니다." }, { status: 403, headers });
  const member = await env.DB.prepare("SELECT id FROM workspace_members WHERE workspace_id = ? AND user_id = ? AND status = 'active' AND role IN ('owner','admin')")
    .bind(auth.ownerId, auth.userId).first();
  if (!member) return Response.json({ error: "워크스페이스 관리자 권한이 필요합니다." }, { status: 403, headers });
  if (request.method !== "GET" && request.headers.get("origin") && request.headers.get("origin") !== new URL(request.url).origin) {
    return Response.json({ error: "다른 사이트에서 보낸 요청은 허용하지 않습니다." }, { status: 403, headers });
  }
  return auth;
}

export async function GET(request: Request) {
  try {
    const auth = await authorize(request);
    if (auth instanceof Response) return auth;
    const params = new URL(request.url).searchParams;
    const id = params.get("id");
    return Response.json(id ? await previewWorkspaceBackup(env, auth.ownerId, id) : await listWorkspaceBackups(env, auth.ownerId, params.get("before") ?? undefined), { headers });
  } catch (error) { return routeError(error); }
}

export async function POST(request: Request) {
  try {
    const auth = await authorize(request);
    if (auth instanceof Response) return auth;
    const payload = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!payload || payload.action !== "create") return Response.json({ error: "백업 생성 요청을 확인해 주세요." }, { status: 400, headers });
    return Response.json({ backup: await createWorkspaceBackup(env, auth.ownerId, "manual", auth.userId) }, { headers });
  } catch (error) { return routeError(error); }
}

export async function PATCH(request: Request) {
  try {
    const auth = await authorize(request);
    if (auth instanceof Response) return auth;
    const payload = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!payload || typeof payload.id !== "string" || payload.action !== "restore" || payload.confirmation !== "RESTORE WORKSPACE") return Response.json({ error: "복원 확인이 필요합니다." }, { status: 400, headers });
    return Response.json(await restoreWorkspaceBackup(env, auth.ownerId, payload.id, auth.userId), { headers });
  } catch (error) { return routeError(error); }
}

function routeError(error: unknown) {
  return Response.json({ error: error instanceof BackupError ? error.message : "백업 작업을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.", code: error instanceof BackupError ? error.code : "backup_failed" }, { status: error instanceof BackupError ? error.status : 500, headers });
}
