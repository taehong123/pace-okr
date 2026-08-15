import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const items = sqliteTable(
  "items",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    parentId: text("parent_id"),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    status: text("status").notNull().default("todo"),
    priority: text("priority").notNull().default("medium"),
    cadence: text("cadence").notNull().default("weekly"),
    progress: integer("progress").notNull().default(0),
    dueDate: text("due_date"),
    source: text("source").notNull().default("web"),
    sourceRef: text("source_ref"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_items_owner_status").on(table.ownerId, table.status),
    index("idx_items_owner_parent").on(table.ownerId, table.parentId),
    index("idx_items_owner_cadence").on(table.ownerId, table.cadence),
  ],
);

export const activityLog = sqliteTable(
  "activity_log",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    itemId: text("item_id").notNull(),
    action: text("action").notNull(),
    source: text("source").notNull().default("web"),
    payload: text("payload").notNull().default("{}"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_activity_owner_created").on(table.ownerId, table.createdAt),
    index("idx_activity_item").on(table.itemId),
  ],
);

export type PaceItem = typeof items.$inferSelect;
export type NewPaceItem = typeof items.$inferInsert;
