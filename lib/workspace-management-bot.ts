import { env } from "cloudflare:workers";
import { getSlackConnection } from "@/lib/pace-data";
import { listSlackChannels, slackApi, slackTokenForConnection, type SlackDailyChannel } from "@/lib/slack-daily";

export const managementBotSignalIds = [
  "missing_due_date",
  "missing_owner",
  "overdue",
  "completed_yesterday",
  "due_today",
] as const;

export type ManagementBotSignal = (typeof managementBotSignalIds)[number];
export type ManagementBotItem = {
  id: string;
  kind: "project" | "task";
  title: string;
  status: string;
  dueDate: string | null;
};
export type ManagementBotGroup = { signal: ManagementBotSignal; count: number; items: ManagementBotItem[] };
export type ManagementBotSettings = {
  enabled: boolean;
  weekdays: number[];
  reportTime: string;
  timezone: string;
  channelId: string;
  channelName: string;
  signals: ManagementBotSignal[];
  lastSentDate: string | null;
  lastSentAt: string | null;
  lastError: string;
  updatedAt: string | null;
};

type RuntimeEnv = {
  DB: D1Database;
  OKRI_APP_URL?: string;
  OKRPTR_APP_URL?: string;
};

type ItemRow = Record<string, string | number | null>;

const completedStatuses = new Set(["done", "development_done"]);
const inactiveStatuses = new Set([...completedStatuses, "archived"]);
const defaultSignals = [...managementBotSignalIds];

export async function getWorkspaceManagementBot(ownerId: string, options: { includeChannels?: boolean; includeSnapshot?: boolean; date?: string; snapshotSignals?: ManagementBotSignal[] } = {}) {
  const settings = await readSettings(ownerId);
  const snapshot = options.includeSnapshot === false
    ? undefined
    : await collectWorkspaceManagementSnapshot(ownerId, options.date, settings.timezone, options.snapshotSignals ?? settings.signals);
  const connection = await getSlackConnection(ownerId);
  const channels = options.includeChannels && connection
    ? await listSlackChannels(ownerId, { includeJoinablePublic: true })
    : [];
  return { settings, ...(snapshot ? { snapshot } : {}), slackConnected: Boolean(connection), channels };
}

export async function updateWorkspaceManagementBot(ownerId: string, input: Partial<{
  enabled: boolean;
  weekdays: number[];
  reportTime: string;
  timezone: string;
  channelId: string;
  signals: ManagementBotSignal[];
}>, options: { includeChannels?: boolean; includeSnapshot?: boolean } = { includeChannels: true, includeSnapshot: true }) {
  const current = await readSettings(ownerId);
  const enabled = input.enabled ?? current.enabled;
  const weekdays = input.weekdays === undefined ? current.weekdays : normalizeWeekdays(input.weekdays);
  const reportTime = input.reportTime === undefined ? current.reportTime : normalizeReportTime(input.reportTime);
  const timezone = input.timezone === undefined ? current.timezone : normalizeTimezone(input.timezone);
  const signals = input.signals === undefined ? current.signals : normalizeSignals(input.signals);
  const channelId = input.channelId === undefined ? current.channelId : input.channelId.trim();
  let channelName = current.channelName;
  if (channelId !== current.channelId || (enabled && !channelName)) {
    const channel = channelId ? await prepareSlackChannel(ownerId, channelId) : null;
    channelName = channel?.name ?? "";
  }
  if (enabled && !channelId) throw new Error("관리 리포트를 받을 Slack 채널을 선택해 주세요.");
  if (enabled && !(await getSlackConnection(ownerId))) throw new Error("워크스페이스 Slack을 먼저 연결해 주세요.");
  const now = new Date().toISOString();
  await (env as RuntimeEnv).DB.prepare(`INSERT INTO workspace_management_bot_settings
    (owner_id, enabled, weekdays, report_time, timezone, channel_id, channel_name, signals, last_error, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, '', ?)
    ON CONFLICT(owner_id) DO UPDATE SET enabled = excluded.enabled, weekdays = excluded.weekdays,
      report_time = excluded.report_time, timezone = excluded.timezone, channel_id = excluded.channel_id,
      channel_name = excluded.channel_name, signals = excluded.signals, last_error = '', updated_at = excluded.updated_at`)
    .bind(ownerId, enabled ? 1 : 0, JSON.stringify(weekdays), reportTime, timezone, channelId, channelName, JSON.stringify(signals), now).run();
  return getWorkspaceManagementBot(ownerId, options);
}

