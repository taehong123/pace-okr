import { authorizeRequest } from "@/lib/pace-data";
import { consumeSlackMemberLink } from "@/lib/slack-daily";

export async function POST(request: Request) {
  const authorization = await authorizeRequest(request);
  if (authorization instanceof Response) return authorization;
  try {
    const payload = await request.json() as { token?: string };
    if (!payload.token) throw new Error("Slack 연결 토큰이 필요합니다.");
    return Response.json(await consumeSlackMemberLink(authorization, payload.token));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Slack 사용자를 연결하지 못했습니다." }, { status: 400 });
  }
}
