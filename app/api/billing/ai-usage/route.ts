import { getAiUsageStatus } from "@/lib/billing";
import { authorizeRequest } from "@/lib/pace-data";

export async function GET(request: Request) {
  const authorization = await authorizeRequest(request, { allowViewerWrite: true });
  if (authorization instanceof Response) return authorization;
  try {
    return Response.json({
      workspaceId: authorization.ownerId,
      userId: authorization.userId,
      ai: await getAiUsageStatus(authorization.ownerId),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "AI 사용량을 확인하지 못했습니다." }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
