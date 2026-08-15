import { authorizeRequest, ensureWorkspace, getRecommendations } from "@/lib/pace-data";

export async function GET(request: Request) {
  const authorization = authorizeRequest(request);
  if (authorization instanceof Response) return authorization;

  try {
    await ensureWorkspace(authorization.ownerId);
    const date = new URL(request.url).searchParams.get("date") ?? undefined;
    const recommendations = await getRecommendations(authorization.ownerId, date);
    return Response.json({ recommendations });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    const status = /date|invalid/i.test(message) ? 400 : 500;
    return Response.json({ error: message }, { status });
  }
}
