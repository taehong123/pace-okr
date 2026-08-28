import {
  authorizeRequest,
  createProjectTemplate,
  deleteProjectTemplate,
  ensureWorkspace,
  listProjectTemplates,
  updateProjectTemplate,
} from "@/lib/pace-data";

export async function GET(request: Request) {
  const authorization = await authorizeRequest(request, { allowViewerWrite: true });
  if (authorization instanceof Response) return authorization;
  try {
    await ensureWorkspace(authorization.ownerId);
    return Response.json({ templates: await listProjectTemplates(authorization.ownerId) });
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
    const name = typeof payload.name === "string" ? payload.name : "";
    const template = await createProjectTemplate(authorization.ownerId, {
      name,
      description: typeof payload.description === "string" ? payload.description : "",
      content: typeof payload.content === "string" ? payload.content : "[]",
      plainText: typeof payload.plainText === "string" ? payload.plainText : "",
      userId: authorization.userId,
    });
    return Response.json({ template }, { status: 201 });
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
    const id = typeof payload.id === "string" ? payload.id.trim() : "";
    if (!id) return Response.json({ error: "id is required" }, { status: 400 });
    const template = await updateProjectTemplate(authorization.ownerId, id, {
      name: typeof payload.name === "string" ? payload.name : undefined,
      description: typeof payload.description === "string" ? payload.description : undefined,
      content: typeof payload.content === "string" ? payload.content : undefined,
      plainText: typeof payload.plainText === "string" ? payload.plainText : undefined,
    });
    return Response.json({ template });
  } catch (error) {
    return routeError(error);
  }
}

export async function DELETE(request: Request) {
  const authorization = await authorizeRequest(request);
  if (authorization instanceof Response) return authorization;
  try {
    await ensureWorkspace(authorization.ownerId);
    const id = new URL(request.url).searchParams.get("id")?.trim();
    if (!id) return Response.json({ error: "id is required" }, { status: 400 });
    return Response.json(await deleteProjectTemplate(authorization.ownerId, id));
  } catch (error) {
    return routeError(error);
  }
}

function routeError(error: unknown) {
  const message = error instanceof Error ? error.message : "Unexpected error";
  const status = /required|not found|already exists|too long|large|block/i.test(message) ? 400 : 500;
  return Response.json({ error: message }, { status });
}