export async function testWorkspaceManagementBot(ownerId: string) {
  const settings = await readSettings(ownerId);
  if (!settings.channelId) throw new Error("테스트 리포트를 받을 Slack 채널을 선택해 주세요.");
  await prepareSlackChannel(ownerId, settings.channelId);
  const snapshot = await collectWorkspaceManagementSnapshot(ownerId, undefined, settings.timezone, settings.signals);
  await sendReport(ownerId, settings, snapshot, true);
  return { sent: true, snapshot };
}

export async function collectWorkspaceManagementSnapshot(ownerId: string, requestedDate?: string, timezone = "Asia/Seoul", signals: ManagementBotSignal[] = defaultSignals) {
  const date = requestedDate ? normalizeDate(requestedDate) : todayInTimezone(timezone);
  const previousDate = addDays(date, -1);
  const db = (env as RuntimeEnv).DB;
  const rows = await db.prepare(`SELECT item.id, item.kind, item.title, item.status, item.due_date,
      MAX(CASE WHEN assignment.role = 'project_dri' THEN 1 ELSE 0 END) AS has_project_dri,
      MAX(CASE WHEN assignment.role = 'task_assignee' THEN 1 ELSE 0 END) AS has_task_assignee
    FROM items AS item
    LEFT JOIN item_assignments AS assignment ON assignment.owner_id = item.owner_id AND assignment.item_id = item.id
    WHERE item.owner_id = ? AND item.kind IN ('project', 'task') AND item.archived_at IS NULL
    GROUP BY item.id, item.kind, item.title, item.status, item.due_date`)
    .bind(ownerId).all<ItemRow>();
  const allItems = rows.results.map(serializeItemRow);
  const openRows = rows.results.filter((row) => !inactiveStatuses.has(String(row.status)));
  const [previousStart, previousEnd] = zonedDayRange(previousDate, timezone);
  const activity = await db.prepare(`SELECT item_id, payload FROM activity_log
    WHERE owner_id = ? AND action = 'updated' AND created_at >= ? AND created_at < ?`)
    .bind(ownerId, previousStart, previousEnd).all<Record<string, string>>();
  const completedYesterdayIds = new Set(activity.results.flatMap((entry) => {
    try {
      const payload = JSON.parse(entry.payload) as { status?: string };
      return payload.status && completedStatuses.has(payload.status) ? [entry.item_id] : [];
    } catch { return []; }
  }));
  const bySignal: Record<ManagementBotSignal, ManagementBotItem[]> = {
    missing_due_date: openRows.filter((row) => !row.due_date).map(serializeItemRow),
    missing_owner: openRows.filter((row) => row.kind === "project" ? !row.has_project_dri : !row.has_task_assignee).map(serializeItemRow),
    overdue: openRows.filter((row) => Boolean(row.due_date && String(row.due_date) < date)).map(serializeItemRow),
    completed_yesterday: allItems.filter((item) => completedStatuses.has(item.status) && completedYesterdayIds.has(item.id)),
    due_today: openRows.filter((row) => row.due_date === date).map(serializeItemRow),
  };
  for (const values of Object.values(bySignal)) values.sort(compareManagementItems);
  return {
    date,
    groups: signals.map((signal) => ({ signal, count: bySignal[signal].length, items: bySignal[signal].slice(0, 20) })),
    totalCount: signals.reduce((total, signal) => total + bySignal[signal].length, 0),
  };
}

