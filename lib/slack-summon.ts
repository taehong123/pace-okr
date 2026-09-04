import { env } from "cloudflare:workers";
import type { SlackConnection } from "@/db/schema";
import { memberCanWrite } from "@/lib/billing";
import { createItem } from "@/lib/pace-data";
import { createSlackMemberLinkUrl, dailyMemberBySlack, slackApi, slackTokenForConnection } from "@/lib/slack-daily";
import { slackSummonSourceRef, slackSummonUsage, slackProjectUsage, type SlackSummonCommand, type SlackSummonMessage } from "@/lib/slack-summon-command";
import { offerSlackProjectForm } from "@/lib/slack-project-drafts";

type CreatedTask = { id: string; title: string };

export async function handleSlackSummon(connection: SlackConnection, event: SlackSummonMessage, command: SlackSummonCommand, request: Request) {
  const token = await slackTokenForConnection(connection);
  const replyContext = { channel: event.channel, thread_ts: event.thread_ts || event.ts };
  // Slack hides ephemeral replies in a thread that does not exist yet.
  const privateReply = (text: string, blocks?: unknown[]) => slackApi(token, "chat.postEphemeral", {
    channel: event.channel, ...(event.thread_ts ? { thread_ts: event.thread_ts } : {}),
    user: event.user, text, parse: "none", blocks,
  });
  if (command.kind === "help") {
    await privateReply(`Task 생성: ${slackSummonUsage}\n같은 명령: !태스크생성, !task\n프로젝트 생성: ${slackProjectUsage}\n같은 명령: !project\n프로젝트는 속성 입력 후 생성됩니다. 첫 줄은 제목, 다음 줄부터는 설명입니다.`);
    return;
  }
  if (command.kind === "invalid") {
    await privateReply(command.message);
    return;
  }

  let member: Awaited<ReturnType<typeof dailyMemberBySlack>>;
  try {
    member = await dailyMemberBySlack(connection.teamId, event.user);
    if (!member) {
      const url = await createSlackMemberLinkUrl(connection.ownerId, connection.teamId, event.user, request);
      await privateReply("OKRI 계정을 먼저 연결해 주세요. 연결 후 명령을 다시 보내면 등록됩니다.", [
        { type: "section", text: { type: "plain_text", text: "OKRI 계정 연결이 필요합니다. 연결 후 명령을 다시 보내 주세요." } },
        { type: "actions", elements: [{ type: "button", action_id: "okri_summon_link", text: { type: "plain_text", text: "계정 연결" }, url }] },
      ]);
      return;
    }
    if (member.authorization.ownerId !== connection.ownerId || !["owner", "admin", "member"].includes(member.authorization.role)) {
      await privateReply("이 워크스페이스에서 Task를 생성할 권한이 없습니다. Owner 또는 Admin에게 멤버 권한을 요청해 주세요.");
      return;
    }
    if (!await memberCanWrite(connection.ownerId, member.authorization.userId, member.authorization.role)) {
      await privateReply("현재 플랜에서 읽기 전용으로 설정된 멤버입니다. Owner 또는 Admin에게 편집 권한을 요청해 주세요.");
      return;
    }
  } catch {
    await privateReply("계정 연결 상태를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    return;
  }

  if (command.kind === "create_project") {
    try { await offerSlackProjectForm(connection, member.authorization, event, command); }
    catch { await privateReply("프로젝트 입력창을 준비하지 못했습니다. 잠시 후 명령을 다시 보내 주세요."); }
    return;
  }

  const sourceRef = slackSummonSourceRef(connection.teamId, event);
  const findCreated = () => env.DB.prepare("SELECT id, title FROM items WHERE owner_id = ? AND source_ref = ? AND kind = 'task' LIMIT 1")
    .bind(connection.ownerId, sourceRef).first<CreatedTask>();
  let task: CreatedTask | null = null;
  try {
    task = await findCreated();
    if (!task) {
      task = await createItem(connection.ownerId, {
        kind: "task", title: command.title, description: command.description,
        source: "slack", sourceRef, createdByUserId: member.authorization.userId,
      });
    }
  } catch {
    // createItem can fail after the insert (activity/notification delivery).
    // Never repeat the insert after an uncertain result.
    task = await findCreated().catch(() => null);
    if (!task) {
      await privateReply("Task 등록을 확인하지 못했습니다. OKRI의 Task 목록을 확인한 뒤 다시 시도해 주세요.");
      return;
    }
  }

  const runtime = env as unknown as { OKRI_APP_URL?: string; OKRPTR_APP_URL?: string };
  const url = new URL("/", runtime.OKRI_APP_URL || runtime.OKRPTR_APP_URL || "https://okri.ai");
  url.searchParams.set("view", "work");
  url.searchParams.set("task", task.id);
  try {
    await slackApi(token, "chat.postMessage", {
      ...replyContext, text: "Task를 등록했습니다.", parse: "none", unfurl_links: false, unfurl_media: false,
      blocks: [
        { type: "section", text: { type: "plain_text", text: `Task를 등록했습니다.\n${task.title}` } },
        { type: "actions", elements: [{ type: "button", action_id: "okri_summon_open", text: { type: "plain_text", text: "Task 열기" }, url: url.toString() }] },
      ],
    });
  } catch {
    await privateReply("Task는 등록됐지만 스레드 알림을 보내지 못했습니다. OKRI에서 확인해 주세요.");
  }
}
