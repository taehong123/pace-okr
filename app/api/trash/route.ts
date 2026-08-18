import { authorizeRequest, deleteTrashRecord, ensureWorkspace, listTrashRecords } from "@/lib/pace-data";

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

  try {
    await ensureWorkspace(authorization.ownerId);
    const id = new URL(request.url).searchParams.get("id")?.trim();
    if (!id) return Response.json({ error: "id is required" }, { status: 400 });
    return Response.json({ deleted: true, trash: await deleteTrashRecord(authorization.ownerId, id) });
  } catch (error) {
    return routeError(error);
  }
}

function routeError(error: unknown) {
  const message = error instanceof Error ? error.message : "Unexpected error";
  const status = /required|not found/i.test(message) ? 400 : 500;
  return Response.json({ error: message }, { status });
}