export async function runDueWorkspaceManagementBots(db: D1Database, now = new Date()) {
  const settingsRows = await db.prepare("SELECT * FROM workspace_management_bot_settings WHERE enabled = 1 AND channel_id <> ''").all<Record<string, string | number | null>>();
  let sent = 0;
  let failed = 0;
  for (const row of settingsRows.results) {
    const settings = serializeSettings(row);
    const parts = zonedParts(now, settings.timezone);
    const date = `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
    const currentTime = `${pad(parts.hour)}:${pad(parts.minute)}`;
    if (!settings.weekdays.includes(localWeekday(date)) || currentTime < settings.reportTime || settings.lastSentDate === date) continue;
    try {
      const snapshot = await collectWorkspaceManagementSnapshot(String(row.owner_id), date, settings.timezone, settings.signals);
      await sendReport(String(row.owner_id), settings, snapshot, false);
      const sentAt = now.toISOString();
      await db.prepare("UPDATE workspace_management_bot_settings SET last_sent_date = ?, last_sent_at = ?, last_error = '', updated_at = ? WHERE owner_id = ?")
        .bind(date, sentAt, sentAt, row.owner_id).run();
      sent += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "관리 리포트 전송 실패";
      await db.prepare("UPDATE workspace_management_bot_settings SET last_error = ?, updated_at = ? WHERE owner_id = ?")
        .bind(message.slice(0, 500), now.toISOString(), row.owner_id).run();
      failed += 1;
    }
  }
  return { sent, failed };
}

async function readSettings(ownerId: string): Promise<ManagementBotSettings> {
  const row = await (env as RuntimeEnv).DB.prepare("SELECT * FROM workspace_management_bot_settings WHERE owner_id = ? LIMIT 1")
    .bind(ownerId).first<Record<string, string | number | null>>();
  return row ? serializeSettings(row) : {
    enabled: false,
    weekdays: [1, 2, 3, 4, 5],
    reportTime: "09:00",
    timezone: "Asia/Seoul",
    channelId: "",
    channelName: "",
    signals: [...defaultSignals],
    lastSentDate: null,
    lastSentAt: null,
    lastError: "",
    updatedAt: null,
  };
}

async function prepareSlackChannel(ownerId: string, channelId: string): Promise<SlackDailyChannel> {
  const connection = await getSlackConnection(ownerId);
  if (!connection) throw new Error("워크스페이스 Slack을 먼저 연결해 주세요.");
  const available = await listSlackChannels(ownerId, { includeJoinablePublic: true });
  const channel = available.find((entry) => entry.id === channelId);
  if (!channel) throw new Error("공개 채널 또는 봇이 참여한 비공개 채널만 선택할 수 있습니다.");
  if (!channel.isPrivate && !channel.isMember) {
    const token = await slackTokenForConnection(connection);
    await slackApi(token, "conversations.join", { channel: channel.id });
  }
  return { ...channel, isMember: true };
}

async function sendReport(ownerId: string, settings: ManagementBotSettings, snapshot: Awaited<ReturnType<typeof collectWorkspaceManagementSnapshot>>, test: boolean) {
  const connection = await getSlackConnection(ownerId);
  if (!connection) throw new Error("워크스페이스 Slack 연결이 필요합니다.");
  const token = await slackTokenForConnection(connection);
  const workspace = await (env as RuntimeEnv).DB.prepare("SELECT name FROM workspaces WHERE id = ? LIMIT 1").bind(ownerId).first<{ name: string }>();
  const selected = snapshot.groups.filter((group) => group.count > 0);
  const body = selected.length
    ? selected.map((group) => `*${signalLabel(group.signal)} · ${group.count}개*\n${group.items.slice(0, 5).map((item) => `• ${escapeSlack(item.title)} _(${item.kind === "project" ? "Project" : "Task"})_`).join("\n")}${group.count > 5 ? `\n_외 ${group.count - 5}개_` : ""}`).join("\n\n")
    : "현재 선택한 관리 항목은 모두 정리되어 있습니다. ✅";
  const runtime = env as RuntimeEnv;
  const appUrl = `${String(runtime.OKRI_APP_URL || runtime.OKRPTR_APP_URL || "https://okri.ai").replace(/\/$/, "")}/?settings=workspace&tab=summary`;
  await slackApi(token, "chat.postMessage", {
    channel: settings.channelId,
    text: `[관리 봇] ${workspace?.name || "OKRI"} 워크스페이스 관리 리포트 · ${snapshot.date}`,
    unfurl_links: false,
    blocks: [
      { type: "header", text: { type: "plain_text", text: `${test ? "테스트 · " : ""}관리 봇 · 워크스페이스 관리 리포트`.slice(0, 150) } },
      { type: "context", elements: [{ type: "mrkdwn", text: `*${escapeSlack(workspace?.name || "OKRI")}* · ${snapshot.date}` }] },
      { type: "section", text: { type: "mrkdwn", text: body.slice(0, 2900) } },
      { type: "actions", elements: [{ type: "button", text: { type: "plain_text", text: "OKRI에서 정리" }, url: appUrl }] },
    ],
  });
}

function serializeSettings(row: Record<string, string | number | null>): ManagementBotSettings {
  return {
    enabled: Boolean(row.enabled),
    weekdays: parseWeekdays(String(row.weekdays || "")),
    reportTime: normalizeReportTime(String(row.report_time || "09:00")),
    timezone: normalizeTimezone(String(row.timezone || "Asia/Seoul")),
    channelId: String(row.channel_id || ""),
    channelName: String(row.channel_name || ""),
    signals: parseSignals(String(row.signals || "")),
    lastSentDate: row.last_sent_date ? String(row.last_sent_date) : null,
    lastSentAt: row.last_sent_at ? String(row.last_sent_at) : null,
    lastError: String(row.last_error || ""),
    updatedAt: row.updated_at ? String(row.updated_at) : null,
  };
}

function serializeItemRow(row: ItemRow): ManagementBotItem {
  return { id: String(row.id), kind: row.kind === "project" ? "project" : "task", title: String(row.title), status: String(row.status), dueDate: row.due_date ? String(row.due_date) : null };
}

function compareManagementItems(left: ManagementBotItem, right: ManagementBotItem) {
  if (left.dueDate && right.dueDate && left.dueDate !== right.dueDate) return left.dueDate.localeCompare(right.dueDate);
  if (left.dueDate) return -1;
  if (right.dueDate) return 1;
  return left.title.localeCompare(right.title, "ko");
}

function normalizeSignals(values: ManagementBotSignal[]) {
  const supported = new Set<ManagementBotSignal>(managementBotSignalIds);
  const signals = [...new Set(values)].filter((value): value is ManagementBotSignal => supported.has(value));
  if (!signals.length) throw new Error("관리 항목을 하나 이상 선택해 주세요.");
  return signals;
}

function parseSignals(value: string) {
  try { return normalizeSignals(JSON.parse(value) as ManagementBotSignal[]); } catch { return [...defaultSignals]; }
}

function normalizeWeekdays(values: number[]) {
  const days = [...new Set(values.map(Number).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))].sort();
  if (!days.length) throw new Error("리포트 요일을 하나 이상 선택해 주세요.");
  return days;
}

function parseWeekdays(value: string) {
  try { return normalizeWeekdays(JSON.parse(value) as number[]); } catch { return [1, 2, 3, 4, 5]; }
}

function normalizeReportTime(value: string) {
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) throw new Error("리포트 시간은 HH:mm 형식이어야 합니다.");
  return value;
}

function normalizeTimezone(value: string) {
  try { new Intl.DateTimeFormat("en-US", { timeZone: value }).format(); } catch { throw new Error("올바른 시간대를 선택해 주세요."); }
  return value;
}

function normalizeDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) throw new Error("올바른 날짜가 필요합니다.");
  return value;
}

function addDays(value: string, amount: number) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function zonedDayRange(value: string, timezone: string) {
  const [year, month, day] = value.split("-").map(Number);
  const start = zonedDateTimeToEpoch({ year, month, day, hour: 0, minute: 0 }, timezone);
  const next = addDays(value, 1).split("-").map(Number);
  const end = zonedDateTimeToEpoch({ year: next[0], month: next[1], day: next[2], hour: 0, minute: 0 }, timezone);
  return [new Date(start).toISOString(), new Date(end).toISOString()] as const;
}

function zonedDateTimeToEpoch(parts: { year: number; month: number; day: number; hour: number; minute: number }, timezone: string) {
  let guess = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
  for (let iteration = 0; iteration < 3; iteration += 1) {
    const actual = zonedParts(new Date(guess), timezone);
    guess += Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute) - Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute);
  }
  return guess;
}

function zonedParts(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return { year: value("year"), month: value("month"), day: value("day"), hour: value("hour"), minute: value("minute") };
}

function todayInTimezone(timezone: string) {
  const parts = zonedParts(new Date(), timezone);
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

function localWeekday(value: string) {
  return new Date(`${value}T00:00:00Z`).getUTCDay();
}

function pad(value: number) { return String(value).padStart(2, "0"); }
function escapeSlack(value: string) { return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function signalLabel(signal: ManagementBotSignal) {
  return { missing_due_date: "기한 없음", missing_owner: "DRI·담당자 없음", overdue: "기한 초과", completed_yesterday: "어제 완료", due_today: "오늘 마감" }[signal];
}
