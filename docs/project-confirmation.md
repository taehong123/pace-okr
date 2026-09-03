# Project recommendation and final confirmation

## User contract

AI recommendations are not permission to attach a Project. All new Projects
from MCP (including cached legacy `create_item` calls) or integration-token
`POST /api/items` requests first create an unsaved review. The same user and
workspace must choose a current Initiative and approve the final summary.
MCP completes this in the conversation with `confirm_project`; a web visit is
not required. The existing browser confirmation page remains an optional path.
No candidate is preselected, even if only one exists.
Integration-token bulk OKR plans containing a Project are rejected before any
ancestors are created; that endpoint cannot bypass the review flow.

`prepare_work` includes bounded Initiative, KR and Objective descriptions and
searches their titles/descriptions. Candidate order is recency, not relevance.
`propose_project` accepts zero to three recommendations with reasons; the model
must explain contribution, not assert a match from vague keywords. The review
shows hierarchy/evidence, allows another search, and supports defer/cancel.
Semantic recommendation quality still requires evaluation with real prompts;
server validation proves lineage/permissions, not business relevance.

## MCP conversation completion

`propose_project` returns the frozen proposal, review version, editor catalog and
revision, and candidate/recommendation fingerprints without a mandatory web URL.
The assistant presents human-readable fields and lineage, accepts changes and
waits for explicit approval. `get_project_review(include_context=true, query,
cycle_id)` refreshes choices; null cycle searches all files. It does not reset
edits held in the conversation. `confirm_project` takes the complete final
proposal, version, chosen Initiative/fingerprint, editor revision and
`confirmed: true`, then uses the same validated atomic writer as the web page.
It returns the saved receipt, not another approval link. A lost response can be
resolved by reading the receipt or repeating the identical confirmation.
`cancel_project_review` cancels a pending proposal in MCP.

Explicit confirmation is a client assertion made only after the user's actual
approval; the server cannot independently prove what a third-party chat displayed.
The server still checks the authenticated identity, scopes, current membership,
complete typed proposal, catalog/lineage versions, quotas and atomic claim.

## Editable review (September 2026)

The same confirmation page now edits title, scope, DRI, workers, deadline, status,
priority, progress, cadence, template and every active custom property. Unset,
zero and false values remain distinct. Member values are displayed as names.
Draft/default/edited labels identify where a value came from. No candidate is
automatically selected. A file filter searches other active files; the explicitly
chosen Initiative determines the actual saved cycle.

`GET /api/project-reviews` includes the property/member/template catalog and its
`editor.revision`. `mode=candidates&q=...&cycleId=...` only returns candidates,
without resetting the form or reloading the editor catalog. The new approval
body includes the complete `proposal` and `editorRevision`. Missing new fields
retain the legacy frozen-review behavior. New requests must include all fields,
even nulls: no workspace defaults are applied during approval.

Catalog conflicts return the current editor catalog and field-specific errors.
The client keeps the edited proposal, clears consent and requires a fresh check.
Before the atomic claim, the server validates all types, options, active members,
templates and the selected file/Initiative. The claimed review contains the final
proposal, display names and fingerprints, so the existing atomic writer persists
exactly that snapshot and the same created receipt. Repeated or uncertain requests
read the existing receipt, not a new creation. MCP summaries include every unset
property and `get_project_review` returns the final approved summary.

The page uses the existing native property input shared with manual Project
creation, and the typography/palette contract in `docs/THEMES.md`. It does not
change the layout or navigation of other work screens. Native document navigation
is intentional on this standalone review page to preserve before-unload warnings.

## Safety and storage

- Protected `system:project-review:` keys in `assistant_drafts` are inaccessible
  through generic draft APIs. No new migration or configuration is required.
- Reviews are owner/user scoped, expire after 30 minutes, and freeze the title,
  description, fields, assignments, custom properties and workspace defaults.
- Personal MCP connections with write scope can approve through `confirm_project`.
  Read-only, viewer and legacy shared server keys cannot. Browser mutations still
  require a same-origin non-token session. Existing membership/editor checks remain.
- Approval compares version and the selected Initiative/ancestor fingerprint,
  revalidates active members, property definitions and the template, and claims
  the review with an atomic compare-and-swap.
- One D1 batch writes a fixed Project ID, assignments, custom properties,
  template document, activity log, monthly quota and created-review receipt.
  Any statement failure rolls back all of them. SQL guards catch stale parent,
  member, template and property changes between preflight and commit. Approver
  membership/role, editor selections and the plan are checked inside that batch.
- Template blocks precede the approved description, with fresh block IDs and
  identical combined plain text in the document and legacy description field.
- Repeated approval returns the existing created receipt. A lost response after
  commit is recovered by reading that receipt. Failed/processing requests are
  never automatically retried as new Projects.
- Project creation has no Slack task notification: the existing dispatcher
  already excludes non-Task records. Task/Routine save behavior is unchanged.

This is not a retroactive cleanup or a redesign of manual web creation, imports,
or existing-item moves. Existing wrongly linked Projects are left unchanged
until the user identifies what to repair. An integration with a legacy shared
API token not tied to a person needs a personal AI connection to approve.

## Validation

`tests/project-review.test.mjs` runs the actual SQL writer against all repository
migrations in SQLite: alternate choice, explicit approval, tenant/user isolation,
token/origin rejection, concurrent approval, cancel/expiry, changed dependencies,
each write-stage rollback, quota rollback and response-loss recovery.
`tests/work-intake.test.mjs` covers recommendation evidence/search and legacy MCP
creation blocking alongside existing Task behavior. These are deterministic
server/API tests, not a claim that every GPT model or browser has been tested.

No extra model call is introduced. The user confirmation step is intentional;
the earlier read-context latency measurements do not include this new flow.

The permission boundary follows [OpenAI tool design guidance](https://developers.openai.com/plugins/plan/tools):
keep coherent actions together while separating different confirmation needs.
