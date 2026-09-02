import { env } from "cloudflare:workers";
import { getWorkspaceRules, listProjectPropertyDefinitions, validateItemPropertiesByName, type RequestAuthorization } from "@/lib/pace-data";
import { proposeProjectReview, getReviewInitiative, reviewFingerprint, projectProposalSchema, projectReviewSummary, type ProjectReview } from "@/lib/project-review";
import { getProjectReviewEditor, reviewPropertyLabels } from "@/lib/project-review-editor";

export async function stageProjectReview(authorization: RequestAuthorization, input: Record<string, unknown>,
  recommendations: { initiativeId: string; reason: string }[], origin: string) {
  const [rules, definitions] = await Promise.all([getWorkspaceRules(authorization.ownerId), listProjectPropertyDefinitions(authorization.ownerId)]);
  const parse = (value: string) => JSON.parse(value) as unknown;
  const systemDefault = (key: string) => { const definition = definitions.find((entry) => entry.systemKey === key); return definition ? parse(definition.defaultValue) : null; };
  const propertyDefaults = Object.fromEntries(definitions.filter((entry) => !entry.systemKey).map((entry) => [entry.name, parse(entry.defaultValue)]));
  const properties = { ...propertyDefaults };
  const fieldOrigins: NonNullable<ProjectReview["fieldOrigins"]> = {};
  for (const [name, value] of Object.entries(propertyDefaults)) if (value !== null) fieldOrigins[`properties.${name}`] = "default";
  for (const [name, value] of Object.entries((input.properties as Record<string, unknown> | undefined) ?? {})) {
    const canonicalName = definitions.find((entry) => entry.name.toLocaleLowerCase() === name.toLocaleLowerCase())?.name ?? name;
    properties[canonicalName] = value;
    fieldOrigins[`properties.${canonicalName}`] = "draft";
  }
  const prepared = await validateItemPropertiesByName(authorization.ownerId, properties as Parameters<typeof validateItemPropertiesByName>[1]);
  const propertyVersions = Object.fromEntries(await Promise.all(prepared.map(async ({ property }) => [property.id, await reviewFingerprint({ name: property.name, type: property.type, options: property.options, updatedAt: property.updatedAt })])));
  // Freeze configured defaults in the visible proposal, never apply new hidden defaults during approval.
  const proposal = {
    ...input, properties: Object.fromEntries(prepared.map(({ property, value }) => [property.name, value])),
    priority: input.priority ?? systemDefault("priority") ?? rules.defaultPriority,
    cadence: input.cadence ?? systemDefault("cadence") ?? rules.defaultCadence,
    status: input.status ?? systemDefault("status") ?? "todo",
    dueDate: input.dueDate === undefined ? systemDefault("due_date") : input.dueDate,
    driMemberId: input.driMemberId === undefined ? systemDefault("project_dri") : input.driMemberId,
    workerMemberIds: input.workerMemberIds ?? systemDefault("project_workers") ?? [],
  };
  const frozen = projectProposalSchema.parse(proposal);
  for (const [key, value] of Object.entries(frozen)) if (key !== "properties" && value !== null && value !== "" && (!Array.isArray(value) || value.length)) fieldOrigins[key] = input[key] === undefined ? "default" : "draft";
  const editor = await getProjectReviewEditor(authorization.ownerId);
  const review = await proposeProjectReview(env.DB, authorization, frozen, recommendations, propertyVersions,
    { fieldOrigins, propertyLabels: reviewPropertyLabels(frozen, editor) });
  const url = new URL("/project-review", origin);
  url.searchParams.set("id", review.id);
  url.searchParams.set("workspaceId", authorization.ownerId);
  return {
    id: review.id, state: "awaiting_user_confirmation" as const, url: url.toString(), expiresAt: review.expiresAt,
    summary: projectReviewSummary(review), selectedInitiative: null,
    recommendations: await Promise.all(review.recommendations.map(async (recommendation) => ({
      ...recommendation, initiative: await getReviewInitiative(env.DB, authorization.ownerId, recommendation.initiativeId),
    }))),
    nextStep: "Project는 아직 생성되지 않았습니다. 미지정 값을 포함한 제목·범위·담당자·기한·속성과 추천 이유·상위 Objective/KR 경로를 요약하고 ‘내용 확인·수정 후 생성’ 링크를 제공하세요. 사용자가 확인 화면에서 속성을 수정하고, 다른 OKR 파일의 Initiative도 검색·선택한 뒤 최종 승인합니다. AI가 승인 화면을 대신 조작하거나 다른 도구로 우회 생성해서는 안 됩니다.",
  };
}
