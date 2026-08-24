import {
  archiveProject,
  authorizeRequest,
  ensureWorkspace,
  getItemAssignmentMap,
  listArchivedProjects,
  restoreProject,
  serializeItem,
} from "@/lib/pace-data";

export async function GET(request: Request) {
  const authorization = await authorizeRequest(request);
  if (authorization instanceof Response) return authorization;
  try {
    await ensureWorkspace(authorization.ownerId);
    const rows = await listArchivedProjects(authorization.ownerId);
    const assignments = await getItemAssignmentMap(authorization.ownerId, rows.map((entry) => entry.project.id));
    return Response.json({
      projects: rows.map((entry) => ({
        ...serializeItem(entry.project, {}, assignments[entry.project.id] ?? []),
        archivedTaskCount: entry.taskCount,
      })),
    });
  } catch (error) {
    return routeError(error);
  }
}

export async function POST(request: Request) {
  const authorization = await authorizeRequest(request);
  if (authorization instanceof Response) return authorization;
  try {
    await ensureWorkspace(authorization.ownerId);
    const payload = await request.json() as Record<string, unknown>;
    const projectId = typeof payload.projectId === "string" ? payload.projectId.trim() : "";
    if (!projectId) return Response.json({ error: "projectId is required" }, { status: 400 });
    const result = await archiveProject(authorization.ownerId, projectId);
    const assignments = await getItemAssignmentMap(authorization.ownerId, [projectId]);
    return Response.json({
      project: serializeItem(result.project, {}, assignments[projectId] ?? []),
      archivedTaskCount: Math.max(0, result.affectedCount - 1),
    });
  } catch (error) {
    return routeError(error);
  }
}

export async function DELETE(request: Request) {
  const authorization = await authorizeRequest(request);
  if (authorization instanceof Response) return authorization;
  try {
    await ensureWorkspace(authorization.ownerId);
    const projectId = new URL(request.url).searchParams.get("projectId")?.trim() ?? "";
    if (!projectId) return Response.json({ error: "projectId is required" }, { status: 400 });
    const result = await restoreProject(authorization.ownerId, projectId);
    return Response.json({ restored: true, projectId, restoredCount: result.affectedCount });
  } catch (error) {
    return routeError(error);
  }
}

function routeError(error: unknown) {
  const message = error instanceof Error ? error.message : "Unexpected error";
  const status = /required|not found|already archived|not archived/i.test(message) ? 400 : 500;
  return Response.json({ error: message }, { status });
}
