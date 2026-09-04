"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { ChevronDown, LoaderCircle, X } from "lucide-react";
import { OverlayDialog } from "./overlay-dialog";
import "./marketing-consent.css";
import { t , apiError } from "@/lib/client-language";

type Consent = {
  marketingDataConsent: boolean;
  advertisingEmailConsent: boolean;
  needsReaffirmation: boolean;
  promptShownAt?: string | null;
  promptRespondedAt?: string | null;
};
type PromptResult = { showPrompt: boolean };
const promptRequests = new Map<string, Promise<PromptResult>>();
const presentedAccounts = new Set<string>();

async function requestConsent<T>(init?: RequestInit): Promise<T> {
  const response = await fetch("/api/account/marketing-consent", {
    cache: "no-store", ...init, headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const data = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(apiError(data, "동의 설정을 저장하지 못했습니다."));
  return data;
}

function rememberDismissal(userId: string) {
  try { window.localStorage.setItem(`okrptr:marketing-consent-nudge:${userId}`, new Date().toISOString()); } catch { /* Server state remains authoritative. */ }
}

function claimPrompt(userId: string) {
  const pending = promptRequests.get(userId);
  if (pending) return pending;
  let dismissedLocally = false;
  try { dismissedLocally = Boolean(window.localStorage.getItem(`okrptr:marketing-consent-nudge:${userId}`)); } catch { /* Local storage is optional. */ }
  const request = requestConsent<PromptResult>({ method: "POST", body: JSON.stringify({ action: dismissedLocally ? "dismiss" : "claim" }) });
  promptRequests.set(userId, request);
  void request.catch(() => { if (promptRequests.get(userId) === request) promptRequests.delete(userId); });
  return request;
}

export function MarketingConsentPrompt({ userId, onNotice }: { userId: string; onNotice: (message: string) => void }) {
  const [visible, setVisible] = useState(false);
  const noticeRef = useRef(onNotice);
  useEffect(() => { noticeRef.current = onNotice; }, [onNotice]);

  useEffect(() => {
    if (!userId || presentedAccounts.has(userId)) return;
    let active = true;
    // Share the claim across StrictMode effects; the server arbitrates other tabs/devices.
    void claimPrompt(userId).then((result) => {
      if (!active || !result.showPrompt || presentedAccounts.has(userId)) return;
      presentedAccounts.add(userId);
      setVisible(true);
    }).catch(() => undefined);
    return () => { active = false; };
  }, [userId]);

  function skip() {
    setVisible(false);
    rememberDismissal(userId);
    void requestConsent<PromptResult>({ method: "POST", body: JSON.stringify({ action: "dismiss" }), keepalive: true })
      .catch(() => noticeRef.current(t("안내 응답을 기록하지 못했습니다. 수신 동의는 변경하지 않았습니다.")));
  }

  if (!visible) return null;
  return <OverlayDialog title={t("이메일 안내 수신 선택")} onRequestClose={skip} initialFocus=".consent-prompt .icon-button">
    <section className="consent-prompt">
      <header><h2>{t("이메일 안내 수신 선택")}</h2><button type="button" className="icon-button" onClick={skip} aria-label={t("수신 안내 닫기")} title={t("닫기")}><X size={18} /></button></header>
      <p>{t("선택 사항입니다. 동의하지 않아도 서비스를 이용할 수 있습니다.")}</p>
      <ConsentEditor onboarding onSkip={skip} onSaved={() => { rememberDismissal(userId); setVisible(false); }} />
    </section>
  </OverlayDialog>;
}

export function MarketingConsentSettings() {
  const [open, setOpen] = useState(false);
  const id = useId();
  return <section className="settings-section marketing-preferences">
    <button type="button" className="secondary marketing-preferences-toggle" aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => setOpen((value) => !value)}>
      <span>{t("이메일 수신 설정")}</span><ChevronDown size={16} aria-hidden="true" />
    </button>
    {open && <div id={id}><ConsentEditor /></div>}
  </section>;
}

function ConsentEditor({ onboarding = false, onSkip, onSaved }: { onboarding?: boolean; onSkip?: () => void; onSaved?: () => void }) {
  const id = useId();
  const [consent, setConsent] = useState<Consent | null>(onboarding ? { marketingDataConsent: false, advertisingEmailConsent: false, needsReaffirmation: false } : null);
  const [marketingDataConsent, setMarketingDataConsent] = useState(false);
  const [advertisingEmailConsent, setAdvertisingEmailConsent] = useState(false);
  const [state, setState] = useState<"loading" | "ready" | "saving" | "saved" | "error">(onboarding ? "ready" : "loading");
  const [message, setMessage] = useState("");
  const [attempt, setAttempt] = useState(0);
  const inFlight = useRef(false);

  useEffect(() => {
    if (onboarding) return;
    let active = true;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15_000);
    void requestConsent<{ consent: Consent }>({ signal: controller.signal }).then((data) => {
      if (!active) return;
      if (!data.consent) throw new Error(t("동의 설정을 불러오지 못했습니다."));
      setConsent(data.consent);
      setMarketingDataConsent(data.consent.marketingDataConsent);
      setAdvertisingEmailConsent(data.consent.advertisingEmailConsent);
      setState("ready");
      setMessage("");
    }).catch(() => {
      if (active) { setState("error"); setMessage(t("동의 설정을 불러오지 못했습니다.")); }
    }).finally(() => window.clearTimeout(timeout));
    return () => { active = false; window.clearTimeout(timeout); controller.abort(); };
  }, [onboarding, attempt]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!consent || inFlight.current) return;
    inFlight.current = true;
    setState("saving");
    setMessage("");
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15_000);
    try {
      const data = await requestConsent<{ consent: Consent }>({ method: "PATCH", signal: controller.signal, body: JSON.stringify({
        marketingDataConsent, advertisingEmailConsent, source: onboarding ? "onboarding" : "settings",
      }) });
      if (!data.consent) throw new Error(t("동의 설정을 저장하지 못했습니다."));
      setConsent(data.consent);
      setState("saved");
      setMessage(t("동의 설정을 저장했습니다."));
      onSaved?.();
    } catch {
      setState("error");
      setMessage(t("저장 결과를 확인하지 못했습니다. 선택한 값은 유지했습니다. 설정을 다시 열어 확인해 주세요."));
    } finally { window.clearTimeout(timeout); inFlight.current = false; }
  }

  function changed() { setState("ready"); setMessage(""); }
  if (state === "loading") return <p className="consent-state" role="status"><LoaderCircle className="spin" size={16} />{t("불러오는 중")}</p>;
  if (!consent) return <div className="consent-state"><p role="alert">{message}</p><button type="button" className="secondary" onClick={() => { setState("loading"); setAttempt((value) => value + 1); }}>{t("다시 불러오기")}</button></div>;

  return <form className="consent-form" onSubmit={(event) => void save(event)} aria-busy={state === "saving"}>
    <label className="consent-option" htmlFor={`${id}-data`} aria-label={t("마케팅 목적 개인정보 이용 설정")}>
      <input id={`${id}-data`} type="checkbox" checked={marketingDataConsent} disabled={state === "saving"} onChange={(event) => { setMarketingDataConsent(event.target.checked); changed(); }} />
      <span><b>{t("마케팅 목적 개인정보 이용 (선택)")}</b><small>{t("혜택과 프로모션 안내를 위해 가입 이메일과 서비스 이용 정보를 사용합니다.")}</small></span>
    </label>
    <label className="consent-option" htmlFor={`${id}-email`} aria-label={t("광고성 이메일 수신 설정")}>
      <input id={`${id}-email`} type="checkbox" checked={advertisingEmailConsent} disabled={state === "saving"} onChange={(event) => { setAdvertisingEmailConsent(event.target.checked); changed(); }} />
      <span><b>{t("광고성 이메일 수신 (선택)")}</b><small>{t("혜택과 프로모션 이메일을 받습니다. 내 설정이나 메일의 수신거부 링크에서 철회할 수 있습니다.")}</small></span>
    </label>
    <p className="consent-note">{t("두 동의가 모두 유효할 때만 광고 이메일을 보냅니다. 초대·결제·보안 안내는 별개입니다.")}</p>
    {!onboarding && consent.needsReaffirmation && <p className="consent-note">{t("기존 동의의 재확인 기간이 지났습니다. 다시 저장하기 전까지 광고 이메일을 보내지 않습니다.")}</p>}
    {message && <p className="consent-message" role={state === "error" ? "alert" : "status"}>{message}</p>}
    <footer>
      {onSkip && <button type="button" className="secondary consent-skip" onClick={onSkip}>{t("동의 없이 계속")}</button>}
      <button type="submit" className="primary-action" disabled={state === "saving"}>{state === "saving" ? <><LoaderCircle className="spin" size={16} />{t("저장 중")}</> : onboarding ? t("선택 저장") : t("동의 설정 저장")}</button>
    </footer>
  </form>;
}
