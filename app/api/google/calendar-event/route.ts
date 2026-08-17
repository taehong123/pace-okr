import { env } from "cloudflare:workers";
import {
  authorizeRequest,
  ensureWorkspace,
  getGoogleCalendarEvent,
  getGoogleConnection,
  getItem,
  saveGoogleCalendarEvent,
} from "@/lib/pace-data";
import {
  decryptSecret,
  googleConfigured,
  refreshGoogleAccessToken,
  upsertGoogleCalendarEvent,
  type GoogleCalendarEventPayload,
  type GoogleRuntimeEnv,
} from "@/lib/google-oauth";

export async function POST(request: Request) {
  const authorization = await authorizeRequest(request);
  if (authorization instanceof Response) return authorization;
  await ensureWorkspace(authorization.ownerId);

  const runtime = env as GoogleRuntimeEnv;
  if (!googleConfigured(runtime)) {
    return Response.json({ error: "Google OAuth is not configured", code: "missing_google_config" }, { status: 503 });
  }

  const payload = await request.json() as Record<string, unknown>;
  const itemId = typeof payload.itemId === "string" ? payload.itemId : "";
  const item = itemId ? await getItem(authorization.ownerId, itemId) : null;
  if (!item) return Response.json({ error: "Task not found" }, { status: 404 });
  if (item.kind !== "task") return Response.json({ error: "Only tasks can be sent to Google Calendar" }, { status: 400 });
  if (!item.dueDate) return Response.json({ error: "Task needs a due date before calendar sync", code: "missing_due_date" }, { status: 400 });

  const connection = await getGoogleConnection(authorization.ownerId, authorization.userId);
  if (!connection) {
    return Response.json({ error: "Google account is not connected", code: "google_not_connected" }, { status: 409 });
  }

  try {
    const refreshToken = await decryptSecret(connection.encryptedRefreshToken, runtime.GOOGLE_TOKEN_ENCRYPTION_KEY!);
    const tokens = await refreshGoogleAccessToken(runtime, refreshToken);
    const savedEvent = await getGoogleCalendarEvent(authorization.ownerId, authorization.userId, item.id);
    const googleEvent = await upsertGoogleCalendarEvent(tokens.access_token, savedEvent?.googleEventId ?? null, taskToCalendarEvent(item));
    const event = await saveGoogleCalendarEvent({
      ownerId: authorization.ownerId,
      userId: authorization.userId,
      itemId: item.id,
      calendarId: "primary",
      googleEventId: googleEvent.id,
      htmlLink: googleEvent.htmlLink,
    });
    return Response.json({ event: { htmlLink: event.htmlLink, syncedAt: event.syncedAt } });
  } catch {
    return Response.json({ error: "Google Calendar sync failed", code: "google_calendar_sync_failed" }, { status: 502 });
  }
}

function taskToCalendarEvent(item: Awaited<ReturnType<typeof getItem>>): GoogleCalendarEventPayload {
  if (!item?.dueDate) throw new Error("Task needs a due date");
  return {
    summary: item.title,
    description: [
      "Created from OKRPTR.",
      `Status: ${item.status}`,
      `Priority: ${item.priority}`,
      `Progress: ${item.progress}%`,
      item.description ? `\n${item.description}` : "",
    ].filter(Boolean).join("\n"),
    start: { date: item.dueDate },
    end: { date: addDays(item.dueDate, 1) },
  };
}

function addDays(value: string, days: number) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
