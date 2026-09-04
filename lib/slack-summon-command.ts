export const slackSummonAliases = ["!테스크생성", "!태스크생성", "!task"] as const;
export const slackSummonUsage = "!테스크생성 고객 인터뷰 정리";
export const slackProjectAliases = ["!프로젝트생성", "!project"] as const;
export const slackProjectUsage = "!프로젝트생성 온보딩 개선";
export const slackSummonScopes = ["channels:history", "groups:history", "app_mentions:read"] as const;

export type SlackSummonCommand =
  | { kind: "create_task"; title: string; description: string }
  | { kind: "create_project"; title: string; description: string }
  | { kind: "help" }
  | { kind: "invalid"; message: string };

export type SlackMessageEvent = {
  type?: string;
  channel_type?: string;
  channel?: string;
  user?: string;
  text?: string;
  ts?: string;
  thread_ts?: string;
  subtype?: string;
  bot_id?: string;
  hidden?: boolean;
  blocks?: Array<{ block_id?: string }>;
};

export type SlackSummonMessage = SlackMessageEvent & { channel: string; user: string; text: string; ts: string };

export function parseSlackSummonCommand(text: string, botUserId?: string): SlackSummonCommand | null {
  let input = text.trim();
  const mention = input.match(/^<@([A-Z0-9]+)>\s*/);
  if (mention) {
    if (botUserId && mention[1] !== botUserId) return null;
    input = input.slice(mention[0].length);
  }
  const match = input.match(/^(![^\s]+)(?:[ \t]+([^\r\n]*))?(?:\r?\n([\s\S]*))?$/);
  if (!match) return null;
  const name = match[1].toLowerCase();
  if (name === "!소환봇" || name === "!okri" || name === "!okrptr") return { kind: "help" };
  const project = slackProjectAliases.some((alias) => alias === name);
  if (!project && !slackSummonAliases.some((alias) => alias === name)) return null;
  const decode = (value: string) => value.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").trim();
  const title = decode(match[2] ?? "");
  const description = decode(match[3] ?? "");
  if (!title && !project) return { kind: "help" };
  if ([...title].length > 240) return { kind: "invalid", message: "제목은 240자 이내로 입력해 주세요." };
  if (project && description.length > 3000) return { kind: "invalid", message: "프로젝트 설명은 3,000자 이내로 입력해 주세요." };
  if (description.length > 8000) return { kind: "invalid", message: "Task 설명은 8,000자 이내로 입력해 주세요." };
  if ([...(title + description)].some((char) => char.charCodeAt(0) < 32 && !["\t", "\n", "\r"].includes(char))) return { kind: "invalid", message: "제목과 설명에 사용할 수 없는 문자가 있습니다." };
  return { kind: project ? "create_project" : "create_task", title, description };
}

export function isSlackSummonMessage(event: SlackMessageEvent): event is SlackSummonMessage {
  return (event.type === "message" || event.type === "app_mention")
    && !event.subtype && !event.bot_id && !event.hidden
    && Boolean(event.channel && event.user && event.text && event.ts && /^\d+\.\d+$/.test(event.ts));
}

export function slackSummonSourceRef(teamId: string, event: SlackSummonMessage) {
  // message and app_mention deliveries share a message timestamp, not an event ID.
  return `slack:summon:${teamId}:${event.channel}:${event.ts}`;
}
