import {
  authorizeRequest,
  ensureWorkspace,
  ItemDeletePermissionError,
  permanentlyDeleteArchivedProject,
} from "@/lib/pace-data";

export async function DELETE(request: Request) {
  const authorization = await authorizeRequest(request);
  if (authorization instanceof Response) return authorization;
  try {
    await ensureWorkspace(authorization.ownerId);
    const payload = await request.json().catch(() => ({})) as Record<string, unknown>;
    const projectId = typeof payload.projectId === "string" ? payload.projectId.trim() : "";
    const confirmationTitle = typeof payload.confirmationTitle === "string" ? payload.confirmationTitle : "";
    if (!projectId || !confirmationTitle) {
      return Response.json({ error: "projectId and confirmationTitle are required" }, { status: 400 });
    }
    return Response.json(await permanentlyDeleteArchivedProject(authorization.ownerId, authorization.userId, projectId, confirmationTitle));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    if (error instanceof ItemDeletePermissionError) return Response.json({ error: message }, { status: 403 });
    const status = /required|not found|archive|confirmation/i.test(message) ? 400 : 500;
    return Response.json({ error: message }, { status });
  }
}
