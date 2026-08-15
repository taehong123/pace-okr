# OKRPTR

OKRPTR is an MCP-first OKR and execution-management service. It keeps the
management hierarchy explicit while making capture nearly frictionless:

```text
Objective -> Key Result -> Initiative -> Project -> Task
```

Small execution steps live as checklist items inside a Task, not as another
hierarchy level. New work can enter through the web UI, an MCP conversation, or
a bot webhook. Unstructured captures land in the Inbox and can be linked later.

## Product surfaces

- OKR execution tree and Project-linked Task database
- Notion-style inline editing and custom Task properties
- Task-internal checklists with automatic progress calculation
- Separate daily, weekly, and monthly Routines with dated completion history
- Inbox for unstructured conversational captures
- Daily scrum with yesterday, today, and blocker notes
- Data-driven recommendations for blocked, overdue, unlinked, and due-soon work
- Daily, weekly, monthly, and quarterly reviews
- Shared workspaces with Owner, Admin, Member, and Viewer roles
- D1 persistence and a Streamable HTTP MCP endpoint at `/mcp`
- Generic bot capture webhook at `/api/webhooks/capture`

## MCP tools

- `capture_item`, `create_item`, `list_items`, `update_item`, `link_item`
- `review_period`
- `list_properties`, `create_property`, `set_property_value`, `delete_property`
- `list_checklist_items`, `add_checklist_item`, `update_checklist_item`
- `get_daily_scrum`, `save_daily_scrum`
- `get_recommendations`
- `list_routines`, `create_routine`, `update_routine`, `complete_routine`, `delete_routine`
- `list_team_members`, `invite_team_member`, `update_team_member`, `remove_team_member`

The MCP endpoint enforces the hierarchy. Project belongs under Initiative, and
Task belongs under Project. Only Inbox Tasks may temporarily have no parent.
Routines remain outside this hierarchy because they represent recurring work.
Invited members join the shared workspace when they sign in with the invited
email. Viewer access is enforced as read-only by the API.

## Local development

Requires Node.js 22.13 or newer.

```bash
npm install
npm run dev
```

Useful checks:

```bash
npm run test:mcp
npm test
```

Set `OKRPTR_MCP_URL` to run the MCP smoke test against a different endpoint.
Hosted writes use the signed-in Sites user or a bearer token configured as
`OKRPTR_API_TOKEN`. Bot clients can send `X-Okrptr-User-Id` to select a workspace.
The previous `OKITA_API_TOKEN`, `X-Okita-User-Id`, `PACE_API_TOKEN`, and
`X-Pace-User-Id` names remain supported for
existing integrations.

## Data

The D1 schema lives in `db/schema.ts`, and generated migrations live in
`drizzle/`. Core hierarchy rows live in `items`. Task properties, checklist
items, and daily scrum notes use relational tables. The app initializes missing
tables defensively at runtime and seeds representative data only for a new
workspace.
