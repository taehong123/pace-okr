import { authorizeRequest, ensureWorkspace, ItemDeletePermissionError } from "@/lib/pace-data";
import { createOkrFile, OkrFileConflictError, type OkrFileSaveInput } from "@/lib/okr-files";

export async function POST(request: Request) {
  const authorization = await authorizeRequest(request, { allowViewerWrite: false });
  if (authorization instanceof Response) return authorization;
  try {
    await ensureWorkspace(authorization.ownerId);
    const payload = await request.json() as OkrFileSaveInput;
    const file = await createOkrFile(authorization.ownerId, authorization.userId, payload);
    return Response.json({ file }, { status: 201 });
  } catch (error) {
    return routeError(error);
  }
}

function routeError(error: unknown) {
  const message = error instanceof Error ? error.message : "Unexpected error";
  if (error instanceof OkrFileConflictError) return Response.json({ error: message }, { status: 409 });
  if (error instanceof ItemDeletePermissionError || /cannot move .* to trash/i.test(message)) return Response.json({ error: message }, { status: 403 });
  const status = /required|invalid|unsupported|at most|before|belong|available|split|resolution|target/i.test(message) ? 400 : 500;
  return Response.json({ error: message }, { status });
}
