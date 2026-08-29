import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const workspaces = sqliteTable(
  "workspaces",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    ownerUserId: text("owner_user_id").notNull(),
    deletionRequestedAt: text("deletion_requested_at"),
    scheduledDeletionAt: text("scheduled_deletion_at"),
    deletionRequestedByUserId: text("deletion_requested_by_user_id"),
    avatarKey: text("avatar_key"),
    avatarUpdatedAt: text("avatar_updated_at"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_workspaces_owner").on(table.ownerUserId),
    index("idx_workspaces_scheduled_deletion").on(table.scheduledDeletionAt),
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

export const integrationTokens = sqliteTable(
  "integration_tokens",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    name: text("name").notNull().default("Codex"),
    tokenHash: text("token_hash").notNull(),
    tokenPrefix: text("token_prefix").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    lastUsedAt: text("last_used_at"),
    revokedAt: text("revoked_at"),
  },
  (table) => [
    uniqueIndex("idx_integration_tokens_hash").on(table.tokenHash),
    index("idx_integration_tokens_workspace_user").on(table.workspaceId, table.userId, table.revokedAt),
  ],
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
    routineId: text("routine_id").references(() => routines.id, { onDelete: "set null" }),
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
    createdByUserId: text("created_by_user_id"),
    sortOrder: integer("sort_order").notNull().default(0),
    archivedAt: text("archived_at"),
    archivedFromStatus: text("archived_from_status"),
    archiveRootId: text("archive_root_id"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_items_owner_status").on(table.ownerId, table.status),
    index("idx_items_owner_parent").on(table.ownerId, table.parentId),
    index("idx_items_owner_routine").on(table.ownerId, table.routineId),
    index("idx_items_owner_cadence").on(table.ownerId, table.cadence),
    index("idx_items_owner_cycle").on(table.ownerId, table.cycleId),
    index("idx_items_owner_archived").on(table.ownerId, table.archivedAt),
    index("idx_items_owner_archive_root").on(table.ownerId, table.archiveRootId),
  ],
);

export const itemAssignments = sqliteTable(
  "item_assignments",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    itemId: text("item_id").notNull().references(() => items.id, { onDelete: "cascade" }),
    memberId: text("member_id").notNull().references(() => workspaceMembers.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("idx_item_assignments_unique").on(table.ownerId, table.itemId, table.memberId, table.role),
    uniqueIndex("idx_item_assignments_single_role")
      .on(table.ownerId, table.itemId, table.role)
      .where(sql`${table.role} IN ('project_dri', 'task_assignee')`),
    index("idx_item_assignments_owner_item").on(table.ownerId, table.itemId),
    index("idx_item_assignments_member").on(table.memberId),
  ],
);

export const krDataConnections = sqliteTable(
  "kr_data_connections",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    krItemId: text("kr_item_id").notNull().references(() => items.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    endpointUrl: text("endpoint_url").notNull(),
    valuePath: text("value_path").notNull().default(""),
    baselineValue: real("baseline_value").notNull().default(0),
    targetValue: real("target_value").notNull(),
    unit: text("unit").notNull().default(""),
    cadence: text("cadence").notNull().default("daily"),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    lastValue: real("last_value"),
    lastSyncStatus: text("last_sync_status").notNull().default("never"),
    lastError: text("last_error").notNull().default(""),
    lastSyncedAt: text("last_synced_at"),
    nextSyncAt: text("next_sync_at"),
    createdByUserId: text("created_by_user_id"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("idx_kr_data_connections_owner_kr").on(table.ownerId, table.krItemId),
    index("idx_kr_data_connections_due").on(table.active, table.nextSyncAt),
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
    defaultValue: text("default_value").notNull().default("null"),
    systemKey: text("system_key"),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("idx_property_definitions_owner_name").on(table.ownerId, table.name),
    uniqueIndex("idx_property_definitions_owner_system")
      .on(table.ownerId, table.systemKey)
      .where(sql`${table.systemKey} IS NOT NULL`),
    index("idx_property_definitions_owner_active_sort").on(table.ownerId, table.active, table.sortOrder),
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
    legacyValue: text("legacy_value"),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("idx_item_property_values_unique").on(table.ownerId, table.itemId, table.propertyId),
    index("idx_item_property_values_owner_item").on(table.ownerId, table.itemId),
    index("idx_item_property_values_owner_property").on(table.ownerId, table.propertyId),
  ],
);

export const projectDocuments = sqliteTable(
  "project_documents",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    projectId: text("project_id").notNull().references(() => items.id, { onDelete: "cascade" }),
    content: text("content").notNull().default("[]"),
    plainText: text("plain_text").notNull().default(""),
    version: integer("version").notNull().default(1),
    updatedByUserId: text("updated_by_user_id"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("idx_project_documents_project").on(table.ownerId, table.projectId),
    index("idx_project_documents_owner_updated").on(table.ownerId, table.updatedAt),
  ],
);

export const projectTemplates = sqliteTable(
  "project_templates",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    content: text("content").notNull().default("[]"),
    plainText: text("plain_text").notNull().default(""),
    createdByUserId: text("created_by_user_id"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("idx_project_templates_owner_name").on(table.ownerId, table.name),
    index("idx_project_templates_owner_updated").on(table.ownerId, table.updatedAt),
  ],
);

export const projectHiddenProperties = sqliteTable(
  "project_hidden_properties",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    projectId: text("project_id").notNull().references(() => items.id, { onDelete: "cascade" }),
    propertyId: text("property_id").notNull().references(() => propertyDefinitions.id, { onDelete: "cascade" }),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("idx_project_hidden_properties_unique").on(table.ownerId, table.projectId, table.propertyId),
    index("idx_project_hidden_properties_project").on(table.ownerId, table.projectId),
    index("idx_project_hidden_properties_property").on(table.ownerId, table.propertyId),
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
    systemKey: text("system_key"),
    assigneeMemberId: text("assignee_member_id").references(() => workspaceMembers.id, { onDelete: "set null" }),
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
    uniqueIndex("idx_routines_owner_system_key")
      .on(table.ownerId, table.systemKey)
      .where(sql`${table.systemKey} IS NOT NULL`),
    index("idx_routines_assignee").on(table.assigneeMemberId),
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

export const slackAutomations = sqliteTable(
  "slack_automations",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    createdByUserId: text("created_by_user_id").notNull(),
    name: text("name").notNull(),
    triggerType: text("trigger_type").notNull(),
    triggerStatus: text("trigger_status").notNull().default(""),
    channelId: text("channel_id").notNull(),
    messageTemplate: text("message_template").notNull(),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    lastTriggeredAt: text("last_triggered_at"),
    lastDeliveryStatus: text("last_delivery_status").notNull().default("never"),
    lastError: text("last_error").notNull().default(""),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_slack_automations_owner").on(table.ownerId),
    index("idx_slack_automations_owner_active_trigger").on(table.ownerId, table.active, table.triggerType),
  ],
);

export const slackAutomationDeliveries = sqliteTable(
  "slack_automation_deliveries",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    automationId: text("automation_id").notNull().references(() => slackAutomations.id, { onDelete: "cascade" }),
    itemId: text("item_id").references(() => items.id, { onDelete: "set null" }),
    eventKey: text("event_key").notNull(),
    triggerType: text("trigger_type").notNull(),
    channelId: text("channel_id").notNull(),
    message: text("message").notNull(),
    status: text("status").notNull().default("pending"),
    error: text("error").notNull().default(""),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    sentAt: text("sent_at"),
  },
  (table) => [
    uniqueIndex("idx_slack_automation_deliveries_event").on(table.eventKey),
    index("idx_slack_automation_deliveries_owner_created").on(table.ownerId, table.createdAt),
    index("idx_slack_automation_deliveries_automation_created").on(table.automationId, table.createdAt),
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
export type ItemAssignment = typeof itemAssignments.$inferSelect;
export type KrDataConnection = typeof krDataConnections.$inferSelect;
export type PropertyDefinition = typeof propertyDefinitions.$inferSelect;
export type ItemPropertyValue = typeof itemPropertyValues.$inferSelect;
export type ProjectHiddenProperty = typeof projectHiddenProperties.$inferSelect;
export type ProjectDocument = typeof projectDocuments.$inferSelect;
export type ProjectTemplate = typeof projectTemplates.$inferSelect;
export type ChecklistItem = typeof checklistItems.$inferSelect;
export type DailyScrum = typeof dailyScrums.$inferSelect;
export type Routine = typeof routines.$inferSelect;
export type RoutineCompletion = typeof routineCompletions.$inferSelect;
export type Workspace = typeof workspaces.$inferSelect;
export type WorkspaceMember = typeof workspaceMembers.$inferSelect;
export type UserWorkspacePreference = typeof userWorkspacePreferences.$inferSelect;
export type WorkspaceRule = typeof workspaceRules.$inferSelect;
export type IntegrationToken = typeof integrationTokens.$inferSelect;
export type OkrCycle = typeof okrCycles.$inferSelect;
export type WorkspaceGroup = typeof workspaceGroups.$inferSelect;
export type WorkspaceGroupMember = typeof workspaceGroupMembers.$inferSelect;
export type AiUsageEvent = typeof aiUsageEvents.$inferSelect;
export type GoogleConnection = typeof googleConnections.$inferSelect;
export type GoogleOAuthState = typeof googleOAuthStates.$inferSelect;
export type GoogleCalendarEvent = typeof googleCalendarEvents.$inferSelect;
export type SlackConnection = typeof slackConnections.$inferSelect;
export type SlackAutomation = typeof slackAutomations.$inferSelect;
export type SlackAutomationDelivery = typeof slackAutomationDeliveries.$inferSelect;
export type SlackOAuthState = typeof slackOAuthStates.$inferSelect;
export type TrashRecord = typeof trashRecords.$inferSelect;
