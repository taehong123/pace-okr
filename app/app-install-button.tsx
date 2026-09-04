"use client";

import { Download } from "lucide-react";
import { t } from "@/lib/client-language";

export function AppInstallButton({ placement = "menu" }: { placement?: "menu" | "login" }) {
  return (
    <a
      href="/download"
      className={`app-install-button ${placement === "login" ? "secondary app-install-login" : "nav-item"}`}
      aria-label={t("OKRI 앱 다운로드")}
      title={t("OKRI 앱 다운로드")}
    >
      <Download size={16} aria-hidden="true" />
      <span>{t("앱 다운로드")}</span>
    </a>
  );
}
