import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import {
  ITEM_CADENCES,
  ITEM_KINDS,
  ITEM_PRIORITIES,
  ITEM_STATUSES,
  GROUP_COLORS,
  GROUP_VISIBILITIES,
  PROPERTY_TYPES,
  ROUTINE_CADENCES,
  addGroupMember,
  archiveProject,
  authorizeRequest,
  canManageTeam,
  createChecklistItem,
  createGroup,
  createItem,
  createPropertyDefinition,
  createRoutine,
  deletePropertyDefinition,
  deleteGroup,
  deleteRoutine,
  ensureWorkspace,
  getTeam,
  getDailyScrum,
  getItemPropertiesByName,
  getItemAssignmentMap,
  getPeriodReview,
  getRecommendations,
  getWorkspaceRules,
  listChecklistItems,
  listGroupMembers,
  listGroups,
  listItems,
  listProjectPropertyDefinitions,
  listRoutines,
  inviteTeamMember,
  removeTeamMember,
  removeGroupMember,
  replaceItemAssignmentRole,
  permanentlyDeleteArchivedProject,
  restoreProject,
  saveDailyScrum,
  saveWorkspaceRules,
  serializeChecklistItem,
  serializeItem,
  serializePropertyDefinition,
  serializeRoutine,
  setItemPropertiesByName,
  setPropertyValue,
  updateChecklistItem,
  updateGroup,
  updateGroupMember,
  updateItem,
  updateRoutine,
  updateTeamMember,
  setRoutineCompletion,
  type ItemCadence,
  type ItemKind,
  type ItemPriority,
  type ItemStatus,
  type GroupColor,
  type GroupRole,
  type GroupVisibility,
  type PropertyType,
  type PropertyValue,
  type RoutineCadence,
  type RequestAuthorization,
  type TeamRole,
} from "@/lib/pace-data";

const propertyValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);

const propertyDefinitionOutput = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  options: z.array(z.string()),
  sortOrder: z.number(),
  valueCount: z.number(),
});

const itemAssignmentOutput = z.object({
  id: z.string(),
  memberId: z.string(),
  displayName: z.string(),
  email: z.string(),
  role: z.enum(["project_dri", "project_worker", "task_assignee"]),
});

const itemOutput = z.object({
  id: z.string(),
  parentId: z.string().nullable(),
  kind: z.string(),
  title: z.string(),
  description: z.string(),
  status: z.string(),
  priority: z.string(),
  cadence: z.string(),
  progress: z.number(),
  dueDate: z.string().nullable(),
  source: z.string(),
  archivedAt: z.string().nullable(),
  archivedFromStatus: z.string().nullable(),
  archiveRootId: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  properties: z.record(z.string(), propertyValueSchema),
  assignments: z.array(itemAssignmentOutput),
});

