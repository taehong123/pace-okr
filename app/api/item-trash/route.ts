import {
  authorizeRequest,
  ensureWorkspace,
  getItemDeletePermissionMap,
  getItemAssignmentMap,
  ItemDeletePermissionError,
  listItems,
  listTrashedItems,
  permanentlyDeleteTrashedItems,
  restoreTrashedItems,
  serializeItem,
  trashItems,
} from "@/lib/pace-data";

export async function GET(request: Request) {
  const authorization = await authorizeRequest(request, { allowViewerWrite: true });
  if (authorization instanceof Response) return authorization;
  try {
    await ensureWorkspace(authorization.ownerId);
    const rows = await listTrashedItems(authorization.ownerId);
    const initiatives = await listItems(authorization.ownerId, { kind: "initiative", limit: 200 });
    const activeInitiativeIds = new Set(initiatives.map((initiative) => initiative.id));
    const assignments = await getItemAssignmentMap(authorization.ownerId, rows.map((entry) => entry.item.id));
    const deletePermissions = await getItemDeletePermissionMap(authorization.ownerId, authorization.userId, rows.map((entry) => entry.item));
    return Response.json({
      items: rows.map((entry) => ({
        ...serializeItem(entry.item, {}, assignments[entry.item.id] ?? []),
        trashedTaskCount: entry.taskCount,
        canDelete: deletePermissions[entry.item.id] ?? false,
        restoreParentRequired: entry.item.kind === "project" && (!entry.item.parentId || !activeInitiativeIds.has(entry.item.parentId)),
      })),
      initiativeOptions: initiatives.filter((initiative) => Boolean(initiative.cycleId)).map((initiative) => ({ id: initiative.id, title: initiative.title, cycleId: initiative.cycleId })),
    });
  } catch (error) {
    return routeError(error);
  }
}

export async function POST(request: Request) {
  const authorization = await authorizeRequest(request);
  if (authorization instanceof Response) return authorization;
  try {
    await ensureWorkspace(authorization.ownerId);
    const payload = await request.json().catch(() => ({})) as Record<string, unknown>;
    const scope = payload.scope === "all_project_task" ? "all_project_task" : undefined;
    const itemIds = asItemIds(payload.itemIds);
    return Response.json(await trashItems(authorization.ownerId, authorization.userId, { itemIds, scope }));
  } catch (error) {
    return routeError(error);
  }
}

export async function PATCH(request: Request) {
  const authorization = await authorizeRequest(request);
  if (authorization instanceof Response) return authorization;
  try {
    await ensureWorkspace(authorization.ownerId);
    const payload = await request.json().catch(() => ({})) as Record<string, unknown>;
    if (payload.action !== "restore") return Response.json({ error: "action must be restore" }, { status: 400 });
    return Response.json(await restoreTrashedItems(authorization.ownerId, asItemIds(payload.itemIds), asProjectParentIds(payload.projectParentIds)));
  } catch (error) {
    return routeError(error);
  }
}

export async function DELETE(request: Request) {
  const authorization = await authorizeRequest(request);
  if (authorization instanceof Response) return authorization;
  try {
    await ensureWorkspace(authorization.ownerId);
    const payload = await request.json().catch(() => ({})) as Record<string, unknown>;
    const confirmationText = typeof payload.confirmationText === "string" ? payload.confirmationText : "";
    return Response.json(await permanentlyDeleteTrashedItems(
      authorization.ownerId,
      authorization.userId,
      asItemIds(payload.itemIds),
      confirmationText,
    ));
  } catch (error) {
    return routeError(error);
  }
}

function asItemIds(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string").map((entry) => entry.trim()).filter(Boolean)
    : [];
}

function asProjectParentIds(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).flatMap(([projectId, initiativeId]) =>
    typeof initiativeId === "string" && projectId.trim() && initiativeId.trim() ? [[projectId.trim(), initiativeId.trim()]] : []));
}

function routeError(error: unknown) {
  const message = error instanceof Error ? error.message : "Unexpected error";
  if (error instanceof ItemDeletePermissionError) return Response.json({ error: message }, { status: 403 });
  const status = /required|not found|confirmation|Project|Task|restore|trashed/i.test(message) ? 400 : 500;
  return Response.json({ error: message }, { status });
}
