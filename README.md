# Pace

Pace is an MCP-first OKR and work-management service. It keeps the management
hierarchy explicit while making capture nearly frictionless:

```text
Objective -> Key Result -> Initiative -> Task -> Action
```

New work can enter through the web UI, an MCP conversation, or a bot webhook.
Unstructured captures land in the Inbox first and can be linked later.

## Product surfaces

- OKR tree and task board
- Inbox for unstructured captures
- Daily, weekly, monthly, and quarterly work rhythms
- D1 persistence with an activity log
- Streamable HTTP MCP endpoint at `/mcp`
- Generic Slack, Discord, and Telegram-compatible capture webhook at
  `/api/webhooks/capture`

## MCP tools

- `capture_item`: save a conversational follow-up to the Inbox
- `create_item`: create an item when its type and parent are known
- `list_items`: find work before updating or linking it
- `update_item`: update status, progress, dates, or content
- `link_item`: connect an Inbox item to the required parent type
- `review_period`: summarize a daily, weekly, monthly, or quarterly period

The MCP endpoint enforces the hierarchy. In particular, Task belongs under
Initiative and Action belongs under Task.

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

Set `PACE_MCP_URL` to run the MCP smoke test against a different endpoint.
Hosted writes use the signed-in Sites user or a bearer token configured as
`PACE_API_TOKEN`. Bot clients can optionally send `X-Pace-User-Id` to select
their workspace when using the bearer token.

## Data

The D1 schema lives in `db/schema.ts`, and generated migrations live in
`drizzle/`. The app initializes missing tables defensively at runtime and
seeds representative data only for a new workspace.
