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
  const authorization = await authorizeRequest(request, { allowViewerWrite: true });
  if (authorization instanceof Response) return authorization;

  try {
    await ensureWorkspace(authorization.ownerId);
    const url = new URL(request.url);
    const date = url.searchParams.get("date") ?? new Date().toISOString().slice(0, 10);
    const [
      itemRows,
      propertyRows,
      propertyValues,
      propertyUsageCounts,
      hiddenByProject,
      archivedRows,
      routines,
      workspaces,
      rules,
      cycles,
      team,
    ] = await Promise.all([
      listItems(authorization.ownerId),
      listProjectPropertyDefinitions(authorization.ownerId),
      getProjectPropertyValueMap(authorization.ownerId),
      getProjectPropertyUsageCounts(authorization.ownerId),
      getProjectHiddenPropertyMap(authorization.ownerId),
      listArchivedProjects(authorization.ownerId),
      listRoutines(authorization.ownerId, date, true),
      listUserWorkspaces(authorization.userId, authorization.ownerId),
      getWorkspaceRules(authorization.ownerId),
      listOkrCycles(authorization.ownerId),
      getTeam(authorization.ownerId, authorization.userId),
    ]);
    const [itemAssignments, archiveAssignments] = await Promise.all([
      getItemAssignmentMap(authorization.ownerId, itemRows.map((item) => item.id)),
      getItemAssignmentMap(authorization.ownerId, archivedRows.map((entry) => entry.project.id)),
    ]);
    const hostname = url.hostname;
    const provider = hostname === "localhost" || hostname === "127.0.0.1"
      ? "local"
      : request.headers.get("oai-authenticated-user-id")
        ? "openai"
        : "google";

    return Response.json({
      user: {
        id: authorization.userId,
        email: authorization.email,
        displayName: authorization.displayName,
        provider,
      },
      items: itemRows.map((item) => serializeItem(item, {}, itemAssignments[item.id] ?? [])),
      properties: propertyRows.map((property) => serializePropertyDefinition(property, propertyUsageCounts[property.id] ?? 0)),
      propertyValues,
      hiddenByProject,
      archivedProjects: archivedRows.map((entry) => ({
        ...serializeItem(entry.project, {}, archiveAssignments[entry.project.id] ?? []),
        archivedTaskCount: entry.taskCount,
      })),
      routines,
      workspaces,
      rules,
      cycles,
      team: {
        ...team,
        currentRole: authorization.role,
        canManage: canManageTeam(authorization),
      },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load workspace";
    return Response.json({ error: message }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
