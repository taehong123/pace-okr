"use client";
import { useState } from "react";
import type { Language } from "@/lib/language";

// Recovery copy must be usable even when the requested dictionary is unavailable.
const recovery = {
  ko: ["언어 파일을 불러오지 못했습니다. 작업 내용은 유지됩니다.", "다시 시도"],
  en: ["Could not load this language. Your work is preserved.", "Try again"],
  ja: ["言語ファイルを読み込めませんでした。作業内容は保持されています。", "再試行"],
  zh: ["无法加载语言文件。您的工作内容已保留。", "重试"],
  es: ["No se pudo cargar el idioma. Tu trabajo se conserva.", "Reintentar"],
} satisfies Record<Language, [string, string]>;

export default function LanguageLoadError({ language, onRetry }: { language: Language; onRetry: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  return <section className="language-settings" lang={language} aria-busy={busy}>
    <p role="alert">{recovery[language][0]}</p>
    <button className="secondary" disabled={busy} onClick={() => { setBusy(true); void onRetry().catch(() => undefined).finally(() => setBusy(false)); }}>{recovery[language][1]}</button>
  </section>;
}
