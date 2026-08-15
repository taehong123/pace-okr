import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import {
  ITEM_CADENCES,
  ITEM_KINDS,
  ITEM_PRIORITIES,
  ITEM_STATUSES,
  authorizeRequest,
  createItem,
  ensureWorkspace,
  getPeriodReview,
  listItems,
  serializeItem,
  updateItem,
  type ItemCadence,
  type ItemKind,
  type ItemPriority,
  type ItemStatus,
} from "@/lib/pace-data";

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
});

function createPaceServer(ownerId: string) {
  const server = new McpServer(
    { name: "pace-okr", version: "0.1.0" },
    {
      instructions:
        "Capture first, structure later. Use capture_item for quick natural-language intake. The hierarchy is Objective > Key Result > Initiative > Task > Action. Use link_item only with the required parent kind.",
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
      },
      outputSchema: { item: itemOutput },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async ({ title, description, due_date, priority, source_ref }) => {
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
      const serialized = serializeItem(item);
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
      const serialized = serializeItem(item);
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
      const serialized = rows.map(serializeItem);
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
      const serialized = serializeItem(item);
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
      const serialized = serializeItem(item);
      return {
        structuredContent: { item: serialized },
        content: [{ type: "text", text: `Linked "${item.title}" into the OKR hierarchy.` }],
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
      const serialized = { ...review, items: review.items.map(serializeItem) };
      return {
        structuredContent: serialized,
        content: [{ type: "text", text: `${cadence} review: ${review.completed}/${review.total} completed, ${review.blocked} blocked.` }],
      };
    },
  );

  return server;
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
