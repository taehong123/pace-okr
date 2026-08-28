import {
  ITEM_CADENCES,
  ITEM_KINDS,
  ITEM_PRIORITIES,
  ITEM_STATUSES,
  authorizeRequest,
  createItem,
  ensureWorkspace,
  getItemAssignmentMap,
  getPeriodReview,
  listItems,
  replaceItemAssignmentRole,
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
    const requestedStatus = url.searchParams.get("status");
    if (requestedStatus && !asValue(requestedStatus, ITEM_STATUSES)) {
      return Response.json({ error: "unsupported status" }, { status: 400 });
    }
    if (url.searchParams.get("review") === "true" && cadence) {
      const review = await getPeriodReview(authorization.ownerId, cadence);
      const assignments = await getItemAssignmentMap(authorization.ownerId, review.items.map((item) => item.id));
      return Response.json({ review: { ...review, items: review.items.map((item) => serializeItem(item, {}, assignments[item.id] ?? [])) } });
    }

    const rows = await listItems(authorization.ownerId, {
      kind: asValue(url.searchParams.get("kind"), ITEM_KINDS),
      status: asValue(requestedStatus, ITEM_STATUSES),
      cadence,
      parentId: url.searchParams.get("parentId") ?? undefined,
      query: url.searchParams.get("q") ?? undefined,
      includeArchived: url.searchParams.get("includeArchived") === "true",
    });
    const assignments = await getItemAssignmentMap(authorization.ownerId, rows.map((item) => item.id));
    return Response.json({ items: rows.map((item) => serializeItem(item, {}, assignments[item.id] ?? [])) });
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
    if (payload.status !== undefined && !asValue(payload.status, ITEM_STATUSES)) {
      return Response.json({ error: "unsupported status" }, { status: 400 });
    }

    const item = await createItem(authorization.ownerId, {
      title,
      description: asString(payload.description),
      kind: asValue(payload.kind, ITEM_KINDS) as ItemKind | undefined,
      cycleId: payload.cycleId === undefined ? undefined : asNullableString(payload.cycleId),
      parentId: payload.parentId === undefined ? undefined : asNullableString(payload.parentId),
      routineId: asNullableString(payload.routineId),
      status: asValue(payload.status, ITEM_STATUSES) as ItemStatus | undefined,
      priority: asValue(payload.priority, ITEM_PRIORITIES) as ItemPriority | undefined,
      cadence: asValue(payload.cadence, ITEM_CADENCES) as ItemCadence | undefined,
      progress: typeof payload.progress === "number" ? payload.progress : undefined,
      dueDate: payload.dueDate === undefined ? undefined : asNullableString(payload.dueDate),
      source: asString(payload.source) || "web",
      sourceRef: asNullableString(payload.sourceRef),
      templateId: asNullableString(payload.templateId),
      createdByUserId: authorization.userId,
    });
    await saveAssignments(authorization.ownerId, item.id, item.kind as ItemKind, payload);
    const assignments = await getItemAssignmentMap(authorization.ownerId, [item.id]);
    return Response.json({ item: serializeItem(item, {}, assignments[item.id] ?? []) }, { status: 201 });
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
    if (payload.status !== undefined && !asValue(payload.status, ITEM_STATUSES)) {
      return Response.json({ error: "unsupported status" }, { status: 400 });
    }

    const item = await updateItem(authorization.ownerId, id, {
      title: asOptionalString(payload.title),
      description: asOptionalString(payload.description),
      cycleId: payload.cycleId === undefined ? undefined : asNullableString(payload.cycleId),
      status: asValue(payload.status, ITEM_STATUSES),
      priority: asValue(payload.priority, ITEM_PRIORITIES),
      cadence: asValue(payload.cadence, ITEM_CADENCES),
      progress: typeof payload.progress === "number" ? payload.progress : undefined,
      dueDate: payload.dueDate === undefined ? undefined : asNullableString(payload.dueDate),
      parentId: payload.parentId === undefined ? undefined : asNullableString(payload.parentId),
      routineId: payload.routineId === undefined ? undefined : asNullableString(payload.routineId),
      source: asOptionalString(payload.source) || "web",
    });
    await saveAssignments(authorization.ownerId, item.id, item.kind as ItemKind, payload);
    const assignments = await getItemAssignmentMap(authorization.ownerId, [item.id]);
    return Response.json({ item: serializeItem(item, {}, assignments[item.id] ?? []) });
  } catch (error) {
    return routeError(error);
  }
}

async function saveAssignments(ownerId: string, itemId: string, kind: ItemKind, payload: Record<string, unknown>) {
  if (kind === "project") {
    if (payload.driMemberId !== undefined) {
      await replaceItemAssignmentRole(ownerId, itemId, "project_dri", asMemberIds(payload.driMemberId, 1));
    }
    if (payload.workerMemberIds !== undefined) {
      await replaceItemAssignmentRole(ownerId, itemId, "project_worker", asMemberIds(payload.workerMemberIds));
    }
  }
  if (kind === "task" && payload.assigneeMemberId !== undefined) {
    await replaceItemAssignmentRole(ownerId, itemId, "task_assignee", asMemberIds(payload.assigneeMemberId, 1));
  }
}

function asMemberIds(value: unknown, max?: number) {
  const values = Array.isArray(value) ? value : typeof value === "string" && value.trim() ? [value] : [];
  const ids = values.filter((entry): entry is string => typeof entry === "string" && Boolean(entry.trim())).map((entry) => entry.trim());
  if (max !== undefined && ids.length > max) throw new Error("Only one accountable member is allowed");
  return ids;
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
  const status = /required|requires|must be|cannot have|not found|only an|archive|restore|active workspace|assignment/i.test(
    message,
  )
    ? 400
    : 500;
  return Response.json({ error: message }, { status });
}
