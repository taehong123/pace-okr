import { authorizeRequest, ensureWorkspace, setProjectPropertyHidden } from "@/lib/pace-data";

export async function PATCH(request: Request) {
  const authorization = await authorizeRequest(request);
  if (authorization instanceof Response) return authorization;
  try {
    await ensureWorkspace(authorization.ownerId);
    const payload = await request.json() as Record<string, unknown>;
    const projectId = typeof payload.projectId === "string" ? payload.projectId.trim() : "";
    const propertyId = typeof payload.propertyId === "string" ? payload.propertyId.trim() : "";
    if (!projectId || !propertyId || typeof payload.hidden !== "boolean") {
      return Response.json({ error: "projectId, propertyId, and hidden are required" }, { status: 400 });
    }
    const visibility = await setProjectPropertyHidden(authorization.ownerId, projectId, propertyId, payload.hidden);
    return Response.json({ visibility });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    const status = /required|not found/i.test(message) ? 400 : 500;
    return Response.json({ error: message }, { status });
  }
}
