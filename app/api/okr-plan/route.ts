import {
  authorizeRequest,
  createOkrPlan,
  ensureWorkspace,
  type OkrPlanInput,
} from "@/lib/pace-data";

const targetKinds = new Set(["objective", "key_result", "initiative"]);

export async function POST(request: Request) {
  const authorization = await authorizeRequest(request);
  if (authorization instanceof Response) return authorization;

  try {
    await ensureWorkspace(authorization.ownerId);
    const payload = (await request.json()) as Record<string, unknown>;
    const cycleId = asString(payload.cycleId);
    if (!cycleId) return Response.json({ error: "cycleId is required" }, { status: 400 });
    const targetKind = asString(payload.targetKind);
    if (targetKind && !targetKinds.has(targetKind)) {
      return Response.json({ error: "unsupported targetKind" }, { status: 400 });
    }

    const result = await createOkrPlan(authorization.ownerId, authorization.userId, {
      cycleId,
      targetId: asString(payload.targetId) || null,
      targetKind: (targetKind || null) as OkrPlanInput["targetKind"],
      objective: asString(payload.objective),
      keyResult: asString(payload.keyResult),
      initiative: asString(payload.initiative),
      project: asString(payload.project),
      driMemberId: asString(payload.driMemberId) || null,
    });
    return Response.json(result, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    const status = /required|not found|must belong|does not match|already exists|active workspace member/i.test(message) ? 400 : 500;
    return Response.json({ error: message }, { status });
  }
}

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
