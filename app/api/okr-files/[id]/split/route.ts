import { authorizeRequest, ensureWorkspace } from "@/lib/pace-data";
import { splitOkrFile } from "@/lib/okr-files";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const authorization = await authorizeRequest(request, { allowViewerWrite: false });
  if (authorization instanceof Response) return authorization;
  try {
    await ensureWorkspace(authorization.ownerId);
    const { id } = await context.params;
    return Response.json(await splitOkrFile(authorization.ownerId, authorization.userId, id));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return Response.json({ error: message }, { status: /not found|required|split/i.test(message) ? 400 : 500 });
  }
}
