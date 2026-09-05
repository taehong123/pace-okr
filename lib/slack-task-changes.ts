import { deliverSlackBotMessage } from "@/lib/slack-bot-delivery";
import { renderSlackAutomationMessage, systemAutomationTemplate } from "@/lib/slack-automation";
import { workspaceMessageLanguage } from "@/lib/language-preferences";
import { serverTranslator, type Translator } from "@/lib/server-language";

type Change = {
  id: string; owner_id: string; automation_id: string; task_id: string; channel_id: string; change_kind: string;
  task_json: string; before_json: string; after_json: string; created_at: string;
};
const labels: Record<string, string> = { title: "제목", description: "설명", status: "상태", priority: "우선순위", cadence: "주기", progress: "진행률", due_date: "기한", cycle_id: "사이클", sort_order: "순서", assignee: "담당자", checklist_title: "체크리스트", completed: "완료" };
const values: Record<string, string> = { todo: "할 일", done: "완료", archived: "삭제", backlog: "백로그", in_progress: "진행 중", blocked: "막힘", policy_discussion: "정책 논의", developing: "개발 중", development_done: "개발 완료", low: "낮음", medium: "보통", high: "높음", urgent: "긴급", daily: "매일", weekly: "매주", monthly: "매월", quarterly: "분기" };

export function taskChangeSummary(change: Pick<Change, "change_kind" | "before_json" | "after_json">, t: Translator) {
  const before = JSON.parse(change.before_json) as Record<string, unknown>;
  const after = JSON.parse(change.after_json) as Record<string, unknown>;
  const display = (value: unknown, system = false): string => {
    if (value === null || value === undefined || value === "") return t("미지정");
    const text = typeof value === "string" ? value : JSON.stringify(value);
    return (system ? t(values[text] ?? text) : text).slice(0, 240);
  };
  if (change.change_kind === "created") return t("Task 생성");
  if (change.change_kind === "deleted") return t("Task를 휴지통으로 이동했습니다.");
  if (change.change_kind === "restored") return t("Task를 휴지통에서 복구했습니다.");
  if (change.change_kind === "permanently_deleted") return t("Task를 영구 삭제했습니다.");
  if (change.change_kind === "property") {
    const parse = (value: unknown) => { try { return typeof value === "string" ? JSON.parse(value) : value; } catch { return value; } };
    return `${display(after.property_name ?? before.property_name)}: ${display(parse(before.value))} → ${display(parse(after.value))}`;
  }
  const fieldValue = (key: string, value: unknown) => key === "completed" && typeof value === "number" ? t(value ? "완료" : "할 일") : display(value, ["status", "priority", "cadence"].includes(key));
  const lines = Object.entries(labels).filter(([key]) => before[key] !== after[key]).map(([key, label]) =>
    `${t(label)}: ${fieldValue(key, before[key])} → ${fieldValue(key, after[key])}`);
  if (before.parent_id !== after.parent_id || before.routine_id !== after.routine_id) lines.push(`${t("상위 업무")}: ${display(before.parent === "General" ? t("General") : before.parent)} → ${display(after.parent === "General" ? t("General") : after.parent)}`);
  return lines.join("\n").slice(0, 2600) || t("Task 변경");
}

export async function runDueTaskChanges(db: D1Database) {
  const startedAt = Date.now();
  const changes = await db.prepare("SELECT * FROM slack_task_changes WHERE processed_at IS NULL ORDER BY created_at, rowid LIMIT 50").all<Change>();
  for (const change of changes.results) {
    if (Date.now() - startedAt >= 8_000) break;
    try {
      const rule = await db.prepare(`SELECT a.active, a.channel_id, a.trigger_type, a.message_template, a.message_template_kind, w.name
        FROM slack_automations a JOIN workspaces w ON w.id = a.owner_id AND w.scheduled_deletion_at IS NULL
        JOIN slack_connections connection ON connection.owner_id = a.owner_id
        WHERE a.owner_id = ? AND a.id = ?`).bind(change.owner_id, change.automation_id)
        .first<{ active: number; channel_id: string; trigger_type: string; message_template: string; message_template_kind: string; name: string }>();
      const expiresAt = new Date(new Date(change.created_at).getTime() + 24 * 60 * 60_000).toISOString();
      if (!rule?.active || rule.trigger_type !== "task_changed" || rule.channel_id !== change.channel_id || expiresAt <= new Date().toISOString()) {
        await db.prepare("UPDATE slack_task_changes SET processed_at = ? WHERE id = ?").bind(new Date().toISOString(), change.id).run();
        continue;
      }
      const t = await serverTranslator(await workspaceMessageLanguage(db, change.owner_id));
      const task = JSON.parse(change.task_json) as { title: string; status: string; priority: string; parent: string };
      const template = rule.message_template_kind === "custom" ? rule.message_template : systemAutomationTemplate("default", "task_changed", t);
      const message = renderSlackAutomationMessage(template, { ...task, kind: "task", workspace: rule.name,
        parent: task.parent === "General" ? t("General") : task.parent, changes: taskChangeSummary(change, t) }, t);
      const eventKey = `task_change:${change.id}`;
      await db.prepare(`INSERT INTO slack_automation_deliveries (id, owner_id, automation_id, item_id, event_key, trigger_type, channel_id, message, status, created_at)
        VALUES (?, ?, ?, (SELECT id FROM items WHERE owner_id = ? AND id = ?), ?, 'task_changed', ?, ?, 'pending', ?)
        ON CONFLICT(event_key) DO NOTHING`)
        .bind(change.id, change.owner_id, change.automation_id, change.owner_id, change.task_id, eventKey, change.channel_id, message, change.created_at).run();
      // The outbox and delivery share an ID. A crash between these steps can resume without sending twice.
      const stored = await db.prepare("SELECT message FROM slack_automation_deliveries WHERE id = ? AND owner_id = ?")
        .bind(change.id, change.owner_id).first<{ message: string }>();
      await deliverSlackBotMessage(db, { ownerId: change.owner_id, botKind: "automation", subjectId: change.id, eventKey,
        payload: { channel: change.channel_id, text: stored!.message }, expiresAt });
      await db.prepare("UPDATE slack_task_changes SET processed_at = ? WHERE id = ?").bind(new Date().toISOString(), change.id).run();
    } catch (error) { console.error("task_change_dispatch_failed", change.id, error instanceof Error ? error.message : "Unknown failure"); }
  }
  await db.prepare("DELETE FROM slack_task_changes WHERE created_at < ? AND processed_at IS NOT NULL")
    .bind(new Date(Date.now() - 7 * 24 * 60 * 60_000).toISOString()).run();
}