const checklistOutput = z.object({
  id: z.string(),
  taskId: z.string(),
  title: z.string(),
  completed: z.boolean(),
  sortOrder: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const recommendationOutput = z.object({
  id: z.string(),
  kind: z.string(),
  title: z.string(),
  detail: z.string(),
  itemIds: z.array(z.string()),
  score: z.number(),
});

const routineOutput = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  triggerPoint: z.string(),
  actionPlace: z.string(),
  actionSteps: z.string(),
  cadence: z.string(),
  active: z.boolean(),
  sortOrder: z.number(),
  date: z.string(),
  completed: z.boolean(),
  completionId: z.string().nullable(),
  note: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const workspaceRulesOutput = z.object({
  workspaceId: z.string(),
  captureInstruction: z.string(),
  structureInstruction: z.string(),
  routineInstruction: z.string(),
  defaultPriority: z.string(),
  defaultCadence: z.string(),
  reviewBeforeCreate: z.boolean(),
  configured: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const teamMemberOutput = z.object({
  id: z.string(),
  email: z.string(),
  displayName: z.string(),
  role: z.string(),
  status: z.string(),
  isCurrent: z.boolean(),
  createdAt: z.string(),
});

const groupOutput = z.object({
  id: z.string(),
  name: z.string(),
  handle: z.string(),
  description: z.string(),
  color: z.string(),
  visibility: z.string(),
  archived: z.boolean(),
  memberCount: z.number(),
  isMember: z.boolean(),
  isLead: z.boolean(),
  canEdit: z.boolean(),
  canArchive: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const groupMemberOutput = z.object({
  id: z.string(),
  memberId: z.string(),
  email: z.string(),
  displayName: z.string(),
  status: z.string(),
  workspaceRole: z.string(),
  groupRole: z.string(),
  isCurrent: z.boolean(),
  createdAt: z.string(),
});

async function createOkrptrServer(authorization: RequestAuthorization) {
  const { ownerId } = authorization;
  const rules = await getWorkspaceRules(ownerId);
  const server = new McpServer(
    { name: "okrptr", version: "0.6.0" },
    {
      instructions:
        [
          "Capture first, structure later. Use capture_item for quick natural-language intake. The OKR hierarchy is Objective > Key Result > Initiative > Project > Task. Routine is an independent Project-like execution container that does not require an Initiative and may own Tasks. Routines add trigger points, places/tools, concrete action steps, and dated completion records. Tasks have one assignee and belong to either a Project or Routine; custom properties belong to Projects. Team access uses Owner, Admin, Member, and read-only Viewer roles. Workspace groups have @handles, open or private visibility, and Lead or Member roles. Use list_properties before setting unfamiliar Project property names.",
          `Workspace capture rule: ${rules.captureInstruction}`,
          `Workspace structure rule: ${rules.structureInstruction}`,
          `Workspace routine rule: ${rules.routineInstruction}`,
          `Default Task priority: ${rules.defaultPriority}. Default cadence: ${rules.defaultCadence}. ${rules.reviewBeforeCreate ? "Ask before creating structured items when the hierarchy is uncertain." : "Create structured items directly when the hierarchy is clear."}`,
        ].join("\n"),
    },
  );

  server.registerTool(
    "get_workspace_rules",
    {
      title: "Get OKRPTR workspace rules",
      description: "Read the shared rules that guide web, API, and MCP capture behavior for the active workspace.",
      inputSchema: {},
      outputSchema: { rules: workspaceRulesOutput },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    async () => ({
      structuredContent: { rules: await getWorkspaceRules(ownerId) },
      content: [{ type: "text", text: "Returned the active OKRPTR workspace rules." }],
    }),
  );

  server.registerTool(
    "update_workspace_rules",
    {
      title: "Update OKRPTR workspace rules",
      description: "Update the shared rules that guide web, API, and MCP capture behavior for the active workspace.",
      inputSchema: {
        captureInstruction: z.string().optional(),
        structureInstruction: z.string().optional(),
        routineInstruction: z.string().optional(),
        defaultPriority: z.enum(ITEM_PRIORITIES).optional(),
        defaultCadence: z.enum(ITEM_CADENCES).optional(),
        reviewBeforeCreate: z.boolean().optional(),
      },
      outputSchema: { rules: workspaceRulesOutput },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async ({ captureInstruction, structureInstruction, routineInstruction, defaultPriority, defaultCadence, reviewBeforeCreate }) => {
      const updated = await saveWorkspaceRules(ownerId, {
        captureInstruction,
        structureInstruction,
        routineInstruction,
        defaultPriority: defaultPriority as ItemPriority | undefined,
        defaultCadence: defaultCadence as ItemCadence | undefined,
        reviewBeforeCreate,
        configured: true,
      });
      return {
        structuredContent: { rules: updated },
        content: [{ type: "text", text: "Updated the OKRPTR workspace rules." }],
      };
    },
  );

  server.registerTool(
    "capture_item",
    {
      title: "Capture work to OKRPTR General",
      description: "Use this first when the user mentions a task, follow-up, idea, or commitment that should be saved quickly without interrupting the conversation.",
      inputSchema: {
        title: z.string().min(1).describe("Short actionable title in the user's language"),
        description: z.string().optional().describe("Useful context from the conversation"),
        due_date: z.string().optional().describe("Due date in YYYY-MM-DD format when stated"),
        priority: z.enum(ITEM_PRIORITIES).optional(),
        source_ref: z.string().optional().describe("Message or conversation identifier for traceability"),
        assignee_member_id: z.string().optional().describe("Active workspace member ID for the single Task assignee"),
      },
      outputSchema: { item: itemOutput },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async ({ title, description, due_date, priority, source_ref, assignee_member_id }) => {
      const item = await createItem(ownerId, {
        title,
        description,
        dueDate: due_date,
        priority: priority as ItemPriority | undefined,
        kind: "task",
        source: "mcp",
        sourceRef: source_ref,
      });
      if (assignee_member_id) await replaceItemAssignmentRole(ownerId, item.id, "task_assignee", [assignee_member_id]);
      const serialized = (await serializeItemsForMcp(ownerId, [item]))[0];
      return {
        structuredContent: { item: serialized },
        content: [{ type: "text", text: `Captured "${item.title}" in OKRPTR General.` }],
      };
    },
  );

  server.registerTool(
    "create_item",
    {
      title: "Create a structured OKR item",
      description: "Create a known Objective, Key Result, Initiative, Project, or Task when its hierarchy and parent are already clear.",
      inputSchema: {
        kind: z.enum(ITEM_KINDS),
        title: z.string().min(1),
        parent_id: z.string().optional().describe("Required except for Objective"),
        description: z.string().optional(),
        status: z.enum(ITEM_STATUSES).optional(),
        priority: z.enum(ITEM_PRIORITIES).optional(),
        cadence: z.enum(ITEM_CADENCES).optional(),
        progress: z.number().min(0).max(100).optional(),
        due_date: z.string().optional(),
        properties: z.record(z.string(), propertyValueSchema).optional().describe("Project-only custom values keyed by property name"),
        dri_member_id: z.string().optional().describe("Active workspace member ID for a Project DRI"),
        worker_member_ids: z.array(z.string()).optional().describe("Active workspace member IDs for Project workers"),
        assignee_member_id: z.string().optional().describe("Active workspace member ID for a Task assignee"),
      },
      outputSchema: { item: itemOutput },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async (input) => {
      const item = await createItem(ownerId, {
        title: input.title,
        kind: input.kind as ItemKind,
        parentId: input.parent_id,
        description: input.description,
        status: input.status as ItemStatus | undefined,
        priority: input.priority as ItemPriority | undefined,
        cadence: input.cadence as ItemCadence | undefined,
        progress: input.progress,
        dueDate: input.due_date,
        source: "mcp",
      });
      if (input.properties && item.kind === "project") {
        await setItemPropertiesByName(ownerId, item.id, input.properties as Record<string, PropertyValue>);
      }
      if (item.kind === "project" && input.dri_member_id) await replaceItemAssignmentRole(ownerId, item.id, "project_dri", [input.dri_member_id]);
      if (item.kind === "project" && input.worker_member_ids) await replaceItemAssignmentRole(ownerId, item.id, "project_worker", input.worker_member_ids);
      if (item.kind === "task" && input.assignee_member_id) await replaceItemAssignmentRole(ownerId, item.id, "task_assignee", [input.assignee_member_id]);
      const serialized = (await serializeItemsForMcp(ownerId, [item]))[0];
      return {
        structuredContent: { item: serialized },
        content: [{ type: "text", text: `Created ${item.kind} "${item.title}".` }],
      };
    },
  );

  server.registerTool(
    "list_items",
    {
      title: "List and search OKRPTR items",
      description: "Find existing OKRs, projects, tasks, or General captures before reviewing, updating, or linking them.",
      inputSchema: {
        kind: z.enum(ITEM_KINDS).optional(),
        status: z.enum(ITEM_STATUSES).optional(),
        cadence: z.enum(ITEM_CADENCES).optional(),
        parent_id: z.string().optional(),
        query: z.string().optional(),
        limit: z.number().int().min(1).max(100).optional(),
        include_archived: z.boolean().default(false),
      },
      outputSchema: { items: z.array(itemOutput), count: z.number() },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    async (input) => {
      const rows = await listItems(ownerId, {
        kind: input.kind as ItemKind | undefined,
        status: input.status as ItemStatus | undefined,
        cadence: input.cadence as ItemCadence | undefined,
        parentId: input.parent_id,
        query: input.query,
        limit: input.limit,
        includeArchived: input.include_archived,
      });
      const serialized = await serializeItemsForMcp(ownerId, rows);
      return {
        structuredContent: { items: serialized, count: serialized.length },
        content: [{ type: "text", text: `Found ${serialized.length} OKRPTR items.` }],
      };
    },
  );

  server.registerTool(
    "update_item",
    {
      title: "Update an OKRPTR item",
      description: "Change the title, status, progress, priority, cadence, or due date of an existing item. Use list_items first when the ID is unknown.",
      inputSchema: {
        id: z.string(),
        title: z.string().min(1).optional(),
        description: z.string().optional(),
        status: z.enum(ITEM_STATUSES).optional(),
        priority: z.enum(ITEM_PRIORITIES).optional(),
        cadence: z.enum(ITEM_CADENCES).optional(),
        progress: z.number().min(0).max(100).optional(),
        due_date: z.string().nullable().optional(),
        properties: z.record(z.string(), propertyValueSchema).optional().describe("Project-only custom values keyed by property name"),
        dri_member_id: z.string().nullable().optional(),
        worker_member_ids: z.array(z.string()).optional(),
        assignee_member_id: z.string().nullable().optional(),
      },
      outputSchema: { item: itemOutput },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async (input) => {
      const item = await updateItem(ownerId, input.id, {
        title: input.title,
        description: input.description,
        status: input.status as ItemStatus | undefined,
        priority: input.priority as ItemPriority | undefined,
        cadence: input.cadence as ItemCadence | undefined,
        progress: input.progress,
        dueDate: input.due_date,
        source: "mcp",
      });
      if (input.properties && item.kind === "project") {
        await setItemPropertiesByName(ownerId, item.id, input.properties as Record<string, PropertyValue>);
      }
      if (item.kind === "project" && input.dri_member_id !== undefined) await replaceItemAssignmentRole(ownerId, item.id, "project_dri", input.dri_member_id ? [input.dri_member_id] : []);
      if (item.kind === "project" && input.worker_member_ids !== undefined) await replaceItemAssignmentRole(ownerId, item.id, "project_worker", input.worker_member_ids);
      if (item.kind === "task" && input.assignee_member_id !== undefined) await replaceItemAssignmentRole(ownerId, item.id, "task_assignee", input.assignee_member_id ? [input.assignee_member_id] : []);
      const serialized = (await serializeItemsForMcp(ownerId, [item]))[0];
      return {
        structuredContent: { item: serialized },
        content: [{ type: "text", text: `Updated "${item.title}".` }],
      };
    },
  );

  server.registerTool(
    "link_item",
    {
      title: "Link an item into the OKR hierarchy",
      description: "Move a General Task or existing item under its correct parent. Project requires Initiative; Task requires Project.",
      inputSchema: { id: z.string(), parent_id: z.string() },
      outputSchema: { item: itemOutput },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async ({ id, parent_id }) => {
      const item = await updateItem(ownerId, id, {
        parentId: parent_id,
        routineId: null,
        status: "todo",
        source: "mcp",
      });
      const serialized = (await serializeItemsForMcp(ownerId, [item]))[0];
      return {
        structuredContent: { item: serialized },
        content: [{ type: "text", text: `Linked "${item.title}" into the OKR hierarchy.` }],
      };
    },
  );

  server.registerTool(
    "archive_project",
    {
      title: "Archive a Project with its Tasks",
      description: "Remove a Project and its direct Tasks from active views while preserving them for restoration.",
      inputSchema: { id: z.string() },
      outputSchema: { project: itemOutput, archivedTaskCount: z.number() },
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    },
    async ({ id }) => {
      const result = await archiveProject(ownerId, id);
      const project = (await serializeItemsForMcp(ownerId, [result.project]))[0];
      const archivedTaskCount = Math.max(0, result.affectedCount - 1);
      return {
        structuredContent: { project, archivedTaskCount },
        content: [{ type: "text", text: `Archived "${result.project.title}" with ${archivedTaskCount} Tasks.` }],
      };
    },
  );

  server.registerTool(
    "restore_project",
    {
      title: "Restore an archived Project",
      description: "Restore an archived Project and its direct Tasks to their previous statuses.",
      inputSchema: { id: z.string() },
      outputSchema: { project: itemOutput, restoredCount: z.number() },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async ({ id }) => {
      const result = await restoreProject(ownerId, id);
      const project = (await serializeItemsForMcp(ownerId, [result.project]))[0];
      return {
        structuredContent: { project, restoredCount: result.affectedCount },
        content: [{ type: "text", text: `Restored "${result.project.title}" and its archived Tasks.` }],
      };
    },
  );

  server.registerTool(
    "delete_archived_project",
    {
      title: "Permanently delete an archived Project",
      description: "Permanently delete an archived Project, its archived Tasks, checklists, property values, and assignments. Ask for explicit confirmation immediately before calling, then pass the exact Project title as confirmation_title.",
      inputSchema: { id: z.string(), confirmation_title: z.string() },
      outputSchema: { deleted: z.boolean(), projectId: z.string(), title: z.string(), deletedTaskCount: z.number(), deletedItemCount: z.number() },
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    },
    async ({ id, confirmation_title }) => {
      const result = await permanentlyDeleteArchivedProject(ownerId, id, confirmation_title);
      return {
        structuredContent: result,
        content: [{ type: "text", text: `Permanently deleted "${result.title}" and ${result.deletedTaskCount} Tasks.` }],
      };
    },
  );

  server.registerTool(
    "list_properties",
    {
      title: "List Project properties",
      description: "List the custom fields available on Projects, including IDs, types, usage counts, and select options.",
      inputSchema: {},
      outputSchema: { properties: z.array(propertyDefinitionOutput), count: z.number() },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    async () => {
      const definitions = await listProjectPropertyDefinitions(ownerId);
      const properties = definitions.map((definition) => serializePropertyDefinition(definition));
      return {
        structuredContent: { properties, count: properties.length },
        content: [{ type: "text", text: `Found ${properties.length} Project properties.` }],
      };
    },
  );

  server.registerTool(
    "create_property",
    {
      title: "Create a Project property",
      description: "Add a custom field to every Project. Select properties should include their allowed options.",
      inputSchema: {
        name: z.string().min(1),
        type: z.enum(PROPERTY_TYPES),
        options: z.array(z.string().min(1)).optional(),
      },
      outputSchema: { property: propertyDefinitionOutput },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async ({ name, type, options }) => {
      const property = await createPropertyDefinition(ownerId, {
        name,
        type: type as PropertyType,
        options,
      });
      const serialized = serializePropertyDefinition(property);
      return {
        structuredContent: { property: serialized },
        content: [{ type: "text", text: `Created Project property "${property.name}".` }],
      };
    },
  );

  server.registerTool(
    "set_property_value",
    {
      title: "Set a Project property value",
      description: "Set or clear a custom property on a Project. The property can be provided by ID or exact name.",
      inputSchema: {
        item_id: z.string(),
        property: z.string().min(1).describe("Property ID or exact name"),
        value: propertyValueSchema,
      },
      outputSchema: {
        itemId: z.string(),
        propertyId: z.string(),
        propertyName: z.string(),
        value: propertyValueSchema,
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async ({ item_id, property, value }) => {
      const definition = await resolveProperty(ownerId, property);
      await setPropertyValue(ownerId, item_id, definition.id, value as PropertyValue);
      const structuredContent = {
        itemId: item_id,
        propertyId: definition.id,
        propertyName: definition.name,
        value: value as PropertyValue,
      };
      return {
        structuredContent,
        content: [{ type: "text", text: `Set "${definition.name}" on item ${item_id}.` }],
      };
    },
  );

  server.registerTool(
    "delete_property",
    {
      title: "Delete a Project property",
      description: "Delete a custom Project field and all Project values stored under it. The property can be provided by ID or exact name.",
      inputSchema: { property: z.string().min(1).describe("Property ID or exact name") },
      outputSchema: { deleted: z.boolean(), propertyId: z.string(), propertyName: z.string() },
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    },
    async ({ property }) => {
      const definition = await resolveProperty(ownerId, property);
      await deletePropertyDefinition(ownerId, definition.id);
      const structuredContent = {
        deleted: true,
        propertyId: definition.id,
        propertyName: definition.name,
      };
      return {
        structuredContent,
        content: [{ type: "text", text: `Deleted Project property "${definition.name}".` }],
      };
    },
  );

  server.registerTool(
    "review_period",
    {
      title: "Review a daily, weekly, monthly, or quarterly period",
      description: "Summarize completion, blockers, progress, and relevant work for planning or review conversations.",
      inputSchema: { cadence: z.enum(ITEM_CADENCES) },
      outputSchema: {
        cadence: z.string(),
        total: z.number(),
        completed: z.number(),
        blocked: z.number(),
        averageProgress: z.number(),
        items: z.array(itemOutput),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    async ({ cadence }) => {
      const review = await getPeriodReview(ownerId, cadence as ItemCadence);
      const serialized = { ...review, items: await serializeItemsForMcp(ownerId, review.items) };
      return {
        structuredContent: serialized,
        content: [{ type: "text", text: `${cadence} review: ${review.completed}/${review.total} completed, ${review.blocked} blocked.` }],
      };
    },
  );

  server.registerTool(
    "list_checklist_items",
    {
      title: "List a Task checklist",
      description: "Read the internal checklist for a Task. Use list_items first when the Task ID is unknown.",
      inputSchema: { task_id: z.string() },
      outputSchema: { items: z.array(checklistOutput), count: z.number() },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    async ({ task_id }) => {
      const rows = await listChecklistItems(ownerId, task_id);
      const serialized = rows.map(serializeChecklistItem);
      return {
        structuredContent: { items: serialized, count: serialized.length },
        content: [{ type: "text", text: `Found ${serialized.length} checklist items.` }],
      };
    },
  );

  server.registerTool(
    "add_checklist_item",
    {
      title: "Add a Task checklist item",
      description: "Add a small execution step inside a Task without creating another hierarchy level.",
      inputSchema: { task_id: z.string(), title: z.string().min(1) },
      outputSchema: { item: checklistOutput },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async ({ task_id, title }) => {
      const item = serializeChecklistItem(await createChecklistItem(ownerId, task_id, title));
      return {
        structuredContent: { item },
        content: [{ type: "text", text: `Added checklist item "${item.title}".` }],
      };
    },
  );

  server.registerTool(
    "update_checklist_item",
    {
      title: "Update a Task checklist item",
      description: "Rename or mark a checklist item complete. Task progress is recalculated automatically.",
      inputSchema: {
        id: z.string(),
        title: z.string().min(1).optional(),
        completed: z.boolean().optional(),
      },
      outputSchema: { item: checklistOutput },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async ({ id, title, completed }) => {
      const item = serializeChecklistItem(await updateChecklistItem(ownerId, id, { title, completed }));
      return {
        structuredContent: { item },
        content: [{ type: "text", text: `Updated checklist item "${item.title}".` }],
      };
    },
  );

  server.registerTool(
    "get_daily_scrum",
    {
      title: "Get a daily scrum",
      description: "Get saved notes plus automatically collected completed, active, and blocked Tasks for a date.",
      inputSchema: { date: z.string().optional().describe("YYYY-MM-DD; defaults to today") },
      outputSchema: {
        date: z.string(),
        yesterdayNote: z.string(),
        todayNote: z.string(),
        blockersNote: z.string(),
        yesterdayTasks: z.array(itemOutput),
        todayTasks: z.array(itemOutput),
        blockers: z.array(itemOutput),
        updatedAt: z.string().nullable(),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    async ({ date }) => {
      const scrum = await getDailyScrum(ownerId, date ?? new Date().toISOString().slice(0, 10));
      const structuredContent = {
        ...scrum,
        yesterdayTasks: await serializeItemsForMcp(ownerId, scrum.yesterdayTasks),
        todayTasks: await serializeItemsForMcp(ownerId, scrum.todayTasks),
        blockers: await serializeItemsForMcp(ownerId, scrum.blockers),
      };
      return {
        structuredContent,
        content: [{ type: "text", text: `${scrum.date} daily scrum is ready.` }],
      };
    },
  );

  server.registerTool(
    "save_daily_scrum",
    {
      title: "Save a daily scrum",
      description: "Save yesterday, today, and blocker notes from a daily planning conversation.",
      inputSchema: {
        date: z.string().describe("YYYY-MM-DD"),
        yesterday_note: z.string().optional(),
        today_note: z.string().optional(),
        blockers_note: z.string().optional(),
      },
      outputSchema: {
        date: z.string(),
        yesterdayNote: z.string(),
        todayNote: z.string(),
        blockersNote: z.string(),
        yesterdayTasks: z.array(itemOutput),
        todayTasks: z.array(itemOutput),
        blockers: z.array(itemOutput),
        updatedAt: z.string().nullable(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async ({ date, yesterday_note, today_note, blockers_note }) => {
      const scrum = await saveDailyScrum(ownerId, date, {
        yesterdayNote: yesterday_note,
        todayNote: today_note,
        blockersNote: blockers_note,
      });
      const structuredContent = {
        ...scrum,
        yesterdayTasks: await serializeItemsForMcp(ownerId, scrum.yesterdayTasks),
        todayTasks: await serializeItemsForMcp(ownerId, scrum.todayTasks),
        blockers: await serializeItemsForMcp(ownerId, scrum.blockers),
      };
      return {
        structuredContent,
        content: [{ type: "text", text: `Saved the ${scrum.date} daily scrum.` }],
      };
    },
  );

  server.registerTool(
    "get_recommendations",
    {
      title: "Get execution recommendations",
      description: "Prioritize blocked, overdue, due-soon, and empty Project work from current OKRPTR data.",
      inputSchema: { date: z.string().optional().describe("YYYY-MM-DD; defaults to today") },
      outputSchema: { recommendations: z.array(recommendationOutput), count: z.number() },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    async ({ date }) => {
      const recommendations = await getRecommendations(ownerId, date);
      return {
        structuredContent: { recommendations, count: recommendations.length },
        content: [{ type: "text", text: `Found ${recommendations.length} execution recommendations.` }],
      };
    },
  );

  server.registerTool(
    "list_routines",
    {
      title: "List recurring routines",
      description: "List routines and whether each one is completed on a specific date.",
      inputSchema: {
        date: z.string().optional().describe("YYYY-MM-DD; defaults to today"),
        include_inactive: z.boolean().optional(),
      },
      outputSchema: { routines: z.array(routineOutput), count: z.number() },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    async ({ date, include_inactive }) => {
      const selectedDate = date ?? new Date().toISOString().slice(0, 10);
      const routines = await listRoutines(ownerId, selectedDate, include_inactive ?? true);
      return {
        structuredContent: { routines, count: routines.length },
        content: [{ type: "text", text: `Found ${routines.length} routines for ${selectedDate}.` }],
      };
    },
  );

  server.registerTool(
    "create_routine",
    {
      title: "Create a recurring routine",
      description: "Create an independent Project-like recurring-work container that may own Tasks.",
      inputSchema: {
        title: z.string().min(1),
        description: z.string().optional(),
        triggerPoint: z.string().optional().describe("The cue that starts the routine, for example a time, event, or state."),
        actionPlace: z.string().optional().describe("Where or in which tool/context the routine should happen."),
        actionSteps: z.string().optional().describe("Concrete steps for how to perform the routine."),
        cadence: z.enum(ROUTINE_CADENCES).optional(),
        active: z.boolean().optional(),
        date: z.string().optional().describe("Date used for the returned completion state"),
      },
      outputSchema: { routine: routineOutput },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async ({ title, description, triggerPoint, actionPlace, actionSteps, cadence, active, date }) => {
      const selectedDate = date ?? new Date().toISOString().slice(0, 10);
      const created = await createRoutine(ownerId, {
        title,
        description,
        triggerPoint,
        actionPlace,
        actionSteps,
        cadence: cadence as RoutineCadence | undefined,
        active,
      });
      const routine = serializeRoutine(created, selectedDate);
      return {
        structuredContent: { routine },
        content: [{ type: "text", text: `Created routine "${routine.title}".` }],
      };
    },
  );

  server.registerTool(
    "update_routine",
    {
      title: "Update a recurring routine",
      description: "Rename a routine, change its cadence, or pause and resume it.",
      inputSchema: {
        id: z.string(),
        title: z.string().min(1).optional(),
        description: z.string().optional(),
        triggerPoint: z.string().optional(),
        actionPlace: z.string().optional(),
        actionSteps: z.string().optional(),
        cadence: z.enum(ROUTINE_CADENCES).optional(),
        active: z.boolean().optional(),
        date: z.string().optional(),
      },
      outputSchema: { routine: routineOutput },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async ({ id, title, description, triggerPoint, actionPlace, actionSteps, cadence, active, date }) => {
      const selectedDate = date ?? new Date().toISOString().slice(0, 10);
      const updated = await updateRoutine(ownerId, id, {
        title,
        description,
        triggerPoint,
        actionPlace,
        actionSteps,
        cadence: cadence as RoutineCadence | undefined,
        active,
      });
      const completionState = (await listRoutines(ownerId, selectedDate)).find((routine) => routine.id === updated.id)!;
      return {
        structuredContent: { routine: completionState },
        content: [{ type: "text", text: `Updated routine "${updated.title}".` }],
      };
    },
  );

  server.registerTool(
    "complete_routine",
    {
      title: "Set a routine completion",
      description: "Mark a routine complete or incomplete for a date, with an optional note.",
      inputSchema: {
        id: z.string(),
        date: z.string().describe("YYYY-MM-DD"),
        completed: z.boolean().default(true),
        note: z.string().optional(),
      },
      outputSchema: { routine: routineOutput },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async ({ id, date, completed, note }) => {
      const routine = await setRoutineCompletion(ownerId, id, date, completed, note);
      return {
        structuredContent: { routine },
        content: [{ type: "text", text: `${routine.title} is ${completed ? "complete" : "incomplete"} for ${date}.` }],
      };
    },
  );

  server.registerTool(
    "delete_routine",
    {
      title: "Delete a recurring routine",
      description: "Delete a routine and its dated completion history.",
      inputSchema: { id: z.string() },
      outputSchema: { deleted: z.boolean(), id: z.string(), title: z.string() },
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    },
    async ({ id }) => {
      const routine = await deleteRoutine(ownerId, id);
      return {
        structuredContent: { deleted: true, id: routine.id, title: routine.title },
        content: [{ type: "text", text: `Deleted routine "${routine.title}".` }],
      };
    },
  );

  server.registerTool(
    "list_team_members",
    {
      title: "List workspace team members",
      description: "List active members and pending invitations with their workspace roles.",
      inputSchema: {},
      outputSchema: { workspace: z.object({ id: z.string(), name: z.string() }), members: z.array(teamMemberOutput), count: z.number() },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    async () => {
      const team = await getTeam(ownerId, authorization.userId);
      return {
        structuredContent: { ...team, count: team.members.length },
        content: [{ type: "text", text: `Found ${team.members.length} workspace members and invitations.` }],
      };
    },
  );

  server.registerTool(
    "invite_team_member",
    {
      title: "Invite a workspace team member",
      description: "Create an email invitation with an Admin, Member, or Viewer role.",
      inputSchema: { email: z.string().email(), role: z.enum(["admin", "member", "viewer"]).default("member"), displayName: z.string().optional() },
      outputSchema: { member: teamMemberOutput },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async ({ email, role, displayName }) => {
      if (!canManageTeam(authorization)) throw new Error("Owner or Admin access is required.");
      const member = await inviteTeamMember(ownerId, authorization.userId, email, role as Exclude<TeamRole, "owner">, displayName ?? "");
      return { structuredContent: { member }, content: [{ type: "text", text: `Invited ${email} as ${role}.` }] };
    },
  );

  server.registerTool(
    "update_team_member",
    {
      title: "Update a team member",
      description: "Change a non-owner team member or invitation role, or update a display name.",
      inputSchema: { id: z.string(), role: z.enum(["admin", "member", "viewer"]).optional(), displayName: z.string().optional() },
      outputSchema: { member: teamMemberOutput },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async ({ id, role, displayName }) => {
      if (!canManageTeam(authorization)) throw new Error("Owner or Admin access is required.");
      const member = await updateTeamMember(ownerId, id, { role: role as Exclude<TeamRole, "owner"> | undefined, displayName }, authorization.userId, true);
      return { structuredContent: { member }, content: [{ type: "text", text: `Updated ${member.email || member.displayName}.` }] };
    },
  );

  server.registerTool(
    "remove_team_member",
    {
      title: "Remove a team member or invitation",
      description: "Remove a non-owner member or cancel a pending invitation.",
      inputSchema: { id: z.string() },
      outputSchema: { deleted: z.boolean(), id: z.string() },
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    },
    async ({ id }) => {
      if (!canManageTeam(authorization)) throw new Error("Owner or Admin access is required.");
      const deleted = await removeTeamMember(ownerId, id, authorization.userId);
      return { structuredContent: deleted, content: [{ type: "text", text: `Removed team member or invitation ${id}.` }] };
    },
  );

  server.registerTool(
    "list_groups",
    {
      title: "List workspace groups",
      description: "List groups visible to the current member. Private groups are only returned to their members and workspace administrators.",
      inputSchema: { include_archived: z.boolean().default(false) },
      outputSchema: { groups: z.array(groupOutput), count: z.number() },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    async ({ include_archived }) => {
      const groups = await listGroups(authorization, include_archived);
      return {
        structuredContent: { groups, count: groups.length },
        content: [{ type: "text", text: `Found ${groups.length} visible workspace groups.` }],
      };
    },
  );

  server.registerTool(
    "create_group",
    {
      title: "Create a workspace group",
      description: "Create an open or private group with a unique @handle. The creator becomes a Group Lead.",
      inputSchema: {
        name: z.string().min(1).max(80),
        handle: z.string().optional().describe("Optional unique handle without @; generated from the name when omitted"),
        description: z.string().max(500).optional(),
        color: z.enum(GROUP_COLORS).default("gray"),
        visibility: z.enum(GROUP_VISIBILITIES).default("open"),
      },
      outputSchema: { group: groupOutput },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async ({ name, handle, description, color, visibility }) => {
      const group = await createGroup(authorization, {
        name,
        handle,
        description,
        color: color as GroupColor,
        visibility: visibility as GroupVisibility,
      });
      return { structuredContent: { group }, content: [{ type: "text", text: `Created @${group.handle} (${group.visibility}).` }] };
    },
  );

  server.registerTool(
    "update_group",
    {
      title: "Update a workspace group",
      description: "Update group identity, description, color, or visibility. Group Leads can update their own groups.",
      inputSchema: {
        id: z.string(),
        name: z.string().min(1).max(80).optional(),
        handle: z.string().optional(),
        description: z.string().max(500).optional(),
        color: z.enum(GROUP_COLORS).optional(),
        visibility: z.enum(GROUP_VISIBILITIES).optional(),
      },
      outputSchema: { group: groupOutput },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async ({ id, name, handle, description, color, visibility }) => {
      const group = await updateGroup(authorization, id, {
        name,
        handle,
        description,
        color: color as GroupColor | undefined,
        visibility: visibility as GroupVisibility | undefined,
      });
      return { structuredContent: { group }, content: [{ type: "text", text: `Updated @${group.handle}.` }] };
    },
  );

  server.registerTool(
    "archive_group",
    {
      title: "Archive or restore a workspace group",
      description: "Archive a group without losing membership, or restore it later. Owner or Admin access is required.",
      inputSchema: { id: z.string(), archived: z.boolean().default(true) },
      outputSchema: { group: groupOutput },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async ({ id, archived }) => {
      const group = await updateGroup(authorization, id, { archived });
      return { structuredContent: { group }, content: [{ type: "text", text: `${archived ? "Archived" : "Restored"} @${group.handle}.` }] };
    },
  );

  server.registerTool(
    "delete_group",
    {
      title: "Permanently delete an archived group",
      description: "Permanently delete a group and its memberships. The group must already be archived.",
      inputSchema: { id: z.string() },
      outputSchema: { deleted: z.boolean(), id: z.string(), name: z.string() },
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    },
    async ({ id }) => {
      const deleted = await deleteGroup(authorization, id);
      return { structuredContent: deleted, content: [{ type: "text", text: `Permanently deleted group "${deleted.name}".` }] };
    },
  );

  server.registerTool(
    "list_group_members",
    {
      title: "List members of a workspace group",
      description: "List active and invited members in a visible group, including Group Lead roles.",
      inputSchema: { group_id: z.string() },
      outputSchema: { group: groupOutput, members: z.array(groupMemberOutput), canManageMembers: z.boolean(), count: z.number() },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    async ({ group_id }) => {
      const result = await listGroupMembers(authorization, group_id);
      return {
        structuredContent: { ...result, count: result.members.length },
        content: [{ type: "text", text: `Found ${result.members.length} members in @${result.group.handle}.` }],
      };
    },
  );

  server.registerTool(
    "add_group_member",
    {
      title: "Add a member to a workspace group",
      description: "Add an active member or pending invitation to a group as a Lead or Member.",
      inputSchema: { group_id: z.string(), member_id: z.string(), role: z.enum(["lead", "member"]).default("member") },
      outputSchema: { member: groupMemberOutput },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async ({ group_id, member_id, role }) => {
      const member = await addGroupMember(authorization, group_id, member_id, role as GroupRole);
      return { structuredContent: { member }, content: [{ type: "text", text: `Added ${member.displayName} to the group as ${role}.` }] };
    },
  );

  server.registerTool(
    "update_group_member",
    {
      title: "Update a group member role",
      description: "Change a group member between Lead and Member.",
      inputSchema: { group_id: z.string(), member_id: z.string(), role: z.enum(["lead", "member"]) },
      outputSchema: { member: groupMemberOutput },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async ({ group_id, member_id, role }) => {
      const member = await updateGroupMember(authorization, group_id, member_id, role as GroupRole);
      return { structuredContent: { member }, content: [{ type: "text", text: `Updated ${member.displayName} to Group ${role}.` }] };
    },
  );

  server.registerTool(
    "remove_group_member",
    {
      title: "Remove a member from a workspace group",
      description: "Remove a member or pending invitation from a group without removing them from the workspace.",
      inputSchema: { group_id: z.string(), member_id: z.string() },
      outputSchema: { deleted: z.boolean(), groupId: z.string(), memberId: z.string() },
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    },
    async ({ group_id, member_id }) => {
      const deleted = await removeGroupMember(authorization, group_id, member_id);
      return { structuredContent: deleted, content: [{ type: "text", text: `Removed member ${member_id} from group ${group_id}.` }] };
    },
  );

  return server;
}

async function serializeItemsForMcp(ownerId: string, rows: Parameters<typeof serializeItem>[0][]) {
  const [properties, assignments] = await Promise.all([
    getItemPropertiesByName(ownerId),
    getItemAssignmentMap(ownerId, rows.map((item) => item.id)),
  ]);
  return rows.map((item) => serializeItem(item, item.kind === "project" ? properties[item.id] ?? {} : {}, assignments[item.id] ?? []));
}

async function resolveProperty(ownerId: string, value: string) {
  const definitions = await listProjectPropertyDefinitions(ownerId);
  const normalized = value.trim().toLocaleLowerCase();
  const property = definitions.find(
    (definition) => definition.id === value || definition.name.toLocaleLowerCase() === normalized,
  );
  if (!property) throw new Error(`Property not found: ${value}`);
  return property;
}

async function handleMcp(request: Request) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  const authorization = await authorizeRequest(request);
  if (authorization instanceof Response) return withCors(authorization);

  try {
    await ensureWorkspace(authorization.ownerId);
    const transport = new WebStandardStreamableHTTPServerTransport({ enableJsonResponse: true });
    const server = await createOkrptrServer(authorization);
    await server.connect(transport);
    return withCors(await transport.handleRequest(request));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected MCP error";
    return withCors(Response.json({ error: message }, { status: 500 }));
  }
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, MCP-Protocol-Version, MCP-Session-Id, Last-Event-ID, X-Okrptr-Workspace-Id, X-Okrptr-User-Id, X-Okita-User-Id, X-Pace-User-Id",
    "Access-Control-Expose-Headers": "MCP-Protocol-Version, MCP-Session-Id",
  };
}

function withCors(response: Response) {
  const headers = new Headers(response.headers);
  Object.entries(corsHeaders()).forEach(([key, value]) => headers.set(key, value));
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export const GET = handleMcp;
export const POST = handleMcp;
export const DELETE = handleMcp;
export const OPTIONS = handleMcp;
