import {
  ITEM_ASSIGNMENT_ROLES,
  authorizeRequest,
  ensureWorkspace,
  getItemAssignmentMap,
  replaceItemAssignmentRole,
  type ItemAssignmentRole,
} from "@/lib/pace-data";

export async function GET(request: Request) {
  const authorization = await authorizeRequest(request);
  if (authorization instanceof Response) return authorization;
  try {
    await ensureWorkspace(authorization.ownerId);
    const itemId = new URL(request.url).searchParams.get("itemId")?.trim() ?? "";
    if (!itemId) return Response.json({ error: "itemId is required" }, { status: 400 });
    const assignments = await getItemAssignmentMap(authorization.ownerId, [itemId]);
    return Response.json({ assignments: assignments[itemId] ?? [] });
  } catch (error) {
    return routeError(error);
  }
}

export async function PATCH(request: Request) {
  const authorization = await authorizeRequest(request);
  if (authorization instanceof Response) return authorization;
  try {
    await ensureWorkspace(authorization.ownerId);
    const payload = await request.json() as Record<string, unknown>;
    const itemId = typeof payload.itemId === "string" ? payload.itemId.trim() : "";
    const role = typeof payload.role === "string" && ITEM_ASSIGNMENT_ROLES.includes(payload.role as ItemAssignmentRole)
      ? payload.role as ItemAssignmentRole
      : null;
    const memberIds = Array.isArray(payload.memberIds)
      ? payload.memberIds.filter((entry): entry is string => typeof entry === "string" && Boolean(entry.trim())).map((entry) => entry.trim())
      : [];
    if (!itemId || !role) return Response.json({ error: "itemId and supported role are required" }, { status: 400 });
    const assignments = await replaceItemAssignmentRole(authorization.ownerId, itemId, role, memberIds);
    return Response.json({ itemId, assignments });
  } catch (error) {
    return routeError(error);
  }
}

function routeError(error: unknown) {
  const message = error instanceof Error ? error.message : "Unexpected error";
  const status = /required|unsupported|not found|only|active workspace member|restore/i.test(message) ? 400 : 500;
  return Response.json({ error: message }, { status });
}
