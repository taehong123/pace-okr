import { authorizeRequest, canManageTeam } from "@/lib/pace-data";
import { listSlackChannels } from "@/lib/slack-daily";

export async function GET(request: Request) {
  const authorization = await authorizeRequest(request, { allowViewerWrite: true });
  if (authorization instanceof Response) return authorization;
  if (!canManageTeam(authorization)) return Response.json({ error: "Owner 또는 Admin 권한이 필요합니다." }, { status: 403 });
  try {
    const includeJoinablePublic = new URL(request.url).searchParams.get("joinable") === "1";
    return Response.json(
      { channels: await listSlackChannels(authorization.ownerId, { includeJoinablePublic }), observedAt: new Date().toISOString() },
      { headers: { "Cache-Control": "private, no-store, max-age=0" } },
    );
  }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Slack 채널을 불러오지 못했습니다." }, { status: 502 }); }
}
