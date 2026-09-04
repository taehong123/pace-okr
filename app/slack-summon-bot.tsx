"use client";

import { Copy } from "lucide-react";
import { slackSummonUsage, slackProjectUsage } from "@/lib/slack-summon-command";
import "./slack-summon-bot.css";

export default function SlackSummonBot({ onNotice }: { onNotice: (message: string) => void }) {
  async function copy(command: string) {
    try {
      await navigator.clipboard.writeText(command);
      onNotice("명령어를 복사했습니다.");
    } catch {
      onNotice("복사하지 못했습니다. 명령어를 직접 선택해 주세요.");
    }
  }

  return <div className="slack-summon-settings">
    <dl className="slack-summon-commands">
      {[{ label: "Task 생성", command: slackSummonUsage }, { label: "프로젝트 생성", command: slackProjectUsage }, { label: "명령어 목록", command: "!소환봇" }].map(({ label, command }) => <div key={command}>
        <dt>{label}</dt><dd><code>{command}</code><button type="button" aria-label={`${label} 명령 복사`} title="명령 복사" onClick={() => void copy(command)}><Copy size={14} /></button></dd>
      </div>)}
    </dl>
    <dl className="slack-summon-details">
      <div><dt>다른 명령어</dt><dd><code>!태스크생성</code>, <code>!task</code>, <code>!project</code></dd></div>
      <div><dt>Task 위치</dt><dd>일반 루틴 · Task</dd></div>
      <div><dt>Project 위치</dt><dd>입력창에서 선택한 Initiative</dd></div>
      <div><dt>Project 속성</dt><dd>상태 · 우선순위 · 주기 · 기한 · DRI · 하위 업무자 · 사용자 지정 속성</dd></div>
      <div><dt>호출 위치</dt><dd>봇이 참여한 채널 · 스레드 · DM</dd></div>
      <div><dt>실행 권한</dt><dd>계정이 연결된 Owner · Admin · Member</dd></div>
      <div><dt>편집 제한</dt><dd>워크스페이스의 편집자 설정 적용</dd></div>
    </dl>
  </div>;
}
