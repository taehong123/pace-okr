import { authorizeRequest, cleanupWorkspaceExecutionData, ensureWorkspace } from "@/lib/pace-data";

const confirmationText = "DELETE OKR DATA";

export async function POST(request: Request) {
  const authorization = await authorizeRequest(request, { allowViewerWrite: false });
  if (authorization instanceof Response) return authorization;
  if (authorization.role !== "owner" && authorization.role !== "admin") {
    return Response.json({ error: "Owner or Admin access is required" }, { status: 403 });
  }

  try {
    const payload = (await request.json()) as Record<string, unknown>;
    if (payload.confirmation !== confirmationText) {
      return Response.json({ error: "confirmation is required" }, { status: 400 });
    }

    await ensureWorkspace(authorization.ownerId);
    const result = await cleanupWorkspaceExecutionData(authorization.ownerId, authorization.userId);
    return Response.json({ cleaned: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return Response.json({ error: message }, { status: 500 });
  }
}
