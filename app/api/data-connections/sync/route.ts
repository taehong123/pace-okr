import { authorizeRequest, ensureWorkspace, syncDataConnection } from "@/lib/pace-data";

export async function POST(request: Request) {
  const authorization = await authorizeRequest(request);
  if (authorization instanceof Response) return authorization;
  try {
    await ensureWorkspace(authorization.ownerId);
    const payload = await request.json() as Record<string, unknown>;
    const id = typeof payload.id === "string" ? payload.id.trim() : "";
    if (!id) return Response.json({ error: "id is required" }, { status: 400 });
    return Response.json(await syncDataConnection(authorization.ownerId, id));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    const status = /not found|required|API|numeric|path|timed out|HTTPS|Private|target/i.test(message) ? 400 : 500;
    return Response.json({ error: message }, { status });
  }
}
