# Workspace Names and Addresses

Workspace Settings > General contains separate name and address forms. Owners
and admins can edit; active members can read. Personal workspaces use the same
name editor. Names do not determine addresses, and signed-in profile refreshes
must not overwrite a name ending in " Workspace".

Addresses are lowercase DNS labels (3-48 characters). A global, case-insensitive
registry prevents duplicate claims. Old labels remain linked to the original
workspace, including after renames; deletion leaves a reservation tombstone so
someone else cannot capture an old shared link. Deleted/scheduled workspaces
cannot be opened. A workspace may retain at most 20 labels.

Name, label claim and revision commit in one guarded D1 batch. The batch rechecks
active owner/admin permission, deletion state, current name and revision. Failed
or concurrent writes cannot partially rename a workspace or steal an address.
Migration 0041 is additive and LF. It does not alter business data or permissions.

## Routing and Login

The subdomain is an entry address, not a separate app/auth origin. Once configured,
`https://team-name.okri.ai/` redirects to the canonical `okri.ai` entry route,
which verifies membership for that exact label and then opens the existing app.
Google login, API/MCP endpoints, cookies, PWA scope and billing stay on the main
origin. No parent-domain session cookie or new cross-origin credential bridge is
introduced. The browser address changes to `okri.ai` after entry.

The entry route preserves selected app navigation, carries the requested address
through Google login, and clears the previous workspace's bootstrap snapshot before
the app reloads. Missing membership/address returns an error, never a fallback
workspace. Subdomain POST/API/OAuth traffic is not forwarded.

## Activation

`WORKSPACE_SUBDOMAINS_ENABLED` defaults to false. Address reservation and canonical
workspace links work while DNS is pending; the UI must not advertise a live
subdomain or copy a broken subdomain URL in this state.

Before enabling the flag in the existing hosted runtime:

1. Obtain approval for the public wildcard domain association and DNS changes.
2. Confirm Sites supports the wildcard custom hostname, and add the provider's
   exact DNS/validation records without replacing the existing root/MX records.
3. Verify wildcard routing and TLS are active, not merely a successful root URL.
4. Deploy the validated app, then enable the flag and verify an existing authorized
   workspace address. Do not create production QA workspaces or records.

If wildcard registration is unavailable, leave the flag off and report the hosting
limitation. A working canonical link is not evidence that the subdomain is active.

On 2026-09-03, the approved production registration was attempted. Sites rejected
`*.okri.ai` with `invalid_custom_domain`: "custom domain must be a valid
non-wildcard hostname". This is not an outstanding user approval or propagation
wait. No domain or environment changes were applied. Keep the flag off until
wildcard-capable routing and TLS are provisioned, or implement a verified
per-host provisioning path with DNS administration. Canonical entry links remain
available meanwhile.

## Tests

`tests/workspace-identity.test.mjs` executes actual batch SQL against isolated
SQLite, including races, permission changes, rollback, alias retention, routing
and route authorization. Browser tests use one worker and mocked writes.
