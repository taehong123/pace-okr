import { env } from "cloudflare:workers";
import { and, asc, desc, eq, like, lte, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { activityLog, items, type PaceItem } from "@/db/schema";

export const ITEM_KINDS = ["objective", "key_result", "initiative", "task", "action"] as const;
export const ITEM_STATUSES = ["inbox", "todo", "in_progress", "done", "blocked"] as const;
export const ITEM_PRIORITIES = ["low", "medium", "high", "urgent"] as const;
export const ITEM_CADENCES = ["daily", "weekly", "monthly", "quarterly"] as const;

export type ItemKind = (typeof ITEM_KINDS)[number];
export type ItemStatus = (typeof ITEM_STATUSES)[number];
export type ItemPriority = (typeof ITEM_PRIORITIES)[number];
export type ItemCadence = (typeof ITEM_CADENCES)[number];

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

export function serializeItem(item: PaceItem) {
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
  };
}
