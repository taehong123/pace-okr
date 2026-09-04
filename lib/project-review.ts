import { z } from "zod";

export const PROJECT_REVIEW_PREFIX = "system:project-review:";
const MAX_AGE_MS = 30 * 60 * 1000;
const valueSchema = z.union([z.string(), z.number(), z.boolean(), z.array(z.string()), z.null()]);
export const projectProposalSchema = z.object({
  title: z.string().trim().min(1).max(500),
  description: z.string().max(20000).default(""),
  status: z.enum(["backlog", "todo", "policy_discussion", "in_progress", "developing", "development_done", "done", "blocked"]).default("todo"),
  priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
  cadence: z.enum(["daily", "weekly", "monthly", "quarterly"]).default("weekly"),
  progress: z.number().min(0).max(100).default(0),
  dueDate: z.iso.date().nullable().default(null),
  driMemberId: z.string().min(1).nullable().default(null),
  workerMemberIds: z.array(z.string().min(1)).max(100).default([]),
  properties: z.record(z.string(), valueSchema).default({}),
  templateId: z.string().min(1).nullable().default(null),
  requestedCycleId: z.string().min(1).nullable().default(null),
});
export type ProjectProposal = z.infer<typeof projectProposalSchema>;
export type ReviewIdentity = { ownerId: string; userId: string };
export type InitiativeChoice = {
  id: string; title: string; cycleId: string | null; cycleName: string | null; path: string[];
  description: string; keyResultDescription: string; objectiveDescription: string;
  fingerprint: string;
  revision: { initiative: string; keyResult: string; objective: string; cycleStatus: string | null };
};
export type ProjectReview = {
  id: string; version: string; state: "pending" | "creating" | "created" | "failed" | "cancelled";
  projectId: string; proposal: ProjectProposal;
  recommendations: { initiativeId: string; reason: string }[];
  fieldLabels: { dri: string | null; workers: string[]; template: string | null; cycle: string | null };
  templateVersion: string | null;
  templatePreview: string | null;
  requestHash: string;
  propertyVersions: Record<string, string>;
  fieldOrigins?: Record<string, "draft" | "default" | "edited">;
  propertyLabels?: Record<string, string>;
  editorRevision?: string;
  createdAt: string; expiresAt: string; selectedParent: InitiativeChoice | null;
};

export class ProjectReviewError extends Error {
  constructor(public code: string, message: string, public status = 409, public fieldErrors: Record<string, string> = {}) { super(message); }
}

export function projectReviewSummary(review: ProjectReview) {
  return { ...review.proposal, ...review.fieldLabels, displayProperties: review.propertyLabels ?? {},
    fieldOrigins: review.fieldOrigins ?? {}, initiativePath: review.selectedParent?.path ?? [],
    cycleId: review.selectedParent?.cycleId ?? review.proposal.requestedCycleId };
}

function fail(code: string, message: string, status = 409): never { throw new ProjectReviewError(code, message, status); }
export async function reviewFingerprint(value: unknown) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(value)));
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

const parentSql = `SELECT i.id, i.title, i.cycle_id AS cycleId, i.description,
  k.title AS krTitle, o.title AS objectiveTitle,
  k.description AS keyResultDescription, o.description AS objectiveDescription,
  i.updated_at AS updatedAt, k.updated_at AS krUpdatedAt, o.updated_at AS objectiveUpdatedAt,
  c.status AS cycleStatus, c.name AS cycleName
  FROM items i
  JOIN items k ON k.id = i.parent_id AND k.owner_id = i.owner_id AND k.kind = 'key_result'
  JOIN items o ON o.id = k.parent_id AND o.owner_id = i.owner_id AND o.kind = 'objective'
  LEFT JOIN okr_cycles c ON c.id = i.cycle_id AND c.owner_id = i.owner_id
  WHERE i.owner_id = ? AND i.kind = 'initiative'
    AND i.archived_at IS NULL AND k.archived_at IS NULL AND o.archived_at IS NULL
    AND i.status != 'archived' AND k.status != 'archived' AND o.status != 'archived'
    AND k.cycle_id IS i.cycle_id AND o.cycle_id IS i.cycle_id
    AND (i.cycle_id IS NULL OR (c.id IS NOT NULL AND c.status != 'closed'))`;

