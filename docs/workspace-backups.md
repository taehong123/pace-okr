# Workspace Backups

Workspace settings > Backup and restore (Owner/Admin only).

## Policy

- A daily snapshot per active workspace, using the Asia/Seoul calendar date.
- The existing 15-minute Worker scheduled handler processes up to 10 due workspaces per run. It does not invent snapshots for missed dates. Monitor `last_daily_date` for scheduling lag as the number of workspaces grows.
- Snapshots expire after 30 days. Expired, abandoned pending, and permanently deleted workspace objects are removed in bounded scheduled batches.
- Manual snapshots are limited to one per minute per workspace.
- A verified snapshot is mandatory before cleanup, OKR-file deletion, and restoration. If object storage is unavailable, those destructive operations stop.
- Historical data before this feature was enabled cannot be recovered by these snapshots.

## Scope

The explicit allowlist in `lib/workspace-backups.ts` includes OKR files/periods/versions, the complete Objective > KR > Initiative > Project > Task hierarchy, routines/completions, project block documents/templates, custom property definitions/values/visibility, assignments, checklists, and daily drafts/submissions/task snapshots. Archived items remain included.

It excludes workspace identity, members, groups and ACLs, auth sessions/tokens, API keys, billing/usage, external integration credentials/configuration, activity history, trash containers, assistant drafts, and attachment bytes. Backup restoration is a **business-data restore**, not a complete database disaster-recovery system. Keep infrastructure-level disaster recovery independently: both metadata and objects are required by the normal restore UI.

Removed members are not recreated. Their assignments and personal daily drafts are skipped; historical submission author names remain, with invalid member references cleared. Restoring a project document increases its revision beyond the current revision to reject stale editor saves.

## Storage and Atomicity

- D1: `workspace_backups` metadata, `workspace_backup_state` revision/lease/scheduler health, and `workspace_backup_guards` transaction assertion.
- R2: the existing `WORKSPACE_AVATARS` binding with a private `workspace-backups/v1/` namespace, separate from the primary database and avatar objects. No public download route or backup credentials.
- New schema is owned by migrations `0036_workspace_backups.sql` and `0037_restore_links.sql`, not runtime DDL.
- A transactional D1 batch reads all business tables and the revision. Objects are SHA-256 verified by read-back before marking them ready.
- Restore first persists a verified `before_restore` snapshot. The single replacement batch starts with a CHECK assertion for an unchanged workspace revision, a valid operation lease, and current active administrator membership. Any write/constraint error rolls the entire replacement back. Audit history is appended, not rewound.
- Revisions are maintained by database triggers, so writes through web, MCP and scheduled jobs all invalidate an in-flight stale restore.
- No Google/Slack network call is made during restore. Existing remote object mappings are reattached to surviving local objects without rewinding their external state.
- `workspace_restore_links` temporarily retains mappings detached by a restore, for up to 30 days. Undoing that restore can reattach newly-created items and their mappings. Attached copies are removed, so an explicit later disconnect is not undone. A detached Calendar mapping is only reused with the same Google connection id. Workspace deletion cascades this temporary metadata.

The initial safety limits are 8 MiB serialized business data, 50,000 rows per table, and 800 statements in a restoration batch. Exceeding a limit fails closed without changing live data. Load testing is needed before increasing these limits. Stored object bytes are not compressed in this version.

## Verification

`node --test tests/workspace-backups.test.mjs` exercises the real backup implementation against SQLite with the generated schema, actual foreign keys/indexes/revision triggers, a transactional D1 adapter, and a fault-injectable in-memory object store. Tests cover isolation, credential exclusion, complete restore/undo, detached external mapping recovery, revoked access, concurrent edits, storage failure, corrupt objects, SQL rollback, leases, daily idempotency, and retention. These are not substitutes for a production scheduled-job check after deployment; do not test restore against customer data.
