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
- A personal workspace for every account, plus additional team workspaces with switching
- Open and private workspace groups with `@handles`, Leads, invited members, and archive/restore lifecycle
- D1 persistence and a Streamable HTTP MCP endpoint at `/api/mcp`
- Generic bot capture webhook at `/api/webhooks/capture`
- Google Calendar connection for sending due-dated Tasks to a user's primary calendar
- Slack bot installation with a `/okrptr` slash command for capturing work into Inbox Tasks

## MCP tools

- `capture_item`, `create_item`, `list_items`, `update_item`, `link_item`
- `review_period`
- `list_properties`, `create_property`, `set_property_value`, `delete_property`
- `list_checklist_items`, `add_checklist_item`, `update_checklist_item`
- `get_daily_scrum`, `save_daily_scrum`
- `get_recommendations`
- `list_routines`, `create_routine`, `update_routine`, `complete_routine`, `delete_routine`
- `list_team_members`, `invite_team_member`, `update_team_member`, `remove_team_member`
- `list_groups`, `create_group`, `update_group`, `archive_group`, `delete_group`
- `list_group_members`, `add_group_member`, `update_group_member`, `remove_group_member`

The MCP endpoint enforces the hierarchy. Project belongs under Initiative, and
Task belongs under Project. Only Inbox Tasks may temporarily have no parent.
Routines remain outside this hierarchy because they represent recurring work.
Invited members join the shared workspace when they sign in with the invited
email. Viewer access is enforced as read-only by the API.
Private groups are only listed for their members and workspace administrators.
Group Leads can edit their group and manage its membership; only workspace
Owners and Admins can create, archive, restore, or permanently delete groups.

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
`OKRPTR_API_TOKEN`. Clients can send `X-Okrptr-Workspace-Id` to target a
workspace; the previous `X-Okrptr-User-Id` selection header remains supported
for token integrations. Signed-in users otherwise use their most recently
selected workspace, and the web app also stores that selection in an HTTP-only
cookie.
The previous `OKITA_API_TOKEN`, `X-Okita-User-Id`, `PACE_API_TOKEN`, and
`X-Pace-User-Id` names remain supported for
existing integrations.

## Google Calendar

Google Calendar integration uses Google's OAuth 2.0 web server flow. Configure
these hosted runtime values before enabling it in production:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_TOKEN_ENCRYPTION_KEY`
- `GOOGLE_OAUTH_REDIRECT_URI`, usually `https://okrptr.com/api/google/callback`

The OAuth client must allow that redirect URI and the Calendar API must be
enabled in the Google Cloud project. OKRPTR requests Google profile identity
and `https://www.googleapis.com/auth/calendar.events`, then stores the refresh
token encrypted with `GOOGLE_TOKEN_ENCRYPTION_KEY`.

## Slack bot

Slack integration uses Slack OAuth v2 and a slash command endpoint. Configure
these hosted runtime values before enabling it in production:

- `SLACK_CLIENT_ID`
- `SLACK_CLIENT_SECRET`
- `SLACK_SIGNING_SECRET`
- `SLACK_TOKEN_ENCRYPTION_KEY`
- `SLACK_OAUTH_REDIRECT_URI`, usually `https://okrptr.com/api/slack/callback`

In the Slack app settings, add the redirect URL above and create a slash command
that points to `https://okrptr.com/api/slack/commands`. OKRPTR requests the
`commands` and `chat:write` bot scopes, verifies Slack request signatures, and
stores the bot token encrypted with `SLACK_TOKEN_ENCRYPTION_KEY`.

## Data

The D1 schema lives in `db/schema.ts`, and generated migrations live in
`drizzle/`. Core hierarchy rows live in `items`. Task properties, checklist
items, and daily scrum notes use relational tables. The app initializes missing
tables defensively at runtime and seeds representative data only for a new
workspace.
