import { env } from "cloudflare:workers";
import { BillingLimitError, prepareReviewedProjectQuota, reviewedProjectPermissionGuard } from "@/lib/billing";
import { getProjectTemplate, prepareProjectTemplateDocument, validateItemPropertiesByName, type RequestAuthorization } from "@/lib/pace-data";
import { PROJECT_REVIEW_PREFIX, ProjectReviewError, reviewFingerprint, type InitiativeChoice, type ProjectReview } from "@/lib/project-review";

/** No notifications or records escape before this batch commits. Everything shown is saved, or nothing is. */
export async function writeReviewedProject(authorization: RequestAuthorization, review: ProjectReview, parent: InitiativeChoice, completed: ProjectReview) {
  const db = env.DB;
  const ownerId = authorization.ownerId;
  const p = review.proposal;
  const now = new Date().toISOString();
  const properties = await validateItemPropertiesByName(ownerId, p.properties);
  for (const { property } of properties) {
    const version = await reviewFingerprint({ name: property.name, type: property.type, options: property.options, updatedAt: property.updatedAt });
    if (review.propertyVersions[property.id] !== version) throw new ProjectReviewError("property_changed", "속성 정의가 변경됐습니다. 새 확인 요청을 받아 주세요.");
  }
  const template = p.templateId ? await getProjectTemplate(ownerId, p.templateId) : null;
  if (p.templateId && (!template || review.templateVersion !== await reviewFingerprint({
    id: template.id, name: template.name, content: template.content, plain_text: template.plainText, updated_at: template.updatedAt,
  }))) throw new ProjectReviewError("template_changed", "템플릿이 변경됐습니다. 새 확인 요청을 받아 주세요.");
  const quota = await prepareReviewedProjectQuota(ownerId);
  const permission = reviewedProjectPermissionGuard(ownerId, authorization.userId);
  const document = template ? prepareProjectTemplateDocument(template, p.description) : null;
  const statements: D1PreparedStatement[] = quota ? [quota.statement] : [];
  // A stale parent or changed approval produces NULL for a NOT NULL title, aborting this entire batch.
  statements.push(db.prepare(`INSERT INTO items
    (id, owner_id, cycle_id, parent_id, kind, title, description, status, priority, cadence, progress, due_date, source, source_ref, created_by_user_id, sort_order, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'project', CASE WHEN EXISTS (
      SELECT 1 FROM items i JOIN items k ON k.id = i.parent_id AND k.owner_id = i.owner_id
      JOIN items o ON o.id = k.parent_id AND o.owner_id = i.owner_id
      LEFT JOIN okr_cycles c ON c.id = i.cycle_id AND c.owner_id = i.owner_id
      WHERE i.id = ? AND i.owner_id = ? AND i.kind = 'initiative' AND k.kind = 'key_result' AND o.kind = 'objective'
        AND i.cycle_id IS ? AND k.cycle_id IS i.cycle_id AND o.cycle_id IS i.cycle_id
        AND i.archived_at IS NULL AND k.archived_at IS NULL AND o.archived_at IS NULL
        AND i.status != 'archived' AND k.status != 'archived' AND o.status != 'archived'
        AND i.updated_at = ? AND k.updated_at = ? AND o.updated_at = ?
        AND c.status IS ? AND (i.cycle_id IS NULL OR (c.id IS NOT NULL AND c.status != 'closed'))
    ) AND EXISTS (SELECT 1 FROM assistant_drafts WHERE id = ? AND owner_id = ? AND user_id = ? AND payload_json = ?)
      AND ${permission.sql}
      AND (? IS NULL OR coalesce((SELECT plan FROM workspace_subscriptions WHERE workspace_id = ?), 'free') = ?)
      THEN ? ELSE NULL END, ?, ?, ?, ?, ?, ?, 'mcp', ?, ?, 0, ?, ?)`)
    .bind(review.projectId, ownerId, parent.cycleId, parent.id, parent.id, ownerId, parent.cycleId,
      parent.revision.initiative, parent.revision.keyResult, parent.revision.objective, parent.revision.cycleStatus,
      review.id, ownerId, authorization.userId, JSON.stringify(review), ...permission.bindings,
      quota?.plan ?? null, ownerId, quota?.plan ?? null, p.title, document?.plainText ?? p.description, p.status, p.priority, p.cadence,
      p.progress, p.dueDate, `project-review:${review.id}`, authorization.userId, now, now));
  for (const assignment of [
    ...(p.driMemberId ? [{ memberId: p.driMemberId, role: "project_dri" }] : []),
    ...[...new Set(p.workerMemberIds)].map((memberId) => ({ memberId, role: "project_worker" })),
  ]) {
    statements.push(db.prepare(`INSERT INTO item_assignments (id, owner_id, item_id, member_id, role, created_at, updated_at)
      VALUES (?, ?, ?, (SELECT id FROM workspace_members WHERE id = ? AND workspace_id = ? AND status = 'active'), ?, ?, ?)`)
      .bind(crypto.randomUUID(), ownerId, review.projectId, assignment.memberId, ownerId, assignment.role, now, now));
  }
  for (const { property, value } of properties) {
    const memberIds = (property.type === "member" || property.type === "members") && value !== null
      ? [...new Set((Array.isArray(value) ? value : [value]).filter((entry): entry is string => typeof entry === "string"))] : [];
    const valueGuard = memberIds.length ? `(SELECT count(*) FROM workspace_members WHERE workspace_id = ? AND status = 'active' AND id IN (SELECT value FROM json_each(?))) = ?` : "1 = 1";
    statements.push(db.prepare(`INSERT INTO item_property_values (id, owner_id, item_id, property_id, value, updated_at)
      VALUES (?, ?, ?, (SELECT id FROM property_definitions WHERE id = ? AND owner_id = ? AND active = 1 AND system_key IS NULL
        AND type = ? AND options = ? AND updated_at = ?), CASE WHEN ${valueGuard} THEN ? ELSE NULL END, ?)`)
      .bind(crypto.randomUUID(), ownerId, review.projectId, property.id, ownerId, property.type, property.options, property.updatedAt,
        ...(memberIds.length ? [ownerId, JSON.stringify(memberIds), memberIds.length] : []), JSON.stringify(value), now));
  }
  if (template && document) {
    statements.push(db.prepare(`INSERT INTO project_documents (id, owner_id, project_id, content, plain_text, version, updated_by_user_id, created_at, updated_at)
      VALUES (?, ?, ?, CASE WHEN EXISTS (SELECT 1 FROM project_templates WHERE id = ? AND owner_id = ? AND updated_at = ? AND content = ? AND plain_text = ?) THEN ? ELSE NULL END, ?, 1, ?, ?, ?)`)
      .bind(crypto.randomUUID(), ownerId, review.projectId, template.id, ownerId, template.updatedAt, template.content, template.plainText, document.content, document.plainText, authorization.userId, now, now));
  }
  statements.push(db.prepare(`INSERT INTO activity_log (id, owner_id, item_id, action, source, payload, created_at)
    VALUES (?, ?, ?, 'created', 'mcp', ?, ?)`)
    .bind(crypto.randomUUID(), ownerId, review.projectId, JSON.stringify({ kind: "project", status: p.status, reviewId: review.id, approvedBy: authorization.userId, initiativeId: parent.id }), now));
  statements.push(db.prepare(`UPDATE assistant_drafts SET payload_json = ?, updated_at = ?
    WHERE id = ? AND owner_id = ? AND user_id = ? AND draft_key = ? AND payload_json = ?`)
    .bind(JSON.stringify(completed), now, review.id, ownerId, authorization.userId, PROJECT_REVIEW_PREFIX + review.id, JSON.stringify(review)));
  try { await db.batch(statements); }
  catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (quota && /project_monthly_usage\.created_count/.test(message)) throw new BillingLimitError("project_quota_exceeded", "이번 달 Project 생성 한도에 도달했습니다.", { limit: quota.limit, resetsAt: quota.resetsAt, upgradeUrl: "/?view=billing" });
    throw new ProjectReviewError("creation_rolled_back", "저장 중 연결·담당자·속성 정보가 바뀌었거나 오류가 발생해 전체 생성을 취소했습니다. 새 확인 요청을 받아 주세요.");
  }
}
