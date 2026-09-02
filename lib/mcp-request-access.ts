// MCP reads use HTTP POST too. Unknown tools and batches must retain write authorization.
const readOnlyTools = new Set([
  "get_workspace_rules", "list_items", "review_period", "list_properties", "get_project_document",
  "list_project_templates", "list_checklist_items", "get_daily_scrum", "get_recommendations",
  "list_routines", "list_team_members", "list_groups", "list_group_members", "prepare_work",
]);
export function isReadOnlyOAuthMcpRequest(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return false;
  const { method, params } = payload as { method?: unknown; params?: { name?: unknown } };
  if (["initialize", "notifications/initialized", "ping", "tools/list", "resources/list", "resources/templates/list", "prompts/list"].includes(String(method))) return true;
  return method === "tools/call" && typeof params?.name === "string" && readOnlyTools.has(params.name);
}
