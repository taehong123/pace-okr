import { env } from "cloudflare:workers";
import { z } from "zod";
import { listProjectPropertyDefinitions, validateItemPropertiesByName } from "@/lib/pace-data";
import { ProjectReviewError, projectProposalSchema, reviewFingerprint, validateProjectProposalReferences,
  type InitiativeChoice, type ProjectProposal, type ProjectReview } from "@/lib/project-review";

export type ReviewProperty = {
  id: string; name: string; type: "text" | "number" | "select" | "date" | "checkbox" | "member" | "members";
  options: string[]; systemKey: string | null; sortOrder: number; version: string;
};
export type ProjectReviewEditor = {
  revision: string; properties: ReviewProperty[];
  members: { id: string; displayName: string }[];
  templates: { id: string; name: string; preview: string; version: string }[];
  cycles: { id: string; name: string }[];
};

/** Only catalog data: candidate searches never initialize or reset the editable proposal. */
export async function getProjectReviewEditor(ownerId: string): Promise<ProjectReviewEditor> {
  const [definitions, members, templates, cycles] = await Promise.all([
    listProjectPropertyDefinitions(ownerId),
    env.DB.prepare("SELECT id, display_name AS displayName FROM workspace_members WHERE workspace_id = ? AND status = 'active' ORDER BY id").bind(ownerId).all<{ id: string; displayName: string }>(),
    env.DB.prepare("SELECT id, name, content, plain_text, updated_at FROM project_templates WHERE owner_id = ? ORDER BY id").bind(ownerId).all<{ id: string; name: string; content: string; plain_text: string; updated_at: string }>(),
    env.DB.prepare("SELECT id, name FROM okr_cycles WHERE owner_id = ? AND status != 'closed' ORDER BY start_date DESC, id").bind(ownerId).all<{ id: string; name: string }>(),
  ]);
  const catalog = {
    properties: await Promise.all(definitions.map(async (p) => ({ id: p.id, name: p.name, type: p.type as ReviewProperty["type"],
      options: JSON.parse(p.options) as string[], systemKey: p.systemKey, sortOrder: p.sortOrder,
      version: await reviewFingerprint({ name: p.name, type: p.type, options: p.options, updatedAt: p.updatedAt }),
    }))),
    members: members.results,
    templates: await Promise.all(templates.results.map(async (t) => ({ id: t.id, name: t.name, preview: t.plain_text.slice(0, 4000), version: await reviewFingerprint(t) }))),
    cycles: cycles.results,
  };
  return { ...catalog, revision: await reviewFingerprint(catalog) };
}

export function reviewPropertyLabels(proposal: ProjectProposal, editor: Pick<ProjectReviewEditor, "properties" | "members">) {
  const names = new Map(editor.members.map((m) => [m.id, m.displayName]));
  return Object.fromEntries(editor.properties.filter((p) => !p.systemKey).map((p) => {
    const value = proposal.properties[p.name];
    const label = value === null || value === undefined || value === "" || (Array.isArray(value) && !value.length) ? "미지정"
      : p.type === "member" ? names.get(String(value)) ?? "사용할 수 없는 멤버"
      : p.type === "members" && Array.isArray(value) ? value.map((id) => names.get(id) ?? "사용할 수 없는 멤버").join(", ")
      : typeof value === "boolean" ? value ? "체크됨" : "체크 안 됨" : String(value);
    return [p.name, label];
  }));
}

export class ReviewEditorChangedError extends ProjectReviewError {
  constructor(public editor: ProjectReviewEditor, fields: Record<string, string>) {
    super("editor_changed", "속성·멤버·템플릿 정보가 변경됐습니다. 수정값은 유지했습니다. 최신 선택지를 확인한 뒤 다시 승인해 주세요.", 409, fields);
  }
}

