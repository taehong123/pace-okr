import { env } from "cloudflare:workers";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  slackDailyChannels,
  slackDailyPreferences,
  slackDailySettings,
  slackMemberLinks,
  workspaceMembers,
  type SlackConnection,
} from "@/db/schema";
import { dailySkipReasonLabel, getDailyDashboard, normalizeDailySkipReason, type DailySkipReason, type DailySubmissionValue } from "@/lib/daily-bot";
import { ensureWorkspace, getSlackConnection, getSlackConnectionByTeam, type RequestAuthorization } from "@/lib/pace-data";
import { decryptSlackSecret, slackScopes, type SlackRuntimeEnv } from "@/lib/slack-oauth";

export { dailyMemberBySlack } from "@/lib/daily-bot";

type SlackApiResult = { ok?: boolean; error?: string; response_metadata?: { next_cursor?: string } } & Record<string, unknown>;
type SlackUser = {
  id: string;
  deleted?: boolean;
  is_bot?: boolean;
  profile?: { email?: string; display_name?: string; real_name?: string };
};

export type SlackDailyChannel = { id: string; name: string; isPrivate: boolean };
export const DAILY_REMINDER_BLOCK_PREFIX = "okrptr_daily_reminder:";

export async function slackTokenForConnection(connection: SlackConnection) {
  return decryptSlackSecret(connection.encryptedBotToken, (env as SlackRuntimeEnv).SLACK_TOKEN_ENCRYPTION_KEY!);
}

export async function slackApi<T extends SlackApiResult>(token: string, method: string, body: Record<string, unknown> = {}) {
  const response = await fetch(`https://slack.com/api/${method}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(body),
  });
  const result = await response.json() as T;
  if (!response.ok || !result.ok) throw new Error(slackApiError(result.error, method));
  return result;
}

export async function syncSlackDailyInstallation(ownerId: string) {
  await ensureWorkspace(ownerId);
  const connection = await getSlackConnection(ownerId);
  if (!connection) {
    await upsertSlackDailySettings(ownerId, { installStatus: "not_connected", lastError: "" });
    return { linked: 0, unmatched: 0, status: "not_connected" };
  }
  const missingScopes = slackScopes.filter((scope) => !scopeSet(connection.scope).has(scope));
  if (missingScopes.length) {
    await upsertSlackDailySettings(ownerId, {
      installStatus: "needs_reauthorization",
      requiredScopes: missingScopes.join(","),
      lastError: `추가 Slack 권한이 필요합니다: ${missingScopes.join(", ")}`,
    });
    return { linked: 0, unmatched: 0, status: "needs_reauthorization", missingScopes };
  }
  const token = await slackTokenForConnection(connection);
  const users = await listAllSlackUsers(token);
  const members = await getDb().select().from(workspaceMembers).where(and(
    eq(workspaceMembers.workspaceId, ownerId),
    eq(workspaceMembers.status, "active"),
  ));
  const memberByEmail = new Map(members.flatMap((member) => member.email ? [[member.email.trim().toLocaleLowerCase(), member] as const] : []));
  const matched = users.flatMap((user) => {
    const email = user.profile?.email?.trim() ?? "";
    const member = email ? memberByEmail.get(email.toLocaleLowerCase()) : null;
    return member ? [{ user, member, email }] : [];
  });
  await getDb().delete(slackMemberLinks).where(and(eq(slackMemberLinks.ownerId, ownerId), eq(slackMemberLinks.matchedBy, "email")));
  const now = new Date().toISOString();
  for (const { user, member, email } of matched) {
    await getDb().insert(slackMemberLinks).values({
      id: crypto.randomUUID(), ownerId, memberId: member.id, teamId: connection.teamId, slackUserId: user.id,
      slackEmail: email, slackDisplayName: user.profile?.display_name || user.profile?.real_name || member.displayName,
      matchedBy: "email", createdAt: now, updatedAt: now,
    }).onConflictDoUpdate({
      target: [slackMemberLinks.ownerId, slackMemberLinks.memberId],
      set: { teamId: connection.teamId, slackUserId: user.id, slackEmail: email,
        slackDisplayName: user.profile?.display_name || user.profile?.real_name || member.displayName, updatedAt: now },
    });
  }
  const unmatched = users.filter((user) => {
    const email = user.profile?.email?.trim().toLocaleLowerCase();
    return !email || !memberByEmail.has(email);
  });
  await upsertSlackDailySettings(ownerId, {
    installStatus: "connected", requiredScopes: "", lastSyncedAt: now, lastError: "",
  });
  await reconcileDailyReminders(ownerId);
  return { linked: matched.length, unmatched: unmatched.length, status: "connected" };
}

export async function createSlackMemberLinkUrl(ownerId: string, teamId: string, slackUserId: string, request: Request) {
  const connection = await getSlackConnection(ownerId);
  if (!connection || connection.teamId !== teamId) throw new Error("Slack 연결을 찾을 수 없습니다.");
  const token = await slackTokenForConnection(connection);
  const profile = await slackApi<SlackApiResult & { user?: SlackUser }>(token, "users.info", { user: slackUserId });
  const rawToken = randomHex(32);
  const tokenHash = await sha256(rawToken);
  const now = new Date();
  await env.DB.prepare(`INSERT INTO slack_link_tokens
    (token_hash, owner_id, team_id, slack_user_id, slack_email, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .bind(tokenHash, ownerId, teamId, slackUserId, profile.user?.profile?.email ?? "", now.toISOString(), new Date(now.getTime() + 15 * 60_000).toISOString()).run();
  const appBase = String((env as unknown as Record<string, unknown>).OKRPTR_APP_URL || new URL(request.url).origin).replace(/\/$/, "");
  return `${appBase}/?view=scrum&slack_link=${encodeURIComponent(rawToken)}`;
}

export async function consumeSlackMemberLink(authorization: RequestAuthorization, rawToken: string) {
  const tokenHash = await sha256(rawToken);
  const row = await env.DB.prepare(`SELECT * FROM slack_link_tokens
    WHERE token_hash = ? AND used_at IS NULL AND expires_at > ? LIMIT 1`)
    .bind(tokenHash, new Date().toISOString()).first<Record<string, string>>();
  if (!row || row.owner_id !== authorization.ownerId) throw new Error("Slack 연결 링크가 만료되었거나 올바르지 않습니다.");
  const member = await currentMemberForSlackPreference(authorization);
  const connection = await getSlackConnection(authorization.ownerId);
  if (!connection || connection.teamId !== row.team_id) throw new Error("Slack 워크스페이스 연결이 변경되었습니다.");
  const token = await slackTokenForConnection(connection);
  const profile = await slackApi<SlackApiResult & { user?: SlackUser }>(token, "users.info", { user: row.slack_user_id });
  if (!profile.user || profile.user.deleted || profile.user.is_bot) throw new Error("연결할 수 없는 Slack 사용자입니다.");
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM slack_member_links WHERE owner_id = ? AND (member_id = ? OR (team_id = ? AND slack_user_id = ?))")
      .bind(authorization.ownerId, member.id, row.team_id, row.slack_user_id),
    env.DB.prepare(`INSERT INTO slack_member_links
      (id, owner_id, member_id, team_id, slack_user_id, slack_email, slack_display_name, matched_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'manual', ?, ?)`)
      .bind(crypto.randomUUID(), authorization.ownerId, member.id, row.team_id, row.slack_user_id,
        profile.user.profile?.email ?? row.slack_email ?? "", profile.user.profile?.display_name || profile.user.profile?.real_name || member.displayName, now, now),
    env.DB.prepare("UPDATE slack_link_tokens SET used_at = ? WHERE token_hash = ? AND used_at IS NULL").bind(now, tokenHash),
  ]);
  await scheduleMemberReminder(authorization.ownerId, member.id, { force: true });
  return { linked: true, memberId: member.id, slackUserId: row.slack_user_id };
}

