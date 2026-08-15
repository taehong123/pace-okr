import {
  GROUP_COLORS,
  GROUP_VISIBILITIES,
  createGroup,
  deleteGroup,
  ensureWorkspace,
  listGroups,
  updateGroup,
  authorizeRequest,
  type GroupColor,
  type GroupVisibility,
} from "@/lib/pace-data";

export async function GET(request: Request) {
  const authorization = await authorizeRequest(request);
  if (authorization instanceof Response) return authorization;
  try {
    await ensureWorkspace(authorization.ownerId);
    const includeArchived = new URL(request.url).searchParams.get("includeArchived") === "true";
    return Response.json({ groups: await listGroups(authorization, includeArchived) });
  } catch (error) {
    return routeError(error);
  }
}

export async function POST(request: Request) {
  const authorization = await authorizeRequest(request);
  if (authorization instanceof Response) return authorization;
  try {
    await ensureWorkspace(authorization.ownerId);
    const payload = (await request.json()) as Record<string, unknown>;
    const name = asString(payload.name);
    if (!name) return Response.json({ error: "name is required" }, { status: 400 });
    const color = payload.color === undefined ? undefined : asColor(payload.color);
    const visibility = payload.visibility === undefined ? undefined : asVisibility(payload.visibility);
    if (payload.color !== undefined && !color) return Response.json({ error: "supported color is required" }, { status: 400 });
    if (payload.visibility !== undefined && !visibility) return Response.json({ error: "supported visibility is required" }, { status: 400 });
    const group = await createGroup(authorization, {
      name,
      handle: asString(payload.handle) || undefined,
      description: asString(payload.description),
      color,
      visibility,
    });
    return Response.json({ group }, { status: 201 });
  } catch (error) {
    return routeError(error);
  }
}

export async function PATCH(request: Request) {
  const authorization = await authorizeRequest(request);
  if (authorization instanceof Response) return authorization;
  try {
    await ensureWorkspace(authorization.ownerId);
    const payload = (await request.json()) as Record<string, unknown>;
    const id = asString(payload.id);
    if (!id) return Response.json({ error: "id is required" }, { status: 400 });
    const color = payload.color === undefined ? undefined : asColor(payload.color);
    const visibility = payload.visibility === undefined ? undefined : asVisibility(payload.visibility);
    if (payload.color !== undefined && !color) return Response.json({ error: "supported color is required" }, { status: 400 });
    if (payload.visibility !== undefined && !visibility) return Response.json({ error: "supported visibility is required" }, { status: 400 });
    const group = await updateGroup(authorization, id, {
      name: typeof payload.name === "string" ? payload.name : undefined,
      handle: typeof payload.handle === "string" ? payload.handle : undefined,
      description: typeof payload.description === "string" ? payload.description : undefined,
      color,
      visibility,
      archived: typeof payload.archived === "boolean" ? payload.archived : undefined,
    });
    return Response.json({ group });
  } catch (error) {
    return routeError(error);
  }
}

export async function DELETE(request: Request) {
  const authorization = await authorizeRequest(request);
  if (authorization instanceof Response) return authorization;
  try {
    await ensureWorkspace(authorization.ownerId);
    const id = new URL(request.url).searchParams.get("id")?.trim() ?? "";
    if (!id) return Response.json({ error: "id is required" }, { status: 400 });
    return Response.json(await deleteGroup(authorization, id));
  } catch (error) {
    return routeError(error);
  }
}

function asColor(value: unknown): GroupColor | undefined {
  return typeof value === "string" && GROUP_COLORS.includes(value as GroupColor) ? value as GroupColor : undefined;
}

function asVisibility(value: unknown): GroupVisibility | undefined {
  return typeof value === "string" && GROUP_VISIBILITIES.includes(value as GroupVisibility) ? value as GroupVisibility : undefined;
}

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function routeError(error: unknown) {
  const message = error instanceof Error ? error.message : "Unexpected error";
  const status = /access is required|only an owner|only be changed/i.test(message)
    ? 403
    : /already|unique/i.test(message)
      ? 409
      : /required|unsupported|not found|archive|restore|characters/i.test(message)
        ? 400
        : 500;
  return Response.json({ error: message }, { status });
}
