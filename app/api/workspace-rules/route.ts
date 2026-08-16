import {
  ITEM_CADENCES,
  ITEM_PRIORITIES,
  authorizeRequest,
  ensureWorkspace,
  getWorkspaceRules,
  saveWorkspaceRules,
  type ItemCadence,
  type ItemPriority,
} from "@/lib/pace-data";

export async function GET(request: Request) {
  const authorization = await authorizeRequest(request);
  if (authorization instanceof Response) return authorization;
  try {
    await ensureWorkspace(authorization.ownerId);
    return Response.json({ rules: await getWorkspaceRules(authorization.ownerId) });
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
    const defaultPriority = asValue(payload.defaultPriority, ITEM_PRIORITIES) as ItemPriority | undefined;
    const defaultCadence = asValue(payload.defaultCadence, ITEM_CADENCES) as ItemCadence | undefined;
    if (payload.defaultPriority !== undefined && !defaultPriority) {
      return Response.json({ error: "supported defaultPriority is required" }, { status: 400 });
    }
    if (payload.defaultCadence !== undefined && !defaultCadence) {
      return Response.json({ error: "supported defaultCadence is required" }, { status: 400 });
    }
    const rules = await saveWorkspaceRules(authorization.ownerId, {
      captureInstruction: asOptionalString(payload.captureInstruction),
      structureInstruction: asOptionalString(payload.structureInstruction),
      routineInstruction: asOptionalString(payload.routineInstruction),
      defaultPriority,
      defaultCadence,
      reviewBeforeCreate: typeof payload.reviewBeforeCreate === "boolean" ? payload.reviewBeforeCreate : undefined,
      configured: typeof payload.configured === "boolean" ? payload.configured : true,
    });
    return Response.json({ rules });
  } catch (error) {
    return routeError(error);
  }
}

function asValue<T extends readonly string[]>(value: unknown, values: T): T[number] | undefined {
  return typeof value === "string" && values.includes(value) ? (value as T[number]) : undefined;
}

function asOptionalString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function routeError(error: unknown) {
  const message = error instanceof Error ? error.message : "Unexpected error";
  const status = /required|unsupported|not found|invalid/i.test(message) ? 400 : 500;
  return Response.json({ error: message }, { status });
}
