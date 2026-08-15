import { env } from "cloudflare:workers";
import { and, asc, desc, eq, like, lte, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  activityLog,
  checklistItems,
  dailyScrums,
  itemPropertyValues,
  items,
  propertyDefinitions,
  routineCompletions,
  routines,
  type PaceItem,
  type PropertyDefinition,
} from "@/db/schema";

export const ITEM_KINDS = ["objective", "key_result", "initiative", "project", "task"] as const;
export const ITEM_STATUSES = ["inbox", "todo", "in_progress", "done", "blocked"] as const;
export const ITEM_PRIORITIES = ["low", "medium", "high", "urgent"] as const;
export const ITEM_CADENCES = ["daily", "weekly", "monthly", "quarterly"] as const;
export const PROPERTY_TYPES = ["text", "number", "select", "date", "checkbox"] as const;
export const ROUTINE_CADENCES = ["daily", "weekly", "monthly"] as const;

export type ItemKind = (typeof ITEM_KINDS)[number];
export type ItemStatus = (typeof ITEM_STATUSES)[number];
export type ItemPriority = (typeof ITEM_PRIORITIES)[number];
export type ItemCadence = (typeof ITEM_CADENCES)[number];
export type PropertyType = (typeof PROPERTY_TYPES)[number];
export type PropertyValue = string | number | boolean | null;
export type RoutineCadence = (typeof ROUTINE_CADENCES)[number];

type RuntimeEnv = typeof env & { OKITA_API_TOKEN?: string; PACE_API_TOKEN?: string };
let schemaReady: Promise<void> | null = null;

const parentKind: Record<ItemKind, ItemKind | null> = {
  objective: null,
  key_result: "objective",
  initiative: "key_result",
  project: "initiative",
  task: "project",
};

export async function ensureWorkspace(ownerId: string) {
  if (!schemaReady) {
    const d1 = (env as RuntimeEnv).DB;
    schemaReady = d1
      .batch([
        d1.prepare(`CREATE TABLE IF NOT EXISTS items (
          id TEXT PRIMARY KEY,
          owner_id TEXT NOT NULL,
          parent_id TEXT,
          kind TEXT NOT NULL,
          title TEXT NOT NULL,
          description TEXT NOT NULL DEFAULT '',
          status TEXT NOT NULL DEFAULT 'todo',
          priority TEXT NOT NULL DEFAULT 'medium',
          cadence TEXT NOT NULL DEFAULT 'weekly',
          progress INTEGER NOT NULL DEFAULT 0,
          due_date TEXT,
          source TEXT NOT NULL DEFAULT 'web',
          source_ref TEXT,
          sort_order INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`),
        d1.prepare("CREATE INDEX IF NOT EXISTS idx_items_owner_status ON items(owner_id, status)"),
        d1.prepare("CREATE INDEX IF NOT EXISTS idx_items_owner_parent ON items(owner_id, parent_id)"),
        d1.prepare("CREATE INDEX IF NOT EXISTS idx_items_owner_cadence ON items(owner_id, cadence)"),
        d1.prepare(`CREATE TABLE IF NOT EXISTS activity_log (
          id TEXT PRIMARY KEY,
          owner_id TEXT NOT NULL,
          item_id TEXT NOT NULL,
          action TEXT NOT NULL,
          source TEXT NOT NULL DEFAULT 'web',
          payload TEXT NOT NULL DEFAULT '{}',
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`),
        d1.prepare("CREATE INDEX IF NOT EXISTS idx_activity_owner_created ON activity_log(owner_id, created_at)"),
        d1.prepare("CREATE INDEX IF NOT EXISTS idx_activity_item ON activity_log(item_id)"),
        d1.prepare(`CREATE TABLE IF NOT EXISTS property_definitions (
          id TEXT PRIMARY KEY,
          owner_id TEXT NOT NULL,
          name TEXT NOT NULL,
          type TEXT NOT NULL,
          options TEXT NOT NULL DEFAULT '[]',
          sort_order INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`),
        d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_property_definitions_owner_name ON property_definitions(owner_id, name)"),
        d1.prepare("CREATE INDEX IF NOT EXISTS idx_property_definitions_owner_sort ON property_definitions(owner_id, sort_order)"),
        d1.prepare(`CREATE TABLE IF NOT EXISTS item_property_values (
          id TEXT PRIMARY KEY,
          owner_id TEXT NOT NULL,
          item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
          property_id TEXT NOT NULL REFERENCES property_definitions(id) ON DELETE CASCADE,
          value TEXT NOT NULL DEFAULT 'null',
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`),
        d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_item_property_values_unique ON item_property_values(owner_id, item_id, property_id)"),
        d1.prepare("CREATE INDEX IF NOT EXISTS idx_item_property_values_owner_item ON item_property_values(owner_id, item_id)"),
        d1.prepare("CREATE INDEX IF NOT EXISTS idx_item_property_values_owner_property ON item_property_values(owner_id, property_id)"),
        d1.prepare(`CREATE TABLE IF NOT EXISTS checklist_items (
          id TEXT PRIMARY KEY,
          owner_id TEXT NOT NULL,
          task_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
          title TEXT NOT NULL,
          completed INTEGER NOT NULL DEFAULT 0,
          sort_order INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`),
        d1.prepare("CREATE INDEX IF NOT EXISTS idx_checklist_owner_task ON checklist_items(owner_id, task_id)"),
        d1.prepare(`CREATE TABLE IF NOT EXISTS daily_scrums (
          id TEXT PRIMARY KEY,
          owner_id TEXT NOT NULL,
          scrum_date TEXT NOT NULL,
          yesterday_note TEXT NOT NULL DEFAULT '',
          today_note TEXT NOT NULL DEFAULT '',
          blockers_note TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`),
        d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_scrums_owner_date ON daily_scrums(owner_id, scrum_date)"),
        d1.prepare(`CREATE TABLE IF NOT EXISTS routines (
          id TEXT PRIMARY KEY,
          owner_id TEXT NOT NULL,
          title TEXT NOT NULL,
          description TEXT NOT NULL DEFAULT '',
          cadence TEXT NOT NULL DEFAULT 'daily',
          active INTEGER NOT NULL DEFAULT 1,
          sort_order INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`),
        d1.prepare("CREATE INDEX IF NOT EXISTS idx_routines_owner_active ON routines(owner_id, active)"),
        d1.prepare("CREATE INDEX IF NOT EXISTS idx_routines_owner_sort ON routines(owner_id, sort_order)"),
        d1.prepare(`CREATE TABLE IF NOT EXISTS routine_completions (
          id TEXT PRIMARY KEY,
          owner_id TEXT NOT NULL,
          routine_id TEXT NOT NULL REFERENCES routines(id) ON DELETE CASCADE,
          completion_date TEXT NOT NULL,
          note TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`),
        d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_routine_completions_unique ON routine_completions(owner_id, routine_id, completion_date)"),
        d1.prepare("CREATE INDEX IF NOT EXISTS idx_routine_completions_owner_date ON routine_completions(owner_id, completion_date)"),
        d1.prepare("PRAGMA optimize"),
      ])
      .then(() => undefined)
      .catch((error: unknown) => {
        schemaReady = null;
        throw error;
      });
  }

  await schemaReady;
  await migrateLegacyHierarchy(ownerId);
  await seedWorkspace(ownerId);
  await seedProperties(ownerId);
}

