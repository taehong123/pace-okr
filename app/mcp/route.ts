import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import {
  ITEM_CADENCES,
  ITEM_KINDS,
  ITEM_PRIORITIES,
  ITEM_STATUSES,
  PROPERTY_TYPES,
  authorizeRequest,
  createItem,
  createPropertyDefinition,
  deletePropertyDefinition,
  ensureWorkspace,
  getItemPropertiesByName,
  getPeriodReview,
  listItems,
  listPropertyDefinitions,
  serializeItem,
  serializePropertyDefinition,
  setItemPropertiesByName,
  setPropertyValue,
  updateItem,
  type ItemCadence,
  type ItemKind,
  type ItemPriority,
  type ItemStatus,
  type PropertyType,
  type PropertyValue,
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

function createPaceServer(ownerId: string) {
  const server = new McpServer(
    { name: "pace-okr", version: "0.1.0" },
    {
      instructions:
        "Capture first, structure later. Use capture_item for quick natural-language intake. The hierarchy is Objective > Key Result > Initiative > Task > Action. Tasks are database rows with custom properties. Use list_properties before setting unfamiliar property names.",
    },
  );

  server.registerTool(
    "capture_item",
    {
      title: "Capture work to the Pace inbox",
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
        content: [{ type: "text", text: `Captured "${item.title}" in the Pace inbox.` }],
      };
    },
  );

  server.registerTool(
    "create_item",
    {
      title: "Create a structured OKR item",
      description: "Create a known Objective, Key Result, Initiative, Task, or Action when its hierarchy and parent are already clear.",
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
      title: "List and search Pace items",
      description: "Find existing OKRs, tasks, actions, or inbox captures before reviewing, updating, or linking them.",
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
        content: [{ type: "text", text: `Found ${serialized.length} Pace items.` }],
      };
    },
  );

  server.registerTool(
    "update_item",
    {
      title: "Update a Pace item",
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
      description: "Move an inbox capture or existing item under its correct parent. Task requires Initiative; Action requires Task.",
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

  const authorization = authorizeRequest(request);
  if (authorization instanceof Response) return withCors(authorization);

  try {
    await ensureWorkspace(authorization.ownerId);
    const transport = new WebStandardStreamableHTTPServerTransport({ enableJsonResponse: true });
    const server = createPaceServer(authorization.ownerId);
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
    "Access-Control-Allow-Headers": "Content-Type, Authorization, MCP-Protocol-Version, MCP-Session-Id, Last-Event-ID, X-Pace-User-Id",
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
