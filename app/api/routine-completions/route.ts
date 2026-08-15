import { authorizeRequest, ensureWorkspace, setRoutineCompletion } from "@/lib/pace-data";

export async function PUT(request: Request) {
  const authorization = await authorizeRequest(request);
  if (authorization instanceof Response) return authorization;
  try {
    await ensureWorkspace(authorization.ownerId);
    const payload = (await request.json()) as Record<string, unknown>;
    const routineId = typeof payload.routineId === "string" ? payload.routineId.trim() : "";
    const date = typeof payload.date === "string" ? payload.date : "";
    if (!routineId || !date || typeof payload.completed !== "boolean") {
      return Response.json({ error: "routineId, date, and completed are required" }, { status: 400 });
    }
    const routine = await setRoutineCompletion(
      authorization.ownerId,
      routineId,
      date,
      payload.completed,
      typeof payload.note === "string" ? payload.note : "",
    );
    return Response.json({ routine });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    const status = /required|not found|date|invalid/i.test(message) ? 400 : 500;
    return Response.json({ error: message }, { status });
  }
}
