import {
  authorizeRequest,
  ensureWorkspace,
  getDailyScrum,
  saveDailyScrum,
  serializeItem,
} from "@/lib/pace-data";

export async function GET(request: Request) {
  const authorization = await authorizeRequest(request);
  if (authorization instanceof Response) return authorization;

  try {
    await ensureWorkspace(authorization.ownerId);
    const date = new URL(request.url).searchParams.get("date") ?? today();
    return Response.json({ scrum: serializeScrum(await getDailyScrum(authorization.ownerId, date)) });
  } catch (error) {
    return routeError(error);
  }
}

export async function PUT(request: Request) {
  const authorization = await authorizeRequest(request);
  if (authorization instanceof Response) return authorization;

  try {
    await ensureWorkspace(authorization.ownerId);
    const payload = (await request.json()) as Record<string, unknown>;
    const date = typeof payload.date === "string" ? payload.date : today();
    const scrum = await saveDailyScrum(authorization.ownerId, date, {
      yesterdayNote: asText(payload.yesterdayNote),
      todayNote: asText(payload.todayNote),
      blockersNote: asText(payload.blockersNote),
    });
    return Response.json({ scrum: serializeScrum(scrum) });
  } catch (error) {
    return routeError(error);
  }
}

function serializeScrum(scrum: Awaited<ReturnType<typeof getDailyScrum>>) {
  return {
    ...scrum,
    yesterdayTasks: scrum.yesterdayTasks.map((item) => serializeItem(item)),
    todayTasks: scrum.todayTasks.map((item) => serializeItem(item)),
    blockers: scrum.blockers.map((item) => serializeItem(item)),
  };
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function asText(value: unknown) {
  return typeof value === "string" ? value : "";
}

function routeError(error: unknown) {
  const message = error instanceof Error ? error.message : "Unexpected error";
  const status = /date|invalid|required/i.test(message) ? 400 : 500;
  return Response.json({ error: message }, { status });
}
