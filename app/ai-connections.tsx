"use client";

import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { ArrowUpRight, CheckCircle2, Copy, LoaderCircle, RefreshCw, X } from "lucide-react";
import { CLAUDE_CODE_COMMAND, PUBLIC_MCP_URL, claudeInstallUrl, effectiveIntegrationProvider, providerLabels, type IntegrationProvider } from "@/lib/integration-providers";
import { OverlayDialog, useAppConfirm } from "./overlay-dialog";
import "./ai-connections.css";
import { t , apiError , messageValue } from "@/lib/client-language";

type ProviderTab = Exclude<IntegrationProvider, "other">;
type Connection = { id: string; name: string; provider?: IntegrationProvider; lastUsedAt: string | null };
const tabs: ProviderTab[] = ["chatgpt", "claude", "claude_code"];

export default function AIConnectionsDialog({ onNotice, onClose }: { onNotice: (message: string) => void; onClose: () => void }) {
  const [tab, setTab] = useState<ProviderTab>("chatgpt");
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [creating, setCreating] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [copyMessage, setCopyMessage] = useState("");
  const [copyError, setCopyError] = useState("");
  const [revoking, setRevoking] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const id = useId();
  const confirmAction = useAppConfirm();

  const refresh = useCallback(async () => {
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    try {
      const response = await fetch("/api/integration-tokens", { signal: request.signal, cache: "no-store" });
      if (!response.ok) throw new Error("Connection status failed");
      const data = await response.json() as { connections: Connection[] };
      if (!request.signal.aborted) { setConnections(data.connections); setLoadError(false); }
    } catch {
      if (!request.signal.aborted) setLoadError(true);
    } finally {
      if (!request.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => { void refresh(); }, 0);
    const interval = window.setInterval(() => { if (!document.hidden) void refresh(); }, 5000);
    const onFocus = () => { void refresh(); };
    window.addEventListener("focus", onFocus);
    return () => { window.clearTimeout(initial); controller.current?.abort(); window.clearInterval(interval); window.removeEventListener("focus", onFocus); };
  }, [refresh]);

  function chooseTab(provider: ProviderTab) { setTab(provider); setCopyMessage(""); setCopyError(""); }
  function tabKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next: number;
    if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
    else if (event.key === "ArrowLeft") next = (index + tabs.length - 1) % tabs.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = tabs.length - 1;
    else return;
    event.preventDefault();
    chooseTab(tabs[next]);
    document.getElementById(`${id}-${tabs[next]}`)?.focus();
  }

  async function copyText(text: string, message: string) {
    setCopyError(""); setCopyMessage("");
    try { await navigator.clipboard.writeText(text); setCopyMessage(message); return true; }
    catch { setCopyError(t("복사하지 못했습니다. 클립보드 권한을 허용하고 다시 시도해 주세요.")); return false; }
  }

  async function copyPrompt() {
    setCreating(true); setCopiedPrompt(false); setCopyError(""); setCopyMessage("");
    try {
      const response = await fetch("/api/integration-tokens", { method: "POST" });
      const data = await response.json() as { prompt?: string; error?: string };
      if (!response.ok || !data.prompt) throw new Error(apiError(data, "연결 내용을 만들지 못했습니다. 다시 시도해 주세요."));
      setCopiedPrompt(await copyText(data.prompt, ""));
    } catch (error) { setCopyError(error instanceof Error ? error.message : t("연결 내용을 만들지 못했습니다.")); }
    finally { setCreating(false); }
  }

  const selected = connections.filter((connection) => effectiveIntegrationProvider(connection) === tab);
  const used = selected.some((connection) => connection.lastUsedAt);
  const claudeLinked = connections.some((connection) => effectiveIntegrationProvider(connection) === "claude");
  const status = loading ? "확인 중" : loadError ? "상태 확인 실패" : used ? "연결됨" : selected.length ? "연결 대기 · 첫 사용 전" : "연결 없음";

  async function disconnect() {
    const provider = tab;
    if (!await confirmAction({ title: t("{value1} 연결 해제", { value1: messageValue(providerLabels[provider]) }), message: t("현재 계정·워크스페이스의 {value1} 연결만 해제합니다. 다른 AI 연결은 유지됩니다.", { value1: messageValue(providerLabels[provider]) }), confirmLabel: t("연결 해제"), danger: true })) return;
    setRevoking(true);
    try {
      const response = await fetch(`/api/integration-tokens?provider=${provider}`, { method: "DELETE" });
      if (!response.ok) throw new Error(t("연결을 해제하지 못했습니다. 다시 시도해 주세요."));
      setConnections((current) => current.filter((connection) => effectiveIntegrationProvider(connection) !== provider));
      onNotice(t("{value1} 연결을 해제했습니다.", { value1: messageValue(providerLabels[provider]) }));
    } catch (error) { onNotice(error instanceof Error ? error.message : t("연결 해제 실패")); }
    finally { setRevoking(false); }
  }

  return <OverlayDialog title={t("AI 연결")} onRequestClose={onClose}>{(requestClose) => <section className="ai-connections">
    <header><div><h2>{t("AI 연결")}</h2><p>{t("내 AI에서 OKRPTR의 업무를 조회하고 관리하세요.")}</p></div><button type="button" className="icon-button" aria-label={t("AI 연결 닫기")} onClick={() => requestClose("close-button")}><X size={18} /></button></header>
    <div className="ai-connection-tabs" role="tablist" aria-label={t("연결할 AI")}>
      {tabs.map((provider, index) => <button key={provider} type="button" id={`${id}-${provider}`} role="tab" aria-controls={`${id}-panel`} aria-selected={tab === provider} tabIndex={tab === provider ? 0 : -1} onClick={() => chooseTab(provider)} onKeyDown={(event) => tabKey(event, index)}>{providerLabels[provider]}</button>)}
    </div>
    <div id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-${tab}`} className="ai-connection-panel" tabIndex={0}>
      <div className="ai-connection-heading"><h3>{providerLabels[tab]}{t("에 OKRPTR 연결")}</h3><span className="ai-connection-state">{status}</span></div>
      {tab === "chatgpt" ? <>
        <div className="ai-connection-actions"><button type="button" className="ai-primary" onClick={() => void copyPrompt()} disabled={creating}>{creating ? <LoaderCircle className="spin" size={16} /> : <Copy size={16} />}{creating ? t("복사 준비 중") : t("ChatGPT 연결 문구 복사")}</button></div>
        <div className={`ai-paste-instruction${copiedPrompt ? " copied" : ""}`} role="status" aria-live="polite">{copiedPrompt ? <CheckCircle2 size={21} /> : <Copy size={21} />}<div><strong>{copiedPrompt ? t("복사 완료! 이제 ChatGPT 대화창에 붙여넣고 전송하세요.") : t("복사한 내용을 ChatGPT 대화창에 붙여넣어 주세요.")}</strong><p>{t("브라우저 제어가 가능한 대화에서 진행해 주세요.")}</p></div></div>
        <div className="ai-connection-actions"><a href="https://chatgpt.com/" target="_blank" rel="noopener noreferrer">{t("ChatGPT 열기")}<ArrowUpRight size={15} /></a></div>
      </> : <>
        {tab === "claude_code" && <p>{t("Claude에 연결한 뒤 같은 Claude 구독 계정으로 Code에 로그인하고")}<code>/mcp</code>{t("에서 확인하세요. 지원 환경에서 연결 설정을 재사용할 수 있습니다.")}</p>}
        <div className="ai-connection-actions"><a className="ai-primary" href={claudeInstallUrl()} target="_blank" rel="noopener noreferrer">{t("Claude에 연결")}<ArrowUpRight size={16} /></a></div>
        <ol className="ai-connection-steps"><li>{t("Claude에서 미리 입력된")}<b>OKRPTR</b> {t("이름과 주소 확인")}</li><li>{t("OKRPTR 로그인 후 계정·워크스페이스와 권한 승인")}</li><li>{tab === "claude_code" ? t("Claude Code의 /mcp에서 OKRPTR 확인") : t("Claude 대화에서 OKRPTR을 켜고 업무 조회")}</li></ol>
        {tab === "claude_code" && <>
          <p className="ai-connection-note">{claudeLinked ? t("Claude 계정 연결은 있습니다. Code에서의 사용 여부는 /mcp로 확인해 주세요.") : t("Claude 계정 연결이 없다면 위 버튼부터 진행하세요.")} {t("API 키·Bedrock 등 다른 방식의 Code 로그인에서는 계정 연결을 불러오지 않습니다.")}</p>
          <details className="ai-connection-help"><summary>{t("터미널에서 직접 연결")}</summary><div><p>{t("개인 설정으로 등록되며 다른 프로젝트에서도 사용할 수 있습니다.")}</p><code className="ai-connection-command">{CLAUDE_CODE_COMMAND}</code><button type="button" onClick={() => void copyText(CLAUDE_CODE_COMMAND, t("명령을 복사했습니다. 터미널에서 실행한 뒤 Code의 /mcp에서 인증하세요."))}><Copy size={15} />{t("명령 복사")}</button><p>{t("등록 후 Claude Code에서")}<code>/mcp</code> {t("→ OKRPTR → 인증을 선택하세요. 같은 이름이 이미 있다면 기존 설정을 먼저 확인하세요. 자동 실행하거나 기존 연결을 삭제하지 않습니다.")}</p></div></details>
        </>}
        <details className="ai-connection-help"><summary>{t("직접 주소 입력·조직 관리자 안내")}</summary><div><label htmlFor={`${id}-endpoint`}>{t("OKRPTR MCP 서버 주소")}</label><input id={`${id}-endpoint`} value={PUBLIC_MCP_URL} readOnly /><button type="button" onClick={() => void copyText(PUBLIC_MCP_URL, t("주소를 복사했습니다. Claude의 커스텀 커넥터에 입력하세요."))}><Copy size={15} />{t("주소 복사")}</button><p>{t("Claude Free는 커스텀 커넥터 1개까지 지원합니다. Team·Enterprise에서는 Claude 조직 소유자의 추가 승인이 필요할 수 있습니다. OKRPTR 관리자 권한과는 별개입니다.")}</p><a href={claudeInstallUrl(true)} target="_blank" rel="noopener noreferrer">{t("Claude 조직 관리자용 연결 열기")}<ArrowUpRight size={15} /></a></div></details>
      </>}
      {copyError && <p className="ai-connection-error" role="alert">{copyError}</p>}
      {copyMessage && <p role="status" className="ai-connection-note">{copyMessage}</p>}
      {loadError && <p className="ai-connection-error" role="alert">{t("연결 상태를 불러오지 못했습니다. 기존 연결은 유지됩니다.")}</p>}
      {!loading && !loadError && <p className="ai-connection-note">{t("발급된 연결 키")}{selected.length}{t("개 · 서비스별 최대 10개")}</p>}
      <div className="ai-connection-management"><button type="button" onClick={() => void refresh()} disabled={loading}><RefreshCw size={15} />{t("상태 다시 확인")}</button>{selected.length > 0 && <button type="button" onClick={() => void disconnect()} disabled={revoking}>{revoking ? t("해제 중") : t("{value1} 연결 해제", { value1: messageValue(providerLabels[tab]) })}</button>}</div>
      <p className="ai-connection-note">{t("개인 계정 · 승인한 워크스페이스에만 연결됩니다. 버튼 클릭이나 복사만으로 연결이 완료되지는 않습니다.")}</p>
    </div>
    <footer><button type="button" onClick={() => requestClose("close-button")}>{t("닫기")}</button></footer>
  </section>}</OverlayDialog>;
}
