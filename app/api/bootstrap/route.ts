import {
  authorizeRequest,
  canManageTeam,
  ensureWorkspace,
  getItemAssignmentMap,
  getProjectHiddenPropertyMap,
  getProjectPropertyUsageCounts,
  getProjectPropertyValueMap,
  getTeam,
  getWorkspaceRules,
  listArchivedProjects,
  listItems,
  listOkrCycles,
  listProjectPropertyDefinitions,
  listRoutines,
  listUserWorkspaces,
  serializeItem,
  serializePropertyDefinition,
} from "@/lib/pace-data";

export async function GET(request: Request) {
  const requestStartedAt = Date.now();
  const authorization = await authorizeRequest(request, { allowViewerWrite: true });
  if (authorization instanceof Response) return authorization;
  const authorizedAt = Date.now();

  try {
    const url = new URL(request.url);
    const date = url.searchParams.get("date") ?? new Date().toISOString().slice(0, 10);
    await ensureWorkspace(authorization.ownerId);
    const workspaceReadyAt = Date.now();
    const hostname = url.hostname;
    const provider = hostname === "localhost" || hostname === "127.0.0.1" ? "local" : "google";

    const loadShell = async () => {
      const [workspaces, rules, cycles, team] = await Promise.all([
        listUserWorkspaces(authorization.userId, authorization.ownerId),
        getWorkspaceRules(authorization.ownerId),
        listOkrCycles(authorization.ownerId),
        getTeam(authorization.ownerId, authorization.userId),
      ]);
      return {
        user: {
        id: authorization.userId,
        email: authorization.email,
        displayName: authorization.displayName,
        provider,
        },
        workspaces,
        rules,
        cycles,
        team: {
          ...team,
          currentRole: authorization.role,
          canManage: canManageTeam(authorization),
        },
      };
    };

    const loadData = async () => {
      const [itemRows, propertyRows, propertyValues, propertyUsageCounts, hiddenByProject, archivedRows, routines] = await Promise.all([
        listItems(authorization.ownerId),
        listProjectPropertyDefinitions(authorization.ownerId, true),
        getProjectPropertyValueMap(authorization.ownerId),
        getProjectPropertyUsageCounts(authorization.ownerId),
        getProjectHiddenPropertyMap(authorization.ownerId),
        listArchivedProjects(authorization.ownerId),
        listRoutines(authorization.ownerId, date, true),
      ]);
      const [itemAssignments, archiveAssignments] = await Promise.all([
        getItemAssignmentMap(authorization.ownerId, itemRows.map((item) => item.id)),
        getItemAssignmentMap(authorization.ownerId, archivedRows.map((entry) => entry.project.id)),
      ]);
      return {
        items: itemRows.map((item) => serializeItem(item, {}, itemAssignments[item.id] ?? [])),
        properties: propertyRows.map((property) => serializePropertyDefinition(property, propertyUsageCounts[property.id] ?? 0)),
        propertyValues,
        hiddenByProject,
        archivedProjects: archivedRows.map((entry) => ({
          ...serializeItem(entry.project, {}, archiveAssignments[entry.project.id] ?? []),
          archivedTaskCount: entry.taskCount,
        })),
        routines,
      };
    };

    const payload = Object.assign({}, ...await Promise.all([loadShell(), loadData()]));
    const payloadReadyAt = Date.now();

    const headers = new Headers({ "Cache-Control": "no-store" });
    headers.set("Server-Timing", [
      `auth;dur=${authorizedAt - requestStartedAt}`,
      `workspace;dur=${workspaceReadyAt - authorizedAt}`,
      `data;dur=${payloadReadyAt - workspaceReadyAt}`,
      `total;dur=${payloadReadyAt - requestStartedAt}`,
    ].join(", "));
    const secure = url.protocol === "https:" ? "; Secure" : "";
    headers.append(
      "Set-Cookie",
      `okri_workspace_id=${encodeURIComponent(authorization.ownerId)}; Path=/; HttpOnly${secure}; SameSite=Lax; Max-Age=31536000`,
    );
    return Response.json(payload, { headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load workspace";
    return Response.json({ error: message }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
