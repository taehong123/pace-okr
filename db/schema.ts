import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const workspaces = sqliteTable(
  "workspaces",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    ownerUserId: text("owner_user_id").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_workspaces_owner").on(table.ownerUserId),
  ],
);

export const workspaceMembers = sqliteTable(
  "workspace_members",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id"),
    email: text("email"),
    displayName: text("display_name").notNull().default(""),
    role: text("role").notNull().default("member"),
    status: text("status").notNull().default("invited"),
    invitedByUserId: text("invited_by_user_id"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("idx_workspace_members_workspace_user").on(table.workspaceId, table.userId),
    index("idx_workspace_members_user_lookup").on(table.userId, table.status),
    uniqueIndex("idx_workspace_members_workspace_email").on(table.workspaceId, table.email),
    index("idx_workspace_members_workspace_status").on(table.workspaceId, table.status),
  ],
);

export const userWorkspacePreferences = sqliteTable(
  "user_workspace_preferences",
  {
    userId: text("user_id").primaryKey(),
    activeWorkspaceId: text("active_workspace_id").references(() => workspaces.id, { onDelete: "set null" }),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("idx_user_workspace_preferences_active").on(table.activeWorkspaceId)],
);

export const workspaceRules = sqliteTable(
  "workspace_rules",
  {
    workspaceId: text("workspace_id").primaryKey().references(() => workspaces.id, { onDelete: "cascade" }),
    captureInstruction: text("capture_instruction").notNull().default(""),
    structureInstruction: text("structure_instruction").notNull().default(""),
    routineInstruction: text("routine_instruction").notNull().default(""),
    defaultPriority: text("default_priority").notNull().default("medium"),
    defaultCadence: text("default_cadence").notNull().default("weekly"),
    reviewBeforeCreate: integer("review_before_create", { mode: "boolean" }).notNull().default(true),
    configured: integer("configured", { mode: "boolean" }).notNull().default(false),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
);

export const okrCycles = sqliteTable(
  "okr_cycles",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    department: text("department").notNull().default(""),
    version: integer("version").notNull().default(1),
    startDate: text("start_date").notNull(),
    endDate: text("end_date").notNull(),
    status: text("status").notNull().default("active"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_okr_cycles_owner_status").on(table.ownerId, table.status),
    uniqueIndex("idx_okr_cycles_owner_version").on(table.ownerId, table.version),
  ],
);

export const workspaceGroups = sqliteTable(
  "workspace_groups",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    handle: text("handle").notNull(),
    description: text("description").notNull().default(""),
    color: text("color").notNull().default("gray"),
    visibility: text("visibility").notNull().default("open"),
    archived: integer("archived", { mode: "boolean" }).notNull().default(false),
    createdByUserId: text("created_by_user_id"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("idx_workspace_groups_workspace_handle").on(table.workspaceId, table.handle),
    index("idx_workspace_groups_workspace_archived").on(table.workspaceId, table.archived),
  ],
);

export const workspaceGroupMembers = sqliteTable(
  "workspace_group_members",
  {
    id: text("id").primaryKey(),
    groupId: text("group_id").notNull().references(() => workspaceGroups.id, { onDelete: "cascade" }),
    memberId: text("member_id").notNull().references(() => workspaceMembers.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("member"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("idx_workspace_group_members_unique").on(table.groupId, table.memberId),
    index("idx_workspace_group_members_member").on(table.memberId),
    index("idx_workspace_group_members_group_role").on(table.groupId, table.role),
  ],
);

export const items = sqliteTable(
  "items",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    cycleId: text("cycle_id").references(() => okrCycles.id, { onDelete: "set null" }),
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
    index("idx_items_owner_cycle").on(table.ownerId, table.cycleId),
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

export const checklistItems = sqliteTable(
  "checklist_items",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    taskId: text("task_id").notNull().references(() => items.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    completed: integer("completed", { mode: "boolean" }).notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_checklist_owner_task").on(table.ownerId, table.taskId),
  ],
);

export const dailyScrums = sqliteTable(
  "daily_scrums",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    scrumDate: text("scrum_date").notNull(),
    yesterdayNote: text("yesterday_note").notNull().default(""),
    todayNote: text("today_note").notNull().default(""),
    blockersNote: text("blockers_note").notNull().default(""),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("idx_daily_scrums_owner_date").on(table.ownerId, table.scrumDate),
  ],
);

export const routines = sqliteTable(
  "routines",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    triggerPoint: text("trigger_point").notNull().default(""),
    actionPlace: text("action_place").notNull().default(""),
    actionSteps: text("action_steps").notNull().default(""),
    cadence: text("cadence").notNull().default("daily"),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_routines_owner_active").on(table.ownerId, table.active),
    index("idx_routines_owner_sort").on(table.ownerId, table.sortOrder),
  ],
);

export const routineCompletions = sqliteTable(
  "routine_completions",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    routineId: text("routine_id").notNull().references(() => routines.id, { onDelete: "cascade" }),
    completionDate: text("completion_date").notNull(),
    note: text("note").notNull().default(""),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("idx_routine_completions_unique").on(table.ownerId, table.routineId, table.completionDate),
    index("idx_routine_completions_owner_date").on(table.ownerId, table.completionDate),
  ],
);

export const aiUsageEvents = sqliteTable(
  "ai_usage_events",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    userId: text("user_id").notNull(),
    model: text("model").notNull(),
    source: text("source").notNull().default("web"),
    inputChars: integer("input_chars").notNull().default(0),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    estimatedCostWonMicros: integer("estimated_cost_won_micros").notNull().default(0),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_ai_usage_owner_created").on(table.ownerId, table.createdAt),
    index("idx_ai_usage_user_created").on(table.userId, table.createdAt),
  ],
);