export function authorizeRequest(request: Request): { ownerId: string } | Response {
  const userId = request.headers.get("oai-authenticated-user-id");
  if (userId) return { ownerId: userId };

  const configuredToken = (env as RuntimeEnv).OKITA_API_TOKEN ?? (env as RuntimeEnv).PACE_API_TOKEN;
  const suppliedToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (configuredToken && suppliedToken === configuredToken) {
    return { ownerId: request.headers.get("x-okita-user-id") || request.headers.get("x-pace-user-id") || "api-workspace" };
  }

  const hostname = new URL(request.url).hostname;
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return { ownerId: "local-user" };
  }

  return Response.json(
    { error: "Authentication required. Sign in or provide an OKITA API token." },
    { status: 401, headers: { "WWW-Authenticate": "Bearer" } },
  );
}

export async function listItems(
  ownerId: string,
  filter: {
    kind?: ItemKind;
    status?: ItemStatus;
    cadence?: ItemCadence;
    parentId?: string;
    query?: string;
    limit?: number;
  } = {},
) {
  const conditions = [eq(items.ownerId, ownerId)];
  if (filter.kind) conditions.push(eq(items.kind, filter.kind));
  if (filter.status) conditions.push(eq(items.status, filter.status));
  if (filter.cadence) conditions.push(eq(items.cadence, filter.cadence));
  if (filter.parentId) conditions.push(eq(items.parentId, filter.parentId));
  if (filter.query) {
    conditions.push(
      or(
        like(items.title, `%${filter.query}%`),
        like(items.description, `%${filter.query}%`),
      )!,
    );
  }

  return getDb()
    .select()
    .from(items)
    .where(and(...conditions))
    .orderBy(asc(items.sortOrder), desc(items.createdAt))
    .limit(Math.min(filter.limit ?? 200, 200));
}

export async function getItem(ownerId: string, id: string) {
  const [item] = await getDb()
    .select()
    .from(items)
    .where(and(eq(items.ownerId, ownerId), eq(items.id, id)))
    .limit(1);
  return item ?? null;
}

export async function createItem(
  ownerId: string,
  input: {
    title: string;
    kind?: ItemKind;
    parentId?: string | null;
    description?: string;
    status?: ItemStatus;
    priority?: ItemPriority;
    cadence?: ItemCadence;
    progress?: number;
    dueDate?: string | null;
    source?: string;
    sourceRef?: string | null;
  },
) {
  const kind = input.kind ?? "task";
  const status = input.status ?? (kind === "task" && !input.parentId ? "inbox" : "todo");
  await validateParent(ownerId, kind, input.parentId ?? null, status);

  const id = crypto.randomUUID();
  const [created] = await getDb()
    .insert(items)
    .values({
      id,
      ownerId,
      parentId: input.parentId ?? null,
      kind,
      title: input.title.trim(),
      description: input.description?.trim() ?? "",
      status,
      priority: input.priority ?? "medium",
      cadence: input.cadence ?? "weekly",
      progress: clampProgress(input.progress ?? 0),
      dueDate: input.dueDate ?? null,
      source: input.source ?? "web",
      sourceRef: input.sourceRef ?? null,
    })
    .returning();

  await logActivity(ownerId, created.id, "created", created.source, { kind, status });
  return created;
}

