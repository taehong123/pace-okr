import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import {
  ITEM_CADENCES,
  ITEM_KINDS,
  ITEM_PRIORITIES,
  ITEM_STATUSES,
  PROPERTY_TYPES,
  ROUTINE_CADENCES,
  authorizeRequest,
  canManageTeam,
  createChecklistItem,
  createItem,
  createPropertyDefinition,
  createRoutine,
  deletePropertyDefinition,
  deleteRoutine,
  ensureWorkspace,
  getTeam,
  getDailyScrum,
  getItemPropertiesByName,
  getPeriodReview,
  getRecommendations,
  listChecklistItems,
  listItems,
  listPropertyDefinitions,
  listRoutines,
  inviteTeamMember,
  removeTeamMember,
  saveDailyScrum,
  serializeChecklistItem,
  serializeItem,
  serializePropertyDefinition,
  serializeRoutine,
  setItemPropertiesByName,
  setPropertyValue,
  updateChecklistItem,
  updateItem,
  updateRoutine,
  updateTeamMember,
  setRoutineCompletion,
  type ItemCadence,
  type ItemKind,
  type ItemPriority,
  type ItemStatus,
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
  createdAt: z.string(),
  updatedAt: z.string(),
  properties: z.record(z.string(), propertyValueSchema),
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

const teamMemberOutput = z.object({
  id: z.string(),
  email: z.string(),
  displayName: z.string(),
  role: z.string(),
  status: z.string(),
  isCurrent: z.boolean(),
  createdAt: z.string(),
});

function createOkrptrServer(authorization: RequestAuthorization) {
  const { ownerId } = authorization;
  const server = new McpServer(
    { name: "okrptr", version: "0.5.0" },
    {
      instructions:
        "Capture first, structure later. Use capture_item for quick natural-language intake. The hierarchy is Objective > Key Result > Initiative > Project > Task. Routines are separate recurring work with dated completion records. Tasks are database rows with custom properties and internal checklists. Team access uses Owner, Admin, Member, and read-only Viewer roles. Use list_properties before setting unfamiliar property names.",
    },
  );

  server.registerTool(
    "capture_item",
    {
      title: "Capture work to the OKRPTR inbox",
      description: "Use this first when the user mentions a task, follow-up, idea, or commitment that should be saved quickly without interrupting the conversation.",
      inputSchema: {
        title: z.string().min(1).describe("Short actionable title in the user's language"),
        description: z.string().optional().describe("Useful context from the conversation"),
        due_date: z.string().optional().describe("Due date in YYYY-MM-DD format when stated"),
        priority: z.enum(ITEM_PRIORITIES).optional(),
        source_ref: z.string().optional().describe("Message or conversation identifier for traceability"),
        properties: z.record(z.string(), propertyValueSchema).optional().describe("Custom values keyed by property name"),
      },
      outputSchema: { item: itemOutput },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async ({ title, description, due_date, priority, source_ref, properties }) => {
      const item = await createItem(ownerId, {
        title,
        description,
        dueDate: due_date,
        priority: priority as ItemPriority | undefined,
        kind: "task",
        status: "inbox",
        source: "mcp",
        sourceRef: source_ref,
      });
      if (properties) await setItemPropertiesByName(ownerId, item.id, properties as Record<string, PropertyValue>);
      const serialized = (await serializeItemsForMcp(ownerId, [item]))[0];
      return {
        structuredContent: { item: serialized },
        content: [{ type: "text", text: `Captured "${item.title}" in the OKRPTR inbox.` }],
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
        properties: z.record(z.string(), propertyValueSchema).optional().describe("Custom values keyed by property name"),
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
      if (input.properties) {
        await setItemPropertiesByName(ownerId, item.id, input.properties as Record<string, PropertyValue>);
      }
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
      description: "Find existing OKRs, projects, tasks, or inbox captures before reviewing, updating, or linking them.",
      inputSchema: {
        kind: z.enum(ITEM_KINDS).optional(),
        status: z.enum(ITEM_STATUSES).optional(),
        cadence: z.enum(ITEM_CADENCES).optional(),
        parent_id: z.string().optional(),
        query: z.string().optional(),
        limit: z.number().int().min(1).max(100).optional(),
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
        properties: z.record(z.string(), propertyValueSchema).optional().describe("Custom values keyed by property name"),
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
      if (input.properties) {
        await setItemPropertiesByName(ownerId, item.id, input.properties as Record<string, PropertyValue>);
      }
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
      description: "Move an inbox capture or existing item under its correct parent. Project requires Initiative; Task requires Project.",
      inputSchema: { id: z.string(), parent_id: z.string() },
      outputSchema: { item: itemOutput },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async ({ id, parent_id }) => {
      const item = await updateItem(ownerId, id, {
        parentId: parent_id,
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
    "list_properties",
    {
      title: "List Task database properties",
      description: "List the custom columns available on Task rows, including IDs, types, and select options.",
      inputSchema: {},
      outputSchema: { properties: z.array(propertyDefinitionOutput), count: z.number() },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    async () => {
      const definitions = await listPropertyDefinitions(ownerId);
      const properties = definitions.map(serializePropertyDefinition);
      return {
        structuredContent: { properties, count: properties.length },
        content: [{ type: "text", text: `Found ${properties.length} Task database properties.` }],
      };
    },
  );

  server.registerTool(
    "create_property",
    {
      title: "Create a Task database property",
      description: "Add a custom column to every Task row. Select properties should include their allowed options.",
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
        content: [{ type: "text", text: `Created Task property "${property.name}".` }],
      };
    },
  );

  server.registerTool(
    "set_property_value",
    {
      title: "Set a Task property value",
      description: "Set or clear a custom property on an item. The property can be provided by ID or exact name.",
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
      title: "Delete a Task database property",
      description: "Delete a custom Task column and all values stored under it. The property can be provided by ID or exact name.",
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
        content: [{ type: "text", text: `Deleted Task property "${definition.name}".` }],
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
      description: "Prioritize blocked, overdue, unlinked, due-soon, and empty Project work from current OKRPTR data.",
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
      description: "Create recurring work that stays separate from the OKR hierarchy.",
      inputSchema: {
        title: z.string().min(1),
        description: z.string().optional(),
        cadence: z.enum(ROUTINE_CADENCES).optional(),
        active: z.boolean().optional(),
        date: z.string().optional().describe("Date used for the returned completion state"),
      },
      outputSchema: { routine: routineOutput },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async ({ title, description, cadence, active, date }) => {
      const selectedDate = date ?? new Date().toISOString().slice(0, 10);
      const created = await createRoutine(ownerId, {
        title,
        description,
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
        cadence: z.enum(ROUTINE_CADENCES).optional(),
        active: z.boolean().optional(),
        date: z.string().optional(),
      },
      outputSchema: { routine: routineOutput },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async ({ id, title, description, cadence, active, date }) => {
      const selectedDate = date ?? new Date().toISOString().slice(0, 10);
      const updated = await updateRoutine(ownerId, id, {
        title,
        description,
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
      inputSchema: { email: z.string().email(), role: z.enum(["admin", "member", "viewer"]).default("member") },
      outputSchema: { member: teamMemberOutput },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async ({ email, role }) => {
      if (!canManageTeam(authorization)) throw new Error("Owner or Admin access is required.");
      const member = await inviteTeamMember(ownerId, authorization.userId, email, role as Exclude<TeamRole, "owner">);
      return { structuredContent: { member }, content: [{ type: "text", text: `Invited ${email} as ${role}.` }] };
    },
  );

  server.registerTool(
    "update_team_member",
    {
      title: "Update a team member role",
      description: "Change a non-owner team member or invitation to Admin, Member, or Viewer.",
      inputSchema: { id: z.string(), role: z.enum(["admin", "member", "viewer"]) },
      outputSchema: { member: teamMemberOutput },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async ({ id, role }) => {
      if (!canManageTeam(authorization)) throw new Error("Owner or Admin access is required.");
      const member = await updateTeamMember(ownerId, id, role as Exclude<TeamRole, "owner">, authorization.userId);
      return { structuredContent: { member }, content: [{ type: "text", text: `Updated ${member.email || member.displayName} to ${role}.` }] };
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

  return server;
}

async function serializeItemsForMcp(ownerId: string, rows: Parameters<typeof serializeItem>[0][]) {
  const properties = await getItemPropertiesByName(ownerId);
  return rows.map((item) => serializeItem(item, properties[item.id] ?? {}));
}

async function resolveProperty(ownerId: string, value: string) {
  const definitions = await listPropertyDefinitions(ownerId);
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
    const server = createOkrptrServer(authorization);
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
    "Access-Control-Allow-Headers": "Content-Type, Authorization, MCP-Protocol-Version, MCP-Session-Id, Last-Event-ID, X-Okrptr-User-Id, X-Okita-User-Id, X-Pace-User-Id",
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
