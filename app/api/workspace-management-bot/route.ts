import { authorizeRequest, canManageTeam, ensureWorkspace } from "@/lib/pace-data";
import { getWorkspaceManagementBot, managementBotSignalIds, testWorkspaceManagementBot, updateWorkspaceManagementBot, type ManagementBotSignal } from "@/lib/workspace-management-bot";

export async function GET(request: Request) {
  const authorization = await authorizeRequest(request, { allowViewerWrite: true });
  if (authorization instanceof Response) return authorization;
  try {
    await ensureWorkspace(authorization.ownerId);
    const url = new URL(request.url);
    const date = url.searchParams.get("date") ?? undefined;
    const mode = url.searchParams.get("mode") ?? "full";
    if (mode === "settings") {
      return Response.json(await getWorkspaceManagementBot(authorization.ownerId, { includeChannels: canManageTeam(authorization), includeSnapshot: false }));
    }
    if (mode === "summary") {
      const data = await getWorkspaceManagementBot(authorization.ownerId, { includeChannels: false, date, snapshotSignals: [...managementBotSignalIds] });
      return Response.json({ snapshot: data.snapshot });
    }
    if (mode !== "full") return Response.json({ error: "지원하지 않는 응답 모드입니다." }, { status: 400 });
    return Response.json(await getWorkspaceManagementBot(authorization.ownerId, { includeChannels: canManageTeam(authorization), date }));
  } catch (error) { return routeError(error); }
}

export async function PATCH(request: Request) {
  const authorization = await authorizeRequest(request);
  if (authorization instanceof Response) return authorization;
  if (!canManageTeam(authorization)) return Response.json({ error: "Owner 또는 Admin 권한이 필요합니다." }, { status: 403 });
  try {
    await ensureWorkspace(authorization.ownerId);
    const settingsOnly = new URL(request.url).searchParams.get("mode") === "settings";
    const payload = await request.json() as Record<string, unknown>;
    if (payload.action === "test") return Response.json(await testWorkspaceManagementBot(authorization.ownerId));
    return Response.json(await updateWorkspaceManagementBot(authorization.ownerId, {
      enabled: typeof payload.enabled === "boolean" ? payload.enabled : undefined,
      weekdays: Array.isArray(payload.weekdays) ? payload.weekdays.map(Number) : undefined,
      reportTime: typeof payload.reportTime === "string" ? payload.reportTime : undefined,
      timezone: typeof payload.timezone === "string" ? payload.timezone : undefined,
      channelId: typeof payload.channelId === "string" ? payload.channelId : undefined,
      signals: Array.isArray(payload.signals) ? payload.signals.filter((value): value is ManagementBotSignal => typeof value === "string") as ManagementBotSignal[] : undefined,
    }, { includeChannels: canManageTeam(authorization), includeSnapshot: !settingsOnly }));
  } catch (error) { return routeError(error); }
}

function routeError(error: unknown) {
  const message = error instanceof Error ? error.message : "워크스페이스 관리 봇 설정을 처리하지 못했습니다.";
  const status = /필요|선택|시간|시간대|요일|날짜|채널|연결|항목/i.test(message) ? 400 : 500;
  return Response.json({ error: message }, { status });
}
