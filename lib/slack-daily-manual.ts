import { getSlackConnection, type RequestAuthorization } from "@/lib/pace-data";
import { dailyReminderBlocks, ensureDmChannel, slackTokenForConnection } from "@/lib/slack-daily";
import { deliverSlackBotMessage } from "@/lib/slack-bot-delivery";
import { memberMessageLanguage } from "@/lib/language-preferences";
import { serverTranslator } from "@/lib/server-language";

type Target = { memberId: string; displayName: string; slackUserId: string };
type Run = { id: string; owner_id: string; targets_json: string; errors_json: string; expires_at: string; created_at: string };
export type DailyManualResult = {
  id: string; createdAt: string; status: "pending" | "complete"; total: number; sent: number; failed: number; uncertain: number; pending: number;
  members: Array<{ memberId: string; displayName: string; status: string; error: string }>;
};

export async function startDailyManualRun(db: D1Database, authorization: RequestAuthorization, requestId: string) {
  if (!["owner", "admin"].includes(authorization.role)) throw new Error("Owner 또는 Admin 권한이 필요합니다.");
  if (!/^[a-zA-Z0-9-]{16,80}$/.test(requestId)) throw new Error("발송 요청을 다시 확인해 주세요.");
  const existing = await db.prepare("SELECT id FROM slack_daily_manual_runs WHERE owner_id = ? AND id = ?")
    .bind(authorization.ownerId, requestId).first();
  if (existing) return getDailyManualRun(db, authorization.ownerId, requestId);
  const targets = await db.prepare(`SELECT m.id AS memberId, COALESCE(NULLIF(m.display_name, ''), m.email, m.id) AS displayName, l.slack_user_id AS slackUserId
    FROM workspace_members m JOIN slack_member_links l ON l.owner_id = m.workspace_id AND l.member_id = m.id
    JOIN slack_connections c ON c.owner_id = l.owner_id AND c.team_id = l.team_id
    WHERE m.workspace_id = ? AND m.status = 'active' ORDER BY m.id`).bind(authorization.ownerId).all<Target>();
  if (!targets.results.length) throw new Error("Slack에 연결된 멤버가 없습니다.");
  if (targets.results.length > 500) throw new Error("한 번에 최대 500명까지 발송할 수 있습니다.");
  await db.prepare(`INSERT INTO slack_daily_manual_runs (id, owner_id, created_by_user_id, targets_json, expires_at)
    SELECT ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM workspace_members m JOIN workspaces w ON w.id = m.workspace_id
      WHERE m.workspace_id = ? AND m.user_id = ? AND m.status = 'active' AND m.role IN ('owner','admin') AND w.scheduled_deletion_at IS NULL)
    ON CONFLICT(id) DO NOTHING`)
    .bind(requestId, authorization.ownerId, authorization.userId, JSON.stringify(targets.results), new Date(Date.now() + 30 * 60_000).toISOString(), authorization.ownerId, authorization.userId).run();
  return getDailyManualRun(db, authorization.ownerId, requestId);
}

export async function getDailyManualRun(db: D1Database, ownerId: string, id: string): Promise<DailyManualResult> {
  const run = await db.prepare("SELECT * FROM slack_daily_manual_runs WHERE owner_id = ? AND id = ?").bind(ownerId, id).first<Run>();
  if (!run) throw new Error("발송 요청을 찾을 수 없습니다.");
  const rows = await db.prepare("SELECT subject_id, status, last_error FROM slack_bot_deliveries WHERE owner_id = ? AND bot_kind = 'daily_manual' AND subject_id LIKE ?")
    .bind(ownerId, `${id}/%`).all<{ subject_id: string; status: string; last_error: string }>();
  const deliveries = new Map(rows.results.map((row) => [row.subject_id.slice(id.length + 1), row]));
  const errors = JSON.parse(run.errors_json) as Record<string, string>;
  const members = (JSON.parse(run.targets_json) as Target[]).map((target) => {
    const delivery = deliveries.get(target.memberId);
    return { memberId: target.memberId, displayName: target.displayName,
      status: delivery?.status ?? (errors[target.memberId] ? "failed" : run.expires_at <= new Date().toISOString() ? "cancelled" : "pending"),
      error: delivery?.last_error ?? errors[target.memberId] ?? "" };
  });
  const sent = members.filter((member) => member.status === "sent").length;
  const failed = members.filter((member) => ["failed", "cancelled"].includes(member.status)).length;
  const uncertain = members.filter((member) => member.status === "uncertain").length;
  const pending = members.length - sent - failed - uncertain;
  return { id, createdAt: run.created_at, status: pending ? "pending" : "complete", total: members.length, sent, failed, uncertain, pending, members };
}