export async function updateItem(
  ownerId: string,
  id: string,
  patch: Partial<{
    title: string;
    description: string;
    status: ItemStatus;
    priority: ItemPriority;
    cadence: ItemCadence;
    progress: number;
    dueDate: string | null;
    parentId: string | null;
    source: string;
  }>,
) {
  const current = await getItem(ownerId, id);
  if (!current) throw new Error("Item not found");

  if (patch.parentId !== undefined || patch.status !== undefined) {
    await validateParent(
      ownerId,
      current.kind as ItemKind,
      patch.parentId === undefined ? current.parentId : patch.parentId,
      patch.status ?? (current.status as ItemStatus),
    );
  }

  const nextStatus = patch.status ?? (current.status as ItemStatus);
  const values = {
    ...patch,
    title: patch.title?.trim(),
    description: patch.description?.trim(),
    progress:
      nextStatus === "done" ? 100 : patch.progress === undefined ? undefined : clampProgress(patch.progress),
    updatedAt: new Date().toISOString(),
  };

  const [updated] = await getDb()
    .update(items)
    .set(values)
    .where(and(eq(items.ownerId, ownerId), eq(items.id, id)))
    .returning();

  await logActivity(ownerId, id, "updated", patch.source ?? "web", patch);
  return updated;
}

export async function listPropertyDefinitions(ownerId: string) {
  return getDb()
    .select()
    .from(propertyDefinitions)
    .where(eq(propertyDefinitions.ownerId, ownerId))
    .orderBy(asc(propertyDefinitions.sortOrder), asc(propertyDefinitions.createdAt));
}

export async function getPropertyDefinition(ownerId: string, id: string) {
  const [property] = await getDb()
    .select()
    .from(propertyDefinitions)
    .where(and(eq(propertyDefinitions.ownerId, ownerId), eq(propertyDefinitions.id, id)))
    .limit(1);
  return property ?? null;
}