async function choiceFromRow(row: Record<string, unknown>): Promise<InitiativeChoice> {
  return {
    id: String(row.id), title: String(row.title), cycleId: row.cycleId as string | null,
    cycleName: row.cycleName as string | null,
    path: [String(row.objectiveTitle), String(row.krTitle), String(row.title)],
    description: String(row.description ?? "").slice(0, 800),
    keyResultDescription: String(row.keyResultDescription ?? "").slice(0, 500),
    objectiveDescription: String(row.objectiveDescription ?? "").slice(0, 500),
    fingerprint: await reviewFingerprint(row),
    revision: { initiative: String(row.updatedAt), keyResult: String(row.krUpdatedAt), objective: String(row.objectiveUpdatedAt), cycleStatus: row.cycleStatus as string | null },
  };
}

export async function getReviewInitiative(db: D1Database, ownerId: string, id: string) {
  const row = await db.prepare(`${parentSql} AND i.id = ?`).bind(ownerId, id).first<Record<string, unknown>>();
  return row ? choiceFromRow(row) : null;
}

export async function listReviewInitiatives(db: D1Database, ownerId: string, query = "", cycleId: string | null = null) {
  const term = query.trim().slice(0, 120);
  const pattern = `%${term.replace(/[\\%_]/g, "\\$&")}%`;
  const result = await db.prepare(`${parentSql}
    AND (? IS NULL OR i.cycle_id = ?)
    AND (? = '' OR i.title LIKE ? ESCAPE '\\' OR i.description LIKE ? ESCAPE '\\'
      OR k.title LIKE ? ESCAPE '\\' OR k.description LIKE ? ESCAPE '\\'
      OR o.title LIKE ? ESCAPE '\\' OR o.description LIKE ? ESCAPE '\\')
    ORDER BY i.updated_at DESC, i.id LIMIT 21`).bind(ownerId, cycleId, cycleId, term, ...Array(6).fill(pattern)).all<Record<string, unknown>>();
  return { choices: await Promise.all(result.results.slice(0, 20).map(choiceFromRow)), truncated: result.results.length > 20 };
}

export async function validateProjectProposalReferences(db: D1Database, ownerId: string, proposal: ProjectProposal) {
  const ids = [...new Set([proposal.driMemberId, ...proposal.workerMemberIds].filter((id): id is string => Boolean(id)))];
  const members = ids.length ? (await db.prepare(`SELECT id, display_name AS name FROM workspace_members
    WHERE workspace_id = ? AND status = 'active' AND id IN (SELECT value FROM json_each(?))`).bind(ownerId, JSON.stringify(ids)).all<{ id: string; name: string }>()).results : [];
  if (members.length !== ids.length) fail("invalid_members", "담당자가 현재 워크스페이스의 활성 멤버인지 다시 확인해 주세요.", 400);
  const names = new Map(members.map((row) => [row.id, row.name]));
  const template = proposal.templateId ? await db.prepare("SELECT id, name, content, plain_text, updated_at FROM project_templates WHERE owner_id = ? AND id = ?")
    .bind(ownerId, proposal.templateId).first<Record<string, unknown>>() : null;
  if (proposal.templateId && !template) fail("invalid_template", "선택한 Project 템플릿을 찾을 수 없습니다.", 400);
  const cycle = proposal.requestedCycleId ? await db.prepare("SELECT name FROM okr_cycles WHERE owner_id = ? AND id = ? AND status != 'closed'")
    .bind(ownerId, proposal.requestedCycleId).first<{ name: string }>() : null;
  if (proposal.requestedCycleId && !cycle) fail("invalid_cycle", "요청한 OKR 파일이 없거나 종료됐습니다. 다시 선택해 주세요.", 400);
  return {
    fieldLabels: { dri: proposal.driMemberId ? names.get(proposal.driMemberId)! : null, workers: proposal.workerMemberIds.map((id) => names.get(id)!), template: template ? String(template.name) : null, cycle: cycle?.name ?? null },
    templateVersion: template ? await reviewFingerprint(template) : null,
    templatePreview: template ? String(template.plain_text).slice(0, 4000) : null,
  };
}