export async function getSlackDailySettings(authorization: RequestAuthorization) {
  await ensureWorkspace(authorization.ownerId);
  const connection = await getSlackConnection(authorization.ownerId);
  const settings = await ensureDailySettingsRow(authorization.ownerId, connection);
  const [channels, members, failedPublications] = await Promise.all([
    getDb().select().from(slackDailyChannels).where(eq(slackDailyChannels.ownerId, authorization.ownerId)),
    env.DB.prepare(`SELECT member.id, member.display_name, member.email, member.role,
        link.slack_user_id, link.slack_email, link.slack_display_name, link.matched_by,
        preference.enabled, preference.reminder_time, preference.timezone,
        reminder.status AS reminder_status, reminder.post_at, reminder.last_error AS reminder_error
      FROM workspace_members AS member
      LEFT JOIN slack_member_links AS link ON link.owner_id = member.workspace_id AND link.member_id = member.id
      LEFT JOIN slack_daily_preferences AS preference ON preference.owner_id = member.workspace_id AND preference.member_id = member.id
      LEFT JOIN slack_daily_reminders AS reminder ON reminder.owner_id = member.workspace_id AND reminder.member_id = member.id
      WHERE member.workspace_id = ? AND member.status = 'active'
      ORDER BY member.created_at`).bind(authorization.ownerId).all<Record<string, string | number | null>>(),
    env.DB.prepare(`SELECT publication.id, publication.submission_id, publication.channel_id, publication.error,
        publication.attempts, publication.updated_at, submission.member_name, submission.scrum_date
      FROM slack_daily_publications AS publication
      INNER JOIN daily_submissions AS submission ON submission.id = publication.submission_id
      WHERE publication.owner_id = ? AND publication.status = 'failed'
      ORDER BY publication.updated_at DESC LIMIT 50`).bind(authorization.ownerId).all<Record<string, string | number | null>>(),
  ]);
  return {
    connected: Boolean(connection),
    teamName: connection?.teamName ?? null,
    scopes: connection?.scope ?? "",
    needsReauthorization: settings.installStatus === "needs_reauthorization",
    settings: serializeSettings(settings),
    channels: channels.map(serializeStoredChannel),
    members: members.results.map((row) => ({
      memberId: String(row.id), displayName: String(row.display_name || row.email || "멤버"), email: String(row.email || ""), role: String(row.role),
      linked: Boolean(row.slack_user_id), slackUserId: row.slack_user_id ? String(row.slack_user_id) : null,
      slackDisplayName: row.slack_display_name ? String(row.slack_display_name) : null, matchedBy: row.matched_by ? String(row.matched_by) : null,
      preference: {
        enabled: row.enabled === null ? true : Boolean(row.enabled),
        reminderTime: row.reminder_time ? String(row.reminder_time) : null,
        timezone: row.timezone ? String(row.timezone) : null,
      },
      reminder: row.reminder_status ? { status: String(row.reminder_status), postAt: Number(row.post_at), error: String(row.reminder_error || "") } : null,
    })),
    failedPublications: failedPublications.results.map((row) => ({
      id: String(row.id), submissionId: String(row.submission_id), channelId: String(row.channel_id), error: String(row.error || ""),
      attempts: Number(row.attempts), updatedAt: String(row.updated_at), memberName: String(row.member_name), date: String(row.scrum_date),
    })),
  };
}

