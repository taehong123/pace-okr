import { env } from "cloudflare:workers";
import { getWorkspaceRules, listProjectPropertyDefinitions, validateItemPropertiesByName, type RequestAuthorization } from "@/lib/pace-data";
import { proposeProjectReview, getReviewInitiative, reviewFingerprint } from "@/lib/project-review";

export async function stageProjectReview(authorization: RequestAuthorization, input: Record<string, unknown>,
  recommendations: { initiativeId: string; reason: string }[], origin: string) {
  const [rules, definitions] = await Promise.all([getWorkspaceRules(authorization.ownerId), listProjectPropertyDefinitions(authorization.ownerId)]);
  const parse = (value: string) => JSON.parse(value) as unknown;
  const systemDefault = (key: string) => { const definition = definitions.find((entry) => entry.systemKey === key); return definition ? parse(definition.defaultValue) : null; };
  const propertyDefaults = Object.fromEntries(definitions.filter((entry) => !entry.systemKey && entry.defaultValue !== "null").map((entry) => [entry.name, parse(entry.defaultValue)]));
  const properties = { ...propertyDefaults };
  for (const [name, value] of Object.entries((input.properties as Record<string, unknown> | undefined) ?? {})) {
    const canonicalName = definitions.find((entry) => entry.name.toLocaleLowerCase() === name.toLocaleLowerCase())?.name ?? name;
    properties[canonicalName] = value;
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
  const review = await proposeProjectReview(env.DB, authorization, {
    ...proposal,
  }, recommendations, propertyVersions);
  const url = new URL("/project-review", origin);
  url.searchParams.set("id", review.id);
  url.searchParams.set("workspaceId", authorization.ownerId);
  return {
    id: review.id, state: "awaiting_user_confirmation" as const, url: url.toString(), expiresAt: review.expiresAt,
    summary: { ...review.proposal, ...review.fieldLabels }, selectedInitiative: null,
    recommendations: await Promise.all(review.recommendations.map(async (recommendation) => ({
      ...recommendation, initiative: await getReviewInitiative(env.DB, authorization.ownerId, recommendation.initiativeId),
    }))),
    nextStep: "Project는 아직 생성되지 않았습니다. 추천 이유·상위 Objective/KR 경로와 생성 내용을 사용자에게 보여주고, 확인 링크에서 Initiative를 직접 선택한 뒤 최종 생성하게 하세요. 추천이 틀리면 다른 후보 검색 또는 생성 보류가 가능합니다. AI가 승인 화면을 대신 조작하거나 다른 도구로 우회 생성해서는 안 됩니다.",
  };
}
