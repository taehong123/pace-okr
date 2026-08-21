import {
  OKR_CYCLE_STATUSES,
  authorizeRequest,
  createOkrCycle,
  deleteOkrCycle,
  ensureWorkspace,
  listOkrCycles,
  updateOkrCycle,
  type OkrCycleStatus,
} from "@/lib/pace-data";

export async function GET(request: Request) {
  const authorization = await authorizeRequest(request);
  if (authorization instanceof Response) return authorization;

  await ensureWorkspace(authorization.ownerId);
  const cycles = await listOkrCycles(authorization.ownerId);
  return Response.json({ cycles });
}

export async function POST(request: Request) {
  const authorization = await authorizeRequest(request, { allowViewerWrite: false });
  if (authorization instanceof Response) return authorization;

  try {
    await ensureWorkspace(authorization.ownerId);
    const payload = (await request.json()) as Record<string, unknown>;
    const cycle = await createOkrCycle(authorization.ownerId, {
      name: asOptionalString(payload.name),
      department: asString(payload.department),
      startDate: asOptionalString(payload.startDate),
      endDate: asOptionalString(payload.endDate),
      status: asCycleStatus(payload.status) ?? "planned",
    });
    return Response.json({ cycle }, { status: 201 });
  } catch (error) {
    return routeError(error);
  }
}

export async function PATCH(request: Request) {
  const authorization = await authorizeRequest(request, { allowViewerWrite: false });
  if (authorization instanceof Response) return authorization;

  try {
    await ensureWorkspace(authorization.ownerId);
    const payload = (await request.json()) as Record<string, unknown>;
    const id = asOptionalString(payload.id);
    if (!id) return Response.json({ error: "id is required" }, { status: 400 });
    const cycle = await updateOkrCycle(authorization.ownerId, id, {
      name: asOptionalString(payload.name),
      department: payload.department === undefined ? undefined : asString(payload.department),
      startDate: asOptionalString(payload.startDate),
      endDate: asOptionalString(payload.endDate),
      status: asCycleStatus(payload.status),
    });
    return Response.json({ cycle });
  } catch (error) {
    return routeError(error);
  }
}

export async function DELETE(request: Request) {
  const authorization = await authorizeRequest(request, { allowViewerWrite: false });
  if (authorization instanceof Response) return authorization;

  try {
    await ensureWorkspace(authorization.ownerId);
    const id = new URL(request.url).searchParams.get("id")?.trim();
    if (!id) return Response.json({ error: "id is required" }, { status: 400 });
    const result = await deleteOkrCycle(authorization.ownerId, id);
    return Response.json(result);
  } catch (error) {
    return routeError(error);
  }
}

function asOptionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : undefined;
}

function asCycleStatus(value: unknown): OkrCycleStatus | undefined {
  return typeof value === "string" && OKR_CYCLE_STATUSES.includes(value as OkrCycleStatus) ? value as OkrCycleStatus : undefined;
}

function routeError(error: unknown) {
  const message = error instanceof Error ? error.message : "Unexpected error";
  const status = /required|unsupported|not found|at least/i.test(message) ? 400 : 500;
  return Response.json({ error: message }, { status });
}
