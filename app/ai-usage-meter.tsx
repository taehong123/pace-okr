"use client";

import { useEffect, useState } from "react";
import { formatAiPercent, readAiUsagePercent, type AiUsage } from "@/lib/ai-usage";
import { invalidateAiUsage, loadAiUsage, type AiUsageScope } from "@/lib/ai-usage-client";
import "./ai-usage-meter.css";
import { t } from "@/lib/client-language";

export function AiUsageMeter({ usage, compact = false, loading = false }: { usage: AiUsage | null; compact?: boolean; loading?: boolean }) {
  const percent = readAiUsagePercent(usage);
  const value = percent ? `${formatAiPercent(percent.usedPercent)} 사용` : loading ? "확인 중…" : "확인 불가";
  const remaining = percent ? `${formatAiPercent(percent.remainingPercent)} 남음` : "사용량을 불러오지 못했습니다.";
  return <article className={`ai-usage-meter${compact ? " ai-usage-meter-compact" : ""}`} aria-label={t("AI 사용량")}>
    <header><span>{compact ? t("이번 달 AI 사용량") : t("AI 사용량")}</span><b>{value}</b></header>
    <div className="ai-usage-track" role="progressbar" aria-label={t("이번 달 AI 사용량")} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent?.usedPercent} aria-valuetext={percent ? `${value}, ${remaining}` : value} aria-busy={loading || undefined}>
      {percent && <i style={{ width: `${percent.usedPercent}%` }} />}
    </div>
    {!loading && <p>{remaining}{percent && percent.usedPercent >= 100 ? t(" · 한도 도달") : ""}</p>}
  </article>;
}

export function ChatAiUsage({ scope, refreshKey }: { scope: AiUsageScope; refreshKey: number }) {
  const [result, setResult] = useState<{ key: string; usage: AiUsage | null } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const key = JSON.stringify([scope.userId, scope.workspaceId, refreshKey, attempt]);
  useEffect(() => {
    let active = true;
    let resetTimer: ReturnType<typeof setTimeout> | undefined;
    async function refresh() {
      try {
        const usage = await loadAiUsage({ userId: scope.userId, workspaceId: scope.workspaceId });
        if (active) {
          setResult({ key, usage });
          clearTimeout(resetTimer);
          const untilReset = Date.parse(usage.resetsAt ?? "") - Date.now();
          if (untilReset > 0 && untilReset < 2_147_483_647) resetTimer = setTimeout(() => { invalidateAiUsage(); void refresh(); }, untilReset + 50);
        }
      } catch {
        if (active) setResult({ key, usage: null });
      }
    }
    void refresh();
    // Recheck cached data when returning to the tab, never on every keystroke.
    const onFocus = () => { if (document.visibilityState === "visible") void refresh(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => { active = false; clearTimeout(resetTimer); window.removeEventListener("focus", onFocus); document.removeEventListener("visibilitychange", onFocus); };
  }, [key, scope.userId, scope.workspaceId]);
  const loaded = result?.key === key;
  return <div className="chat-ai-usage">
    <AiUsageMeter compact usage={loaded ? result.usage : null} loading={!loaded} />
    {loaded && !result.usage && <button type="button" className="secondary" onClick={() => { invalidateAiUsage(); setAttempt((value) => value + 1); }}>{t("사용량 다시 확인")}</button>}
  </div>;
}
