import {
  authorizeRequest,
  createChecklistItem,
  deleteChecklistItem,
  ensureWorkspace,
  listChecklistItems,
  serializeChecklistItem,
  updateChecklistItem,
} from "@/lib/pace-data";

export async function GET(request: Request) {
  const authorization = authorizeRequest(request);
  if (authorization instanceof Response) return authorization;

  try {
    await ensureWorkspace(authorization.ownerId);
    const taskId = new URL(request.url).searchParams.get("taskId")?.trim();
    if (!taskId) return Response.json({ error: "taskId is required" }, { status: 400 });
    const rows = await listChecklistItems(authorization.ownerId, taskId);
    return Response.json({ items: rows.map(serializeChecklistItem) });
  } catch (error) {
    return routeError(error);
  }
}

export async function POST(request: Request) {
  const authorization = authorizeRequest(request);
  if (authorization instanceof Response) return authorization;

  try {
    await ensureWorkspace(authorization.ownerId);
    const payload = (await request.json()) as Record<string, unknown>;
    const taskId = asString(payload.taskId);
    const title = asString(payload.title);
    if (!taskId || !title) {
      return Response.json({ error: "taskId and title are required" }, { status: 400 });
    }
    const item = await createChecklistItem(authorization.ownerId, taskId, title);
    return Response.json({ item: serializeChecklistItem(item) }, { status: 201 });
  } catch (error) {
    return routeError(error);
  }
}

export async function PATCH(request: Request) {
  const authorization = authorizeRequest(request);
  if (authorization instanceof Response) return authorization;

  try {
    await ensureWorkspace(authorization.ownerId);
    const payload = (await request.json()) as Record<string, unknown>;
    const id = asString(payload.id);
    if (!id) return Response.json({ error: "id is required" }, { status: 400 });
    const item = await updateChecklistItem(authorization.ownerId, id, {
      title: typeof payload.title === "string" ? payload.title : undefined,
      completed: typeof payload.completed === "boolean" ? payload.completed : undefined,
    });
    return Response.json({ item: serializeChecklistItem(item) });
  } catch (error) {
    return routeError(error);
  }
}

export async function DELETE(request: Request) {
  const authorization = authorizeRequest(request);
  if (authorization instanceof Response) return authorization;

  try {
    await ensureWorkspace(authorization.ownerId);
    const id = new URL(request.url).searchParams.get("id")?.trim();
    if (!id) return Response.json({ error: "id is required" }, { status: 400 });
    await deleteChecklistItem(authorization.ownerId, id);
    return Response.json({ deleted: true, id });
  } catch (error) {
    return routeError(error);
  }
}

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function routeError(error: unknown) {
  const message = error instanceof Error ? error.message : "Unexpected error";
  const status = /required|not found|only belong/i.test(message) ? 400 : 500;
  return Response.json({ error: message }, { status });
}