export async function prepareEditedProjectReview(ownerId: string, review: ProjectReview, parent: InitiativeChoice,
  input: unknown, expectedRevision: string | undefined): Promise<ProjectReview> {
  const parsed = projectProposalSchema.safeParse(input);
  const fields: Record<string, string> = {};
  if (!parsed.success) {
    for (const issue of parsed.error.issues) fields[issue.path.join(".")] = "값의 형식이나 범위를 확인해 주세요.";
    throw new ProjectReviewError("invalid_proposal", "표시된 항목을 수정해 주세요.", 400, fields);
  }
  // New clients send a complete reviewed snapshot. No omitted field receives a saving-time default.
  for (const key of Object.keys(projectProposalSchema.shape)) if (!Object.hasOwn(input as object, key)) fields[key] = "이 항목을 확인해 주세요.";
  const proposal = parsed.data;
  if (new TextEncoder().encode(JSON.stringify(proposal)).byteLength > 64000) fields.description = "생성 내용은 64KB 이내로 입력해 주세요.";
  const editor = await getProjectReviewEditor(ownerId);
  const activeMembers = new Set(editor.members.map((m) => m.id));
  if (proposal.driMemberId && !activeMembers.has(proposal.driMemberId)) fields.driMemberId = "활성 멤버를 선택하거나 미지정으로 변경해 주세요.";
  if (proposal.workerMemberIds.some((id) => !activeMembers.has(id))) fields.workerMemberIds = "사용할 수 없는 참여자를 제외해 주세요.";
  if (proposal.templateId && !editor.templates.some((t) => t.id === proposal.templateId)) fields.templateId = "현재 템플릿을 선택하거나 미지정으로 변경해 주세요.";
  if (proposal.requestedCycleId !== parent.cycleId) fields.initiativeId = "선택한 Initiative와 OKR 파일이 다릅니다. 연결을 다시 선택해 주세요.";
  const custom = editor.properties.filter((p) => !p.systemKey);
  for (const key of ["status", "priority"] as const) {
    const definition = editor.properties.find((p) => p.systemKey === key);
    if (definition && !definition.options.includes(proposal[key])) fields[key] = "워크스페이스에서 사용하는 현재 선택지를 골라 주세요.";
  }
  for (const name of Object.keys(proposal.properties)) if (!custom.some((p) => p.name === name)) fields[`properties.${name}`] = "삭제되거나 이름이 변경된 속성입니다. 해당 값을 비워 주세요.";
  for (const p of custom) {
    const value = proposal.properties[p.name];
    let valid = Object.hasOwn(proposal.properties, p.name);
    if (value !== null) {
      if (p.type === "number") valid &&= typeof value === "number" && Number.isFinite(value);
      else if (p.type === "checkbox") valid &&= typeof value === "boolean";
      else if (p.type === "members") valid &&= Array.isArray(value) && value.every((id) => activeMembers.has(id));
      else valid &&= typeof value === "string" && (p.type !== "select" || p.options.includes(value))
        && (p.type !== "date" || z.iso.date().safeParse(value).success) && (p.type !== "member" || activeMembers.has(value));
    }
    if (!valid) fields[`properties.${p.name}`] = "현재 유형·선택지에 맞는 값을 입력하거나 미지정으로 변경해 주세요.";
  }
  if (!expectedRevision || expectedRevision !== editor.revision) throw new ReviewEditorChangedError(editor, fields);
  if (Object.keys(fields).length) throw new ProjectReviewError("invalid_proposal", "표시된 항목을 수정해 주세요.", 400, fields);
  const prepared = await validateItemPropertiesByName(ownerId, proposal.properties);
  proposal.properties = Object.fromEntries(prepared.map(({ property, value }) => [property.name, value]));
  proposal.workerMemberIds = [...new Set(proposal.workerMemberIds)];
  const references = await validateProjectProposalReferences(env.DB, ownerId, proposal);
  const fieldOrigins = { ...review.fieldOrigins };
  for (const key of Object.keys(proposal) as (keyof ProjectProposal)[]) if (JSON.stringify(proposal[key]) !== JSON.stringify(review.proposal[key])) fieldOrigins[key] = "edited";
  for (const p of custom) if (JSON.stringify(proposal.properties[p.name]) !== JSON.stringify(review.proposal.properties[p.name])) fieldOrigins[`properties.${p.name}`] = "edited";
  return { ...review, proposal, ...references, fieldOrigins, editorRevision: editor.revision,
    propertyVersions: Object.fromEntries(custom.map((p) => [p.id, p.version])), propertyLabels: reviewPropertyLabels(proposal, editor) };
}
