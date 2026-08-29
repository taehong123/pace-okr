import {
  KR_DATA_CADENCES,
  authorizeRequest,
  createKrDataConnection,
  deleteKrDataConnection,
  ensureWorkspace,
  listKrDataConnections,
  updateKrDataConnection,
  type KrDataCadence,
} from "@/lib/pace-data";

export async function GET(request: Request) {
  const authorization = await authorizeRequest(request, { allowViewerWrite: true });
  if (authorization instanceof Response) return authorization;
  try {
    await ensureWorkspace(authorization.ownerId);
    return Response.json({ connections: await listKrDataConnections(authorization.ownerId) });
  } catch (error) {
    return routeError(error);
  }
}

export async function POST(request: Request) {
  const authorization = await authorizeRequest(request);
  if (authorization instanceof Response) return authorization;
  try {
    await ensureWorkspace(authorization.ownerId);
    const payload = await request.json() as Record<string, unknown>;
    const connection = await createKrDataConnection(authorization.ownerId, authorization.userId, connectionInput(payload));
    return Response.json({ connection }, { status: 201 });
  } catch (error) {
    return routeError(error);
  }
}

export async function PATCH(request: Request) {
  const authorization = await authorizeRequest(request);
  if (authorization instanceof Response) return authorization;
  try {
    await ensureWorkspace(authorization.ownerId);
    const payload = await request.json() as Record<string, unknown>;
    const id = text(payload.id);
    if (!id) return Response.json({ error: "id is required" }, { status: 400 });
    const connection = await updateKrDataConnection(authorization.ownerId, id, connectionInput(payload));
    return Response.json({ connection });
  } catch (error) {
    return routeError(error);
  }
}

export async function DELETE(request: Request) {
  const authorization = await authorizeRequest(request);
  if (authorization instanceof Response) return authorization;
  try {
    await ensureWorkspace(authorization.ownerId);
    const id = new URL(request.url).searchParams.get("id")?.trim() ?? "";
    if (!id) return Response.json({ error: "id is required" }, { status: 400 });
    return Response.json(await deleteKrDataConnection(authorization.ownerId, id));
  } catch (error) {
    return routeError(error);
  }
}

function connectionInput(payload: Record<string, unknown>) {
  return {
    krItemId: optionalText(payload.krItemId),
    name: optionalText(payload.name),
    endpointUrl: optionalText(payload.endpointUrl),
    valuePath: optionalText(payload.valuePath),
    baselineValue: optionalNumber(payload.baselineValue),
    targetValue: optionalNumber(payload.targetValue),
    unit: optionalText(payload.unit),
    cadence: optionalCadence(payload.cadence),
    active: typeof payload.active === "boolean" ? payload.active : undefined,
  };
}

function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function optionalText(value: unknown) { return typeof value === "string" ? value : undefined; }
function optionalNumber(value: unknown) {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error("Metric values must be numbers");
  return value;
}
function optionalCadence(value: unknown): KrDataCadence | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !KR_DATA_CADENCES.includes(value as KrDataCadence)) throw new Error("Unsupported KR data cadence");
  return value as KrDataCadence;
}

function routeError(error: unknown) {
  const message = error instanceof Error ? error.message : "Unexpected error";
  const status = /required|not found|must|unsupported|valid|https|private|unique|constraint/i.test(message) ? 400 : 500;
  return Response.json({ error: message }, { status });
}
