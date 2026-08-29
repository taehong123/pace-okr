import { authorizeRequest, deleteTrashRecord, ensureWorkspace, listTrashRecords, restoreTrashRecord } from "@/lib/pace-data";

export async function GET(request: Request) {
  const authorization = await authorizeRequest(request);
  if (authorization instanceof Response) return authorization;

  try {
    await ensureWorkspace(authorization.ownerId);
    return Response.json({ trash: await listTrashRecords(authorization.ownerId) });
  } catch (error) {
    return routeError(error);
  }
}

export async function DELETE(request: Request) {
  const authorization = await authorizeRequest(request, { allowViewerWrite: false });
  if (authorization instanceof Response) return authorization;
  if (authorization.role !== "owner" && authorization.role !== "admin") {
    return Response.json({ error: "Owner or Admin access is required" }, { status: 403 });
  }

  try {
    await ensureWorkspace(authorization.ownerId);
    const id = new URL(request.url).searchParams.get("id")?.trim();
    if (!id) return Response.json({ error: "id is required" }, { status: 400 });
    return Response.json({ deleted: true, trash: await deleteTrashRecord(authorization.ownerId, id) });
  } catch (error) {
    return routeError(error);
  }
}

export async function PATCH(request: Request) {
  const authorization = await authorizeRequest(request, { allowViewerWrite: false });
  if (authorization instanceof Response) return authorization;
  if (authorization.role !== "owner" && authorization.role !== "admin") {
    return Response.json({ error: "Owner or Admin access is required" }, { status: 403 });
  }

  try {
    await ensureWorkspace(authorization.ownerId);
    const payload = (await request.json()) as { id?: unknown; action?: unknown };
    const id = typeof payload.id === "string" ? payload.id.trim() : "";
    if (!id || payload.action !== "restore") return Response.json({ error: "restore id is required" }, { status: 400 });
    return Response.json({ restored: true, trash: await restoreTrashRecord(authorization.ownerId, id) });
  } catch (error) {
    return routeError(error);
  }
}

function routeError(error: unknown) {
  const message = error instanceof Error ? error.message : "Unexpected error";
  const status = /required|not found|cannot be restored|empty execution workspace/i.test(message) ? 400 : 500;
  return Response.json({ error: message }, { status });
}
