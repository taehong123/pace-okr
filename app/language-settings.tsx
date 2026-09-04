"use client";

import { useEffect, useId, useState } from "react";
import { Check, LoaderCircle } from "lucide-react";
import { languages, type LanguagePreference, type LanguagePreferences } from "@/lib/language";
import { applyAccountLanguage, browserPreferredLanguage, isCurrentLanguageAccount, previewLanguage, saveAccountLanguage, t, useLanguage } from "@/lib/client-language";

export default function LanguageSettings({ userId, onDirtyChange }: { userId: string; onDirtyChange: (dirty: boolean) => void }) {
  const current = useLanguage();
  const id = useId();
  const [draft, setDraft] = useState<{ language: LanguagePreference; revision: number } | null>(null);
  const choice = draft?.language ?? current.preferences?.language ?? "ko";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<"save" | "conflict" | null>(null);
  const [saved, setSaved] = useState(false);
  const revision = draft?.revision ?? current.preferences?.revision ?? 0;
  const dirty = choice !== current.preferences?.language || Boolean(error);
  useEffect(() => { onDirtyChange(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  async function choose(value: LanguagePreference) {
    setDraft({ language: value, revision }); setError(null); setSaved(false);
    try { await previewLanguage(value === "auto" ? browserPreferredLanguage() : value); }
    catch { setError("save"); }
  }

  async function save() {
    if (busy) return;
    setBusy(true); setError(null); setSaved(false);
    try {
      const response = await fetch("/api/account/preferences", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ language: choice, revision }) });
      const data = await response.json() as { preferences?: LanguagePreferences; code?: string };
      if (!isCurrentLanguageAccount(userId)) return;
      if (!response.ok || !data.preferences) {
        if (response.status === 409) {
          const fresh = await fetch("/api/account/preferences", { cache: "no-store" });
          const value = await fresh.json() as { preferences?: LanguagePreferences };
          if (!isCurrentLanguageAccount(userId)) return;
          if (fresh.ok && value.preferences) setDraft({ language: choice, revision: value.preferences.revision });
          setError("conflict"); return;
        }
        throw new Error("save");
      }
      await saveAccountLanguage(userId, data.preferences);
      setDraft(null); setSaved(true);
    } catch { setError("save"); }
    finally { setBusy(false); }
  }

  return <section className="settings-section language-settings" aria-labelledby={`${id}-title`}>
    <h3 id={`${id}-title`}>{t("언어")}</h3>
    <label className="sr-only" htmlFor={id}>{t("언어")}</label>
    <div className="language-settings-controls">
      <select id={id} value={choice} onChange={(event) => void choose(event.target.value as LanguagePreference)} disabled={busy}>
        <option value="auto">{t("자동 선택")}</option>
        {languages.map(({ id: language, label }) => <option key={language} value={language} lang={language === "zh" ? "zh-Hans" : language}>{label}</option>)}
      </select>
      <button className="primary-action" disabled={busy || !dirty} onClick={() => void save()}>{busy && <LoaderCircle size={16} className="spin" />}{t("언어 저장")}</button>
    </div>
    <p>{t("언어는 계정에 저장되어 다른 기기에도 적용됩니다.")}</p>
    {choice === "auto" && <p>{t("현재 적용 언어: {language}", { language: languages.find((entry) => entry.id === current.language)!.label })}</p>}
    {error && <p className="language-settings-error" role="alert">{t(error === "conflict" ? "다른 기기에서 언어가 변경되었습니다. 다시 확인해 주세요." : "언어를 저장하지 못했습니다. 다시 시도해 주세요.")}</p>}
    {saved && <p role="status"><Check size={16} />{t("언어를 저장했습니다.")}</p>}
    {dirty && !busy && <button className="secondary" onClick={() => { const value = current.preferences; if (value) { setDraft(null); setError(null); void applyAccountLanguage(userId, value, { commit: true }); } }}>{t("취소")}</button>}
  </section>;
}
