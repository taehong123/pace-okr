import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const endpoint = process.env.OKRPTR_MCP_URL || process.env.OKITA_MCP_URL || process.env.PACE_MCP_URL || "http://localhost:3002/api/mcp";
const client = new Client({ name: "okrptr-smoke", version: "0.6.0" });
const transport = new StreamableHTTPClientTransport(new URL(endpoint));

await client.connect(transport);
const tools = await client.listTools();
const names = tools.tools.map((tool) => tool.name).sort();
assert.deepEqual(names, [
  "add_checklist_item",
  "add_group_member",
  "archive_group",
  "capture_item",
  "complete_routine",
  "create_group",
  "create_item",
  "create_property",
  "create_routine",
  "delete_group",
  "delete_property",
  "delete_routine",
  "get_daily_scrum",
  "get_recommendations",
  "invite_team_member",
  "link_item",
  "list_checklist_items",
  "list_group_members",
  "list_groups",
  "list_items",
  "list_properties",
  "list_routines",
  "list_team_members",
  "remove_group_member",
  "remove_team_member",
  "review_period",
  "save_daily_scrum",
  "set_property_value",
  "update_checklist_item",
  "update_group",
  "update_group_member",
  "update_item",
  "update_routine",
  "update_team_member",
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

const listedRoutines = await client.callTool({ name: "list_routines", arguments: { date: "2026-08-15" } });
assert.equal(listedRoutines.isError, undefined);
assert.ok(listedRoutines.structuredContent);

const createdRoutine = await client.callTool({
  name: "create_routine",
  arguments: { title: `MCP routine ${Date.now()}`, cadence: "daily", date: "2026-08-15" },
});
assert.equal(createdRoutine.isError, undefined);
const routineId = createdRoutine.structuredContent.routine.id;
try {
  const completedRoutine = await client.callTool({
    name: "complete_routine",
    arguments: { id: routineId, date: "2026-08-15", completed: true },
  });
  assert.equal(completedRoutine.isError, undefined);
  assert.equal(completedRoutine.structuredContent.routine.completed, true);
} finally {
  const deletedRoutine = await client.callTool({ name: "delete_routine", arguments: { id: routineId } });
  assert.equal(deletedRoutine.isError, undefined);
  assert.equal(deletedRoutine.structuredContent.deleted, true);
}

const team = await client.callTool({ name: "list_team_members", arguments: {} });
assert.equal(team.isError, undefined);
assert.ok(team.structuredContent.members.length >= 1);
const invitedMember = await client.callTool({
  name: "invite_team_member",
  arguments: { email: `mcp-${Date.now()}@example.com`, role: "member" },
});
assert.equal(invitedMember.isError, undefined);
const invitedMemberId = invitedMember.structuredContent.member.id;
let groupId;
try {
  const updatedMember = await client.callTool({
    name: "update_team_member",
    arguments: { id: invitedMemberId, role: "viewer" },
  });
  assert.equal(updatedMember.isError, undefined);
  assert.equal(updatedMember.structuredContent.member.role, "viewer");

  const createdGroup = await client.callTool({
    name: "create_group",
    arguments: { name: `MCP 그룹 ${Date.now()}`, color: "blue", visibility: "private" },
  });
  assert.equal(createdGroup.isError, undefined);
  groupId = createdGroup.structuredContent.group.id;
  assert.equal(createdGroup.structuredContent.group.isLead, true);

  const listedGroups = await client.callTool({ name: "list_groups", arguments: { include_archived: true } });
  assert.equal(listedGroups.isError, undefined);
  assert.ok(listedGroups.structuredContent.groups.some((group) => group.id === groupId));

  const addedGroupMember = await client.callTool({
    name: "add_group_member",
    arguments: { group_id: groupId, member_id: invitedMemberId, role: "member" },
  });
  assert.equal(addedGroupMember.isError, undefined);
  assert.equal(addedGroupMember.structuredContent.member.status, "invited");

  const blockedViewerLead = await client.callTool({
    name: "update_group_member",
    arguments: { group_id: groupId, member_id: invitedMemberId, role: "lead" },
  });
  assert.equal(blockedViewerLead.isError, true);
  const restoredWorkspaceMember = await client.callTool({
    name: "update_team_member",
    arguments: { id: invitedMemberId, role: "member" },
  });
  assert.equal(restoredWorkspaceMember.isError, undefined);

  const updatedGroupMember = await client.callTool({
    name: "update_group_member",
    arguments: { group_id: groupId, member_id: invitedMemberId, role: "lead" },
  });
  assert.equal(updatedGroupMember.isError, undefined);
  assert.equal(updatedGroupMember.structuredContent.member.groupRole, "lead");

  const groupMembers = await client.callTool({ name: "list_group_members", arguments: { group_id: groupId } });
  assert.equal(groupMembers.isError, undefined);
  assert.ok(groupMembers.structuredContent.members.some((member) => member.memberId === invitedMemberId));

  const archivedGroup = await client.callTool({ name: "archive_group", arguments: { id: groupId, archived: true } });
  assert.equal(archivedGroup.isError, undefined);
  assert.equal(archivedGroup.structuredContent.group.archived, true);
  const blockedMembershipChange = await client.callTool({
    name: "remove_group_member",
    arguments: { group_id: groupId, member_id: invitedMemberId },
  });
  assert.equal(blockedMembershipChange.isError, true);

  const restoredGroup = await client.callTool({ name: "archive_group", arguments: { id: groupId, archived: false } });
  assert.equal(restoredGroup.isError, undefined);
  const removedGroupMember = await client.callTool({
    name: "remove_group_member",
    arguments: { group_id: groupId, member_id: invitedMemberId },
  });
  assert.equal(removedGroupMember.isError, undefined);
  await client.callTool({ name: "archive_group", arguments: { id: groupId, archived: true } });
  const deletedGroup = await client.callTool({ name: "delete_group", arguments: { id: groupId } });
  assert.equal(deletedGroup.isError, undefined);
  assert.equal(deletedGroup.structuredContent.deleted, true);
  groupId = undefined;
} finally {
  if (groupId) {
    await client.callTool({ name: "archive_group", arguments: { id: groupId, archived: true } });
    await client.callTool({ name: "delete_group", arguments: { id: groupId } });
  }
  const removedMember = await client.callTool({ name: "remove_team_member", arguments: { id: invitedMemberId } });
  assert.equal(removedMember.isError, undefined);
  assert.equal(removedMember.structuredContent.deleted, true);
}

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