export async function updateSlackDailySettings(ownerId: string, input: {
  enabled?: boolean; weekdays?: number[]; reminderTime?: string; timezone?: string; channelIds?: string[];
}) {
  const connection = await getSlackConnection(ownerId);
  if (!connection) throw new Error("Slack을 먼저 연결해 주세요.");
  const current = await ensureDailySettingsRow(ownerId, connection);
  const weekdays = input.weekdays === undefined ? parseWeekdays(current.weekdays) : normalizeWeekdays(input.weekdays);
  const reminderTime = input.reminderTime === undefined ? current.reminderTime : normalizeReminderTime(input.reminderTime);
  const timezone = input.timezone === undefined ? current.timezone : normalizeTimezone(input.timezone);
  await upsertSlackDailySettings(ownerId, {
    enabled: input.enabled ?? current.enabled,
    weekdays: JSON.stringify(weekdays), reminderTime, timezone,
  });
  if (input.channelIds) {
    const available = await listSlackChannels(ownerId);
    const byId = new Map(available.map((channel) => [channel.id, channel]));
    const selected = [...new Set(input.channelIds)].map((id) => byId.get(id)).filter((channel): channel is SlackDailyChannel => Boolean(channel));
    if (selected.length !== new Set(input.channelIds).size) throw new Error("봇이 참여한 채널만 선택할 수 있습니다.");
    await getDb().delete(slackDailyChannels).where(eq(slackDailyChannels.ownerId, ownerId));
    if (selected.length) await getDb().insert(slackDailyChannels).values(selected.map((channel) => ({
      id: crypto.randomUUID(), ownerId, channelId: channel.id, channelName: channel.name, isPrivate: channel.isPrivate,
    })));
  }
  await reconcileDailyReminders(ownerId, { force: true });
  return getSlackDailySettings({ ownerId, userId: "system", email: null, displayName: "System", role: "owner", apiToken: true });
}

export async function getSlackDailyPreference(authorization: RequestAuthorization) {
  const member = await currentMemberForSlackPreference(authorization);
  const [settings, preference, link] = await Promise.all([
    ensureDailySettingsRow(authorization.ownerId, await getSlackConnection(authorization.ownerId)),
    getDb().select().from(slackDailyPreferences).where(and(
      eq(slackDailyPreferences.ownerId, authorization.ownerId), eq(slackDailyPreferences.memberId, member.id),
    )).limit(1).then((rows) => rows[0] ?? null),
    getDb().select().from(slackMemberLinks).where(and(
      eq(slackMemberLinks.ownerId, authorization.ownerId), eq(slackMemberLinks.memberId, member.id),
    )).limit(1).then((rows) => rows[0] ?? null),
  ]);
  return {
    memberId: member.id,
    linked: Boolean(link),
    enabled: preference?.enabled ?? true,
    reminderTime: preference?.reminderTime ?? settings.reminderTime,
    timezone: preference?.timezone ?? settings.timezone,
    usesWorkspaceTime: !preference?.reminderTime,
    usesWorkspaceTimezone: !preference?.timezone,
  };
}

export async function updateSlackDailyPreference(authorization: RequestAuthorization, input: {
  enabled?: boolean; reminderTime?: string | null; timezone?: string | null;
}) {
  const member = await currentMemberForSlackPreference(authorization);
  const [current] = await getDb().select().from(slackDailyPreferences).where(and(
    eq(slackDailyPreferences.ownerId, authorization.ownerId), eq(slackDailyPreferences.memberId, member.id),
  )).limit(1);
  const values = {
    enabled: input.enabled ?? current?.enabled ?? true,
    reminderTime: input.reminderTime === null ? null : input.reminderTime === undefined ? current?.reminderTime ?? null : normalizeReminderTime(input.reminderTime),
    timezone: input.timezone === null ? null : input.timezone === undefined ? current?.timezone ?? null : normalizeTimezone(input.timezone),
    updatedAt: new Date().toISOString(),
  };
  await getDb().insert(slackDailyPreferences).values({ id: current?.id ?? crypto.randomUUID(), ownerId: authorization.ownerId, memberId: member.id, ...values })
    .onConflictDoUpdate({ target: [slackDailyPreferences.ownerId, slackDailyPreferences.memberId], set: values });
  await scheduleMemberReminder(authorization.ownerId, member.id, { force: true });
  return getSlackDailyPreference(authorization);
}

