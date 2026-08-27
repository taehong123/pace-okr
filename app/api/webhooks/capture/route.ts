import { authorizeRequest, createItem, ensureWorkspace, serializeItem } from "@/lib/pace-data";

export async function POST(request: Request) {
  const authorization = await authorizeRequest(request);
  if (authorization instanceof Response) return authorization;

  try {
    const payload = (await request.json()) as Record<string, unknown>;
    if (typeof payload.challenge === "string") {
      return Response.json({ challenge: payload.challenge });
    }

    const capture = extractCapture(payload);
    if (!capture.title) {
      return Response.json({ error: "No message text found" }, { status: 400 });
    }

    await ensureWorkspace(authorization.ownerId);
    const item = await createItem(authorization.ownerId, {
      title: capture.title,
      description: capture.description,
      kind: "task",
      source: capture.source,
      sourceRef: capture.sourceRef,
    });

    return Response.json({ ok: true, item: serializeItem(item) }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return Response.json({ error: message }, { status: 500 });
  }
}

function extractCapture(payload: Record<string, unknown>) {
  const event = isRecord(payload.event) ? payload.event : {};
  const message = isRecord(payload.message) ? payload.message : {};
  const text = firstString(payload.text, event.text, message.content, message.text);
  const source = event.text ? "slack" : message.content ? "discord" : message.text ? "telegram" : "bot";
  const sourceRef = firstString(payload.event_id, message.id, message.message_id);
  return { title: text.trim(), description: "", source, sourceRef: sourceRef || null };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function firstString(...values: unknown[]) {
  return values.find((value): value is string => typeof value === "string") ?? "";
}
