import { env } from "cloudflare:workers";
import { authorizeRequest, canManageTeam } from "@/lib/pace-data";
import { listRoutineProperties, RoutinePropertyError, saveRoutineProperty } from "@/lib/routine-properties";

async function handle(request: Request) {
  const auth = await authorizeRequest(request);
  if (auth instanceof Response) return auth;
  if (request.method !== "GET" && !canManageTeam(auth)) return Response.json({ error: "소유자 또는 관리자만 루틴 속성을 관리할 수 있습니다." }, { status: 403 });
  try {
    const url = new URL(request.url);
    if (request.method === "GET") return Response.json({ properties: await listRoutineProperties(env.DB, auth.ownerId, url.searchParams.get("includeInactive") === "true") }, { headers: { "Cache-Control": "private, no-store" } });
    const input: unknown = request.method === "DELETE" ? { id: url.searchParams.get("id"), active: false } : await request.json();
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new RoutinePropertyError("입력 내용을 확인해 주세요.");
    return Response.json(await saveRoutineProperty(env.DB, auth.ownerId, input as Record<string, unknown>, request.method === "POST"), { status: request.method === "POST" ? 201 : 200 });
  } catch (error) {
    return Response.json({ error: error instanceof RoutinePropertyError ? error.message : "루틴 속성을 저장하지 못했습니다." }, { status: error instanceof RoutinePropertyError ? error.status : error instanceof SyntaxError ? 400 : 500 });
  }
}
export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const DELETE = handle;
