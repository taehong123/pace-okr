import {
  authorizeRequest,
  createWorkspaceForUser,
  deleteWorkspaceForUser,
  ensureWorkspace,
  listUserWorkspaces,
  setActiveWorkspace,
} from "@/lib/pace-data";

export async function GET(request: Request) {
  const authorization = await authorizeRequest(request, { allowViewerWrite: true });
  if (authorization instanceof Response) return authorization;
  await ensureWorkspace(authorization.ownerId);
  return Response.json({
    workspaces: await listUserWorkspaces(authorization.userId, authorization.ownerId),
    currentWorkspaceId: authorization.ownerId,
  });
}

export async function POST(request: Request) {
  const authorization = await authorizeRequest(request, { allowViewerWrite: true });
  if (authorization instanceof Response) return authorization;
  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const workspace = await createWorkspaceForUser(
      authorization.userId,
      authorization.email,
      authorization.displayName,
      typeof payload.name === "string" ? payload.name : "",
    );
    await ensureWorkspace(workspace.id);
    return withWorkspaceCookie(Response.json({ workspace }, { status: 201 }), workspace.id, request);
  } catch (error) {
    return routeError(error);
  }
}

export async function PATCH(request: Request) {
  const authorization = await authorizeRequest(request, { allowViewerWrite: true });
  if (authorization instanceof Response) return authorization;
  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const workspaceId = typeof payload.workspaceId === "string" ? payload.workspaceId.trim() : "";
    if (!workspaceId) return Response.json({ error: "workspaceId is required" }, { status: 400 });
    await setActiveWorkspace(authorization.userId, workspaceId);
    await ensureWorkspace(workspaceId);
    return withWorkspaceCookie(Response.json({ currentWorkspaceId: workspaceId }), workspaceId, request);
  } catch (error) {
    return routeError(error);
  }
}

export async function DELETE(request: Request) {
  const authorization = await authorizeRequest(request, { allowViewerWrite: true });
  if (authorization instanceof Response) return authorization;
  try {
    const workspaceId = new URL(request.url).searchParams.get("workspaceId")?.trim() ?? "";
    if (!workspaceId) return Response.json({ error: "workspaceId is required" }, { status: 400 });
    const result = await deleteWorkspaceForUser(authorization.userId, workspaceId);
    return withWorkspaceCookie(Response.json(result), result.nextWorkspaceId, request);
  } catch (error) {
    return routeError(error);
  }
}

function withWorkspaceCookie(response: Response, workspaceId: string, request: Request) {
  const headers = new Headers(response.headers);
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  headers.append(
    "Set-Cookie",
    `okrptr_workspace_id=${encodeURIComponent(workspaceId)}; Path=/; HttpOnly${secure}; SameSite=Lax; Max-Age=31536000`,
  );
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function routeError(error: unknown) {
  const message = error instanceof Error ? error.message : "Unexpected error";
  const status = /owner|personal|access/i.test(message)
    ? 403
    : /required|characters|not found|keep another/i.test(message)
      ? 400
      : 500;
  return Response.json({ error: message }, { status });
}
