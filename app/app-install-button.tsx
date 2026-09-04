"use client";

import { useSyncExternalStore } from "react";
import { LoaderCircle, MonitorDown } from "lucide-react";
import type { AppInstallStatus } from "@/lib/app-install";
import { t } from "@/lib/client-language";

const subscribe = (onChange: () => void) => {
  window.addEventListener("okri:installchange", onChange);
  return () => window.removeEventListener("okri:installchange", onChange);
};
const getSnapshot = (): AppInstallStatus => window.__OKRI_INSTALL__?.status ?? "unavailable";
const getServerSnapshot = (): AppInstallStatus => "unavailable";

export function AppInstallButton({ placement = "menu" }: { placement?: "menu" | "login" }) {
  const status = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  if (status === "error") return <p className="app-install-error" role="alert">{t("설치 창을 열지 못했습니다. 새로고침 후 다시 시도해 주세요.")}</p>;
  if (status !== "ready" && status !== "prompting") return null;
  const busy = status === "prompting";
  return (
    <button
      type="button"
      className={`app-install-button ${placement === "login" ? "secondary app-install-login" : "nav-item"}`}
      onClick={() => { void window.__OKRI_INSTALL__?.prompt(); }}
      disabled={busy}
      aria-busy={busy}
      aria-label={t("OKRI 앱 설치")}
      title={t("OKRI 앱 설치")}
    >
      {busy ? <LoaderCircle className="spin" size={16} aria-hidden="true" /> : <MonitorDown size={16} aria-hidden="true" />}
      <span>{busy ? t("설치 확인 중") : t("앱 설치")}</span>
    </button>
  );
}
