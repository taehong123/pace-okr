const guide = {
  service: "OKRPTR Codex conversation API",
  version: "1.0",
  authentication: {
    header: "Authorization: Bearer <OKRPTR_ACCESS_TOKEN>",
    note: "The token is scoped to one OKRPTR workspace. Never print or persist it in source files or logs.",
  },
  hierarchy: "Objective > Key Result > Initiative > Project > Task. Routines are separate and may own Tasks.",
  values: {
    kind: ["objective", "key_result", "initiative", "project", "task"],
    status: ["backlog", "todo", "policy_discussion", "in_progress", "developing", "development_done", "done", "blocked", "archived"],
    priority: ["low", "medium", "high", "urgent"],
    cadence: ["daily", "weekly", "monthly", "quarterly"],
  },
  endpoints: [
    { purpose: "Read workspace name and current role", method: "GET", path: "/api/team" },
    { purpose: "Read shared capture and structure rules", method: "GET", path: "/api/workspace-rules" },
    { purpose: "Update shared rules", method: "PUT", path: "/api/workspace-rules", body: "Any of captureInstruction, structureInstruction, routineInstruction, defaultPriority, defaultCadence, reviewBeforeCreate" },
    { purpose: "List or search active items", method: "GET", path: "/api/items?kind=&status=&cadence=&parentId=&q=&includeArchived=false" },
    { purpose: "Create an item", method: "POST", path: "/api/items", body: "title required; optional description, kind, cycleId, parentId, routineId, status, priority, cadence, progress, dueDate, driMemberId, workerMemberIds, assigneeMemberId; use source=codex" },
    { purpose: "Update or link an item", method: "PATCH", path: "/api/items", body: "id required; include only fields to change, including parentId or routineId" },
    { purpose: "List OKR files/cycles", method: "GET", path: "/api/okr-cycles" },
    { purpose: "Create an OKR cycle", method: "POST", path: "/api/okr-cycles", body: "name, department, startDate, endDate, status" },
    { purpose: "Update an OKR cycle", method: "PATCH", path: "/api/okr-cycles", body: "id required plus changed fields" },
    { purpose: "List routines", method: "GET", path: "/api/routines?date=YYYY-MM-DD&includeInactive=true" },
    { purpose: "Create a routine", method: "POST", path: "/api/routines", body: "title required; triggerPoint, actionPlace, actionSteps, cadence, active" },
    { purpose: "Update a routine", method: "PATCH", path: "/api/routines", body: "id required plus changed fields" },
    { purpose: "Delete a routine after explicit confirmation", method: "DELETE", path: "/api/routines?id=<routine-id>", requiresConfirmation: true },
    { purpose: "Read or update today's scrum", method: "GET or PUT", path: "/api/daily-scrum?date=YYYY-MM-DD", body: "For PUT: date, yesterdayNote, todayNote, blockersNote" },
    { purpose: "Complete or reopen a routine for a date", method: "PUT or DELETE", path: "/api/routine-completions", body: "routineId and date required; note optional" },
    { purpose: "Archive a Project and its direct Tasks", method: "POST", path: "/api/project-archives", body: "projectId required" },
    { purpose: "List archived Projects", method: "GET", path: "/api/project-archives" },
    { purpose: "Restore a Project and its direct Tasks", method: "DELETE", path: "/api/project-archives?projectId=<project-id>" },
    { purpose: "Permanently delete an archived Project and all of its archived Tasks after explicit confirmation", method: "DELETE", path: "/api/project-archives/permanent", body: "projectId and exact confirmationTitle required", requiresConfirmation: true },
    { purpose: "Read Project custom properties, values, and per-Project visibility", method: "GET", path: "/api/properties" },
    { purpose: "Set one Project property value", method: "PATCH", path: "/api/property-values", body: "itemId, propertyId, value" },
    { purpose: "Set Project or Task member assignments", method: "PATCH", path: "/api/item-assignments", body: "itemId, role, memberIds; role is project_dri, project_worker, or task_assignee" },
    { purpose: "Hide or show a property on one Project", method: "PATCH", path: "/api/project-property-visibility", body: "projectId, propertyId, hidden" },
    { purpose: "Read or manage a Task checklist", method: "GET, POST, PATCH or DELETE", path: "/api/checklists?taskId=<task-id>", body: "POST requires taskId and title; PATCH requires id; DELETE uses id query", requiresConfirmationForDelete: true },
    { purpose: "Read workspace groups", method: "GET", path: "/api/groups" },
    { purpose: "Create or update a workspace group", method: "POST or PATCH", path: "/api/groups", body: "POST requires name; PATCH requires id; optional handle, description, color, visibility, archived" },
    { purpose: "Read team members", method: "GET", path: "/api/team" },
    { purpose: "Read recommendations", method: "GET", path: "/api/recommendations" },
    { purpose: "Delete an OKR cycle after explicit confirmation", method: "DELETE", path: "/api/okr-cycles?id=<cycle-id>", requiresConfirmation: true },
    { purpose: "Delete a group after explicit confirmation", method: "DELETE", path: "/api/groups?id=<group-id>", requiresConfirmation: true },
  ],
  behavior: [
    "Fetch workspace rules before interpreting unstructured work.",
    "Use General Task capture when no Project or named Routine is known.",
    "For counts, fetch items once and group locally by kind; fetch routines separately.",
    "Do not delete cycles, routines, groups, members, or workspace data without immediate user confirmation.",
    "Return concise summaries instead of raw JSON unless raw data is requested.",
  ],
};

export function GET() {
  return Response.json(guide, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=300",
    },
  });
}
