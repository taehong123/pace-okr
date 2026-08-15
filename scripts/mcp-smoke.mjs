import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const endpoint = process.env.OKITA_MCP_URL || process.env.PACE_MCP_URL || "http://localhost:3002/mcp";
const client = new Client({ name: "okita-smoke", version: "0.2.0" });
const transport = new StreamableHTTPClientTransport(new URL(endpoint));

await client.connect(transport);
const tools = await client.listTools();
const names = tools.tools.map((tool) => tool.name).sort();
assert.deepEqual(names, [
  "add_checklist_item",
  "capture_item",
  "create_item",
  "create_property",
  "delete_property",
  "get_daily_scrum",
  "get_recommendations",
  "link_item",
  "list_checklist_items",
  "list_items",
  "list_properties",
  "review_period",
  "save_daily_scrum",
  "set_property_value",
  "update_checklist_item",
  "update_item",
]);

const result = await client.callTool({ name: "list_items", arguments: { limit: 5 } });
assert.equal(result.isError, undefined);
assert.ok(result.structuredContent);

const properties = await client.callTool({ name: "list_properties", arguments: {} });
assert.equal(properties.isError, undefined);
assert.ok(properties.structuredContent);

const daily = await client.callTool({ name: "get_daily_scrum", arguments: {} });
assert.equal(daily.isError, undefined);
assert.ok(daily.structuredContent);

const recommendations = await client.callTool({ name: "get_recommendations", arguments: {} });
assert.equal(recommendations.isError, undefined);
assert.ok(recommendations.structuredContent);

const tasks = await client.callTool({ name: "list_items", arguments: { kind: "task", limit: 1 } });
const taskId = tasks.structuredContent.items[0]?.id;
assert.ok(taskId);
const checklist = await client.callTool({ name: "list_checklist_items", arguments: { task_id: taskId } });
assert.equal(checklist.isError, undefined);
assert.ok(checklist.structuredContent);

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
