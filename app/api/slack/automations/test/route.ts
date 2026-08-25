import { authorizeRequest, canManageTeam, ensureWorkspace, testSlackAutomation } from "@/lib/pace-data";

export async function POST(request: Request) {
  const authorization = await authorizeRequest(request);
  if (authorization instanceof Response) return authorization;
  if (!canManageTeam(authorization)) return Response.json({ error: "Owner or Admin access is required." }, { status: 403 });
  try {
    await ensureWorkspace(authorization.ownerId);
    const payload = await request.json() as Record<string, unknown>;
    const id = typeof payload.id === "string" ? payload.id.trim() : "";
    if (!id) return Response.json({ error: "id is required" }, { status: 400 });
    return Response.json({ delivery: await testSlackAutomation(authorization.ownerId, id) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return Response.json({ error: message }, { status: 400 });
  }
}
