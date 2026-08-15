import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

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

export const propertyDefinitions = sqliteTable(
  "property_definitions",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    name: text("name").notNull(),
    type: text("type").notNull(),
    options: text("options").notNull().default("[]"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("idx_property_definitions_owner_name").on(table.ownerId, table.name),
    index("idx_property_definitions_owner_sort").on(table.ownerId, table.sortOrder),
  ],
);

export const itemPropertyValues = sqliteTable(
  "item_property_values",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    itemId: text("item_id").notNull().references(() => items.id, { onDelete: "cascade" }),
    propertyId: text("property_id").notNull().references(() => propertyDefinitions.id, { onDelete: "cascade" }),
    value: text("value").notNull().default("null"),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("idx_item_property_values_unique").on(table.ownerId, table.itemId, table.propertyId),
    index("idx_item_property_values_owner_item").on(table.ownerId, table.itemId),
    index("idx_item_property_values_owner_property").on(table.ownerId, table.propertyId),
  ],
);

export type PaceItem = typeof items.$inferSelect;
export type NewPaceItem = typeof items.$inferInsert;
export type PropertyDefinition = typeof propertyDefinitions.$inferSelect;
export type ItemPropertyValue = typeof itemPropertyValues.$inferSelect;
