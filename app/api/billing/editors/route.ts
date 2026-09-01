import { saveEditorSelections } from "@/lib/billing";
import { authorizeRequest } from "@/lib/pace-data";

export async function PATCH(request: Request) {
  const authorization = await authorizeRequest(request, { allowViewerWrite: true });
  if (authorization instanceof Response) return authorization;
  if (authorization.role !== "owner") return Response.json({ error: "활성 편집자는 Owner만 선택할 수 있습니다." }, { status: 403 });
  const payload = await request.json().catch(() => null) as { memberIds?: unknown } | null;
  if (!Array.isArray(payload?.memberIds) || payload.memberIds.some((id) => typeof id !== "string")) {
    return Response.json({ error: "memberIds 배열이 필요합니다." }, { status: 400 });
  }
  try {
    return Response.json(await saveEditorSelections(authorization.ownerId, payload.memberIds as string[]));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "활성 편집자를 저장하지 못했습니다." }, { status: 400 });
  }
}
