import {
  TEAM_ROLES,
  authorizeRequest,
  canManageTeam,
  ensureWorkspace,
  getTeam,
  inviteTeamMember,
  removeTeamMember,
  updateTeamMember,
  type TeamRole,
} from "@/lib/pace-data";

export async function GET(request: Request) {
  const authorization = await authorizeRequest(request);
  if (authorization instanceof Response) return authorization;
  try {
    await ensureWorkspace(authorization.ownerId);
    return Response.json({
      ...(await getTeam(authorization.ownerId, authorization.userId)),
      currentRole: authorization.role,
      canManage: canManageTeam(authorization),
    });
  } catch (error) {
    return routeError(error);
  }
}

export async function POST(request: Request) {
  const authorization = await authorizeRequest(request);
  if (authorization instanceof Response) return authorization;
  if (!canManageTeam(authorization)) return forbidden();
  try {
    await ensureWorkspace(authorization.ownerId);
    const payload = (await request.json()) as Record<string, unknown>;
    const email = typeof payload.email === "string" ? payload.email : "";
    const role = asAssignableRole(payload.role);
    if (!role) return Response.json({ error: "supported role is required" }, { status: 400 });
    const member = await inviteTeamMember(authorization.ownerId, authorization.userId, email, role);
    return Response.json({ member }, { status: 201 });
  } catch (error) {
    return routeError(error);
  }
}

export async function PATCH(request: Request) {
  const authorization = await authorizeRequest(request);
  if (authorization instanceof Response) return authorization;
  if (!canManageTeam(authorization)) return forbidden();
  try {
    await ensureWorkspace(authorization.ownerId);
    const payload = (await request.json()) as Record<string, unknown>;
    const id = typeof payload.id === "string" ? payload.id.trim() : "";
    const role = asAssignableRole(payload.role);
    if (!id || !role) return Response.json({ error: "id and supported role are required" }, { status: 400 });
    const member = await updateTeamMember(authorization.ownerId, id, role, authorization.userId);
    return Response.json({ member });
  } catch (error) {
    return routeError(error);
  }
}

export async function DELETE(request: Request) {
  const authorization = await authorizeRequest(request);
  if (authorization instanceof Response) return authorization;
  if (!canManageTeam(authorization)) return forbidden();
  try {
    await ensureWorkspace(authorization.ownerId);
    const id = new URL(request.url).searchParams.get("id")?.trim() ?? "";
    if (!id) return Response.json({ error: "id is required" }, { status: 400 });
    return Response.json(await removeTeamMember(authorization.ownerId, id, authorization.userId));
  } catch (error) {
    return routeError(error);
  }
}

function asAssignableRole(value: unknown): Exclude<TeamRole, "owner"> | null {
  return typeof value === "string" && TEAM_ROLES.includes(value as TeamRole) && value !== "owner"
    ? value as Exclude<TeamRole, "owner">
    : null;
}

function forbidden() {
  return Response.json({ error: "Owner or Admin access is required." }, { status: 403 });
}

function routeError(error: unknown) {
  const message = error instanceof Error ? error.message : "Unexpected error";
  const status = /already/i.test(message) ? 409 : /required|unsupported|not found|cannot/i.test(message) ? 400 : 500;
  return Response.json({ error: message }, { status });
}