export const googleConnections = sqliteTable(
  "google_connections",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    userId: text("user_id").notNull(),
    googleAccountId: text("google_account_id").notNull().default(""),
    email: text("email").notNull().default(""),
    displayName: text("display_name").notNull().default(""),
    encryptedRefreshToken: text("encrypted_refresh_token").notNull(),
    scope: text("scope").notNull().default(""),
    connectedAt: text("connected_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("idx_google_connections_owner_user").on(table.ownerId, table.userId),
    index("idx_google_connections_user").on(table.userId),
  ],
);

export const googleOAuthStates = sqliteTable(
  "google_oauth_states",
  {
    state: text("state").primaryKey(),
    ownerId: text("owner_id").notNull(),
    userId: text("user_id").notNull(),
    returnTo: text("return_to").notNull().default("/"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    expiresAt: text("expires_at").notNull(),
  },
  (table) => [
    index("idx_google_oauth_states_expires").on(table.expiresAt),
  ],
);

export const googleCalendarEvents = sqliteTable(
  "google_calendar_events",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    userId: text("user_id").notNull(),
    itemId: text("item_id").notNull().references(() => items.id, { onDelete: "cascade" }),
    calendarId: text("calendar_id").notNull().default("primary"),
    googleEventId: text("google_event_id").notNull(),
    htmlLink: text("html_link").notNull().default(""),
    syncedAt: text("synced_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("idx_google_calendar_events_item").on(table.ownerId, table.userId, table.itemId),
    index("idx_google_calendar_events_owner").on(table.ownerId),
  ],
);

export const slackConnections = sqliteTable(
  "slack_connections",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    userId: text("user_id").notNull(),
    teamId: text("team_id").notNull(),
    teamName: text("team_name").notNull().default(""),
    botUserId: text("bot_user_id").notNull().default(""),
    appId: text("app_id").notNull().default(""),
    encryptedBotToken: text("encrypted_bot_token").notNull(),
    scope: text("scope").notNull().default(""),
    connectedAt: text("connected_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("idx_slack_connections_owner_user").on(table.ownerId, table.userId),
    uniqueIndex("idx_slack_connections_team").on(table.teamId),
    index("idx_slack_connections_owner").on(table.ownerId),
  ],
);

export const slackOAuthStates = sqliteTable(
  "slack_oauth_states",
  {
    state: text("state").primaryKey(),
    ownerId: text("owner_id").notNull(),
    userId: text("user_id").notNull(),
    returnTo: text("return_to").notNull().default("/"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    expiresAt: text("expires_at").notNull(),
  },
  (table) => [
    index("idx_slack_oauth_states_expires").on(table.expiresAt),
  ],
);

export const trashRecords = sqliteTable(
  "trash_records",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    category: text("category").notNull(),
    title: text("title").notNull(),
    payload: text("payload").notNull(),
    itemCount: integer("item_count").notNull().default(0),
    routineCount: integer("routine_count").notNull().default(0),
    cycleCount: integer("cycle_count").notNull().default(0),
    createdByUserId: text("created_by_user_id"),
    archivedAt: text("archived_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_trash_records_owner_archived").on(table.ownerId, table.archivedAt),
  ],
);

export type PaceItem = typeof items.$inferSelect;
export type NewPaceItem = typeof items.$inferInsert;
export type PropertyDefinition = typeof propertyDefinitions.$inferSelect;
export type ItemPropertyValue = typeof itemPropertyValues.$inferSelect;
export type ChecklistItem = typeof checklistItems.$inferSelect;
export type DailyScrum = typeof dailyScrums.$inferSelect;
export type Routine = typeof routines.$inferSelect;
export type RoutineCompletion = typeof routineCompletions.$inferSelect;
export type Workspace = typeof workspaces.$inferSelect;
export type WorkspaceMember = typeof workspaceMembers.$inferSelect;
export type UserWorkspacePreference = typeof userWorkspacePreferences.$inferSelect;
export type WorkspaceRule = typeof workspaceRules.$inferSelect;
export type OkrCycle = typeof okrCycles.$inferSelect;
export type WorkspaceGroup = typeof workspaceGroups.$inferSelect;
export type WorkspaceGroupMember = typeof workspaceGroupMembers.$inferSelect;
export type AiUsageEvent = typeof aiUsageEvents.$inferSelect;
export type GoogleConnection = typeof googleConnections.$inferSelect;
export type GoogleOAuthState = typeof googleOAuthStates.$inferSelect;
export type GoogleCalendarEvent = typeof googleCalendarEvents.$inferSelect;
export type SlackConnection = typeof slackConnections.$inferSelect;
export type SlackOAuthState = typeof slackOAuthStates.$inferSelect;
export type TrashRecord = typeof trashRecords.$inferSelect;
