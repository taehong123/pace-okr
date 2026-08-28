import {
  applyProjectTemplate,
  authorizeRequest,
  ensureWorkspace,
  getProjectDocument,
  saveProjectDocument,
} from "@/lib/pace-data";

export async function GET(request: Request) {
  const authorization = await authorizeRequest(request, { allowViewerWrite: true });
  if (authorization instanceof Response) return authorization;
  try {
    await ensureWorkspace(authorization.ownerId);
    const projectId = new URL(request.url).searchParams.get("projectId")?.trim();
    if (!projectId) return Response.json({ error: "projectId is required" }, { status: 400 });
    return Response.json({ document: await getProjectDocument(authorization.ownerId, projectId) });
  } catch (error) {
    return routeError(error);
  }
}

export async function PUT(request: Request) {
  const authorization = await authorizeRequest(request);
  if (authorization instanceof Response) return authorization;
  try {
    await ensureWorkspace(authorization.ownerId);
    const payload = await request.json() as Record<string, unknown>;
    const projectId = typeof payload.projectId === "string" ? payload.projectId.trim() : "";
    const content = typeof payload.content === "string" ? payload.content : "";
    const plainText = typeof payload.plainText === "string" ? payload.plainText : "";
    const expectedVersion = typeof payload.expectedVersion === "number" ? payload.expectedVersion : -1;
    if (!projectId || !content || expectedVersion < 0) return Response.json({ error: "projectId, content, and expectedVersion are required" }, { status: 400 });
    const document = await saveProjectDocument(authorization.ownerId, projectId, { content, plainText, expectedVersion, userId: authorization.userId });
    return Response.json({ document });
  } catch (error) {
    return routeError(error);
  }
}

export async function POST(request: Request) {
  const authorization = await authorizeRequest(request);
  if (authorization instanceof Response) return authorization;
  try {
    await ensureWorkspace(authorization.ownerId);
    const payload = await request.json() as Record<string, unknown>;
    const projectId = typeof payload.projectId === "string" ? payload.projectId.trim() : "";
    const templateId = typeof payload.templateId === "string" ? payload.templateId.trim() : "";
    if (!projectId || !templateId) return Response.json({ error: "projectId and templateId are required" }, { status: 400 });
    const document = await applyProjectTemplate(authorization.ownerId, projectId, templateId, authorization.userId);
    return Response.json({ document });
  } catch (error) {
    return routeError(error);
  }
}

function routeError(error: unknown) {
  const message = error instanceof Error ? error.message : "Unexpected error";
  const status = /version conflict/i.test(message) ? 409 : /required|not found|restore|valid|large|block/i.test(message) ? 400 : 500;
  return Response.json({ error: message }, { status });
}
