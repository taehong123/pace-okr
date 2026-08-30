import { authorizeRequest } from "@/lib/pace-data";
import { getSlackDailyPreference, updateSlackDailyPreference } from "@/lib/slack-daily";

export async function GET(request: Request) {
  const authorization = await authorizeRequest(request, { allowViewerWrite: true });
  if (authorization instanceof Response) return authorization;
  try { return Response.json(await getSlackDailyPreference(authorization)); } catch (error) { return routeError(error); }
}

export async function PATCH(request: Request) {
  const authorization = await authorizeRequest(request);
  if (authorization instanceof Response) return authorization;
  try {
    const payload = await request.json() as Record<string, unknown>;
    return Response.json(await updateSlackDailyPreference(authorization, {
      enabled: typeof payload.enabled === "boolean" ? payload.enabled : undefined,
      reminderTime: payload.reminderTime === null || typeof payload.reminderTime === "string" ? payload.reminderTime : undefined,
      timezone: payload.timezone === null || typeof payload.timezone === "string" ? payload.timezone : undefined,
    }));
  } catch (error) { return routeError(error); }
}

function routeError(error: unknown) {
  return Response.json({ error: error instanceof Error ? error.message : "개인 Slack 알림 설정을 처리하지 못했습니다." }, { status: 400 });
}
