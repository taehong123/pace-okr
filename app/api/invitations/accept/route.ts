import { acceptWorkspaceInvitation, authorizeRequest } from "@/lib/pace-data";
import { BillingLimitError } from "@/lib/billing";

export async function POST(request: Request) {
  const authorization = await authorizeRequest(request);
  if (authorization instanceof Response) return authorization;
  try {
    const payload = await request.json() as Record<string, unknown>;
    const token = typeof payload.token === "string" ? payload.token.trim() : "";
    if (!token) return Response.json({ error: "Invitation token is required" }, { status: 400 });
    const result = await acceptWorkspaceInvitation(authorization, token);
    return Response.json(result, {
      headers: {
        "Set-Cookie": `okri_workspace_id=${encodeURIComponent(result.workspaceId)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${60 * 60 * 24 * 365}`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invitation could not be accepted";
    if (error instanceof BillingLimitError) return Response.json({ error: message, code: error.code, ...error.details }, { status: 409 });
    const status = /matches|linked to another/i.test(message) ? 403 : /not found/i.test(message) ? 404 : 400;
    return Response.json({ error: message }, { status });
  }
}
