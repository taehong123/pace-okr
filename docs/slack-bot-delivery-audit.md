# Shared Slack bot delivery safeguards

Daily DMs use Slack's scheduled-message receipts; management, automation and
daily-publication channel messages use `slack_bot_deliveries`. No existing recipients, rules or
message history are migrated or replayed. Migration 0040 is an additive receipt
table with a workspace FK and tenant/kind/event uniqueness.

## Channel bot audit

- Management jobs previously read `last_sent_date` and posted before updating it;
  two overlapping invocations could both send. An atomic receipt claim now owns
  the send, independently for each workspace and local report date.
- Invalid settings in one workspace no longer abort every later workspace.
  Stopped and deletion-pending workspaces are excluded. Current workspace reads
  never run other workspaces' jobs.
- Automation deliveries keep their existing event/history IDs. The common claim
  retries explicit Slack rate-limit rejection with `Retry-After`, at most five
  attempts, and updates the original history rather than creating another alert.
- Connection identity, active rule, channel, template and task availability are
  checked again immediately before sending. Old queued messages are cancelled
  after disconnection, reinstallation, settings changes or task archival. A
  request already accepted by Slack cannot be recalled by a later setting change.
- HTTP calls have a 15-second bound. Confirmed `ts` is required for success.
  Network loss, malformed acknowledgement and partial server errors are marked
  uncertain, not retried blindly. `client_msg_id` is stable as an extra safeguard,
  not an assumption of exactly-once delivery.
- A crashed pre-send claim can resume after two minutes; a crashed in-flight send
  becomes uncertain. Historical failed/pending attempts without new receipts are
  not backfilled, because their actual Slack outcome is unknown.
- Management errors are visible outside advanced settings. Accordion labels
  distinguish transmission problems and pending delivery from enabled settings.
- Daily publications serialize each member/date/channel stream. New versions
  update its confirmed message, not create another. Unknown previous posts block
  fresh posts; old submission versions, removed members/channels and foreign
  workspace IDs cannot publish. Historic failures without receipts stay explicit.
- Automated retries and due management reports run independently from other
  maintenance jobs and also on authenticated workspace bootstrap, off its response
  critical path. No new notification destinations or permissions were added.
- Each background pass stops starting work after ten seconds, leaving room for
  its last bounded 15-second request. Management rotates up to twenty workspaces
  per invocation so a malformed or slow first workspace cannot monopolize it.

## Operational limits that must stay explicit

- A `scheduled` export and local cron declaration do not prove that Sites has
  registered a hosted recurring trigger. Confirm actual scheduled invocations in
  hosting logs; browser/bootstrap fallback is not a 24/7 scheduler guarantee.
- Channel history permissions are deliberately not expanded to investigate
  ambiguous acknowledgements. Such outcomes require receipt confirmation, not
  unbounded automatic resend. Permanent scope/token errors require authorized
  reconnection; the service cannot grant its own Slack permissions.
- Management snapshots are limited to the configured reporting day; queued
  automation events expire after 24 hours. Expired sends are cancelled visibly.
- Tests use SQLite and mocked Slack only. Never verify this release by sending
  production test DMs, test reports or creating workspace/task fixtures.

Reference: [Slack message API](https://docs.slack.dev/reference/methods/chat.postmessage)
documents rate limits and partial-failure errors; [Cloudflare Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/)
requires both a scheduled handler and configured trigger.
