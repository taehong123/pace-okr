"use client";
import { useState } from "react";
import { ChevronDown, Link2, LoaderCircle, RefreshCw } from "lucide-react";
import "./slack-member-connections.css";

type Diagnostics = { members: Array<{ memberId: string; displayName: string; email: string; reason: string; message: string }>;
  availableUsers: Array<{ id: string; displayName: string; email: string }> };

export function SlackMemberConnections({ onChanged }: { onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<Diagnostics | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [confirming, setConfirming] = useState<string | null>(null);
  async function load(payload?: Record<string, unknown>) {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/slack/members", payload ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) } : undefined);
      const next = await response.json() as Diagnostics & { error?: string };
      if (!response.ok) throw new Error(next.error || "Slack 연결 상태를 확인하지 못했습니다.");
      setData(next); setConfirming(null);
      if (payload) onChanged();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Slack 연결을 확인하지 못했습니다."); }
    finally { setBusy(false); }
  }
  return <section className="slack-member-repair">
    <button type="button" className="secondary" aria-expanded={open} onClick={() => { setOpen(!open); if (!open && !data) void load(); }}><Link2 size={16} />Slack 멤버 연결 확인<ChevronDown size={16} /></button>
    {open && <div>
      {busy && <p role="status"><LoaderCircle className="spin" size={16} /> 연결 상태 확인 중</p>}
      {error && <p role="alert">{error}</p>}
      <button type="button" className="secondary" disabled={busy} onClick={() => void load()}><RefreshCw size={16} />새로고침</button>
      {data?.members.some((m) => m.reason === "email_match_pending") && <button type="button" className="primary-action" disabled={busy} onClick={() => void load({ action: "sync" })}><Link2 size={16} />이메일 일치 계정 연결</button>}
      {data?.members.map((member) => <div className="slack-member-repair-row" key={member.memberId}>
        <div><b>{member.displayName}</b><span>{member.email || "이메일 없음"}</span><p>{member.message}</p></div>
        {member.reason !== "connected" && member.reason !== "slack_account_inactive" && <div>
          <label><span>연결할 Slack 계정</span><select aria-label={`${member.displayName} Slack 계정`} value={choices[member.memberId] || ""} disabled={busy} onChange={(event) => { setChoices({ ...choices, [member.memberId]: event.target.value }); setConfirming(null); }}>
            <option value="">계정 선택</option>{data.availableUsers.map((user) => <option key={user.id} value={user.id}>{user.displayName} · {user.email || "이메일 비공개"}</option>)}
          </select></label>
          {confirming === member.memberId ? <div role="group" aria-label="Slack 계정 연결 확인"><p>{member.displayName} 님을 {data.availableUsers.find((u) => u.id === choices[member.memberId])?.displayName} Slack 계정과 연결할까요?</p>
            <button type="button" className="primary-action" disabled={busy} onClick={() => void load({ action: "link", memberId: member.memberId, slackUserId: choices[member.memberId], confirmed: true })}>확인 후 연결</button>
            <button type="button" className="secondary" disabled={busy} onClick={() => setConfirming(null)}>취소</button></div>
            : <button type="button" className="secondary" disabled={busy || !choices[member.memberId]} onClick={() => setConfirming(member.memberId)}><Link2 size={16} />계정 연결</button>}
        </div>}
      </div>)}
    </div>}
  </section>;
}
