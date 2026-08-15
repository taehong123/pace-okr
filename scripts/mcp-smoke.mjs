import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const endpoint = process.env.PACE_MCP_URL || "http://localhost:3002/mcp";
const client = new Client({ name: "pace-smoke", version: "0.1.0" });
const transport = new StreamableHTTPClientTransport(new URL(endpoint));

await client.connect(transport);
const tools = await client.listTools();
const names = tools.tools.map((tool) => tool.name).sort();
assert.deepEqual(names, [
  "capture_item",
  "create_item",
  "link_item",
  "list_items",
  "review_period",
  "update_item",
]);

const result = await client.callTool({ name: "list_items", arguments: { limit: 5 } });
assert.equal(result.isError, undefined);
assert.ok(result.structuredContent);
console.log(`MCP ready: ${names.join(", ")}`);
await client.close();