export async function listSlackChannels(ownerId: string) {
  const connection = await getSlackConnection(ownerId);
  if (!connection) return [];
  const token = await slackTokenForConnection(connection);
  const channels: SlackDailyChannel[] = [];
  let cursor = "";
  do {
    const result = await slackApi<SlackApiResult & { channels?: Array<{ id?: string; name?: string; is_private?: boolean; is_member?: boolean; is_archived?: boolean }> }>(token, "conversations.list", {
      types: "public_channel,private_channel", exclude_archived: true, limit: 200, cursor: cursor || undefined,
    });
    for (const channel of result.channels ?? []) {
      if (channel.id && channel.name && channel.is_member && !channel.is_archived) channels.push({ id: channel.id, name: channel.name, isPrivate: Boolean(channel.is_private) });
    }
    cursor = result.response_metadata?.next_cursor ?? "";
  } while (cursor);
  return channels.sort((left, right) => left.name.localeCompare(right.name));
}

export async function testDailyDm(ownerId: string, memberId: string) {
  const [connection, link] = await Promise.all([
    getSlackConnection(ownerId),
    getDb().select().from(slackMemberLinks).where(and(eq(slackMemberLinks.ownerId, ownerId), eq(slackMemberLinks.memberId, memberId))).limit(1).then((rows) => rows[0] ?? null),
  ]);
  if (!connection || !link) throw new Error("Slack 사용자 연결이 필요합니다.");
  const token = await slackTokenForConnection(connection);
  const dmChannelId = await ensureDmChannel(token, link.slackUserId, link.dmChannelId);
  await slackApi(token, "chat.postMessage", { channel: dmChannelId, text: "OKRPTR 데일리 알림 테스트입니다.", blocks: dailyReminderBlocks("test") });
  if (dmChannelId !== link.dmChannelId) await getDb().update(slackMemberLinks).set({ dmChannelId, updatedAt: new Date().toISOString() }).where(eq(slackMemberLinks.id, link.id));
}

export async function disconnectSlackDaily(ownerId: string, connection: SlackConnection) {
  const token = await slackTokenForConnection(connection);
  const reminders = await env.DB.prepare("SELECT * FROM slack_daily_reminders WHERE owner_id = ? AND status = 'scheduled'")
    .bind(ownerId).all<Record<string, string | number>>();
  for (const reminder of reminders.results) await cancelScheduledReminder(token, reminder);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM slack_daily_reminders WHERE owner_id = ?").bind(ownerId),
    env.DB.prepare("DELETE FROM slack_member_links WHERE owner_id = ?").bind(ownerId),
    env.DB.prepare("DELETE FROM slack_daily_channels WHERE owner_id = ?").bind(ownerId),
    env.DB.prepare(`INSERT INTO slack_daily_settings (owner_id, enabled, install_status, required_scopes, last_error, updated_at)
      VALUES (?, 1, 'not_connected', '', '', ?)
      ON CONFLICT(owner_id) DO UPDATE SET install_status = 'not_connected', required_scopes = '', last_error = '', updated_at = excluded.updated_at`)
      .bind(ownerId, new Date().toISOString()),
  ]);
}

export async function reconcileDailyReminders(ownerId: string, options: { force?: boolean } = {}) {
  const links = await getDb().select({ memberId: slackMemberLinks.memberId }).from(slackMemberLinks).where(eq(slackMemberLinks.ownerId, ownerId));
  for (const link of links) {
    try { await scheduleMemberReminder(ownerId, link.memberId, options); } catch (error) {
      await upsertSlackDailySettings(ownerId, { lastError: error instanceof Error ? error.message : "Slack 알림 예약 실패" });
    }
  }
}

export async function scheduleMemberReminder(ownerId: string, memberId: string, options: { force?: boolean } = {}) {
  const [connection, settings, preference, link, existing] = await Promise.all([
    getSlackConnection(ownerId),
    ensureDailySettingsRow(ownerId, await getSlackConnection(ownerId)),
    getDb().select().from(slackDailyPreferences).where(and(eq(slackDailyPreferences.ownerId, ownerId), eq(slackDailyPreferences.memberId, memberId))).limit(1).then((rows) => rows[0] ?? null),
    getDb().select().from(slackMemberLinks).where(and(eq(slackMemberLinks.ownerId, ownerId), eq(slackMemberLinks.memberId, memberId))).limit(1).then((rows) => rows[0] ?? null),
    env.DB.prepare("SELECT * FROM slack_daily_reminders WHERE owner_id = ? AND member_id = ? LIMIT 1").bind(ownerId, memberId).first<Record<string, string | number>>(),
  ]);
  if (!connection || !link) return;
  const enabled = settings.enabled && (preference?.enabled ?? true) && settings.installStatus === "connected";
  const token = await slackTokenForConnection(connection);
  if (!enabled) {
    if (existing) await cancelScheduledReminder(token, existing);
    await env.DB.prepare("DELETE FROM slack_daily_reminders WHERE owner_id = ? AND member_id = ?").bind(ownerId, memberId).run();
    return;
  }
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (existing && existing.status === "scheduled" && Number(existing.post_at) > nowSeconds + 60 && !options.force) return;
  if (existing?.scheduled_message_id) await cancelScheduledReminder(token, existing);
  const dmChannelId = await ensureDmChannel(token, link.slackUserId, link.dmChannelId);
  const postAt = nextReminderEpoch(preference?.reminderTime ?? settings.reminderTime, preference?.timezone ?? settings.timezone, parseWeekdays(settings.weekdays));
  const blockId = `${DAILY_REMINDER_BLOCK_PREFIX}${crypto.randomUUID()}`;
  const result = await slackApi<SlackApiResult & { scheduled_message_id?: string }>(token, "chat.scheduleMessage", {
    channel: dmChannelId,
    post_at: postAt,
    text: "오늘의 OKRPTR 데일리를 작성해 주세요.",
    blocks: dailyReminderBlocks(blockId),
  });
  if (!result.scheduled_message_id) throw new Error("Slack 예약 메시지 ID를 받지 못했습니다.");
  const now = new Date().toISOString();
  await env.DB.prepare(`INSERT INTO slack_daily_reminders
    (id, owner_id, member_id, slack_user_id, dm_channel_id, scheduled_message_id, post_at, block_id, bot_user_id, status, last_error, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'scheduled', '', ?, ?)
    ON CONFLICT(owner_id, member_id) DO UPDATE SET slack_user_id = excluded.slack_user_id,
      dm_channel_id = excluded.dm_channel_id, scheduled_message_id = excluded.scheduled_message_id,
      post_at = excluded.post_at, block_id = excluded.block_id, bot_user_id = excluded.bot_user_id,
      status = 'scheduled', last_error = '', updated_at = excluded.updated_at`)
    .bind(existing?.id ?? crypto.randomUUID(), ownerId, memberId, link.slackUserId, dmChannelId, result.scheduled_message_id, postAt, blockId, connection.botUserId, now, now).run();
  if (dmChannelId !== link.dmChannelId) await getDb().update(slackMemberLinks).set({ dmChannelId, updatedAt: now }).where(eq(slackMemberLinks.id, link.id));
}

