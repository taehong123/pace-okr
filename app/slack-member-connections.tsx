"use client";
import { useState } from "react";
import { ChevronDown, Link2, LoaderCircle, RefreshCw } from "lucide-react";
import "./slack-member-connections.css";
import { apiError, messageValue, t } from "@/lib/client-language";

type Diagnostics = { members: Array<{ memberId: string; displayName: string; email: string; reason: string; message: string }>;
  availableUsers: Array<{ id: string; displayName: string; email: string }> };

function connectionMessage(reason: string) {
  if (reason === "connected") return t("연결됨");
  if (reason === "email_missing") return t("OKRPTR 이메일이 없습니다.");
  if (reason === "email_not_found") return t("같은 이메일의 Slack 계정을 찾지 못했습니다. 이메일이 다르거나 Slack 이메일이 공개되지 않았을 수 있습니다.");
  if (reason === "email_ambiguous") return t("같은 이메일이 여러 계정에 등록돼 자동 연결을 보류했습니다.");
  if (reason === "already_linked") return t("해당 Slack 계정이 다른 멤버에게 연결돼 있습니다.");
  if (reason === "email_match_pending") return t("이메일이 일치하지만 아직 연결되지 않았습니다.");
  if (reason === "slack_account_inactive") return t("연결됐던 Slack 계정이 비활성화됐거나 이 워크스페이스에서 확인되지 않습니다.");
  return t("연결 상태를 확인해 주세요.");
}

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
      const next = await response.json() as Diagnostics & { error?: string; messageCode?: string; messageValues?: Record<string, string | number> };
      if (!response.ok) throw new Error(apiError(next, "Slack 연결 상태를 확인하지 못했습니다."));
      setData(next); setConfirming(null);
      if (payload) onChanged();
    } catch (cause) { setError(cause instanceof Error ? cause.message : t("Slack 연결을 확인하지 못했습니다.")); }
    finally { setBusy(false); }
  }
  return <section className="slack-member-repair">
    <button type="button" className="secondary" aria-expanded={open} onClick={() => { setOpen(!open); if (!open && !data) void load(); }}><Link2 size={16} />{t("Slack 멤버 연결 확인")}<ChevronDown size={16} /></button>
    {open && <div>
      {busy && <p role="status"><LoaderCircle className="spin" size={16} /> {t("연결 상태 확인 중")}</p>}
      {error && <p role="alert">{error}</p>}
      <button type="button" className="secondary" disabled={busy} onClick={() => void load()}><RefreshCw size={16} />{t("새로고침")}</button>
      {data?.members.some((m) => m.reason === "email_match_pending") && <button type="button" className="primary-action" disabled={busy} onClick={() => void load({ action: "sync" })}><Link2 size={16} />{t("이메일 일치 계정 연결")}</button>}
      {data?.members.map((member) => <div className="slack-member-repair-row" key={member.memberId}>
        <div><b>{member.displayName}</b><span>{member.email || t("이메일 없음")}</span><p>{connectionMessage(member.reason)}</p></div>
        {member.reason !== "connected" && member.reason !== "slack_account_inactive" && <div>
          <label><span>{t("연결할 Slack 계정")}</span><select aria-label={t("{value1} Slack 계정", { value1: messageValue(member.displayName) })} value={choices[member.memberId] || ""} disabled={busy} onChange={(event) => { setChoices({ ...choices, [member.memberId]: event.target.value }); setConfirming(null); }}>
            <option value="">{t("계정 선택")}</option>{data.availableUsers.map((user) => <option key={user.id} value={user.id}>{user.displayName} · {user.email || t("이메일 비공개")}</option>)}
          </select></label>
          {confirming === member.memberId ? <div role="group" aria-label={t("Slack 계정 연결 확인")}><p>{t("{member} 님을 {slackUser} Slack 계정과 연결할까요?", { member: member.displayName, slackUser: data.availableUsers.find((u) => u.id === choices[member.memberId])?.displayName ?? "" })}</p>
            <button type="button" className="primary-action" disabled={busy} onClick={() => void load({ action: "link", memberId: member.memberId, slackUserId: choices[member.memberId], confirmed: true })}>{t("확인 후 연결")}</button>
            <button type="button" className="secondary" disabled={busy} onClick={() => setConfirming(null)}>{t("취소")}</button></div>
            : <button type="button" className="secondary" disabled={busy || !choices[member.memberId]} onClick={() => setConfirming(member.memberId)}><Link2 size={16} />{t("계정 연결")}</button>}
        </div>}
      </div>)}
    </div>}
  </section>;
}
