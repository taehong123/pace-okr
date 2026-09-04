"use client";

import { Check } from "lucide-react";
import { THEMES, type ThemeMode } from "@/lib/themes";
import { t } from "@/lib/client-language";

export function ThemePicker({ value, onChange }: { value: ThemeMode; onChange: (mode: ThemeMode) => void }) {
  return <div className="theme-picker" role="group" aria-label={t("색상 테마")}>
    {THEMES.map(({ mode, label, description }) => <button
      type="button"
      className={value === mode ? "active" : ""}
      aria-pressed={value === mode}
      onClick={() => onChange(mode)}
      key={mode}
    >
      <i className="theme-swatch" data-theme-preview={mode} aria-hidden="true"><i /><b /><em /></i>
      <span>{t(label)}</span>
      <small>{t(description)}</small>
      {value === mode && <Check className="theme-selected-check" size={13} aria-hidden="true" />}
    </button>)}
  </div>;
}
