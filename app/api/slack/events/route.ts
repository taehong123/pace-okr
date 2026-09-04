import { env, waitUntil } from "cloudflare:workers";
import { z } from "zod";
import { getSlackConnectionByTeam } from "@/lib/pace-data";
import { handleDeliveredDailyReminder, reconcileDailyReminders } from "@/lib/slack-daily";
import { slackConfigured, verifySlackRequest, type SlackRuntimeEnv } from "@/lib/slack-oauth";
import { isSlackSummonMessage, parseSlackSummonCommand, slackSummonSourceRef } from "@/lib/slack-summon-command";
import { handleSlackSummon } from "@/lib/slack-summon";

const envelopeSchema = z.object({
  type: z.string(), challenge: z.string().optional(), team_id: z.string().optional(), event_id: z.string().optional(),
  event: z.object({
    type: z.string(), channel_type: z.string().optional(), channel: z.string().optional(),
    user: z.string().optional(), text: z.string().optional(), ts: z.string().optional(), thread_ts: z.string().optional(),
    subtype: z.string().optional(), bot_id: z.string().optional(), hidden: z.boolean().optional(),
    blocks: z.array(z.object({ block_id: z.string().optional() })).optional(),
  }).optional(),
});

export async function POST(request: Request) {
  const runtime = env as SlackRuntimeEnv;
  if (!slackConfigured(runtime)) return new Response("Slack is not configured", { status: 503 });
  const rawBody = await request.text();
  if (!await verifySlackRequest(request, rawBody, runtime.SLACK_SIGNING_SECRET!)) return new Response("invalid Slack signature", { status: 401 });
  let parsed;
  try { parsed = envelopeSchema.safeParse(JSON.parse(rawBody)); } catch { return new Response("invalid payload", { status: 400 }); }
  if (!parsed.success) return new Response("invalid payload", { status: 400 });
  const payload = parsed.data;
  if (payload.type === "url_verification") return payload.challenge ? Response.json({ challenge: payload.challenge }) : new Response("missing challenge", { status: 400 });
  const { event_id: eventId, team_id: teamId, event } = payload;
  if (payload.type !== "event_callback" || !eventId || !teamId || !event) return new Response(null, { status: 200 });
  const candidate = isSlackSummonMessage(event) && parseSlackSummonCommand(event.text);
  const dailyMessage = event.type === "message" && event.channel_type === "im";
  if (!candidate && !dailyMessage) return new Response(null, { status: 200 });
  // Acknowledge before database/Slack calls; Slack expects a response within 3 seconds.
  waitUntil(processEvent(request, eventId, teamId, event).catch(() => { console.error("Slack event processing failed", { eventId, teamId }); }));
  return new Response(null, { status: 200 });
}

async function processEvent(request: Request, eventId: string, teamId: string, event: NonNullable<z.infer<typeof envelopeSchema>["event"]>) {
  const connection = await getSlackConnectionByTeam(teamId);
  if (!connection) return;
  const command = isSlackSummonMessage(event) && event.user !== connection.botUserId ? parseSlackSummonCommand(event.text, connection.botUserId) : null;
  const dailyMessage = event.type === "message" && event.channel_type === "im";
  if (!command && !dailyMessage) return;
  const receiptId = command && isSlackSummonMessage(event) ? slackSummonSourceRef(teamId, event) : eventId;
  const receipt = await env.DB.prepare(`INSERT OR IGNORE INTO slack_event_receipts (event_id, team_id, event_type, received_at)
    VALUES (?, ?, ?, ?)`)
    .bind(receiptId, teamId, event.type, new Date().toISOString()).run();
  if (!receipt.meta.changes) return;
  if (command && isSlackSummonMessage(event)) {
    await handleSlackSummon(connection, event, command, request);
  } else if (dailyMessage && event.channel && event.user === connection.botUserId) {
    const blockIds = (event.blocks ?? []).flatMap((block) => block.block_id ? [block.block_id] : []);
    await handleDeliveredDailyReminder({ teamId, channelId: event.channel, botId: event.user, blockIds });
  } else if (!event.bot_id && !event.subtype) {
    await reconcileDailyReminders(connection.ownerId);
  }
}
