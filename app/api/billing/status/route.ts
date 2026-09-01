import { getBillingStatus } from "@/lib/billing";
import { authorizeRequest } from "@/lib/pace-data";

export async function GET(request: Request) {
  const authorization = await authorizeRequest(request, { allowViewerWrite: true });
  if (authorization instanceof Response) return authorization;
  try {
    return Response.json(await getBillingStatus(authorization.ownerId, authorization.userId, authorization.role), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "결제 정보를 불러오지 못했습니다." }, { status: 500 });
  }
}