export async function createPropertyDefinition(
  ownerId: string,
  input: { name: string; type: PropertyType; options?: string[] },
) {
  const name = input.name.trim();
  if (!name) throw new Error("Property name is required");
  if (!PROPERTY_TYPES.includes(input.type)) throw new Error("Unsupported property type");

  const existing = await listPropertyDefinitions(ownerId);
  if (existing.some((property) => property.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
    throw new Error("Property name already exists");
  }

  const [created] = await getDb()
    .insert(propertyDefinitions)
    .values({
      id: crypto.randomUUID(),
      ownerId,
      name,
      type: input.type,
      options: JSON.stringify(normalizeOptions(input.options ?? [])),
      sortOrder: (existing.at(-1)?.sortOrder ?? 0) + 10,
    })
    .returning();
  return created;
}

export async function deletePropertyDefinition(ownerId: string, id: string) {
  const property = await getPropertyDefinition(ownerId, id);
  if (!property) throw new Error("Property not found");

  await getDb()
    .delete(itemPropertyValues)
    .where(and(eq(itemPropertyValues.ownerId, ownerId), eq(itemPropertyValues.propertyId, id)));
  await getDb()
    .delete(propertyDefinitions)
    .where(and(eq(propertyDefinitions.ownerId, ownerId), eq(propertyDefinitions.id, id)));
  return property;
}

export async function setPropertyValue(
  ownerId: string,
  itemId: string,
  propertyId: string,
  value: PropertyValue,
) {
  const [itemRecord, property] = await Promise.all([
    getItem(ownerId, itemId),
    getPropertyDefinition(ownerId, propertyId),
  ]);
  if (!itemRecord) throw new Error("Item not found");
  if (!property) throw new Error("Property not found");

  const normalized = normalizePropertyValue(property, value);
  if (normalized === null) {
    await getDb()
      .delete(itemPropertyValues)
      .where(
        and(
          eq(itemPropertyValues.ownerId, ownerId),
          eq(itemPropertyValues.itemId, itemId),
          eq(itemPropertyValues.propertyId, propertyId),
        ),
      );
    return null;
  }

  const updatedAt = new Date().toISOString();
  const [stored] = await getDb()
    .insert(itemPropertyValues)
    .values({
      id: crypto.randomUUID(),
      ownerId,
      itemId,
      propertyId,
      value: JSON.stringify(normalized),
      updatedAt,
    })
    .onConflictDoUpdate({
      target: [itemPropertyValues.ownerId, itemPropertyValues.itemId, itemPropertyValues.propertyId],
      set: { value: JSON.stringify(normalized), updatedAt },
    })
    .returning();

  await logActivity(ownerId, itemId, "property_updated", "web", {
    propertyId,
    value: normalized,
  });
  return stored;
}

export async function getPropertyValueMap(ownerId: string) {
  const rows = await getDb()
    .select()
    .from(itemPropertyValues)
    .where(eq(itemPropertyValues.ownerId, ownerId));
  const result: Record<string, Record<string, PropertyValue>> = {};
  for (const row of rows) {
    result[row.itemId] ??= {};
    result[row.itemId][row.propertyId] = parsePropertyValue(row.value);
  }
  return result;
}

export async function getItemPropertiesByName(ownerId: string) {
  const [definitions, values] = await Promise.all([
    listPropertyDefinitions(ownerId),
    getPropertyValueMap(ownerId),
  ]);
  const names = new Map(definitions.map((property) => [property.id, property.name]));
  const result: Record<string, Record<string, PropertyValue>> = {};
  for (const [itemId, itemValues] of Object.entries(values)) {
    result[itemId] = {};
    for (const [propertyId, value] of Object.entries(itemValues)) {
      const name = names.get(propertyId);
      if (name) result[itemId][name] = value;
    }
  }
  return result;
}

export async function setItemPropertiesByName(
  ownerId: string,
  itemId: string,
  values: Record<string, PropertyValue>,
) {
  const definitions = await listPropertyDefinitions(ownerId);
  const byName = new Map(definitions.map((property) => [property.name.toLocaleLowerCase(), property]));
  for (const [name, value] of Object.entries(values)) {
    const property = byName.get(name.toLocaleLowerCase());
    if (!property) throw new Error(`Property not found: ${name}`);
    await setPropertyValue(ownerId, itemId, property.id, value);
  }
}

export function serializePropertyDefinition(property: PropertyDefinition) {
  return {
    id: property.id,
    name: property.name,
    type: property.type,
    options: parseOptions(property.options),
    sortOrder: property.sortOrder,
  };
}

export async function getPeriodReview(ownerId: string, cadence: ItemCadence) {
  const now = new Date();
  const days = cadence === "daily" ? 1 : cadence === "weekly" ? 7 : cadence === "monthly" ? 31 : 92;
  const boundary = new Date(now.getTime() + days * 86_400_000).toISOString().slice(0, 10);
  const rows = await getDb()
    .select()
    .from(items)
    .where(
      and(
        eq(items.ownerId, ownerId),
        or(eq(items.cadence, cadence), and(sql`${items.dueDate} IS NOT NULL`, lte(items.dueDate, boundary))),
      ),
    )
    .orderBy(asc(items.dueDate), asc(items.sortOrder))
    .limit(100);

  const completed = rows.filter((item) => item.status === "done").length;
  const blocked = rows.filter((item) => item.status === "blocked").length;
  const averageProgress = rows.length
    ? Math.round(rows.reduce((sum, item) => sum + item.progress, 0) / rows.length)
    : 0;

  return { cadence, total: rows.length, completed, blocked, averageProgress, items: rows };
}

export async function listChecklistItems(ownerId: string, taskId: string) {
  await requireTask(ownerId, taskId);
  return getDb()
    .select()
    .from(checklistItems)
    .where(and(eq(checklistItems.ownerId, ownerId), eq(checklistItems.taskId, taskId)))
    .orderBy(asc(checklistItems.sortOrder), asc(checklistItems.createdAt));
}

export async function createChecklistItem(ownerId: string, taskId: string, title: string) {
  await requireTask(ownerId, taskId);
  const normalizedTitle = title.trim();
  if (!normalizedTitle) throw new Error("Checklist title is required");

  const existing = await listChecklistItems(ownerId, taskId);
  const [created] = await getDb()
    .insert(checklistItems)
    .values({
      id: crypto.randomUUID(),
      ownerId,
      taskId,
      title: normalizedTitle,
      sortOrder: (existing.at(-1)?.sortOrder ?? 0) + 10,
    })
    .returning();
  await syncChecklistProgress(ownerId, taskId);
  return created;
}

export async function updateChecklistItem(
  ownerId: string,
  id: string,
  patch: Partial<{ title: string; completed: boolean }>,
) {
  const [current] = await getDb()
    .select()
    .from(checklistItems)
    .where(and(eq(checklistItems.ownerId, ownerId), eq(checklistItems.id, id)))
    .limit(1);
  if (!current) throw new Error("Checklist item not found");

  const values: Partial<typeof checklistItems.$inferInsert> = { updatedAt: new Date().toISOString() };
  if (patch.title !== undefined) {
    const title = patch.title.trim();
    if (!title) throw new Error("Checklist title is required");
    values.title = title;
  }
  if (patch.completed !== undefined) values.completed = patch.completed;

  const [updated] = await getDb()
    .update(checklistItems)
    .set(values)
    .where(and(eq(checklistItems.ownerId, ownerId), eq(checklistItems.id, id)))
    .returning();
  await syncChecklistProgress(ownerId, current.taskId);
  return updated;
}

export async function deleteChecklistItem(ownerId: string, id: string) {
  const [current] = await getDb()
    .select()
    .from(checklistItems)
    .where(and(eq(checklistItems.ownerId, ownerId), eq(checklistItems.id, id)))
    .limit(1);
  if (!current) throw new Error("Checklist item not found");

  await getDb()
    .delete(checklistItems)
    .where(and(eq(checklistItems.ownerId, ownerId), eq(checklistItems.id, id)));
  await syncChecklistProgress(ownerId, current.taskId);
  return current;
}

export function serializeChecklistItem(item: typeof checklistItems.$inferSelect) {
  return {
    id: item.id,
    taskId: item.taskId,
    title: item.title,
    completed: item.completed,
    sortOrder: item.sortOrder,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

export async function listRoutines(
  ownerId: string,
  requestedDate: string,
  includeInactive = true,
) {
  const date = normalizeDate(requestedDate);
  const routineRows = await getDb()
    .select()
    .from(routines)
    .where(includeInactive ? eq(routines.ownerId, ownerId) : and(eq(routines.ownerId, ownerId), eq(routines.active, true)))
    .orderBy(asc(routines.sortOrder), asc(routines.createdAt));
  const completionRows = await getDb()
    .select()
    .from(routineCompletions)
    .where(and(eq(routineCompletions.ownerId, ownerId), eq(routineCompletions.completionDate, date)));
  const completionByRoutine = new Map(completionRows.map((completion) => [completion.routineId, completion]));
  return routineRows.map((routine) => serializeRoutine(routine, date, completionByRoutine.get(routine.id)));
}

export async function createRoutine(
  ownerId: string,
  input: { title: string; description?: string; cadence?: RoutineCadence; active?: boolean },
) {
  const title = input.title.trim();
  if (!title) throw new Error("Routine title is required");
  const cadence = input.cadence ?? "daily";
  if (!ROUTINE_CADENCES.includes(cadence)) throw new Error("Unsupported routine cadence");
  const [last] = await getDb()
    .select({ sortOrder: routines.sortOrder })
    .from(routines)
    .where(eq(routines.ownerId, ownerId))
    .orderBy(desc(routines.sortOrder))
    .limit(1);
  const [created] = await getDb()
    .insert(routines)
    .values({
      id: crypto.randomUUID(),
      ownerId,
      title,
      description: input.description?.trim() ?? "",
      cadence,
      active: input.active ?? true,
      sortOrder: (last?.sortOrder ?? 0) + 10,
    })
    .returning();
  return created;
}

export async function updateRoutine(
  ownerId: string,
  id: string,
  patch: Partial<{ title: string; description: string; cadence: RoutineCadence; active: boolean }>,
) {
  const current = await getRoutine(ownerId, id);
  if (!current) throw new Error("Routine not found");
  if (patch.title !== undefined && !patch.title.trim()) throw new Error("Routine title is required");
  if (patch.cadence !== undefined && !ROUTINE_CADENCES.includes(patch.cadence)) {
    throw new Error("Unsupported routine cadence");
  }
  const [updated] = await getDb()
    .update(routines)
    .set({
      title: patch.title?.trim(),
      description: patch.description?.trim(),
      cadence: patch.cadence,
      active: patch.active,
      updatedAt: new Date().toISOString(),
    })
    .where(and(eq(routines.ownerId, ownerId), eq(routines.id, id)))
    .returning();
  return updated;
}

export async function deleteRoutine(ownerId: string, id: string) {
  const current = await getRoutine(ownerId, id);
  if (!current) throw new Error("Routine not found");
  await getDb()
    .delete(routineCompletions)
    .where(and(eq(routineCompletions.ownerId, ownerId), eq(routineCompletions.routineId, id)));
  await getDb()
    .delete(routines)
    .where(and(eq(routines.ownerId, ownerId), eq(routines.id, id)));
  return current;
}

export async function setRoutineCompletion(
  ownerId: string,
  routineId: string,
  completionDate: string,
  completed: boolean,
  note = "",
) {
  const date = normalizeDate(completionDate);
  const routine = await getRoutine(ownerId, routineId);
  if (!routine) throw new Error("Routine not found");
  if (!completed) {
    await getDb()
      .delete(routineCompletions)
      .where(
        and(
          eq(routineCompletions.ownerId, ownerId),
          eq(routineCompletions.routineId, routineId),
          eq(routineCompletions.completionDate, date),
        ),
      );
  } else {
    await getDb()
      .insert(routineCompletions)
      .values({ id: crypto.randomUUID(), ownerId, routineId, completionDate: date, note: note.trim() })
      .onConflictDoUpdate({
        target: [routineCompletions.ownerId, routineCompletions.routineId, routineCompletions.completionDate],
        set: { note: note.trim() },
      });
  }
  const rows = await listRoutines(ownerId, date);
  return rows.find((entry) => entry.id === routineId)!;
}

async function getRoutine(ownerId: string, id: string) {
  const [routine] = await getDb()
    .select()
    .from(routines)
    .where(and(eq(routines.ownerId, ownerId), eq(routines.id, id)))
    .limit(1);
  return routine ?? null;
}

export function serializeRoutine(
  routine: typeof routines.$inferSelect,
  date: string,
  completion?: typeof routineCompletions.$inferSelect,
) {
  return {
    id: routine.id,
    title: routine.title,
    description: routine.description,
    cadence: routine.cadence,
    active: routine.active,
    sortOrder: routine.sortOrder,
    date,
    completed: Boolean(completion),
    completionId: completion?.id ?? null,
    note: completion?.note ?? "",
    createdAt: routine.createdAt,
    updatedAt: routine.updatedAt,
  };
}

export async function getDailyScrum(ownerId: string, scrumDate: string) {
  const date = normalizeDate(scrumDate);
  const previousDate = addDays(date, -1);
  const [saved] = await getDb()
    .select()
    .from(dailyScrums)
    .where(and(eq(dailyScrums.ownerId, ownerId), eq(dailyScrums.scrumDate, date)))
    .limit(1);
  const tasks = await listItems(ownerId, { kind: "task", limit: 200 });
  const activeTasks = tasks.filter((task) => task.status !== "inbox" && task.status !== "done");
  const yesterdayTasks = tasks
    .filter(
      (task) =>
        task.status === "done" &&
        (task.updatedAt.slice(0, 10) === previousDate || task.dueDate === previousDate),
    )
    .slice(0, 8);
  const todayTasks = activeTasks
    .filter(
      (task) =>
        task.status === "in_progress" ||
        task.dueDate === date ||
        (task.dueDate !== null && task.dueDate < date),
    )
    .sort(compareTaskUrgency)
    .slice(0, 8);
  const blockers = tasks.filter((task) => task.status === "blocked").slice(0, 8);

  return {
    date,
    yesterdayNote: saved?.yesterdayNote ?? "",
    todayNote: saved?.todayNote ?? "",
    blockersNote: saved?.blockersNote ?? "",
    yesterdayTasks,
    todayTasks,
    blockers,
    updatedAt: saved?.updatedAt ?? null,
  };
}

export async function saveDailyScrum(
  ownerId: string,
  scrumDate: string,
  input: { yesterdayNote?: string; todayNote?: string; blockersNote?: string },
) {
  const date = normalizeDate(scrumDate);
  const updatedAt = new Date().toISOString();
  await getDb()
    .insert(dailyScrums)
    .values({
      id: crypto.randomUUID(),
      ownerId,
      scrumDate: date,
      yesterdayNote: input.yesterdayNote?.trim() ?? "",
      todayNote: input.todayNote?.trim() ?? "",
      blockersNote: input.blockersNote?.trim() ?? "",
      updatedAt,
    })
    .onConflictDoUpdate({
      target: [dailyScrums.ownerId, dailyScrums.scrumDate],
      set: {
        yesterdayNote: input.yesterdayNote?.trim() ?? "",
        todayNote: input.todayNote?.trim() ?? "",
        blockersNote: input.blockersNote?.trim() ?? "",
        updatedAt,
      },
    });
  return getDailyScrum(ownerId, date);
}

export type RecommendationKind = "blocked" | "overdue" | "unlinked" | "due_soon" | "empty_project";
export type Recommendation = {
  id: string;
  kind: RecommendationKind;
  title: string;
  detail: string;
  itemIds: string[];
  score: number;
};

export async function getRecommendations(ownerId: string, requestedDate?: string) {
  const date = normalizeDate(requestedDate ?? new Date().toISOString().slice(0, 10));
  const dueSoon = addDays(date, 3);
  const rows = await listItems(ownerId, { limit: 200 });
  const tasks = rows.filter((item) => item.kind === "task");
  const projects = rows.filter((item) => item.kind === "project");
  const openTasks = tasks.filter((task) => task.status !== "done");
  const recommendations: Recommendation[] = [];

  const blocked = openTasks.filter((task) => task.status === "blocked");
  if (blocked.length) {
    recommendations.push({
      id: "blocked-tasks",
      kind: "blocked",
      title: `막힌 Task ${blocked.length}개를 먼저 해소하세요`,
      detail: "막힘이 길어지면 상위 Project와 Key Result의 진행도도 함께 멈춥니다.",
      itemIds: blocked.map((task) => task.id),
      score: 100,
    });
  }

  const overdue = openTasks.filter((task) => task.status !== "inbox" && task.dueDate !== null && task.dueDate < date);
  if (overdue.length) {
    recommendations.push({
      id: "overdue-tasks",
      kind: "overdue",
      title: `기한이 지난 Task ${overdue.length}개를 재계획하세요`,
      detail: "완료일을 조정하거나 오늘 실행할 작업으로 명확히 정리하는 편이 좋습니다.",
      itemIds: overdue.map((task) => task.id),
      score: 90,
    });
  }

  const unlinked = openTasks.filter((task) => task.status === "inbox" || task.parentId === null);
  if (unlinked.length) {
    recommendations.push({
      id: "unlinked-tasks",
      kind: "unlinked",
      title: `미연결 Task ${unlinked.length}개의 Project를 정하세요`,
      detail: "인박스에서 Project에 연결하면 OKR 진행 상황과 데일리 계획에 함께 반영됩니다.",
      itemIds: unlinked.map((task) => task.id),
      score: 75,
    });
  }

  const urgent = openTasks.filter(
    (task) =>
      task.status !== "inbox" &&
      task.dueDate !== null &&
      task.dueDate >= date &&
      task.dueDate <= dueSoon &&
      (task.priority === "high" || task.priority === "urgent"),
  );
  if (urgent.length) {
    recommendations.push({
      id: "due-soon-tasks",
      kind: "due_soon",
      title: `3일 안에 마감되는 중요 Task ${urgent.length}개가 있습니다`,
      detail: "오늘 할 일에 올리거나 담당자와 완료 기준을 확인하세요.",
      itemIds: urgent.map((task) => task.id),
      score: 70,
    });
  }

  const projectIdsWithTasks = new Set(tasks.map((task) => task.parentId).filter(Boolean));
  const emptyProjects = projects.filter((project) => !projectIdsWithTasks.has(project.id));
  if (emptyProjects.length) {
    recommendations.push({
      id: "empty-projects",
      kind: "empty_project",
      title: `실행 Task가 없는 Project ${emptyProjects.length}개를 확인하세요`,
      detail: "다음 행동이 없다면 Project의 범위를 줄이거나 첫 Task를 추가하세요.",
      itemIds: emptyProjects.map((project) => project.id),
      score: 55,
    });
  }

  return recommendations.sort((a, b) => b.score - a.score);
}

async function requireTask(ownerId: string, taskId: string) {
  const task = await getItem(ownerId, taskId);
  if (!task) throw new Error("Task not found");
  if (task.kind !== "task") throw new Error("Checklists can only belong to a Task");
  return task;
}

async function syncChecklistProgress(ownerId: string, taskId: string) {
  const rows = await getDb()
    .select()
    .from(checklistItems)
    .where(and(eq(checklistItems.ownerId, ownerId), eq(checklistItems.taskId, taskId)));
  const progress = rows.length
    ? Math.round((rows.filter((row) => row.completed).length / rows.length) * 100)
    : 0;
  await getDb()
    .update(items)
    .set({ progress, updatedAt: new Date().toISOString() })
    .where(and(eq(items.ownerId, ownerId), eq(items.id, taskId)));
}

function normalizeDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Date must use YYYY-MM-DD");
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error("Date is invalid");
  }
  return value;
}

function addDays(value: string, days: number) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function compareTaskUrgency(a: PaceItem, b: PaceItem) {
  if (a.status === "blocked" && b.status !== "blocked") return -1;
  if (b.status === "blocked" && a.status !== "blocked") return 1;
  if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
  if (a.dueDate) return -1;
  if (b.dueDate) return 1;
  const priorityWeight: Record<string, number> = { low: 1, medium: 2, high: 3, urgent: 4 };
  return (priorityWeight[b.priority] ?? 0) - (priorityWeight[a.priority] ?? 0);
}

async function validateParent(
  ownerId: string,
  kind: ItemKind,
  parentId: string | null,
  status: ItemStatus,
) {
  if (status === "inbox" && (kind !== "task" || parentId !== null)) {
    throw new Error("Only an unlinked Task can use inbox status");
  }
  const expected = parentKind[kind];
  if (!expected) {
    if (parentId) throw new Error("Objective cannot have a parent");
    return;
  }

  if (!parentId) {
    if (kind === "task" && status === "inbox") return;
    throw new Error(`${kind} requires a ${expected} parent`);
  }

  const parent = await getItem(ownerId, parentId);
  if (!parent) throw new Error("Parent item not found");
  if (parent.kind !== expected) {
    throw new Error(`${kind} must be linked under ${expected}`);
  }
}

async function migrateLegacyHierarchy(ownerId: string) {
  const d1 = (env as RuntimeEnv).DB;
  await d1.batch([
    d1.prepare(`INSERT OR IGNORE INTO checklist_items
      (id, owner_id, task_id, title, completed, sort_order, created_at, updated_at)
      SELECT 'legacy-action-' || id, owner_id, parent_id, title,
        CASE WHEN status = 'done' THEN 1 ELSE 0 END,
        sort_order, created_at, updated_at
      FROM items AS action_item
      WHERE action_item.owner_id = ? AND action_item.kind = 'action'
        AND EXISTS (
          SELECT 1 FROM items AS parent_task
          WHERE parent_task.owner_id = action_item.owner_id
            AND parent_task.id = action_item.parent_id
            AND parent_task.kind = 'task'
        )`).bind(ownerId),
    d1.prepare(`DELETE FROM items
      WHERE owner_id = ? AND kind = 'action'
        AND parent_id IN (
          SELECT id FROM items WHERE owner_id = ? AND kind = 'task'
        )`).bind(ownerId, ownerId),
    d1.prepare(`UPDATE items
      SET kind = 'task', parent_id = NULL, status = 'inbox', source = 'migration',
        updated_at = CURRENT_TIMESTAMP
      WHERE owner_id = ? AND kind = 'action'`).bind(ownerId),
    d1.prepare(`INSERT OR IGNORE INTO items
      (id, owner_id, parent_id, kind, title, description, status, priority, cadence,
       progress, due_date, source, source_ref, sort_order, created_at, updated_at)
      SELECT 'legacy-project-' || initiative.id, initiative.owner_id, initiative.id,
        'project', initiative.title || ' 실행', '', 'in_progress', 'medium',
        initiative.cadence, 0, NULL, 'migration', NULL, initiative.sort_order + 1,
        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      FROM items AS initiative
      WHERE initiative.owner_id = ? AND initiative.kind = 'initiative'
        AND EXISTS (
          SELECT 1 FROM items AS child
          WHERE child.owner_id = initiative.owner_id
            AND child.parent_id = initiative.id AND child.kind = 'task'
        )`).bind(ownerId),
    d1.prepare(`UPDATE items
      SET parent_id = 'legacy-project-' || parent_id, updated_at = CURRENT_TIMESTAMP
      WHERE owner_id = ? AND kind = 'task'
        AND parent_id IN (
          SELECT id FROM items WHERE owner_id = ? AND kind = 'initiative'
        )`).bind(ownerId, ownerId),
  ]);
}

async function seedWorkspace(ownerId: string) {
  const [result] = await getDb()
    .select({ count: sql<number>`count(*)` })
    .from(items)
    .where(eq(items.ownerId, ownerId));
  if (Number(result?.count ?? 0) > 0) return;

  const objective = crypto.randomUUID();
  const keyResult = crypto.randomUUID();
  const initiative = crypto.randomUUID();
  const project = crypto.randomUUID();
  const firstTask = crypto.randomUUID();
  const due = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

  const seedRows = [
    { id: objective, ownerId, kind: "objective", title: "셀프 서브 도입으로 팀의 성장 속도를 높인다", status: "in_progress", cadence: "quarterly", progress: 68, sortOrder: 10 },
    { id: keyResult, ownerId, parentId: objective, kind: "key_result", title: "신규 사용자의 첫 주 활성화율 32% → 48%", status: "in_progress", cadence: "monthly", progress: 61, sortOrder: 20 },
    { id: initiative, ownerId, parentId: keyResult, kind: "initiative", title: "가입 후 10분 안에 첫 가치 경험 만들기", status: "in_progress", cadence: "monthly", progress: 54, sortOrder: 30 },
    { id: project, ownerId, parentId: initiative, kind: "project", title: "온보딩 활성화 개선", status: "in_progress", cadence: "monthly", progress: 52, sortOrder: 40 },
    { id: firstTask, ownerId, parentId: project, kind: "task", title: "온보딩 체크리스트 실험", status: "in_progress", cadence: "weekly", progress: 75, dueDate: due(5), priority: "high", sortOrder: 50 },
    { id: crypto.randomUUID(), ownerId, parentId: project, kind: "task", title: "결제 화면 카피 확정", status: "in_progress", cadence: "weekly", progress: 40, dueDate: due(0), priority: "high", sortOrder: 60 },
    { id: crypto.randomUUID(), ownerId, parentId: project, kind: "task", title: "활성화 이벤트 QA", status: "todo", cadence: "weekly", progress: 0, dueDate: due(2), sortOrder: 70 },
    { id: crypto.randomUUID(), ownerId, parentId: project, kind: "task", title: "신규 사용자 5명 인터뷰", status: "todo", cadence: "weekly", progress: 0, dueDate: due(4), sortOrder: 80 },
    { id: crypto.randomUUID(), ownerId, kind: "task", title: "가격 정책 페이지 개선 아이디어", status: "inbox", cadence: "weekly", source: "mcp", sortOrder: 90 },
    { id: crypto.randomUUID(), ownerId, kind: "task", title: "모바일 가입 이탈 구간 확인", status: "inbox", cadence: "weekly", source: "slack", sortOrder: 100 },
  ];
  await getDb().insert(items).values(seedRows.slice(0, 5));
  await getDb().insert(items).values(seedRows.slice(5));
  await getDb().insert(checklistItems).values([
    { id: crypto.randomUUID(), ownerId, taskId: firstTask, title: "A/B 테스트 이벤트 정의", completed: true, sortOrder: 10 },
    { id: crypto.randomUUID(), ownerId, taskId: firstTask, title: "실험군 이벤트 검증", completed: false, sortOrder: 20 },
  ]);
  await getDb().insert(routines).values([
    { id: crypto.randomUUID(), ownerId, title: "오늘의 최우선 Task 정리", cadence: "daily", sortOrder: 10 },
    { id: crypto.randomUUID(), ownerId, title: "주간 회고 작성", cadence: "weekly", sortOrder: 20 },
  ]);
}

async function seedProperties(ownerId: string) {
  const existing = await listPropertyDefinitions(ownerId);
  if (existing.length) return;

  const ownerProperty = crypto.randomUUID();
  const sprintProperty = crypto.randomUUID();
  const estimateProperty = crypto.randomUUID();
  await getDb().insert(propertyDefinitions).values([
    { id: ownerProperty, ownerId, name: "담당", type: "text", sortOrder: 10 },
    {
      id: sprintProperty,
      ownerId,
      name: "스프린트",
      type: "select",
      options: JSON.stringify(["Sprint 18", "Sprint 19", "Backlog"]),
      sortOrder: 20,
    },
    { id: estimateProperty, ownerId, name: "예상 시간", type: "number", sortOrder: 30 },
  ]);

  const tasks = await listItems(ownerId, { kind: "task", limit: 4 });
  const owners = ["태홍", "민지", "태홍", "유진"];
  const sprints = ["Sprint 18", "Sprint 18", "Sprint 18", "Sprint 19"];
  const estimates = [6, 3, 4, 5];
  const values = tasks.flatMap((task, index) => [
    {
      id: crypto.randomUUID(),
      ownerId,
      itemId: task.id,
      propertyId: ownerProperty,
      value: JSON.stringify(owners[index] ?? "태홍"),
    },
    {
      id: crypto.randomUUID(),
      ownerId,
      itemId: task.id,
      propertyId: sprintProperty,
      value: JSON.stringify(sprints[index] ?? "Backlog"),
    },
    {
      id: crypto.randomUUID(),
      ownerId,
      itemId: task.id,
      propertyId: estimateProperty,
      value: JSON.stringify(estimates[index] ?? 2),
    },
  ]);
  if (values.length) await getDb().insert(itemPropertyValues).values(values);
}

async function logActivity(
  ownerId: string,
  itemId: string,
  action: string,
  source: string,
  payload: unknown,
) {
  await getDb().insert(activityLog).values({
    id: crypto.randomUUID(),
    ownerId,
    itemId,
    action,
    source,
    payload: JSON.stringify(payload),
  });
}

function clampProgress(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function normalizeOptions(options: string[]) {
  return [...new Set(options.map((option) => option.trim()).filter(Boolean))].slice(0, 50);
}

function parseOptions(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((option): option is string => typeof option === "string") : [];
  } catch {
    return [];
  }
}

function parsePropertyValue(value: string): PropertyValue {
  try {
    const parsed = JSON.parse(value) as unknown;
    return typeof parsed === "string" || typeof parsed === "number" || typeof parsed === "boolean" || parsed === null
      ? parsed
      : null;
  } catch {
    return value;
  }
}

function normalizePropertyValue(property: PropertyDefinition, value: PropertyValue): PropertyValue {
  if (value === null || value === "") return null;
  if (property.type === "number") {
    const number = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(number)) throw new Error(`${property.name} must be a number`);
    return number;
  }
  if (property.type === "checkbox") {
    if (typeof value !== "boolean") throw new Error(`${property.name} must be true or false`);
    return value;
  }
  if (typeof value !== "string") throw new Error(`${property.name} must be text`);
  const text = value.trim();
  if (!text) return null;
  if (property.type === "date" && !/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    throw new Error(`${property.name} must use YYYY-MM-DD`);
  }
  if (property.type === "select" && !parseOptions(property.options).includes(text)) {
    throw new Error(`${property.name} must use one of its configured options`);
  }
  return text;
}

export function serializeItem(item: PaceItem, properties: Record<string, PropertyValue> = {}) {
  return {
    id: item.id,
    parentId: item.parentId,
    kind: item.kind,
    title: item.title,
    description: item.description,
    status: item.status,
    priority: item.priority,
    cadence: item.cadence,
    progress: item.progress,
    dueDate: item.dueDate,
    source: item.source,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    properties,
  };
}