export async function handleDeliveredDailyReminder(input: { teamId: string; channelId: string; botId: string; blockIds: string[] }) {
  const connection = await getSlackConnectionByTeam(input.teamId);
  if (!connection || connection.botUserId !== input.botId) return false;
  const reminder = await env.DB.prepare(`SELECT * FROM slack_daily_reminders
    WHERE owner_id = ? AND dm_channel_id = ? AND bot_user_id = ? AND status = 'scheduled' LIMIT 1`)
    .bind(connection.ownerId, input.channelId, input.botId).first<Record<string, string | number>>();
  if (!reminder || !input.blockIds.includes(String(reminder.block_id))) return false;
  await env.DB.prepare("UPDATE slack_daily_reminders SET status = 'delivered', updated_at = ? WHERE id = ?")
    .bind(new Date().toISOString(), reminder.id).run();
  await scheduleMemberReminder(connection.ownerId, String(reminder.member_id), { force: true });
  return true;
}

export async function publishDailySubmission(ownerId: string, submissionId: string) {
  const connection = await getSlackConnection(ownerId);
  if (!connection) return;
  const token = await slackTokenForConnection(connection);
  const submission = await loadSubmission(submissionId);
  if (!submission) return;
  const publications = await env.DB.prepare(`SELECT * FROM slack_daily_publications
    WHERE owner_id = ? AND submission_id = ? AND status IN ('pending', 'failed') ORDER BY channel_id`)
    .bind(ownerId, submissionId).all<Record<string, string | number | null>>();
  for (const publication of publications.results) {
    const now = new Date().toISOString();
    try {
      const previous = await env.DB.prepare(`SELECT publication.slack_message_ts FROM slack_daily_publications AS publication
        INNER JOIN daily_submissions AS submission ON submission.id = publication.submission_id
        WHERE publication.owner_id = ? AND publication.member_id = ? AND publication.scrum_date = ?
          AND publication.channel_id = ? AND publication.slack_message_ts IS NOT NULL
        ORDER BY submission.version DESC LIMIT 1`)
        .bind(ownerId, submission.memberId, submission.date, publication.channel_id).first<{ slack_message_ts: string }>();
      const message = dailyCard(submission);
      let timestamp = previous?.slack_message_ts ?? (publication.slack_message_ts ? String(publication.slack_message_ts) : null);
      if (timestamp) {
        await slackApi(token, "chat.update", { channel: publication.channel_id, ts: timestamp, ...message });
      } else {
        const result = await slackApi<SlackApiResult & { ts?: string }>(token, "chat.postMessage", { channel: publication.channel_id, ...message });
        timestamp = result.ts ?? null;
      }
      await env.DB.prepare(`UPDATE slack_daily_publications SET status = 'sent', error = '', slack_message_ts = ?,
        attempts = attempts + 1, updated_at = ? WHERE id = ?`)
        .bind(timestamp, now, publication.id).run();
    } catch (error) {
      await env.DB.prepare(`UPDATE slack_daily_publications SET status = 'failed', error = ?, attempts = attempts + 1, updated_at = ? WHERE id = ?`)
        .bind(error instanceof Error ? error.message : "Slack 채널 전송 실패", now, publication.id).run();
    }
  }
}

export async function retryDailyPublication(ownerId: string, publicationId: string) {
  const row = await env.DB.prepare("SELECT submission_id FROM slack_daily_publications WHERE id = ? AND owner_id = ? LIMIT 1")
    .bind(publicationId, ownerId).first<{ submission_id: string }>();
  if (!row) throw new Error("게시 기록을 찾을 수 없습니다.");
  await env.DB.prepare("UPDATE slack_daily_publications SET status = 'pending', error = '', updated_at = ? WHERE id = ?")
    .bind(new Date().toISOString(), publicationId).run();
  await publishDailySubmission(ownerId, row.submission_id);
}

