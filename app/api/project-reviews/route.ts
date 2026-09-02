import { env } from "cloudflare:workers";
import { z } from "zod";
import { authorizeRequest, ensureWorkspace, validateItemPropertiesByName } from "@/lib/pace-data";
import { writeReviewedProject } from "@/lib/project-review-writer";
import { BillingLimitError } from "@/lib/billing";
import {
  approveProjectReview, assertProjectReviewBrowserRequest, cancelProjectReview, getProjectReview,
  getReviewInitiative, listReviewInitiatives, ProjectReviewError,
} from "@/lib/project-review";

const decisionSchema = z.discriminatedUnion("decision", [
  z.object({ decision: z.literal("cancel"), id: z.string().uuid(), version: z.string().uuid() }),
  z.object({ decision: z.literal("approve"), id: z.string().uuid(), version: z.string().uuid(),
    initiativeId: z.string().min(1), initiativeFingerprint: z.string().regex(/^[a-f0-9]{64}$/), confirmed: z.literal(true) }),
]);
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });

export async function GET(request: Request) {
  try {
    const authorization = await authorizeRequest(request);
    if (authorization instanceof Response) return authorization;
    assertProjectReviewBrowserRequest(request, authorization);
    const url = new URL(request.url);
    const id = z.string().uuid().parse(url.searchParams.get("id"));
    await ensureWorkspace(authorization.ownerId);
    const review = await getProjectReview(env.DB, authorization, id);
    const [candidates, recommendations, workspace, existing] = await Promise.all([
      review.state === "pending" ? listReviewInitiatives(env.DB, authorization.ownerId, url.searchParams.get("q") ?? "", review.proposal.requestedCycleId) : { choices: [], truncated: false },
      Promise.all(review.recommendations.map(async (entry) => ({ ...entry, initiative: await getReviewInitiative(env.DB, authorization.ownerId, entry.initiativeId) }))),
      env.DB.prepare("SELECT name FROM workspaces WHERE id = ?").bind(authorization.ownerId).first<{ name: string }>(),
      ["creating", "failed"].includes(review.state) ? env.DB.prepare("SELECT id FROM items WHERE owner_id = ? AND id = ?").bind(authorization.ownerId, review.projectId).first<{ id: string }>() : null,
    ]);
    return json({ review, candidates, recommendations, workspaceName: workspace?.name ?? "", existingProjectId: existing?.id ?? null });
  } catch (error) { return reviewError(error); }
}

export async function POST(request: Request) {
  try {
    const authorization = await authorizeRequest(request);
    if (authorization instanceof Response) return authorization;
    assertProjectReviewBrowserRequest(request, authorization);
    const input = decisionSchema.parse(await request.json());
    await ensureWorkspace(authorization.ownerId);
    if (input.decision === "cancel") return json({ review: await cancelProjectReview(env.DB, authorization, input.id, input.version) });
    const current = await getProjectReview(env.DB, authorization, input.id);
    if (current.state === "pending") await validateItemPropertiesByName(authorization.ownerId, current.proposal.properties);
    const review = await approveProjectReview(env.DB, authorization, input, (draft, parent, completed) => writeReviewedProject(authorization, draft, parent, completed));
    return json({ review });
  } catch (error) { return reviewError(error); }
}

function reviewError(error: unknown) {
  if (error instanceof BillingLimitError) return json({ error: error.message, code: error.code, ...error.details }, 409);
  if (error instanceof ProjectReviewError) return json({ error: error.message, code: error.code }, error.status);
  if (error instanceof z.ZodError || error instanceof SyntaxError) return json({ error: "확인 요청 내용이 올바르지 않습니다.", code: "invalid_request" }, 400);
  return json({ error: "요청을 완료하지 못했습니다. 중복 생성하지 말고 현재 처리 결과를 확인해 주세요.", code: "review_failed" }, 500);
}
