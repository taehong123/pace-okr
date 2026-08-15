import {
  PROPERTY_TYPES,
  authorizeRequest,
  createPropertyDefinition,
  deletePropertyDefinition,
  ensureWorkspace,
  getPropertyValueMap,
  listPropertyDefinitions,
  serializePropertyDefinition,
  type PropertyType,
} from "@/lib/pace-data";

export async function GET(request: Request) {
  const authorization = authorizeRequest(request);
  if (authorization instanceof Response) return authorization;

  try {
    await ensureWorkspace(authorization.ownerId);
    const [properties, values] = await Promise.all([
      listPropertyDefinitions(authorization.ownerId),
      getPropertyValueMap(authorization.ownerId),
    ]);
    return Response.json({
      properties: properties.map(serializePropertyDefinition),
      values,
    });
  } catch (error) {
    return routeError(error);
  }
}

export async function POST(request: Request) {
  const authorization = authorizeRequest(request);
  if (authorization instanceof Response) return authorization;

  try {
    await ensureWorkspace(authorization.ownerId);
    const payload = (await request.json()) as Record<string, unknown>;
    const name = typeof payload.name === "string" ? payload.name.trim() : "";
    const type = typeof payload.type === "string" && PROPERTY_TYPES.includes(payload.type as PropertyType)
      ? payload.type as PropertyType
      : null;
    if (!name) return Response.json({ error: "name is required" }, { status: 400 });
    if (!type) return Response.json({ error: "supported type is required" }, { status: 400 });

    const property = await createPropertyDefinition(authorization.ownerId, {
      name,
      type,
      options: Array.isArray(payload.options)
        ? payload.options.filter((option): option is string => typeof option === "string")
        : [],
    });
    return Response.json({ property: serializePropertyDefinition(property) }, { status: 201 });
  } catch (error) {
    return routeError(error);
  }
}

export async function DELETE(request: Request) {
  const authorization = authorizeRequest(request);
  if (authorization instanceof Response) return authorization;

  try {
    await ensureWorkspace(authorization.ownerId);
    const id = new URL(request.url).searchParams.get("id")?.trim();
    if (!id) return Response.json({ error: "id is required" }, { status: 400 });
    await deletePropertyDefinition(authorization.ownerId, id);
    return Response.json({ deleted: true, id });
  } catch (error) {
    return routeError(error);
  }
}

function routeError(error: unknown) {
  const message = error instanceof Error ? error.message : "Unexpected error";
  const status = /required|unsupported|already exists|not found/i.test(message) ? 400 : 500;
  return Response.json({ error: message }, { status });
}
