import { env, waitUntil } from "cloudflare:workers";
import { z } from "zod";
import { getSlackConnectionByTeam } from "@/lib/pace-data";
import { handleDeliveredDailyReminder, repairSlackDailyReminders } from "@/lib/slack-daily";
import { slackConfigured, verifySlackRequest, type SlackRuntimeEnv } from "@/lib/slack-oauth";
import { handleSlackWorkCommandEvent, parseSlackWorkCommand } from "@/lib/slack-work-command";

type SlackEventEnvelope = {
  type?: string;
  challenge?: string;
  team_id?: string;
  event_id?: string;
  event?: {
    type?: string;
    channel_type?: string;
    channel?: string;
    user?: string;
    text?: string;
    bot_id?: string;
    subtype?: string;
    thread_ts?: string;
    blocks?: Array<{ block_id?: string }>;
  };
};

export async function POST(request: Request) {
  const runtime = env as SlackRuntimeEnv;
  if (!slackConfigured(runtime)) return new Response("Slack is not configured", { status: 503 });
  const rawBody = await request.text();
  if (!await verifySlackRequest(request, rawBody, runtime.SLACK_SIGNING_SECRET!)) return new Response("invalid Slack signature", { status: 401 });
  let payload: SlackEventEnvelope;
  try { payload = JSON.parse(rawBody) as SlackEventEnvelope; } catch { return new Response("invalid payload", { status: 400 }); }
  if (payload.type === "url_verification") return Response.json({ challenge: payload.challenge ?? "" });
  const event = payload.event;
  const parsedCommand = event?.type === "message" && event.text && !event.subtype && !event.bot_id
    ? parseSlackWorkCommand(event.text) : null;
  const eventId = payload.event_id ?? "";
  const teamId = payload.team_id ?? "";
  if (!eventId || !teamId) return new Response(null, { status: 200 });
  const connection = await getSlackConnectionByTeam(teamId);
  if (!connection) return new Response(null, { status: 200 });
  if (event?.type === "message" && event.user && !event.bot_id && !event.subtype && !parsedCommand && event.user !== connection.botUserId) {
    return new Response(null, { status: 200 });
  }
  const receipt = await env.DB.prepare(`INSERT OR IGNORE INTO slack_event_receipts (event_id, team_id, event_type, received_at)
    VALUES (?, ?, ?, ?)`)
    .bind(eventId, teamId, payload.event?.type ?? "", new Date().toISOString()).run();
  if (!receipt.meta.changes) return new Response(null, { status: 200 });
  if (event?.type === "message" && event.channel_type === "im" && event.channel && event.user === connection.botUserId) {
    const blockIds = (event.blocks ?? []).flatMap((block) => block.block_id ? [block.block_id] : []);
    waitUntil(handleDeliveredDailyReminder({ teamId, channelId: event.channel, botId: event.user, blockIds }).then(() => undefined));
  } else if (event?.type === "message" && event.channel && event.user && event.text && !event.subtype && !event.bot_id && event.user !== connection.botUserId) {
    if (parsedCommand && ["im", "channel", "group"].includes(event.channel_type ?? "")) {
      waitUntil(handleSlackWorkCommandEvent(request, connection, {
        channel: event.channel,
        channelType: event.channel_type ?? "",
        user: event.user,
        text: event.text,
        threadTs: event.thread_ts,
      }, parsedCommand).catch((error) => console.error("Slack work command failed", error)));
    }
  } else if (event?.type !== "message") {
    waitUntil(repairSlackDailyReminders(connection.ownerId));
  }
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
