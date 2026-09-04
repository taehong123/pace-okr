"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import { AlertTriangle, CreditCard, LoaderCircle, LockKeyhole } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAppConfirm } from "./overlay-dialog";

type NoticeTone = "success" | "error" | "info";
type BillingPlanId = "free" | "team" | "business";
type BillingStatusData = {
  plan: BillingPlanId;
  planLabel: string;
  status: "free" | "trialing" | "active" | "past_due" | "cancel_at_period_end" | "canceled";
  nextPlan: BillingPlanId | null;
  trialEndsAt: string | null;
  currentPeriodEndsAt: string | null;
  nextBillingAt: string | null;
  cancelAtPeriodEnd: boolean;
  graceEndsAt: string | null;
  usage: {
    projects: { used: number; limit: number | null; remaining: number | null; resetsAt: string };
    editors: { used: number; limit: number | null; remaining: number | null; enforced: boolean; graceEndsAt: string | null };
    ai: { usedWon: number; limitWon: number; remainingWon: number; resetsAt: string };
  };
  editorMembers: Array<{ id: string; displayName: string; email: string; role: string; selected: boolean; writeAllowed: boolean }>;
  paymentMethod: { id: string; cardCompany: string; maskedCard: string; createdAt: string } | null;
  transactions: Array<{ id: string; kind: string; plan: string; priceWon: number; status: string; receiptUrl: string | null; createdAt: string }>;
  canManage: boolean;
  enforcementEnabled: boolean;
  checkoutAvailable: boolean;
};

const plans: Array<{ id: BillingPlanId; label: string; price: number; projects: string; editors: string; ai: string }> = [
  { id: "free", label: "Free", price: 0, projects: "월 Project 10개", editors: "활성 편집자 3명", ai: "월 AI 500원 안전한도" },
  { id: "team", label: "Team", price: 11_000, projects: "월 Project 100개", editors: "활성 편집자 10명", ai: "월 AI 2,000원 안전한도" },
  { id: "business", label: "Business", price: 55_000, projects: "Project 무제한", editors: "활성 편집자 무제한", ai: "월 AI 10,000원 안전한도" },
];

