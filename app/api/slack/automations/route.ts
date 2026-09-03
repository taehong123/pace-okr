import {
  authorizeRequest,
  canManageTeam,
  createSlackAutomation,
  deleteSlackAutomation,
  ensureWorkspace,
  listSlackAutomationDeliveries,
  listSlackAutomations,
  updateSlackAutomation,
} from "@/lib/pace-data";

export async function GET(request: Request) {
  const authorization = await authorizeRequest(request, { allowViewerWrite: true });
  if (authorization instanceof Response) return authorization;
  try {
    await ensureWorkspace(authorization.ownerId);
    const [automations, deliveries] = await Promise.all([
      listSlackAutomations(authorization.ownerId),
      listSlackAutomationDeliveries(authorization.ownerId),
    ]);
    return Response.json({ automations, deliveries, canManage: canManageTeam(authorization) });
  } catch (error) {
    return routeError(error);
  }
}

export async function POST(request: Request) {
  const authorization = await authorizeRequest(request);
  if (authorization instanceof Response) return authorization;
  if (!canManageTeam(authorization)) return forbidden();
  try {
    await ensureWorkspace(authorization.ownerId);
    const payload = await request.json() as Record<string, unknown>;
    const automation = await createSlackAutomation(authorization.ownerId, authorization.userId, automationInput(payload));
    return Response.json({ automation }, { status: 201 });
  } catch (error) {
    return routeError(error);
  }
}

export async function PATCH(request: Request) {
  const authorization = await authorizeRequest(request);
  if (authorization instanceof Response) return authorization;
  if (!canManageTeam(authorization)) return forbidden();
  try {
    await ensureWorkspace(authorization.ownerId);
    const payload = await request.json() as Record<string, unknown>;
    const id = text(payload.id);
    if (!id) return Response.json({ error: "id is required" }, { status: 400 });
    const automation = await updateSlackAutomation(authorization.ownerId, id, automationInput(payload));
    return Response.json({ automation });
  } catch (error) {
    return routeError(error);
  }
}

export async function DELETE(request: Request) {
  const authorization = await authorizeRequest(request);
  if (authorization instanceof Response) return authorization;
  if (!canManageTeam(authorization)) return forbidden();
  try {
    await ensureWorkspace(authorization.ownerId);
    const id = new URL(request.url).searchParams.get("id")?.trim() ?? "";
    if (!id) return Response.json({ error: "id is required" }, { status: 400 });
    return Response.json(await deleteSlackAutomation(authorization.ownerId, id));
  } catch (error) {
    return routeError(error);
  }
}

function automationInput(payload: Record<string, unknown>) {
  return {
    name: optionalText(payload.name),
    triggerType: optionalText(payload.triggerType),
    triggerStatus: optionalText(payload.triggerStatus),
    channelId: optionalText(payload.channelId),
    messageTemplate: optionalText(payload.messageTemplate),
    active: typeof payload.active === "boolean" ? payload.active : undefined,
  };
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function optionalText(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function forbidden() {
  return Response.json({ error: "Owner or Admin access is required." }, { status: 403 });
}

function routeError(error: unknown) {
  const message = error instanceof Error ? error.message : "Unexpected error";
  const status = /required|입력|지원하지|찾을 수|먼저 연결|이하여야|선택|채널/i.test(message) ? 400 : 500;
  return Response.json({ error: message }, { status });
}
