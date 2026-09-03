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
- Failures remain on the member's row and in the workspace settings. They are
  shown next to the bot, not only inside advanced settings. Setup responses never
  report all schedules complete when any recipient failed.
- The scheduled Worker maintenance callback and authenticated bootstrap's
  background work repair missing/stale reservations. Automatic attempts have a
  five-minute failure cooldown; bootstrap never waits for Slack. Actual automatic
  maintenance timing still depends on the hosting scheduler's configuration.
- Slack's signed delivered-message event maintains the next reservation as
  before. Unrelated bot IDs/blocks cannot advance it.
- Owner/Admin `PATCH /api/slack/daily/settings` with `action: "repair"` checks
  reservations without rematching members, changing saved preferences, or sending
  a test/immediate DM. Confirm the returned `delivery.status` and each receipt.

Recovery does not send past-due DMs retrospectively. A same-day manual send is a
separate existing action, to avoid surprising or duplicate messages.

`tests/slack-daily.test.mjs` validates real SQLite claim SQL and mocked Slack
success, rejection, cancellation, lost-response and concurrency paths. Production
verification reads settings/receipts; it must not create QA messages or records.