export default function BillingView({ onNotice }: { onNotice: (message: string, tone?: NoticeTone) => void }) {
  const confirmAction = useAppConfirm();
  const [billing, setBilling] = useState<BillingStatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedPlan, setSelectedPlan] = useState<BillingPlanId>("team");
  const [contractAccepted, setContractAccepted] = useState(false);
  const [selectedEditorIds, setSelectedEditorIds] = useState<string[]>([]);
  const [working, setWorking] = useState<"checkout" | "change" | "cancel" | "refund" | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/billing/status", { cache: "no-store" });
      const data = await response.json() as BillingStatusData & { error?: string };
      if (!response.ok) throw new Error(data.error || "결제 정보를 불러오지 못했습니다.");
      setBilling(data);
      setSelectedPlan(data.plan === "free" ? "team" : data.plan);
      setSelectedEditorIds(data.editorMembers.filter((member) => member.selected).map((member) => member.id));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "결제 정보를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  async function startCheckout() {
    if (!billing?.canManage || !contractAccepted || working) return;
    setWorking("checkout");
    try {
      const response = await fetch("/api/billing/payple/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: selectedPlan, contractAccepted: true }),
      });
      const session = await response.json() as { error?: string; sessionToken?: string; authUrl?: string; merchantId?: string; returnUrl?: string };
      if (!response.ok || !session.sessionToken || !session.authUrl) throw new Error(session.error || "카드 등록을 시작하지 못했습니다.");
      await loadExternalScript(session.authUrl);
      if (!window.PaypleCpayAuthCheck) throw new Error("Payple 카드 등록 모듈을 불러오지 못했습니다.");
      window.PaypleCpayAuthCheck({
        clientKey: session.merchantId,
        PCD_PAY_TYPE: "card",
        PCD_PAY_WORK: "AUTH",
        PCD_CARD_VER: "01",
        PCD_RST_URL: session.returnUrl,
        callbackFunction: async (result: Record<string, unknown>) => {
          try {
            const billingKey = String(result.PCD_PAYER_ID || "");
            const complete = await fetch("/api/billing/payple/result", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                sessionToken: session.sessionToken,
                payerId: String(result.PCD_PAYER_NO || billingKey),
                billingKey,
                maskedCard: String(result.PCD_PAY_CARDNUM || ""),
                cardCompany: String(result.PCD_PAY_CARDNAME || ""),
                paypleTransactionId: String(result.PCD_PAY_AUTHNO || ""),
              }),
            });
            const completed = await complete.json() as { error?: string };
            if (!complete.ok) throw new Error(completed.error || "카드 등록을 완료하지 못했습니다.");
            onNotice("카드 등록과 30일 체험을 시작했습니다.", "success");
            await refresh();
          } catch (completeError) {
            onNotice(completeError instanceof Error ? completeError.message : "카드 등록을 완료하지 못했습니다.", "error");
          } finally { setWorking(null); }
        },
      }, "prod");
    } catch (checkoutError) {
      onNotice(checkoutError instanceof Error ? checkoutError.message : "카드 등록을 시작하지 못했습니다.", "error");
      setWorking(null);
    }
  }

  async function requestPlanChange(plan: BillingPlanId) {
    if (!billing?.canManage || working) return;
    const approved = await confirmAction({
      title: plan === "free" ? "Free 플랜으로 변경할까요?" : `${plans.find((entry) => entry.id === plan)?.label} 플랜으로 변경할까요?`,
      message: plan === "free" ? "현재 결제기간이 끝나면 Free 한도가 적용됩니다. 데이터와 기존 역할은 유지됩니다." : "상향은 결제 승인 후, 하향은 다음 갱신일부터 적용됩니다.",
      confirmLabel: "변경",
    });
    if (!approved) return;
    await billingAction("change", "/api/billing/change-plan", { plan }, "플랜 변경을 반영했습니다.");
  }

  async function cancel() {
    if (!billing?.canManage || working) return;
    const approved = await confirmAction({ title: "구독을 해지할까요?", message: "자동 갱신은 즉시 중단되고 현재 결제기간 끝까지 이용한 뒤 Free로 전환됩니다. 데이터는 삭제되지 않습니다.", confirmLabel: "구독 해지", danger: true });
    if (!approved) return;
    await billingAction("cancel", "/api/billing/cancel", undefined, "자동 갱신을 중단했습니다.");
  }

  async function refund() {
    if (!billing?.canManage || working) return;
    const approved = await confirmAction({ title: "첫 결제를 전액 환불할까요?", message: "첫 결제 후 7일 이내이고 결제 후 Project 생성·AI 사용이 없을 때만 가능합니다. 성공하면 즉시 Free로 전환됩니다.", confirmLabel: "환불 요청", danger: true });
    if (!approved) return;
    await billingAction("refund", "/api/billing/refund", undefined, "전액 환불하고 Free로 전환했습니다.");
  }

  async function billingAction(kind: "change" | "cancel" | "refund", url: string, body: Record<string, unknown> | undefined, successMessage: string) {
    setWorking(kind);
    try {
      const response = await fetch(url, { method: "POST", headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "요청을 처리하지 못했습니다.");
      onNotice(successMessage, "success");
      await refresh();
    } catch (actionError) {
      onNotice(actionError instanceof Error ? actionError.message : "요청을 처리하지 못했습니다.", "error");
    } finally { setWorking(null); }
  }

  async function saveEditors() {
    if (!billing?.canManage || working) return;
    setWorking("change");
    try {
      const response = await fetch("/api/billing/editors", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ memberIds: selectedEditorIds }) });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "활성 편집자를 저장하지 못했습니다.");
      onNotice("활성 편집자 선택을 저장했습니다.", "success");
      await refresh();
    } catch (saveError) {
      onNotice(saveError instanceof Error ? saveError.message : "활성 편집자를 저장하지 못했습니다.", "error");
    } finally { setWorking(null); }
  }

  if (loading) return <section className="billing-page"><div className="billing-loading" role="status"><LoaderCircle className="spin" size={20} />요금제와 사용량을 불러오는 중입니다.</div></section>;
  if (!billing) return <section className="billing-page"><div className="billing-load-error" role="alert"><CreditCard size={20} /><b>결제 정보를 불러오지 못했습니다</b><p>{error}</p><button onClick={() => void refresh()}>다시 시도</button></div></section>;

  return <section className="billing-page" aria-label="요금제 및 결제">
    <header className="billing-hero"><div><span>WORKSPACE BILLING</span><h2>{billing.planLabel} 플랜</h2><p>Slack을 포함한 모든 연동, Task, Routine, Viewer는 어떤 플랜에서도 제한하지 않습니다.</p></div><div className={`billing-status billing-status-${billing.status}`}><b>{statusLabel(billing.status)}</b><small>{billing.trialEndsAt ? `체험 종료 ${formatDate(billing.trialEndsAt)}` : billing.nextBillingAt ? `다음 결제 ${formatDate(billing.nextBillingAt)}` : "월간 정액 · VAT 포함"}</small></div></header>
    {!billing.enforcementEnabled && <div className="billing-rollout-note" role="status"><AlertTriangle size={18} /><div><b>안전한 사전 배포 상태</b><p>Payple 실결제·이메일·예약 청구·환불 검증이 끝날 때까지 Project·편집자·AI 한도는 강제하지 않습니다. 기존 기능은 그대로 사용할 수 있습니다.</p></div></div>}
    {billing.status === "past_due" && <div className="billing-alert" role="alert"><AlertTriangle size={18} /><div><b>결제를 다시 확인해 주세요</b><p>{billing.graceEndsAt ? `${formatDate(billing.graceEndsAt)}까지 현재 플랜을 유지하며 자동으로 재시도합니다.` : "결제수단을 확인해 주세요."}</p></div></div>}

    <section className="billing-usage-section"><header><div><span>이번 달</span><h3>사용량</h3></div><small>Project·AI는 한국시간 매월 1일 초기화</small></header><div className="billing-usage-grid"><Usage label="Project 생성" used={billing.usage.projects.used} limit={billing.usage.projects.limit} suffix="개" /><Usage label="활성 편집자" used={billing.usage.editors.used} limit={billing.usage.editors.limit} suffix="명" /><Usage label="AI 안전한도" used={billing.usage.ai.usedWon} limit={billing.usage.ai.limitWon} suffix="원" /></div></section>

    {billing.usage.editors.graceEndsAt && !billing.usage.editors.enforced && <div className="billing-editor-grace" role="status"><AlertTriangle size={18} /><div><b>기존 워크스페이스 편집자 정리 유예</b><p>{formatDate(billing.usage.editors.graceEndsAt)}까지 편집 권한을 정리할 수 있습니다. 그전에는 초과 멤버를 읽기 전용으로 전환하지 않습니다.</p></div></div>}

    {billing.canManage && billing.usage.editors.limit !== null && <section className="billing-editors-section"><header><div><span>DOWNGRADE SAFETY</span><h3>활성 편집자 선택</h3></div><p>한도를 넘는 멤버의 역할과 데이터는 유지되고 읽기 전용으로 전환됩니다.</p></header><div className="billing-editor-list">{billing.editorMembers.map((member) => { const checked = selectedEditorIds.includes(member.id); const owner = member.role === "owner"; const atLimit = !checked && selectedEditorIds.length >= billing.usage.editors.limit!; return <label aria-label={`${member.displayName} 활성 편집자`} className={checked ? "selected" : ""} key={member.id}><input type="checkbox" checked={checked} disabled={owner || atLimit} onChange={(event) => setSelectedEditorIds((current) => event.target.checked ? [...current, member.id] : current.filter((id) => id !== member.id))} /><span><b>{member.displayName}</b><small>{member.email || member.role} · {owner ? "Owner는 필수" : checked ? "편집 가능" : "읽기 전용"}</small></span></label>; })}</div><footer><small>{selectedEditorIds.length} / {billing.usage.editors.limit}명 선택</small><button type="button" onClick={() => void saveEditors()} disabled={Boolean(working)}>선택 저장</button></footer></section>}

    <section className="billing-plans-section"><header><div><span>MONTHLY · VAT INCLUDED</span><h3>플랜 비교</h3></div><p>연간 결제와 해외 카드는 현재 지원하지 않습니다.</p></header><div className="billing-plan-grid">{plans.map((plan) => <article className={`billing-plan-card ${billing.plan === plan.id ? "current" : ""}`} key={plan.id}><header><div><h4>{plan.label}</h4>{billing.plan === plan.id && <span>현재 플랜</span>}</div><p><b>{plan.price.toLocaleString("ko-KR")}원</b><small>/ 월</small></p></header><ul><li>{plan.projects}</li><li>{plan.editors}</li><li>{plan.ai}</li><li>Task·Routine·Viewer 무제한</li><li>Slack 등 모든 연동 포함</li></ul>{billing.canManage && billing.paymentMethod && billing.plan !== plan.id && <button type="button" onClick={() => void requestPlanChange(plan.id)} disabled={Boolean(working)}>{working === "change" ? "변경 중" : `${plan.label}로 변경`}</button>}</article>)}</div></section>

    <section className="billing-payment-section"><header><div><span>DOMESTIC CARD</span><h3>결제수단과 자동 갱신</h3></div>{billing.paymentMethod && <div className="billing-card-chip"><CreditCard size={17} /><span><b>{billing.paymentMethod.cardCompany || "등록 카드"}</b><small>{billing.paymentMethod.maskedCard}</small></span></div>}</header>
      {!billing.canManage ? <p className="billing-member-note">현재 플랜과 사용량은 모든 멤버가 볼 수 있습니다. 카드·플랜·환불 관리는 워크스페이스 Owner에게 요청해 주세요.</p>
        : !billing.checkoutAvailable ? <div className="billing-setup-note"><LockKeyhole size={18} /><div><b>결제는 아직 활성화하지 않았습니다</b><p>Payple에 okri.ai 정기결제·환불 승인을 받은 뒤 운영 보안값과 예약 청구 검증을 마치면 카드 등록 버튼이 표시됩니다. 그 전에는 Free 한도를 강제하지 않습니다.</p></div></div>
        : !billing.paymentMethod ? <div className="billing-checkout"><div><label aria-label="Team 플랜 선택"><input type="radio" name="billing-plan" checked={selectedPlan === "team"} onChange={() => setSelectedPlan("team")} />Team · 월 11,000원</label><label aria-label="Business 플랜 선택"><input type="radio" name="billing-plan" checked={selectedPlan === "business"} onChange={() => setSelectedPlan("business")} />Business · 월 55,000원</label></div><label aria-label="체험 및 자동 갱신 조건 동의" className="billing-contract"><input type="checkbox" checked={contractAccepted} onChange={(event) => setContractAccepted(event.target.checked)} /><span><b>30일 체험 및 자동 갱신 조건에 동의합니다.</b><small>오늘은 결제되지 않습니다. 체험 종료일에 선택 플랜이 결제되며, 해지는 결제기간 말에 적용됩니다. 환불 조건을 확인했습니다.</small></span></label><button type="button" onClick={() => void startCheckout()} disabled={!contractAccepted || Boolean(working)}>{working === "checkout" ? "카드 등록 중" : "국내 카드 등록하고 30일 체험"}</button></div>
        : <div className="billing-owner-actions">{billing.plan !== "free" && <button type="button" onClick={() => void cancel()} disabled={Boolean(working) || billing.cancelAtPeriodEnd}>{billing.cancelAtPeriodEnd ? "해지 예약됨" : working === "cancel" ? "해지 중" : "구독 해지"}</button>}<button type="button" onClick={() => void refund()} disabled={Boolean(working)}>{working === "refund" ? "환불 처리 중" : "첫 결제 환불 확인"}</button></div>}
    </section>

    <section className="billing-history"><header><div><span>5 YEAR RECORD</span><h3>결제 기록</h3></div><p>계약·결제·해지 기록은 관련 법령에 따라 5년간 보관합니다.</p></header>{billing.transactions.length ? <div>{billing.transactions.map((transaction) => <article key={transaction.id}><div><b>{plans.find((plan) => plan.id === transaction.plan)?.label || transaction.plan} · {transactionLabel(transaction.kind)}</b><small>{formatDateTime(transaction.createdAt)}</small></div><strong>{transaction.priceWon.toLocaleString("ko-KR")}원</strong><span>{transaction.status}</span>{transaction.receiptUrl ? <a href={transaction.receiptUrl} target="_blank" rel="noreferrer">영수증</a> : <em>영수증 없음</em>}</article>)}</div> : <p className="billing-empty-history">아직 결제 기록이 없습니다.</p>}</section>
  </section>;
}

