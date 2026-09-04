# Routine property values

Routine > 루틴 속성 관리 defines an independent workspace catalog. Owners/admins
manage definitions; writable workspace members set values. Viewers and unselected
paid-plan editors retain the existing server-side write restrictions.

Text, number, select, date, checkbox, member and members fields use the same UI
controls as Project fields. New routines get configured defaults. Existing
routines keep their values and are never backfilled when defaults change.
Save submits only changed custom values together with the routine guide. All
values are validated before one routine write. JSON merge preserves unrelated
and removed field values. Failed saves keep the user's draft. General is protected.

Definitions and values persist in D1. Migration 0042 is additive; routine values
use `properties_json`. No runtime DDL is added. Definitions participate in backup
revision guards; backup and restore include definitions and values. Old signed
backups without these fields remain restorable with an empty routine catalog.

Removed Project and Routine fields are absent from the default manager catalog;
the separate removed-items view supports recovery without erasing stored values.

MCP `list_routine_properties` returns the matching IDs; `create_routine` and
`update_routine` accept an optional `properties` object keyed by those IDs. Project
IDs cannot be used for Routine values. Null clears a value; zero and false are
preserved. Integration writes never alter memberships or invite unknown people.
