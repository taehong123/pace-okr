import {
  GROUP_ROLES,
  addGroupMember,
  authorizeRequest,
  ensureWorkspace,
  listGroupMembers,
  removeGroupMember,
  updateGroupMember,
  type GroupRole,
} from "@/lib/pace-data";

export async function GET(request: Request) {
  const authorization = await authorizeRequest(request);
  if (authorization instanceof Response) return authorization;
  try {
    await ensureWorkspace(authorization.ownerId);
    const groupId = new URL(request.url).searchParams.get("groupId")?.trim() ?? "";
    if (!groupId) return Response.json({ error: "groupId is required" }, { status: 400 });
    return Response.json(await listGroupMembers(authorization, groupId));
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
    const groupId = asString(payload.groupId);
    const memberId = asString(payload.memberId);
    const role = payload.role === undefined ? "member" : asRole(payload.role);
    if (!groupId || !memberId) return Response.json({ error: "groupId and memberId are required" }, { status: 400 });
    if (!role) return Response.json({ error: "supported role is required" }, { status: 400 });
    return Response.json({ member: await addGroupMember(authorization, groupId, memberId, role) }, { status: 201 });
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
    const groupId = asString(payload.groupId);
    const memberId = asString(payload.memberId);
    const role = asRole(payload.role);
    if (!groupId || !memberId || !role) return Response.json({ error: "groupId, memberId, and supported role are required" }, { status: 400 });
    return Response.json({ member: await updateGroupMember(authorization, groupId, memberId, role) });
  } catch (error) {
    return routeError(error);
  }
}

export async function DELETE(request: Request) {
  const authorization = await authorizeRequest(request);
  if (authorization instanceof Response) return authorization;
  try {
    await ensureWorkspace(authorization.ownerId);
    const url = new URL(request.url);
    const groupId = url.searchParams.get("groupId")?.trim() ?? "";
    const memberId = url.searchParams.get("memberId")?.trim() ?? "";
    if (!groupId || !memberId) return Response.json({ error: "groupId and memberId are required" }, { status: 400 });
    return Response.json(await removeGroupMember(authorization, groupId, memberId));
  } catch (error) {
    return routeError(error);
  }
}

function asRole(value: unknown): GroupRole | undefined {
  return typeof value === "string" && GROUP_ROLES.includes(value as GroupRole) ? value as GroupRole : undefined;
}

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function routeError(error: unknown) {
  const message = error instanceof Error ? error.message : "Unexpected error";
  const status = /access is required/i.test(message)
    ? 403
    : /already|unique/i.test(message)
      ? 409
      : /required|unsupported|not found|restore|cannot/i.test(message)
        ? 400
        : 500;
  return Response.json({ error: message }, { status });
}
