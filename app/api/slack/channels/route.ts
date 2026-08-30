import { authorizeRequest, canManageTeam } from "@/lib/pace-data";
import { listSlackChannels } from "@/lib/slack-daily";

export async function GET(request: Request) {
  const authorization = await authorizeRequest(request, { allowViewerWrite: true });
  if (authorization instanceof Response) return authorization;
  if (!canManageTeam(authorization)) return Response.json({ error: "Owner 또는 Admin 권한이 필요합니다." }, { status: 403 });
  try { return Response.json({ channels: await listSlackChannels(authorization.ownerId) }); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Slack 채널을 불러오지 못했습니다." }, { status: 502 }); }
}
