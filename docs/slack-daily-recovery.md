# Daily reservation recovery

The daily bot reserves the next configured delivery with Slack. A saved setup is
not proof of delivery readiness: `delivery` reports ready/paused/failed/pending
from the active recipients and confirmed future reservations.

- The reminder's action block retains its delivery marker. The section has a
  distinct `:body` ID, so both scheduled and immediate messages satisfy Block Kit.
- A compare-and-swap claim in the existing reminder row serializes concurrent
  repairs. No schema or recipient preference changes are required.
- Before creating a reservation, the service checks Slack's pending receipts at
  that channel and time. A lost response can be recovered without sending twice.
- Cancellation failures are not swallowed. The previous receipt remains stored
  until cancellation or replacement is confirmed.
- Slack's final 60-second cancellation lock returns the same error as an absent
  receipt. Re-read pending receipts before treating cancellation as complete. If
  still present, keep the receipt and report a retryable failure; do not replace
  it or pretend a disconnect succeeded. An imminent unchanged reminder is kept.
  Slack may still deliver a reminder that is already inside this lock window.
- Pause and disconnect use the same recipient claim as scheduling. Re-check the
  current installation ID, active member, Slack identity, opt-out and schedule
  before and after reserving externally. Cancel a newly created reservation if
  any of these change. Lost-response, failed and unlinked receipts also take part
  in cleanup. Keep credentials until cleanup is confirmed, and compare the
  connection ID before deleting it. A team switch cleans the old team's receipts
  before replacing its credentials; another workspace's Slack team is rejected
  before changing the current installation.
- Final cleanup and credential deletion refuse concurrent replacement, re-enable
  or new receipt creation. Never bulk-delete unconfirmed reminder rows. OAuth
  exchange and revocation requests each have a 15-second timeout.
- Failures remain on the member's row and in the workspace settings. They are
  shown next to the bot, not only inside advanced settings. Setup responses never
  report all schedules complete when any recipient failed.
- The scheduled Worker maintenance callback and authenticated bootstrap's
  background work repair missing/stale reservations. Automatic attempts have a
  five-minute per-recipient cooldown; a new recipient cannot bypass someone
  else's cooldown. Verify future remote receipts after six hours and on explicit
  repair. Each automatic pass checks at most 20 recipients with a shared
  20-second external-request budget. Global maintenance rotates at most 20
  workspaces per invocation, isolating each workspace's errors. Bootstrap never
  waits for Slack. Actual automatic maintenance timing still depends on the
  hosting scheduler's configuration and must be verified after deployment.
- Slack's signed delivered-message event maintains the next reservation as
  before. Unrelated bot IDs/blocks cannot advance it.
- Owner/Admin `PATCH /api/slack/daily/settings` with `action: "repair"` checks
  reservations without rematching members, changing saved preferences, or sending
  a test/immediate DM. Confirm the returned `delivery.status` and each receipt.

Recovery does not send past-due DMs retrospectively. A same-day manual send is a
separate existing action, to avoid surprising or duplicate messages.

Delivery health counts linked recipients and explicitly selected or previously
scheduled members whose links are missing. An unlinked member with neither a
saved preference nor a reminder is not a failed recipient. This affects only
health reporting; it never changes recipients, preferences or message schedules.

`tests/slack-daily.test.mjs` validates real SQLite claim SQL with two independent
workspace/token/timezone fixtures, recipient cooldowns, opt-outs, removal, account
replacement, cancellation locks, lost responses, external receipt deletion,
bounded maintenance and concurrency. `tests/slack-daily-routes.test.mjs` executes
the real settings/disconnect/callback/event handlers with mocked dependencies to
verify permissions, tenant selection, cleanup order and signed-event dedup.
Production verification reads settings/receipts; it must not create QA messages
or records. Local tests do not prove production cron invocations or real Slack
delivery. Historical receipts whose credentials were already lost cannot be
canceled without restoring a valid installation.

Slack cancellation contract:
https://docs.slack.dev/reference/methods/chat.deleteScheduledMessage/

## Channel publication delivery

Daily channel publication now uses the shared `slack_bot_deliveries` receipt
and atomic claim described in `slack-bot-delivery-audit.md`, not reminder rows.
Concurrent confirmations cannot post the same submission twice. New versions
update a known message receipt; a previous unknown post outcome blocks a new
post. Historical failed sends without receipts are not blindly replayed.
Current submission version, member, workspace, connection and sharing channel
are checked before delivery. Tests use mocked Slack; this is not a claim of
exactly-once delivery across an external API and database.

## Production recovery — 2026-09-03

- The approved bot-only release restored all three existing recipients' Slack
  reservations for 2026-09-04 09:00 Asia/Seoul. Each has a scheduled-message ID;
  workspace and recipient errors are empty. Preferences were not changed and
  no test/immediate messages were sent.
- The Slack app's existing `message.im` subscription was enabled, but its
  `https://okri.ai/api/slack/events` request URL showed a verification failure.
  Re-verification succeeded and the same URL was saved. The signed validation
  POST appears in hosting logs. No scopes or event subscriptions were added.
- The examined hosting logs contained fetch invocations, not scheduled ones.
  Slack's scheduled receipts and delivered-message event are the verified
  configured path; actual next-day delivery/event renewal remains to be observed.
  The separate hosting cron registration cannot be verified or configured with
  the current Sites tools. Do not describe bootstrap fallback as an always-on
  replacement for a scheduler.
