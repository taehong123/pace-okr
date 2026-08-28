import {
  authorizeRequest,
  ensureWorkspace,
  setPropertyValue,
  type PropertyValue,
} from "@/lib/pace-data";

export async function PATCH(request: Request) {
  const authorization = await authorizeRequest(request);
  if (authorization instanceof Response) return authorization;

  try {
    await ensureWorkspace(authorization.ownerId);
    const payload = (await request.json()) as Record<string, unknown>;
    const itemId = typeof payload.itemId === "string" ? payload.itemId.trim() : "";
    const propertyId = typeof payload.propertyId === "string" ? payload.propertyId.trim() : "";
    if (!itemId || !propertyId) {
      return Response.json({ error: "itemId and propertyId are required" }, { status: 400 });
    }
    if (!isPropertyValue(payload.value)) {
      return Response.json({ error: "value must be text, number, boolean, or null" }, { status: 400 });
    }

    await setPropertyValue(authorization.ownerId, itemId, propertyId, payload.value);
    return Response.json({ itemId, propertyId, value: payload.value });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    const status = /required|must be|not found|configured options|only|archived/i.test(message) ? 400 : 500;
    return Response.json({ error: message }, { status });
  }
}

function isPropertyValue(value: unknown): value is PropertyValue {
  return value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean" || (Array.isArray(value) && value.every((entry) => typeof entry === "string"));
}
