import {
  authorizeRequest,
  canManageTeam,
  resendWorkspaceInvitation,
  revokeWorkspaceInvitation,
  rotateWorkspaceInvitationLink,
} from "@/lib/pace-data";

export async function POST(request: Request) {
  const authorization = await authorizeRequest(request);
  if (authorization instanceof Response) return authorization;
  if (!canManageTeam(authorization)) return Response.json({ error: "Owner or Admin access is required." }, { status: 403 });
  try {
    const payload = await request.json() as Record<string, unknown>;
    const id = typeof payload.id === "string" ? payload.id.trim() : "";
    const action = payload.action === "link" ? "link" : payload.action === "resend" ? "resend" : null;
    if (!id || !action) return Response.json({ error: "id and supported action are required" }, { status: 400 });
    const result = action === "link"
      ? await rotateWorkspaceInvitationLink(authorization.ownerId, id)
      : await resendWorkspaceInvitation(authorization.ownerId, id);
    return Response.json(result);
  } catch (error) {
    return routeError(error);
  }
}

export async function DELETE(request: Request) {
  const authorization = await authorizeRequest(request);
  if (authorization instanceof Response) return authorization;
  if (!canManageTeam(authorization)) return Response.json({ error: "Owner or Admin access is required." }, { status: 403 });
  try {
    const id = new URL(request.url).searchParams.get("id")?.trim() ?? "";
    if (!id) return Response.json({ error: "id is required" }, { status: 400 });
    return Response.json(await revokeWorkspaceInvitation(authorization.ownerId, id));
  } catch (error) {
    return routeError(error);
  }
}

function routeError(error: unknown) {
  const message = error instanceof Error ? error.message : "Unexpected error";
  const status = /owner or admin|access/i.test(message) ? 403 : /required|not found|pending|wait/i.test(message) ? 400 : 500;
  return Response.json({ error: message }, { status });
}
