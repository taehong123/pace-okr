import { authorizeRequest, canManageTeam } from "@/lib/pace-data";
import { manageSlackMemberConnections } from "@/lib/slack-daily";
import { slackErrorMessage } from "@/lib/slack-display";

export async function GET(request: Request) {
  const authorization = await authorizeRequest(request, { allowViewerWrite: true });
  if (authorization instanceof Response) return authorization;
  if (!canManageTeam(authorization)) return Response.json({ error: "Owner 또는 Admin 권한이 필요합니다." }, { status: 403 });
  try { return Response.json(await manageSlackMemberConnections(authorization)); }
  catch (error) { return Response.json({ error: slackErrorMessage(error, "Slack 사용자 목록을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.") }, { status: 502 }); }
}

export async function POST(request: Request) {
  const authorization = await authorizeRequest(request);
  if (authorization instanceof Response) return authorization;
  if (!canManageTeam(authorization) || authorization.apiToken || request.headers.get("origin") !== new URL(request.url).origin) return Response.json({ error: "워크스페이스 관리자 화면에서 연결해 주세요." }, { status: 403 });
  const body = await request.json().catch(() => null) as { action?: unknown; confirmed?: unknown; memberId?: unknown; slackUserId?: unknown } | null;
  if (body?.action !== "sync" && !(body?.action === "link" && body.confirmed === true && typeof body.memberId === "string" && typeof body.slackUserId === "string")) return Response.json({ error: "연결할 멤버와 Slack 계정을 확인해 주세요." }, { status: 400 });
  try { return Response.json(await manageSlackMemberConnections(authorization, body.action === "sync" ? { type: "sync" } : { type: "link", memberId: body.memberId as string, slackUserId: body.slackUserId as string })); }
  catch { return Response.json({ error: "연결하지 못했습니다. 이미 연결된 계정 또는 변경된 멤버인지 다시 확인해 주세요." }, { status: 409 }); }
}