export async function latestDailyManualRun(db: D1Database, ownerId: string) {
  const latest = await db.prepare("SELECT id FROM slack_daily_manual_runs WHERE owner_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1")
    .bind(ownerId).first<{ id: string }>();
  return latest ? getDailyManualRun(db, ownerId, latest.id) : null;
}

export async function processDailyManualRun(db: D1Database, ownerId: string, id: string) {
  const run = await db.prepare("SELECT * FROM slack_daily_manual_runs WHERE owner_id = ? AND id = ?").bind(ownerId, id).first<Run>();
  if (!run) return;
  const startedAt = Date.now();
  const result = await getDailyManualRun(db, ownerId, id);
  for (const target of JSON.parse(run.targets_json) as Target[]) {
    if (Date.now() - startedAt >= 8_000 || run.expires_at <= new Date().toISOString()) break;
    if (result.members.find((member) => member.memberId === target.memberId)?.status !== "pending") continue;
    const eventKey = `daily_manual:${id}:${target.memberId}`;
    const existing = await db.prepare("SELECT id FROM slack_bot_deliveries WHERE owner_id = ? AND bot_kind = 'daily_manual' AND event_key = ?")
      .bind(ownerId, eventKey).first();
    if (existing) continue;
    try {
      const link = await db.prepare(`SELECT l.dm_channel_id, l.team_id FROM slack_member_links l
        JOIN workspace_members m ON m.workspace_id = l.owner_id AND m.id = l.member_id AND m.status = 'active'
        JOIN slack_connections c ON c.owner_id = l.owner_id AND c.team_id = l.team_id
        JOIN slack_daily_manual_runs r ON r.owner_id = l.owner_id AND r.id = ?
        JOIN workspace_members actor ON actor.workspace_id = r.owner_id AND actor.user_id = r.created_by_user_id
          AND actor.status = 'active' AND actor.role IN ('owner','admin')
        WHERE l.owner_id = ? AND l.member_id = ? AND l.slack_user_id = ?`)
        .bind(id, ownerId, target.memberId, target.slackUserId).first<{ dm_channel_id: string; team_id: string }>();
      const connection = await getSlackConnection(ownerId);
      if (!link || !connection) throw new Error("활성 워크스페이스 멤버의 Slack 연결이 필요합니다.");
      const channel = await ensureDmChannel(await slackTokenForConnection(connection), target.slackUserId, link.dm_channel_id, AbortSignal.timeout(5_000));
      await db.prepare("UPDATE slack_member_links SET dm_channel_id = ? WHERE owner_id = ? AND member_id = ? AND slack_user_id = ? AND team_id = ?")
        .bind(channel, ownerId, target.memberId, target.slackUserId, link.team_id).run();
      const t = await serverTranslator(await memberMessageLanguage(db, ownerId, target.memberId));
      await deliverSlackBotMessage(db, { ownerId, botKind: "daily_manual", subjectId: `${id}/${target.memberId}`, eventKey,
        payload: { channel, text: `[${t("데일리 봇")}] ${t("오늘의 데일리를 작성해 주세요.")}`, blocks: dailyReminderBlocks(`okri_daily_reminder:manual:${id}:${target.memberId}`, t) }, expiresAt: run.expires_at });
    } catch {
      await db.prepare("UPDATE slack_daily_manual_runs SET errors_json = json_set(errors_json, ?, ?) WHERE owner_id = ? AND id = ?")
        .bind(`$."${target.memberId}"`, "데일리 봇 DM을 보내지 못했습니다.", ownerId, id).run();
    }
  }
  const latest = await getDailyManualRun(db, ownerId, id);
  await db.prepare("UPDATE slack_daily_manual_runs SET status = ? WHERE owner_id = ? AND id = ?").bind(latest.status, ownerId, id).run();
}

export async function runDueDailyManualRuns(db: D1Database) {
  const startedAt = Date.now();
  const runs = await db.prepare("SELECT owner_id, id FROM slack_daily_manual_runs WHERE status = 'pending' ORDER BY created_at LIMIT 10")
    .all<{ owner_id: string; id: string }>();
  for (const run of runs.results) {
    if (Date.now() - startedAt >= 8_000) break;
    await processDailyManualRun(db, run.owner_id, run.id).catch(() => undefined);
  }
}
