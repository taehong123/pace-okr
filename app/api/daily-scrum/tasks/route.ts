import { createExplicitDailyTask } from "@/lib/daily-bot";
import { authorizeRequest, serializeItem } from "@/lib/pace-data";
import { dailyRouteError } from "../route";

export async function POST(request: Request) {
  const authorization = await authorizeRequest(request);
  if (authorization instanceof Response) return authorization;
  try {
    const payload = await request.json() as Record<string, unknown>;
    const task = await createExplicitDailyTask(authorization, {
      date: typeof payload.date === "string" ? payload.date : new Date().toISOString().slice(0, 10),
      title: typeof payload.title === "string" ? payload.title : "",
      parentKind: payload.parentKind === "project" || payload.parentKind === "routine" || payload.parentKind === "general" ? payload.parentKind : undefined,
      parentId: typeof payload.parentId === "string" ? payload.parentId : null,
      requestId: typeof payload.requestId === "string" ? payload.requestId : undefined,
    });
    return Response.json({ task: serializeItem(task) }, { status: 201 });
  } catch (error) {
    return dailyRouteError(error);
  }
}
