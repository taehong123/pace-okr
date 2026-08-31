import { authorizeRequest, ensureWorkspace, ItemDeletePermissionError } from "@/lib/pace-data";
import { getOkrFile, OkrFileConflictError, updateOkrFile, type OkrFileSaveInput } from "@/lib/okr-files";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const authorization = await authorizeRequest(request);
  if (authorization instanceof Response) return authorization;
  try {
    await ensureWorkspace(authorization.ownerId);
    const { id } = await context.params;
    const file = await getOkrFile(authorization.ownerId, authorization.userId, id);
    return Response.json({ file });
  } catch (error) {
    return routeError(error);
  }
}

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const authorization = await authorizeRequest(request, { allowViewerWrite: false });
  if (authorization instanceof Response) return authorization;
  try {
    await ensureWorkspace(authorization.ownerId);
    const { id } = await context.params;
    const payload = await request.json() as OkrFileSaveInput;
    const file = await updateOkrFile(authorization.ownerId, authorization.userId, id, payload);
    return Response.json({ file });
  } catch (error) {
    return routeError(error);
  }
}

function routeError(error: unknown) {
  const message = error instanceof Error ? error.message : "Unexpected error";
  if (error instanceof OkrFileConflictError) return Response.json({ error: message }, { status: 409 });
  if (error instanceof ItemDeletePermissionError || /cannot move .* to trash/i.test(message)) return Response.json({ error: message }, { status: 403 });
  const status = /required|invalid|unsupported|at most|before|belong|available|not found|split|resolution|target/i.test(message) ? 400 : 500;
  return Response.json({ error: message }, { status });
}