export function dailyReminderBlocks(blockId: string) {
  return [
    { type: "section", block_id: blockId, text: { type: "mrkdwn", text: "*오늘의 데일리를 정리할 시간입니다.*\n할당된 Task를 고르거나, 필요한 경우 사유와 함께 오늘 데일리를 스킵할 수 있습니다." } },
    { type: "actions", block_id: blockId, elements: [{ type: "button", action_id: "daily_open", text: { type: "plain_text", text: "데일리 작성" }, style: "primary", value: "daily" }] },
  ];
}

export async function openDailyModal(triggerId: string, authorization: RequestAuthorization) {
  const connection = await getSlackConnection(authorization.ownerId);
  if (!connection) throw new Error("Slack 연결을 찾을 수 없습니다.");
  const dashboard = await getDailyDashboard(authorization, todayInTimezone("Asia/Seoul"));
  const token = await slackTokenForConnection(connection);
  const parentOptions = [
    ...dashboard.createTargets.projects.map((project) => ({ text: { type: "plain_text", text: `Project · ${project.title}`.slice(0, 75) }, value: `project:${project.id}` })),
    ...dashboard.createTargets.routines.map((routine) => ({ text: { type: "plain_text", text: `Routine · ${routine.title}`.slice(0, 75) }, value: `routine:${routine.id}` })),
    ...(dashboard.createTargets.allowGeneral ? [{ text: { type: "plain_text", text: "General" }, value: "general:" }] : []),
  ];
  const skipOptions = [
    { text: { type: "plain_text", text: "스킵하지 않음" }, value: "none" },
    ...(["workload", "vacation", "personal", "other"] as DailySkipReason[]).map((reason) => ({
      text: { type: "plain_text", text: dailySkipReasonLabel(reason) }, value: reason,
    })),
  ];
  const selectedSkip = dashboard.draft.skipReason ?? "none";
  const blocks: Record<string, unknown>[] = [
    { type: "input", block_id: "skip_reason", optional: true, label: { type: "plain_text", text: "데일리 스킵" }, element: {
      type: "static_select", action_id: "value", options: skipOptions,
      initial_option: skipOptions.find((option) => option.value === selectedSkip) ?? skipOptions[0],
    } },
    { type: "input", block_id: "skip_note", optional: true, label: { type: "plain_text", text: "스킵 상세 사유 (기타는 필수)" }, element: {
      type: "plain_text_input", action_id: "value", max_length: 500, initial_value: dashboard.draft.skipNote,
      placeholder: { type: "plain_text", text: "팀에 공유할 보충 설명" },
    } },
    { type: "input", block_id: "daily_tasks", optional: true, label: { type: "plain_text", text: "오늘 할 Task" }, element: {
      type: "multi_external_select", action_id: "selected_tasks", min_query_length: 0, max_selected_items: 50,
      placeholder: { type: "plain_text", text: "할당된 Task 검색" },
      initial_options: dashboard.candidates.tasks.filter((task) => dashboard.draft.selectedTaskIds.includes(task.id)).slice(0, 50).map(taskOption),
    } },
    { type: "input", block_id: "today_note", optional: true, label: { type: "plain_text", text: "오늘 메모" }, element: { type: "plain_text_input", action_id: "value", multiline: true, initial_value: dashboard.draft.todayNote } },
    { type: "input", block_id: "blockers_note", optional: true, label: { type: "plain_text", text: "블로커" }, element: { type: "plain_text_input", action_id: "value", multiline: true, initial_value: dashboard.draft.blockersNote } },
    { type: "input", block_id: "no_planned", optional: true, label: { type: "plain_text", text: "오늘 예정" }, element: {
      type: "checkboxes", action_id: "value", options: [{ text: { type: "plain_text", text: "오늘 예정 없음" }, value: "yes" }],
      initial_options: dashboard.draft.noPlannedTasks ? [{ text: { type: "plain_text", text: "오늘 예정 없음" }, value: "yes" }] : [],
    } },
  ];
  if (parentOptions.length) {
    blocks.push(
      { type: "input", block_id: "new_task_parent", optional: true, label: { type: "plain_text", text: "새 Task 상위 항목" }, element: { type: "static_select", action_id: "value", placeholder: { type: "plain_text", text: "상위 항목 선택" }, options: parentOptions.slice(0, 100) } },
      { type: "input", block_id: "new_task_title", optional: true, label: { type: "plain_text", text: "새 Task 만들기 (선택)" }, element: { type: "plain_text_input", action_id: "value", max_length: 240, placeholder: { type: "plain_text", text: "명시적으로 제출할 때만 생성됩니다" } } },
    );
  }
  await slackApi(token, "views.open", { trigger_id: triggerId, view: {
    type: "modal", callback_id: "daily_submit", private_metadata: JSON.stringify({ ownerId: authorization.ownerId, date: dashboard.date, requestId: crypto.randomUUID() }),
    title: { type: "plain_text", text: "OKRPTR 데일리" }, submit: { type: "plain_text", text: "확정 및 공유" }, close: { type: "plain_text", text: "취소" }, blocks,
  } });
}

export async function externalTaskOptions(authorization: RequestAuthorization, query: string) {
  const dashboard = await getDailyDashboard(authorization, todayInTimezone("Asia/Seoul"));
  const normalized = query.trim().toLocaleLowerCase();
  return dashboard.candidates.tasks.filter((task) => !normalized || `${task.title} ${task.parentTitle}`.toLocaleLowerCase().includes(normalized)).slice(0, 100).map(taskOption);
}

