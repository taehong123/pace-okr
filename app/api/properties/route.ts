import {
  PROPERTY_TYPES,
  analyzePropertyTypeChange,
  authorizeRequest,
  createPropertyDefinition,
  deletePropertyDefinition,
  ensureWorkspace,
  getProjectHiddenPropertyMap,
  getProjectPropertyUsageCounts,
  getProjectPropertyValueMap,
  listProjectPropertyDefinitions,
  serializePropertyDefinition,
  updatePropertyDefinition,
  type PropertyValue,
  type PropertyType,
} from "@/lib/pace-data";

export async function GET(request: Request) {
  const authorization = await authorizeRequest(request);
  if (authorization instanceof Response) return authorization;

  try {
    await ensureWorkspace(authorization.ownerId);
    const includeInactive = new URL(request.url).searchParams.get("includeInactive") === "true";
    const [properties, values, usageCounts, hiddenByProject] = await Promise.all([
      listProjectPropertyDefinitions(authorization.ownerId, includeInactive),
      getProjectPropertyValueMap(authorization.ownerId),
      getProjectPropertyUsageCounts(authorization.ownerId),
      getProjectHiddenPropertyMap(authorization.ownerId),
    ]);
    return Response.json({
      properties: properties.map((property) => serializePropertyDefinition(property, usageCounts[property.id] ?? 0)),
      values,
      hiddenByProject,
    });
  } catch (error) {
    return routeError(error);
  }
}

export async function POST(request: Request) {
  const authorization = await authorizeRequest(request);
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
      defaultValue: isPropertyValue(payload.defaultValue) ? payload.defaultValue : null,
    });
    return Response.json({ property: serializePropertyDefinition(property) }, { status: 201 });
  } catch (error) {
    return routeError(error);
  }
}

export async function PATCH(request: Request) {
  const authorization = await authorizeRequest(request);
  if (authorization instanceof Response) return authorization;

  try {
    await ensureWorkspace(authorization.ownerId);
    const payload = await request.json() as Record<string, unknown>;
    const id = typeof payload.id === "string" ? payload.id.trim() : "";
    if (!id) return Response.json({ error: "id is required" }, { status: 400 });
    const type = typeof payload.type === "string" && PROPERTY_TYPES.includes(payload.type as PropertyType)
      ? payload.type as PropertyType
      : undefined;
    const options = Array.isArray(payload.options)
      ? payload.options.filter((option): option is string => typeof option === "string")
      : undefined;
    if (payload.preview === true) {
      if (!type) return Response.json({ error: "type is required for preview" }, { status: 400 });
      return Response.json({ analysis: await analyzePropertyTypeChange(authorization.ownerId, id, { type, options }) });
    }
    const property = await updatePropertyDefinition(authorization.ownerId, id, {
      name: typeof payload.name === "string" ? payload.name : undefined,
      type,
      options,
      defaultValue: isPropertyValue(payload.defaultValue) ? payload.defaultValue : undefined,
      sortOrder: typeof payload.sortOrder === "number" ? payload.sortOrder : undefined,
      active: typeof payload.active === "boolean" ? payload.active : undefined,
    });
    return Response.json({ property: serializePropertyDefinition(property) });
  } catch (error) {
    return routeError(error);
  }
}

export async function DELETE(request: Request) {
  const authorization = await authorizeRequest(request);
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
  const status = /required|unsupported|already exists|not found|assignment fields/i.test(message) ? 400 : 500;
  return Response.json({ error: message }, { status });
}

function isPropertyValue(value: unknown): value is PropertyValue {
  return value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean" || (Array.isArray(value) && value.every((entry) => typeof entry === "string"));
}
