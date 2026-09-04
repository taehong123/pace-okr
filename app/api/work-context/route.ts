import { env } from "cloudflare:workers";
import { z } from "zod";
import { authorizeRequest, ensureWorkspace, getWorkspaceRules } from "@/lib/pace-data";
import { readWorkContext, WORK_KINDS } from "@/lib/work-intake";

const inputSchema = z.object({
  kind: z.enum(WORK_KINDS).default("unsure"),
  query: z.string().max(120).optional(),
  memberQuery: z.string().max(120).optional(),
  limit: z.coerce.number().int().min(1).max(20).default(6),
  includeMembers: z.enum(["true", "false"]).optional(),
});

export async function GET(request: Request) {
  const authorization = await authorizeRequest(request);
  if (authorization instanceof Response) return authorization;
  const parsed = inputSchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return Response.json({ error: "Invalid work context parameters", details: parsed.error.flatten() }, { status: 400 });
  try {
    await ensureWorkspace(authorization.ownerId);
    const [context, rules] = await Promise.all([
      readWorkContext(env.DB, authorization.ownerId, authorization.userId, {
        ...parsed.data, includeMembers: parsed.data.includeMembers !== "false",
      }),
      getWorkspaceRules(authorization.ownerId),
    ]);
    return Response.json({ context: { ...context, rules } }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Unable to load work context" }, { status: 500 });
  }
}