function taskOption(task: { id: string; title: string; parentTitle: string }) {
  return { text: { type: "plain_text", text: `${task.title} · ${task.parentTitle}`.slice(0, 75) }, value: task.id };
}

async function listAllSlackUsers(token: string) {
  const users: SlackUser[] = [];
  let cursor = "";
  do {
    const result = await slackApi<SlackApiResult & { members?: SlackUser[] }>(token, "users.list", { limit: 200, cursor: cursor || undefined });
    users.push(...(result.members ?? []).filter((user) => user.id && !user.is_bot && !user.deleted && user.profile?.email));
    cursor = result.response_metadata?.next_cursor ?? "";
  } while (cursor);
  return users;
}

async function ensureDailySettingsRow(ownerId: string, connection: SlackConnection | null) {
  let [settings] = await getDb().select().from(slackDailySettings).where(eq(slackDailySettings.ownerId, ownerId)).limit(1);
  if (!settings) {
    const missingScopes = connection ? slackScopes.filter((scope) => !scopeSet(connection.scope).has(scope)) : slackScopes;
    [settings] = await getDb().insert(slackDailySettings).values({
      ownerId,
      installStatus: !connection ? "not_connected" : missingScopes.length ? "needs_reauthorization" : "connected",
      requiredScopes: missingScopes.join(","),
    }).returning();
  }
  return settings;
}

async function upsertSlackDailySettings(ownerId: string, values: Partial<typeof slackDailySettings.$inferInsert>) {
  const now = new Date().toISOString();
  await getDb().insert(slackDailySettings).values({ ownerId, updatedAt: now, ...values })
    .onConflictDoUpdate({ target: slackDailySettings.ownerId, set: { ...values, updatedAt: now } });
}

async function currentMemberForSlackPreference(authorization: RequestAuthorization) {
  await ensureWorkspace(authorization.ownerId);
  const [member] = await getDb().select().from(workspaceMembers).where(and(
    eq(workspaceMembers.workspaceId, authorization.ownerId), eq(workspaceMembers.userId, authorization.userId), eq(workspaceMembers.status, "active"),
  )).limit(1);
  if (!member) throw new Error("현재 멤버를 찾을 수 없습니다.");
  return member;
}

async function ensureDmChannel(token: string, slackUserId: string, existing: string) {
  if (existing) return existing;
  const result = await slackApi<SlackApiResult & { channel?: { id?: string } }>(token, "conversations.open", { users: slackUserId, return_im: true });
  if (!result.channel?.id) throw new Error("Slack DM 채널을 열지 못했습니다.");
  return result.channel.id;
}

async function cancelScheduledReminder(token: string, reminder: Record<string, string | number>) {
  try {
    await slackApi(token, "chat.deleteScheduledMessage", { channel: reminder.dm_channel_id, scheduled_message_id: reminder.scheduled_message_id });
  } catch {
    // 이미 게시되거나 Slack에서 제거된 예약은 로컬 재예약을 계속한다.
  }
}

async function loadSubmission(id: string) {
  const row = await env.DB.prepare("SELECT * FROM daily_submissions WHERE id = ? LIMIT 1").bind(id).first<Record<string, string | number | null>>();
  if (!row) return null;
  const snapshots = await env.DB.prepare("SELECT * FROM daily_task_snapshots WHERE submission_id = ? ORDER BY sort_order").bind(id).all<Record<string, string | number | null>>();
  return {
    id: String(row.id), memberId: row.member_id ? String(row.member_id) : null, memberName: String(row.member_name), memberEmail: String(row.member_email),
    date: String(row.scrum_date), version: Number(row.version), yesterdayNote: String(row.yesterday_note), todayNote: String(row.today_note),
    blockersNote: String(row.blockers_note), noPlannedTasks: Boolean(row.no_planned_tasks),
    skipReason: normalizeDailySkipReason(row.skip_reason), skipNote: String(row.skip_note || ""),
    source: String(row.source), submittedAt: String(row.submitted_at),
    tasks: snapshots.results.map((snapshot) => ({ id: String(snapshot.id), taskId: snapshot.task_id ? String(snapshot.task_id) : null,
      taskTitle: String(snapshot.task_title), parentKind: String(snapshot.parent_kind), parentId: snapshot.parent_id ? String(snapshot.parent_id) : null,
      parentTitle: String(snapshot.parent_title), status: String(snapshot.status), isNew: Boolean(snapshot.is_new), sortOrder: Number(snapshot.sort_order) })),
  } satisfies DailySubmissionValue;
}

