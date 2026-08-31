import { deleteAssistantDraft, getAssistantDraft, saveAssistantDraft } from "@/lib/assistant-drafts";
import { authorizeRequest, ensureWorkspace } from "@/lib/pace-data";

export async function GET(request: Request) {
  return handle(request, async (ownerId, userId, key) => ({ draft: await getAssistantDraft(ownerId, userId, key) }));
}

export async function PUT(request: Request) {
  return handle(request, async (ownerId, userId, key) => {
    const payload = await request.json() as { payload?: unknown };
    return saveAssistantDraft(ownerId, userId, key, payload.payload);
  });
}

export async function DELETE(request: Request) {
  return handle(request, (ownerId, userId, key) => deleteAssistantDraft(ownerId, userId, key));
}

async function handle(request: Request, action: (ownerId: string, userId: string, key: string) => Promise<unknown>) {
  const authorization = await authorizeRequest(request, { allowViewerWrite: true });
  if (authorization instanceof Response) return authorization;
  try {
    await ensureWorkspace(authorization.ownerId);
    const key = new URL(request.url).searchParams.get("key") ?? "";
    return Response.json(await action(authorization.ownerId, authorization.userId, key));
  } catch (error) {
    const message = error instanceof Error ? error.message : "대화 초안을 처리하지 못했습니다.";
    const status = /올바르지|너무 큽니다/.test(message) ? 400 : 500;
    return Response.json({ error: message }, { status });
  }
}
