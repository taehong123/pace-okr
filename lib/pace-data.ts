import { env } from "cloudflare:workers";
import { and, asc, desc, eq, like, lte, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  activityLog,
  itemPropertyValues,
  items,
  propertyDefinitions,
  type PaceItem,
  type PropertyDefinition,
} from "@/db/schema";

export const ITEM_KINDS = ["objective", "key_result", "initiative", "task", "action"] as const;
export const ITEM_STATUSES = ["inbox", "todo", "in_progress", "done", "blocked"] as const;
export const ITEM_PRIORITIES = ["low", "medium", "high", "urgent"] as const;
export const ITEM_CADENCES = ["daily", "weekly", "monthly", "quarterly"] as const;
export const PROPERTY_TYPES = ["text", "number", "select", "date", "checkbox"] as const;

export type ItemKind = (typeof ITEM_KINDS)[number];
export type ItemStatus = (typeof ITEM_STATUSES)[number];
export type ItemPriority = (typeof ITEM_PRIORITIES)[number];
export type ItemCadence = (typeof ITEM_CADENCES)[number];
export type PropertyType = (typeof PROPERTY_TYPES)[number];
export type PropertyValue = string | number | boolean | null;

type RuntimeEnv = typeof env & { PACE_API_TOKEN?: string };
let schemaReady: Promise<void> | null = null;

const parentKind: Record<ItemKind, ItemKind | null> = {
  objective: null,
  key_result: "objective",
  initiative: "key_result",
  task: "initiative",
  action: "task",
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
        d1.prepare("PRAGMA optimize"),
      ])
      .then(() => undefined)
      .catch((error: unknown) => {
        schemaReady = null;
        throw error;
      });
  }

  await schemaReady;
  await seedWorkspace(ownerId);
  await seedProperties(ownerId);
}

export function authorizeRequest(request: Request): { ownerId: string } | Response {
  const userId = request.headers.get("oai-authenticated-user-id");
  if (userId) return { ownerId: userId };

  const configuredToken = (env as RuntimeEnv).PACE_API_TOKEN;
  const suppliedToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (configuredToken && suppliedToken === configuredToken) {
    return { ownerId: request.headers.get("x-pace-user-id") || "api-workspace" };
  }

  const hostname = new URL(request.url).hostname;
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return { ownerId: "local-user" };
  }

  return Response.json(
    { error: "Authentication required. Sign in or provide a Pace API token." },
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
  const status = input.status ?? (input.parentId ? "todo" : "inbox");
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

  if (patch.parentId !== undefined) {
    await validateParent(
      ownerId,
      current.kind as ItemKind,
      patch.parentId,
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

async function validateParent(
  ownerId: string,
  kind: ItemKind,
  parentId: string | null,
  status: ItemStatus,
) {
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

async function seedWorkspace(ownerId: string) {
  const [result] = await getDb()
    .select({ count: sql<number>`count(*)` })
    .from(items)
    .where(eq(items.ownerId, ownerId));
  if (Number(result?.count ?? 0) > 0) return;

  const objective = crypto.randomUUID();
  const keyResult = crypto.randomUUID();
  const initiative = crypto.randomUUID();
  const task = crypto.randomUUID();
  const due = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

  const seedRows = [
    { id: objective, ownerId, kind: "objective", title: "셀프 서브 도입으로 팀의 성장 속도를 높인다", status: "in_progress", cadence: "quarterly", progress: 68, sortOrder: 10 },
    { id: keyResult, ownerId, parentId: objective, kind: "key_result", title: "신규 사용자의 첫 주 활성화율 32% → 48%", status: "in_progress", cadence: "monthly", progress: 61, sortOrder: 20 },
    { id: initiative, ownerId, parentId: keyResult, kind: "initiative", title: "가입 후 10분 안에 첫 가치 경험 만들기", status: "in_progress", cadence: "monthly", progress: 54, sortOrder: 30 },
    { id: task, ownerId, parentId: initiative, kind: "task", title: "온보딩 체크리스트 실험", status: "in_progress", cadence: "weekly", progress: 75, dueDate: due(5), priority: "high", sortOrder: 40 },
    { id: crypto.randomUUID(), ownerId, parentId: task, kind: "action", title: "A/B 테스트 이벤트 정의", status: "done", cadence: "daily", progress: 100, dueDate: due(-1), sortOrder: 50 },
    { id: crypto.randomUUID(), ownerId, parentId: initiative, kind: "task", title: "결제 화면 카피 확정", status: "in_progress", cadence: "weekly", progress: 40, dueDate: due(0), priority: "high", sortOrder: 60 },
    { id: crypto.randomUUID(), ownerId, parentId: initiative, kind: "task", title: "활성화 이벤트 QA", status: "todo", cadence: "weekly", progress: 0, dueDate: due(2), sortOrder: 70 },
    { id: crypto.randomUUID(), ownerId, parentId: initiative, kind: "task", title: "신규 사용자 5명 인터뷰", status: "todo", cadence: "weekly", progress: 0, dueDate: due(4), sortOrder: 80 },
    { id: crypto.randomUUID(), ownerId, kind: "task", title: "가격 정책 페이지 개선 아이디어", status: "inbox", cadence: "weekly", source: "mcp", sortOrder: 90 },
    { id: crypto.randomUUID(), ownerId, kind: "task", title: "모바일 가입 이탈 구간 확인", status: "inbox", cadence: "weekly", source: "slack", sortOrder: 100 },
  ];
  await getDb().insert(items).values(seedRows.slice(0, 5));
  await getDb().insert(items).values(seedRows.slice(5));
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