function dailyCard(submission: DailySubmissionValue) {
  if (submission.skipReason) {
    const reason = dailySkipReasonLabel(submission.skipReason);
    const detail = submission.skipNote ? `\n${escapeSlack(submission.skipNote)}` : "";
    const appUrl = `${String((env as unknown as Record<string, unknown>).OKRPTR_APP_URL || "https://okrptr.com").replace(/\/$/, "")}/?view=scrum`;
    return { text: `${submission.memberName}님의 ${submission.date} 데일리 스킵 · ${reason}`, unfurl_links: false, unfurl_media: false, blocks: [
      { type: "header", text: { type: "plain_text", text: `${submission.memberName} · ${submission.date}`.slice(0, 150) } },
      { type: "section", text: { type: "mrkdwn", text: `*⏭️ 오늘 데일리 스킵*\n*사유:* ${reason}${detail}`.slice(0, 2900) } },
      { type: "actions", elements: [{ type: "button", text: { type: "plain_text", text: "OKRPTR에서 보기" }, url: appUrl }] },
    ] };
  }
  const visible = submission.tasks.slice(0, 20);
  const taskLines = visible.length ? visible.map((task) => `${task.isNew ? "✨ " : "• "}${escapeSlack(task.taskTitle)} _(${escapeSlack(task.parentTitle)})_`).join("\n") : "• 오늘 예정 없음";
  const overflow = submission.tasks.length > 20 ? `\n_외 ${submission.tasks.length - 20}개_` : "";
  const blocker = submission.blockersNote ? `\n*블로커*\n${escapeSlack(submission.blockersNote)}` : "";
  const note = submission.todayNote ? `\n*오늘 메모*\n${escapeSlack(submission.todayNote)}` : "";
  const appUrl = `${String((env as unknown as Record<string, unknown>).OKRPTR_APP_URL || "https://okrptr.com").replace(/\/$/, "")}/?view=scrum`;
  const text = `${submission.memberName}님의 ${submission.date} 데일리`;
  return { text, unfurl_links: false, unfurl_media: false, blocks: [
    { type: "header", text: { type: "plain_text", text: `${submission.memberName} · ${submission.date}`.slice(0, 150) } },
    { type: "section", text: { type: "mrkdwn", text: `*오늘 Task*\n${taskLines}${overflow}${note}${blocker}`.slice(0, 2900) } },
    { type: "actions", elements: [{ type: "button", text: { type: "plain_text", text: "OKRPTR에서 보기" }, url: appUrl }] },
  ] };
}

function serializeSettings(settings: typeof slackDailySettings.$inferSelect) {
  return { enabled: settings.enabled, weekdays: parseWeekdays(settings.weekdays), reminderTime: settings.reminderTime, timezone: settings.timezone,
    installStatus: settings.installStatus, requiredScopes: settings.requiredScopes ? settings.requiredScopes.split(",").filter(Boolean) : [],
    lastSyncedAt: settings.lastSyncedAt, lastError: settings.lastError, updatedAt: settings.updatedAt };
}

function serializeStoredChannel(channel: typeof slackDailyChannels.$inferSelect) {
  return { id: channel.channelId, name: channel.channelName, isPrivate: channel.isPrivate };
}

function scopeSet(value: string) {
  return new Set(value.split(/[ ,]/).map((scope) => scope.trim()).filter(Boolean));
}

function normalizeWeekdays(values: number[]) {
  const result = [...new Set(values.map(Number).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))].sort();
  if (!result.length) throw new Error("알림 요일을 하나 이상 선택해 주세요.");
  return result;
}

function parseWeekdays(value: string) {
  try { return normalizeWeekdays(JSON.parse(value) as number[]); } catch { return [1, 2, 3, 4, 5]; }
}

function normalizeReminderTime(value: string) {
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) throw new Error("알림 시간은 HH:mm 형식이어야 합니다.");
  return value;
}

function normalizeTimezone(value: string) {
  try { new Intl.DateTimeFormat("en-US", { timeZone: value }).format(); } catch { throw new Error("올바른 시간대를 선택해 주세요."); }
  return value;
}

export function nextReminderEpoch(time: string, timezone: string, weekdays: number[], now = new Date()) {
  const [hour, minute] = normalizeReminderTime(time).split(":").map(Number);
  const localNow = zonedParts(now, timezone);
  const base = new Date(Date.UTC(localNow.year, localNow.month - 1, localNow.day));
  for (let offset = 0; offset < 15; offset += 1) {
    const day = new Date(base.getTime() + offset * 86_400_000);
    if (!weekdays.includes(day.getUTCDay())) continue;
    const epoch = zonedDateTimeToEpoch({ year: day.getUTCFullYear(), month: day.getUTCMonth() + 1, day: day.getUTCDate(), hour, minute }, timezone);
    if (epoch > Math.floor(now.getTime() / 1000) + 60) return epoch;
  }
  throw new Error("다음 Slack 알림 시간을 계산하지 못했습니다.");
}

function zonedDateTimeToEpoch(parts: { year: number; month: number; day: number; hour: number; minute: number }, timezone: string) {
  let guess = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
  for (let iteration = 0; iteration < 3; iteration += 1) {
    const actual = zonedParts(new Date(guess), timezone);
    const wantedAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
    const actualAsUtc = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute);
    guess += wantedAsUtc - actualAsUtc;
  }
  return Math.floor(guess / 1000);
}

function zonedParts(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return { year: value("year"), month: value("month"), day: value("day"), hour: value("hour"), minute: value("minute") };
}

function todayInTimezone(timezone: string) {
  const parts = zonedParts(new Date(), timezone);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function escapeSlack(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function randomHex(byteLength: number) {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function slackApiError(code: string | undefined, method: string) {
  if (code === "missing_scope") return "Slack 권한 업데이트가 필요합니다.";
  if (code === "not_in_channel") return "OKRPTR 봇을 해당 채널에 먼저 초대해 주세요.";
  if (code === "invalid_auth" || code === "token_revoked") return "Slack 연결이 만료되었습니다. 다시 연결해 주세요.";
  return `Slack ${method} 요청에 실패했습니다${code ? ` (${code})` : ""}.`;
}
