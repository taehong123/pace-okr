import {
  ITEM_CADENCES,
  ITEM_KINDS,
  ITEM_PRIORITIES,
  ITEM_STATUSES,
  authorizeRequest,
  createItem,
  ensureWorkspace,
  getPeriodReview,
  listItems,
  serializeItem,
  updateItem,
  type ItemCadence,
  type ItemKind,
  type ItemPriority,
  type ItemStatus,
} from "@/lib/pace-data";

export async function GET(request: Request) {
  const authorization = await authorizeRequest(request);
  if (authorization instanceof Response) return authorization;

  try {
    await ensureWorkspace(authorization.ownerId);
    const url = new URL(request.url);
    const cadence = asValue(url.searchParams.get("cadence"), ITEM_CADENCES);
    if (url.searchParams.get("review") === "true" && cadence) {
      const review = await getPeriodReview(authorization.ownerId, cadence);
      return Response.json({ review: { ...review, items: review.items.map((item) => serializeItem(item)) } });
    }

    const rows = await listItems(authorization.ownerId, {
      kind: asValue(url.searchParams.get("kind"), ITEM_KINDS),
      status: asValue(url.searchParams.get("status"), ITEM_STATUSES),
      cadence,
      parentId: url.searchParams.get("parentId") ?? undefined,
      query: url.searchParams.get("q") ?? undefined,
    });
    return Response.json({ items: rows.map((item) => serializeItem(item)) });
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
    const title = typeof payload.title === "string" ? payload.title.trim() : "";
    if (!title) return Response.json({ error: "title is required" }, { status: 400 });

    const item = await createItem(authorization.ownerId, {
      title,
      description: asString(payload.description),
      kind: asValue(payload.kind, ITEM_KINDS) as ItemKind | undefined,
      parentId: asNullableString(payload.parentId),
      status: asValue(payload.status, ITEM_STATUSES) as ItemStatus | undefined,
      priority: asValue(payload.priority, ITEM_PRIORITIES) as ItemPriority | undefined,
      cadence: asValue(payload.cadence, ITEM_CADENCES) as ItemCadence | undefined,
      progress: typeof payload.progress === "number" ? payload.progress : undefined,
      dueDate: asNullableString(payload.dueDate),
      source: asString(payload.source) || "web",
      sourceRef: asNullableString(payload.sourceRef),
    });
    return Response.json({ item: serializeItem(item) }, { status: 201 });
  } catch (error) {
    return routeError(error);
  }
}

export async function PATCH(request: Request) {
  const authorization = await authorizeRequest(request);
  if (authorization instanceof Response) return authorization;

  try {
    await ensureWorkspace(authorization.ownerId);
    const payload = (await request.json()) as Record<string, unknown>;
    const id = asString(payload.id);
    if (!id) return Response.json({ error: "id is required" }, { status: 400 });

    const item = await updateItem(authorization.ownerId, id, {
      title: asOptionalString(payload.title),
      description: asOptionalString(payload.description),
      status: asValue(payload.status, ITEM_STATUSES),
      priority: asValue(payload.priority, ITEM_PRIORITIES),
      cadence: asValue(payload.cadence, ITEM_CADENCES),
      progress: typeof payload.progress === "number" ? payload.progress : undefined,
      dueDate: payload.dueDate === undefined ? undefined : asNullableString(payload.dueDate),
      parentId: payload.parentId === undefined ? undefined : asNullableString(payload.parentId),
      source: asOptionalString(payload.source) || "web",
    });
    return Response.json({ item: serializeItem(item) });
  } catch (error) {
    return routeError(error);
  }
}

function asValue<T extends readonly string[]>(value: unknown, values: T): T[number] | undefined {
  return typeof value === "string" && values.includes(value) ? (value as T[number]) : undefined;
}

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asOptionalString(value: unknown) {
  return value === undefined ? undefined : asString(value);
}

function asNullableString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function routeError(error: unknown) {
  const message = error instanceof Error ? error.message : "Unexpected error";
  const status = /required|requires|must be|cannot have|not found|only an/i.test(message) ? 400 : 500;
  return Response.json({ error: message }, { status });
}