/** This is only a draft. No Project, hierarchy, quota, assignment or notification is created. */
export async function proposeProjectReview(db: D1Database, identity: ReviewIdentity, input: unknown,
  recommendations: { initiativeId: string; reason: string }[] = [], propertyVersions: Record<string, string> = {},
  display: Pick<ProjectReview, "fieldOrigins" | "propertyLabels"> = {}) {
  const proposal = projectProposalSchema.parse(input);
  const normalizedRecommendations = z.array(z.object({ initiativeId: z.string().min(1), reason: z.string().trim().min(1).max(1000) })).max(3).parse(recommendations);
  for (const recommendation of normalizedRecommendations) {
    const candidate = await getReviewInitiative(db, identity.ownerId, recommendation.initiativeId);
    if (!candidate || (proposal.requestedCycleId && candidate.cycleId !== proposal.requestedCycleId)) {
      fail("invalid_initiative", "추천 Initiative가 유효하지 않습니다. 다른 후보를 검색해 주세요.", 400);
    }
  }
  const labels = await validateProjectProposalReferences(db, identity.ownerId, proposal);
  const now = new Date();
  if (new TextEncoder().encode(JSON.stringify(proposal)).byteLength > 64000) fail("proposal_too_large", "생성할 내용이 너무 큽니다. Project 본문을 간결하게 정리해 주세요.", 400);
  const requestHash = await reviewFingerprint({ proposal, recommendations: normalizedRecommendations, ...labels, propertyVersions, ...display });
  const previous = await db.prepare(`SELECT payload_json FROM assistant_drafts WHERE owner_id = ? AND user_id = ?
    AND draft_key LIKE 'system:project-review:%' AND json_extract(payload_json, '$.state') = 'pending'
    AND json_extract(payload_json, '$.requestHash') = ? AND json_extract(payload_json, '$.expiresAt') > ? LIMIT 1`)
    .bind(identity.ownerId, identity.userId, requestHash, now.toISOString()).first<{ payload_json: string }>();
  if (previous) return JSON.parse(previous.payload_json) as ProjectReview;
  const pending = await db.prepare(`SELECT count(*) AS n FROM assistant_drafts WHERE owner_id = ? AND user_id = ?
    AND draft_key LIKE 'system:project-review:%' AND json_extract(payload_json, '$.state') = 'pending'
    AND json_extract(payload_json, '$.expiresAt') > ?`).bind(identity.ownerId, identity.userId, now.toISOString()).first<{ n: number }>();
  if ((pending?.n ?? 0) >= 10) fail("too_many_reviews", "대기 중인 생성 요청을 먼저 확인하거나 취소해 주세요.", 429);
  const id = crypto.randomUUID();
  const review: ProjectReview = {
    id, version: crypto.randomUUID(), state: "pending", projectId: crypto.randomUUID(), proposal,
    recommendations: normalizedRecommendations, ...labels, requestHash, propertyVersions, ...display,
    createdAt: now.toISOString(), expiresAt: new Date(now.getTime() + MAX_AGE_MS).toISOString(), selectedParent: null,
  };
  await db.prepare(`INSERT INTO assistant_drafts (id, owner_id, user_id, draft_key, payload_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(id, identity.ownerId, identity.userId, PROJECT_REVIEW_PREFIX + id,
    JSON.stringify(review), review.createdAt, review.createdAt).run();
  return review;
}

export async function getProjectReview(db: D1Database, identity: ReviewIdentity, id: string) {
  const row = await db.prepare(`SELECT payload_json FROM assistant_drafts
    WHERE id = ? AND owner_id = ? AND user_id = ? AND draft_key = ?`).bind(id, identity.ownerId, identity.userId, PROJECT_REVIEW_PREFIX + id).first<{ payload_json: string }>();
  if (!row) fail("review_not_found", "이 계정과 워크스페이스에서 확인할 생성 요청을 찾을 수 없습니다.", 404);
  const review = JSON.parse(row.payload_json) as ProjectReview;
  if (review.id !== id || !review.version || !review.proposal) fail("invalid_review", "확인 요청이 유효하지 않습니다.");
  if (review.state === "pending" && Date.parse(review.expiresAt) <= Date.now()) fail("review_expired", "확인 요청이 만료됐습니다. 새 추천·확인 요청을 받아 주세요.", 410);
  return review;
}

async function transition(db: D1Database, identity: ReviewIdentity, before: ProjectReview, after: ProjectReview) {
  const result = await db.prepare(`UPDATE assistant_drafts SET payload_json = ?, updated_at = ?
    WHERE id = ? AND owner_id = ? AND user_id = ? AND draft_key = ? AND payload_json = ?`)
    .bind(JSON.stringify(after), new Date().toISOString(), before.id, identity.ownerId, identity.userId,
      PROJECT_REVIEW_PREFIX + before.id, JSON.stringify(before)).run();
  if (result.meta.changes !== 1) fail("review_changed", "다른 요청에서 처리 중이거나 내용이 변경됐습니다. 현재 결과를 다시 확인해 주세요.");
}

export async function cancelProjectReview(db: D1Database, identity: ReviewIdentity, id: string, version: string) {
  const review = await getProjectReview(db, identity, id);
  if (review.version !== version || review.state !== "pending") fail("review_changed", "현재 요청은 취소할 수 없습니다. 처리 결과를 확인해 주세요.");
  const cancelled: ProjectReview = { ...review, state: "cancelled" };
  await transition(db, identity, review, cancelled);
  return cancelled;
}

/** The caller verifies browser CSRF or authenticated MCP write access and explicit user confirmation. */
export async function approveProjectReview(db: D1Database, identity: ReviewIdentity,
  input: { id: string; version: string; initiativeId: string; initiativeFingerprint: string },
  create: (review: ProjectReview, parent: InitiativeChoice, completed: ProjectReview) => Promise<void>,
  prepareEdit?: (review: ProjectReview, parent: InitiativeChoice) => Promise<ProjectReview>) {
  const review = await getProjectReview(db, identity, input.id);
  if (review.version !== input.version) fail("review_changed", "생성 내용이 변경됐습니다. 최종 내용을 다시 확인해 주세요.");
  if (review.state === "created") return review;
  if (review.state !== "pending") fail("review_not_pending", "이미 처리 중이거나 종료된 요청입니다. 중복 생성하지 말고 기존 결과를 확인해 주세요.");
  const parent = await getReviewInitiative(db, identity.ownerId, input.initiativeId);
  if (!parent || parent.fingerprint !== input.initiativeFingerprint) throw new ProjectReviewError("initiative_changed", "선택한 Initiative 또는 상위 KR·Objective가 변경됐습니다. 후보를 다시 확인해 주세요.", 409, { initiativeId: "현재 경로를 확인하고 다시 선택해 주세요." });
  const effective = prepareEdit ? await prepareEdit(review, parent) : review;
  if (effective.proposal.requestedCycleId && parent.cycleId !== effective.proposal.requestedCycleId) fail("cycle_mismatch", "요청한 OKR 파일 안의 Initiative를 선택해 주세요.");
  const references = await validateProjectProposalReferences(db, identity.ownerId, effective.proposal);
  if (references.templateVersion !== effective.templateVersion || JSON.stringify(references.fieldLabels) !== JSON.stringify(effective.fieldLabels)) {
    fail("details_changed", "담당자 또는 템플릿 정보가 변경됐습니다. 새 확인 요청을 받아 주세요.");
  }
  const creating: ProjectReview = { ...effective, state: "creating", selectedParent: parent };
  await transition(db, identity, review, creating); // One claimant; repeated clicks cannot create twice.
  const created: ProjectReview = { ...creating, state: "created" };
  try {
    await create(creating, parent, created); // Writer atomically persists both Project data and the created receipt.
  } catch (error) {
    const latest = await getProjectReview(db, identity, review.id);
    if (latest.state === "created") return latest; // A committed batch with a lost response is not a failed save.
    await transition(db, identity, creating, { ...creating, state: "failed" });
    throw error;
  }
  return created;
}

export function assertProjectReviewBrowserRequest(request: Request, authorization: { apiToken: boolean }) {
  if (authorization.apiToken || request.headers.has("authorization")) fail("browser_confirmation_required", "이 경로는 웹 확인 화면 전용입니다. MCP에서는 대화에서 확인한 뒤 confirm_project를 사용해 주세요.", 403);
  if (request.method !== "GET" && request.headers.get("origin") !== new URL(request.url).origin) {
    fail("invalid_origin", "OKRI 확인 화면에서 다시 시도해 주세요.", 403);
  }
  const site = request.headers.get("sec-fetch-site");
  if (request.method !== "GET" && site && site !== "same-origin") fail("invalid_origin", "동일한 OKRI 화면에서만 승인할 수 있습니다.", 403);
}
