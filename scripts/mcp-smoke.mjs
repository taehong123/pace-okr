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
  "create_property",
  "delete_property",
  "link_item",
  "list_items",
  "list_properties",
  "review_period",
  "set_property_value",
  "update_item",
]);

const result = await client.callTool({ name: "list_items", arguments: { limit: 5 } });
assert.equal(result.isError, undefined);
assert.ok(result.structuredContent);

const properties = await client.callTool({ name: "list_properties", arguments: {} });
assert.equal(properties.isError, undefined);
assert.ok(properties.structuredContent);

const itemId = result.structuredContent.items[0]?.id;
assert.ok(itemId);
const propertyName = `MCP smoke ${Date.now()}`;
const created = await client.callTool({
  name: "create_property",
  arguments: { name: propertyName, type: "text" },
});
assert.equal(created.isError, undefined);
const propertyId = created.structuredContent.property.id;
try {
  const setValue = await client.callTool({
    name: "set_property_value",
    arguments: { item_id: itemId, property: propertyId, value: "ok" },
  });
  assert.equal(setValue.isError, undefined);
  assert.equal(setValue.structuredContent.value, "ok");
} finally {
  const deleted = await client.callTool({
    name: "delete_property",
    arguments: { property: propertyId },
  });
  assert.equal(deleted.isError, undefined);
  assert.equal(deleted.structuredContent.deleted, true);
}
console.log(`MCP ready: ${names.join(", ")}`);
await client.close();
