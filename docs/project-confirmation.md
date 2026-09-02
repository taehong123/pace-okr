# Project recommendation and final confirmation

## User contract

AI recommendations are not permission to attach a Project. All new Projects
from MCP (including cached legacy `create_item` calls) or integration-token
`POST /api/items` requests first create an unsaved review. A browser session for
the same user and workspace must choose a current Initiative, check the final
summary and click Create. No candidate is preselected, even if only one exists.
Integration-token bulk OKR plans containing a Project are rejected before any
ancestors are created; that endpoint cannot bypass the review flow.

`prepare_work` includes bounded Initiative, KR and Objective descriptions and
searches their titles/descriptions. Candidate order is recency, not relevance.
`propose_project` accepts zero to three recommendations with reasons; the model
must explain contribution, not assert a match from vague keywords. The review
shows hierarchy/evidence, allows another search, and supports defer/cancel.
Semantic recommendation quality still requires evaluation with real prompts;
server validation proves lineage/permissions, not business relevance.

## Safety and storage

- Protected `system:project-review:` keys in `assistant_drafts` are inaccessible
  through generic draft APIs. No new migration or configuration is required.
- Reviews are owner/user scoped, expire after 30 minutes, and freeze the title,
  description, fields, assignments, custom properties and workspace defaults.
- Tokens cannot approve; browser mutations require a same-origin request.
  Existing session membership/editor authorization remains in force.
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
