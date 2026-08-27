import {
  ROUTINE_CADENCES,
  authorizeRequest,
  createRoutine,
  deleteRoutine,
  ensureWorkspace,
  listRoutines,
  serializeRoutine,
  updateRoutine,
  type RoutineCadence,
} from "@/lib/pace-data";

export async function GET(request: Request) {
  const authorization = await authorizeRequest(request);
  if (authorization instanceof Response) return authorization;
  try {
    await ensureWorkspace(authorization.ownerId);
    const url = new URL(request.url);
    const date = url.searchParams.get("date") ?? today();
    const includeInactive = url.searchParams.get("includeInactive") !== "false";
    return Response.json({ routines: await listRoutines(authorization.ownerId, date, includeInactive) });
  } catch (error) {
    return routeError(error);
  }
}

export async function POST(request: Request) {
  const authorization = await authorizeRequest(request);
  if (authorization instanceof Response) return authorization;
  try {
    await ensureWorkspace(authorization.ownerId);
    const payload = (await request.json()) as Record<string, unknown>;
    const title = asString(payload.title);
    const cadence = payload.cadence === undefined ? "daily" : asCadence(payload.cadence);
    if (!title) return Response.json({ error: "title is required" }, { status: 400 });
    if (!cadence) return Response.json({ error: "supported cadence is required" }, { status: 400 });
    const routine = await createRoutine(authorization.ownerId, {
      title,
      description: asString(payload.description),
      triggerPoint: asString(payload.triggerPoint),
      actionPlace: asString(payload.actionPlace),
      actionSteps: asString(payload.actionSteps),
      cadence,
      active: typeof payload.active === "boolean" ? payload.active : true,
      assigneeMemberId: asNullableString(payload.assigneeMemberId),
    });
    return Response.json({ routine: serializeRoutine(routine, asDate(payload.date)) }, { status: 201 });
  } catch (error) {
    return routeError(error);
  }
}

export async function PATCH(request: Request) {
  const authorization = await authorizeRequest(request);
  if (authorization instanceof Response) return authorization;
  try {
    await ensureWorkspace(authorization.ownerId);
    const payload = (await request.json()) as Record<string, unknown>;
    const id = asString(payload.id);
    if (!id) return Response.json({ error: "id is required" }, { status: 400 });
    const cadence = payload.cadence === undefined ? undefined : asCadence(payload.cadence);
    if (payload.cadence !== undefined && !cadence) {
      return Response.json({ error: "supported cadence is required" }, { status: 400 });
    }
    const routine = await updateRoutine(authorization.ownerId, id, {
      title: typeof payload.title === "string" ? payload.title : undefined,
      description: typeof payload.description === "string" ? payload.description : undefined,
      triggerPoint: typeof payload.triggerPoint === "string" ? payload.triggerPoint : undefined,
      actionPlace: typeof payload.actionPlace === "string" ? payload.actionPlace : undefined,
      actionSteps: typeof payload.actionSteps === "string" ? payload.actionSteps : undefined,
      cadence,
      active: typeof payload.active === "boolean" ? payload.active : undefined,
      assigneeMemberId: payload.assigneeMemberId === undefined ? undefined : asNullableString(payload.assigneeMemberId),
    });
    return Response.json({ routine: serializeRoutine(routine, asDate(payload.date)) });
  } catch (error) {
    return routeError(error);
  }
}

export async function DELETE(request: Request) {
  const authorization = await authorizeRequest(request);
  if (authorization instanceof Response) return authorization;
  try {
    await ensureWorkspace(authorization.ownerId);
    const id = new URL(request.url).searchParams.get("id")?.trim();
    if (!id) return Response.json({ error: "id is required" }, { status: 400 });
    await deleteRoutine(authorization.ownerId, id);
    return Response.json({ deleted: true, id });
  } catch (error) {
    return routeError(error);
  }
}

function asCadence(value: unknown): RoutineCadence | undefined {
  return typeof value === "string" && ROUTINE_CADENCES.includes(value as RoutineCadence)
    ? value as RoutineCadence
    : undefined;
}

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asNullableString(value: unknown) {
  const normalized = asString(value);
  return normalized || null;
}

function asDate(value: unknown) {
  return typeof value === "string" ? value : today();
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function routeError(error: unknown) {
  const message = error instanceof Error ? error.message : "Unexpected error";
  const status = /required|unsupported|not found|date|invalid|protected|cannot/i.test(message) ? 400 : 500;
  return Response.json({ error: message }, { status });
}
