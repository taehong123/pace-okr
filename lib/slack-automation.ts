export const SLACK_AUTOMATION_TRIGGERS = ["task_created", "task_status_changed"] as const;

export type SlackAutomationTrigger = (typeof SLACK_AUTOMATION_TRIGGERS)[number];

export type SlackAutomationContext = {
  title: string;
  status: string;
  fromStatus?: string | null;
  priority: string;
  kind: string;
  workspace: string;
};

const statusLabels: Record<string, string> = {
  backlog: "백로그",
  todo: "할 일",
  policy_discussion: "정책 논의",
  in_progress: "진행 중",
  developing: "개발 중",
  development_done: "개발 완료",
  done: "완료",
  blocked: "막힘",
  archived: "보관됨",
};

const priorityLabels: Record<string, string> = {
  low: "낮음",
  medium: "보통",
  high: "높음",
  urgent: "긴급",
};

const kindLabels: Record<string, string> = {
  objective: "목표",
  key_result: "핵심 결과",
  initiative: "이니셔티브",
  project: "프로젝트",
  task: "업무",
};

export function isSlackAutomationTrigger(value: string): value is SlackAutomationTrigger {
  return (SLACK_AUTOMATION_TRIGGERS as readonly string[]).includes(value);
}

export function defaultSlackAutomationTemplate(triggerType: SlackAutomationTrigger) {
  if (triggerType === "task_status_changed") {
    return "*{{title}}* 상태가 `{{from_status}}` → `{{status}}`로 바뀌었습니다.\n우선순위: {{priority}} · {{workspace}}";
  }
  return "새 업무가 등록되었습니다.\n*{{title}}*\n상태: {{status}} · 우선순위: {{priority}} · {{workspace}}";
}

export function renderSlackAutomationMessage(template: string, context: SlackAutomationContext) {
  const variables: Record<string, string> = {
    title: context.title,
    status: statusLabels[context.status] ?? context.status,
    from_status: context.fromStatus ? statusLabels[context.fromStatus] ?? context.fromStatus : "-",
    priority: priorityLabels[context.priority] ?? context.priority,
    kind: kindLabels[context.kind] ?? context.kind,
    workspace: context.workspace,
  };

  const message = template.replace(/{{\s*(title|status|from_status|priority|kind|workspace)\s*}}/g, (_, key: string) => escapeSlackText(variables[key] ?? ""));
  return `*업무 자동화 봇*\n${message}`;
}

export function slackAutomationMatches(input: {
  triggerType: string;
  triggerStatus: string;
}, event: {
  triggerType: SlackAutomationTrigger;
  status: string;
}) {
  if (input.triggerType !== event.triggerType) return false;
  return event.triggerType !== "task_status_changed" || !input.triggerStatus || input.triggerStatus === event.status;
}

export function normalizeSlackChannelId(value: string) {
  const channelId = value.trim();
  if (!/^[A-Z][A-Z0-9]{5,31}$/.test(channelId)) {
    throw new Error("Slack 채널 ID를 입력해 주세요. 예: C0123456789");
  }
  return channelId;
}

export async function postSlackMessage(token: string, channel: string, text: string) {
  const response = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({ channel, text, unfurl_links: false, unfurl_media: false }),
  });
  const result = await response.json() as { ok?: boolean; error?: string; ts?: string };
  if (!response.ok || !result.ok) throw new Error(slackErrorMessage(result.error));
  return { timestamp: result.ts ?? null };
}

function escapeSlackText(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function slackErrorMessage(code?: string) {
  if (code === "channel_not_found") return "채널을 찾을 수 없습니다. 채널 ID와 봇 초대 여부를 확인해 주세요.";
  if (code === "not_in_channel") return "OKRI 봇을 이 채널에 먼저 초대해 주세요.";
  if (code === "invalid_auth" || code === "token_revoked") return "Slack 연결이 만료되었습니다. 다시 연결해 주세요.";
  if (code === "missing_scope") return "Slack 앱에 메시지 전송 권한이 없습니다. 앱을 다시 연결해 주세요.";
  return `Slack 전송에 실패했습니다${code ? ` (${code})` : ""}`;
}