export function ProjectQuotaBadge() {
  const [quota, setQuota] = useState<{ used: number; limit: number | null; remaining: number | null; enforcementEnabled: boolean } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/billing/status", { cache: "no-store", signal: controller.signal })
      .then(async (response) => response.ok ? response.json() as Promise<BillingStatusData> : Promise.reject())
      .then((data) => setQuota({ ...data.usage.projects, enforcementEnabled: data.enforcementEnabled }))
      .catch(() => undefined);
    return () => controller.abort();
  }, []);
  if (!quota || quota.limit === null) return null;
  const percentage = quota.limit ? Math.round((quota.used / quota.limit) * 100) : 0;
  return <Link className={`project-quota-badge ${percentage >= 100 ? "limit" : percentage >= 80 ? "warning" : ""}`} href="/?view=billing">
    <span>이번 달 Project</span><b>{quota.remaining}개 남음</b>{!quota.enforcementEnabled && <small>현재 미적용</small>}
  </Link>;
}

function Usage({ label, used, limit, suffix }: { label: string; used: number; limit: number | null; suffix: string }) {
  const percentage = limit === null || limit <= 0 ? 0 : Math.min(100, Math.round((used / limit) * 100));
  return <article className={percentage >= 100 ? "limit" : percentage >= 80 ? "warning" : ""}><header><span>{label}</span><b>{used.toLocaleString("ko-KR")}{suffix} <small>/ {limit === null ? "무제한" : `${limit.toLocaleString("ko-KR")}${suffix}`}</small></b></header><div role="progressbar" aria-label={`${label} 사용량`} aria-valuemin={0} aria-valuemax={limit ?? undefined} aria-valuenow={used}><i style={{ width: limit === null ? "0%" : `${percentage}%` }} /></div><p>{limit === null ? "제한 없음" : percentage >= 100 ? "한도 도달" : `${Math.max(0, limit - used).toLocaleString("ko-KR")}${suffix} 남음`}</p></article>;
}

function statusLabel(status: BillingStatusData["status"]) {
  return { free: "무료 사용 중", trialing: "30일 체험 중", active: "정기결제 이용 중", past_due: "결제 재시도 중", cancel_at_period_end: "해지 예약", canceled: "종료됨" }[status];
}

function transactionLabel(kind: string) {
  return ({ charge: "정기결제", prorated_upgrade: "플랜 상향", refund: "환불" } as Record<string, string>)[kind] || kind;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "short", day: "numeric" }).format(new Date(value));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function loadExternalScript(url: string) {
  return new Promise<void>((resolve, reject) => {
    const existing = Array.from(document.scripts).find((script) => script.src === new URL(url, window.location.href).toString()) as HTMLScriptElement | undefined;
    if (existing?.dataset.loaded === "true") return resolve();
    const script = existing ?? document.createElement("script");
    script.src = url;
    script.async = true;
    script.onload = () => { script.dataset.loaded = "true"; resolve(); };
    script.onerror = () => reject(new Error("Payple 모듈을 불러오지 못했습니다."));
    if (!existing) document.head.appendChild(script);
  });
}
