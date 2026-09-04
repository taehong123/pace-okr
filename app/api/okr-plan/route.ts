import {
  authorizeRequest,
  createOkrPlan,
  ensureWorkspace,
  type OkrPlanInput,
} from "@/lib/pace-data";
import { BillingLimitError } from "@/lib/billing";

const targetKinds = new Set(["objective", "key_result", "initiative"]);

export async function POST(request: Request) {
  const authorization = await authorizeRequest(request);
  if (authorization instanceof Response) return authorization;

  try {
    await ensureWorkspace(authorization.ownerId);
    const payload = (await request.json()) as Record<string, unknown>;
    if (authorization.apiToken && asString(payload.project)) {
      return Response.json({ code: "project_confirmation_required", created: false,
        error: "Project는 일괄 OKR 생성으로 우회할 수 없습니다. propose_project 또는 /api/items의 Project 확인 요청을 사용해 사용자가 연결과 최종 내용을 확인하도록 해 주세요." },
      { status: 409, headers: { "Cache-Control": "no-store" } });
    }
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
      tree: asTree(payload.tree),
      objective: asString(payload.objective),
      keyResult: asString(payload.keyResult),
      initiative: asString(payload.initiative),
      project: asString(payload.project),
      driMemberId: asString(payload.driMemberId) || null,
    });
    return Response.json(result, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    if (error instanceof BillingLimitError) return Response.json({ error: message, code: error.code, ...error.details }, { status: 409 });
    const status = /required|not found|must belong|does not match|already exists|active workspace member|at most|only accepts|supports|selected Initiative/i.test(message) ? 400 : 500;
    return Response.json({ error: message }, { status });
  }
}

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asTree(value: unknown): OkrPlanInput["tree"] {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  const keyResults = Array.isArray(record.keyResults) ? record.keyResults.slice(0, 20).flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const keyResult = entry as Record<string, unknown>;
    const title = asString(keyResult.title);
    if (!title) return [];
    const initiatives = Array.isArray(keyResult.initiatives) ? keyResult.initiatives.slice(0, 30).flatMap((initiative) => {
      if (!initiative || typeof initiative !== "object") return [];
      const initiativeTitle = asString((initiative as Record<string, unknown>).title);
      return initiativeTitle ? [{ title: initiativeTitle }] : [];
    }) : [];
    return [{ title, initiatives }];
  }) : [];
  const targetInitiatives = Array.isArray(record.targetInitiatives) ? record.targetInitiatives.slice(0, 30).flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const title = asString((entry as Record<string, unknown>).title);
    return title ? [{ title }] : [];
  }) : [];
  return {
    objectiveTitle: asString(record.objectiveTitle),
    keyResults,
    targetInitiatives,
  };
}
