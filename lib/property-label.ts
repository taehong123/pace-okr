/** Translate only system-owned defaults. Renamed and custom properties remain user text. */
const defaults: Record<string, readonly string[]> = {
  parent_id: ["상위 Initiative"],
  status: ["상태"],
  priority: ["우선순위"],
  due_date: ["기한"],
  project_dri: ["책임자", "DRI"],
  project_workers: ["하위 업무자", "참여자"],
  progress: ["진행률"],
  cadence: ["검토 주기"],
};

export function systemPropertyLabel(
  property: { name: string; systemKey?: string | null } | undefined,
  translate: (message: string) => string,
  fallback = "",
) {
  if (!property) return translate(fallback);
  if (!property.systemKey || !defaults[property.systemKey]?.includes(property.name)) return property.name;
  return translate(property.systemKey === "project_dri" ? "책임자" : property.systemKey === "project_workers" ? "참여자" : property.name);
}
