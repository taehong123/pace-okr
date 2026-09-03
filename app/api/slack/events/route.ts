import { env, waitUntil } from "cloudflare:workers";
import { getSlackConnectionByTeam } from "@/lib/pace-data";
import { handleDeliveredDailyReminder, repairSlackDailyReminders } from "@/lib/slack-daily";
import { slackConfigured, verifySlackRequest, type SlackRuntimeEnv } from "@/lib/slack-oauth";

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
    subtype?: string;
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
  const eventId = payload.event_id ?? "";
  const teamId = payload.team_id ?? "";
  if (!eventId || !teamId) return new Response(null, { status: 200 });
  const receipt = await env.DB.prepare(`INSERT OR IGNORE INTO slack_event_receipts (event_id, team_id, event_type, received_at)
    VALUES (?, ?, ?, ?)`)
    .bind(eventId, teamId, payload.event?.type ?? "", new Date().toISOString()).run();
  if (!receipt.meta.changes) return new Response(null, { status: 200 });
  const connection = await getSlackConnectionByTeam(teamId);
  if (!connection) return new Response(null, { status: 200 });
  const event = payload.event;
  if (event?.type === "message" && event.channel_type === "im" && event.channel && event.user === connection.botUserId) {
    const blockIds = (event.blocks ?? []).flatMap((block) => block.block_id ? [block.block_id] : []);
    waitUntil(handleDeliveredDailyReminder({ teamId, channelId: event.channel, botId: event.user, blockIds }).then(() => undefined));
  } else {
    waitUntil(repairSlackDailyReminders(connection.ownerId));
  }
  return new Response(null, { status: 200 });
}
