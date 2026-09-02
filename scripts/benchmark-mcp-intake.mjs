// Read-only comparison of the old multi-read workflow and the new context tool.
// This measures tools/network, NOT ChatGPT reasoning time or user-perceived end-to-end latency.
import assert from "node:assert/strict";

const endpoint = process.env.OKRPTR_MCP_URL || "http://localhost:3002/api/mcp";
const token = process.env.OKRPTR_MCP_TOKEN;
let requestId = 0;
async function call(name, args = {}) {
  const start = performance.now();
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++requestId, method: "tools/call", params: { name, arguments: args } }),
  });
  const body = await response.text();
  assert.equal(response.status, 200, `MCP HTTP ${response.status}`);
  const message = JSON.parse(body);
  assert.ok(message.result && !message.result.isError, `${name} failed`);
  return { elapsedMs: performance.now() - start, bytes: Buffer.byteLength(body), timing: response.headers.get("server-timing") };
}
async function scenario(calls) {
  const results = [];
  for (const [name, args] of calls) results.push(await call(name, args));
  return { calls: calls.length, elapsedMs: Math.round(results.reduce((sum, value) => sum + value.elapsedMs, 0)), bytes: results.reduce((sum, value) => sum + value.bytes, 0) };
}
const workflows = {
  task_old: [["get_workspace_rules", {}], ["list_items", { kind: "project", limit: 6 }], ["list_routines", { include_inactive: false }], ["list_team_members", {}]],
  task_new: [["prepare_work", { kind: "task", limit: 6 }]],
  project_old: [["get_workspace_rules", {}], ["list_items", { kind: "initiative", limit: 6 }], ["list_properties", {}], ["list_team_members", {}]],
  project_new: [["prepare_work", { kind: "project", limit: 6 }]],
};
await call("get_workspace_rules"); // Warm-up only; keep cold-start effects out of this comparison.
const samples = Object.fromEntries(Object.keys(workflows).map((name) => [name, []]));
for (let round = 0; round < 3; round++) {
  for (const [name, calls] of Object.entries(workflows)) samples[name].push(await scenario(calls));
}
const median = (values) => values.toSorted((a, b) => a - b)[Math.floor(values.length / 2)];
console.log(JSON.stringify({
  measuredAt: new Date().toISOString(), scope: "warm read-only tool workflow; excludes ChatGPT generation",
  scenarios: Object.fromEntries(Object.entries(samples).map(([name, runs]) => [name, {
    calls: runs[0].calls, medianMs: median(runs.map((run) => run.elapsedMs)), medianBytes: median(runs.map((run) => run.bytes)), samples: runs,
  }])),
}, null, 2));
