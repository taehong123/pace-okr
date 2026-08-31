import { previewWorkspaceInvitation } from "@/lib/pace-data";

export async function GET(request: Request) {
  try {
    const token = new URL(request.url).searchParams.get("token")?.trim() ?? "";
    if (!token) return Response.json({ error: "Invitation token is required" }, { status: 400 });
    return Response.json({ invitation: await previewWorkspaceInvitation(token) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invitation could not be loaded";
    return Response.json({ error: message }, { status: /not found/i.test(message) ? 404 : 400 });
  }
}
