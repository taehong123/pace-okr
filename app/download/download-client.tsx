"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, Check, Download, ExternalLink, Laptop, LoaderCircle } from "lucide-react";
import type { AppInstallStatus } from "@/lib/app-install";
import { t } from "@/lib/client-language";
import styles from "./download.module.css";

type Platform = "windows" | "mac";

const platformCopy = {
  windows: {
    name: "OKRI for Windows",
    summary: "Chrome 또는 Edge가 OKRI 전용 창과 시작 메뉴 바로가기를 만듭니다.",
    steps: [
      "Chrome 또는 Edge에서 이 페이지를 엽니다.",
      "아래 설치 버튼을 누르거나 주소창의 설치 아이콘을 선택합니다.",
      "브라우저 확인 창에서 설치를 선택합니다.",
    ],
    help: "Chrome 설치 도움말",
    helpUrl: "https://support.google.com/chrome/answer/9658361?co=GENIE.Platform%3DDesktop&hl=ko",
    action: "Windows에 OKRI 설치",
  },
  mac: {
    name: "OKRI for Mac",
    summary: "Chrome 또는 Safari가 OKRI 전용 창과 Dock 바로가기를 만듭니다.",
    steps: [
      "Chrome 또는 Safari에서 이 페이지를 엽니다.",
      "Chrome은 아래 설치 버튼을, Safari는 파일 > Dock에 추가를 선택합니다.",
      "브라우저 확인 창에서 추가 또는 설치를 선택합니다.",
    ],
    help: "Safari 설치 도움말",
    helpUrl: "https://support.apple.com/ko-kr/104996",
    action: "Mac에 OKRI 설치",
  },
} as const;

export function DownloadClient() {
  const [status, setStatus] = useState<AppInstallStatus>("unavailable");
  const [detected, setDetected] = useState<Platform | null>(null);
  const [selectedPlatform, setSelectedPlatform] = useState<Platform | null>(null);
  const platform = selectedPlatform ?? detected ?? "windows";

  useEffect(() => {
    let active = true;
    const syncStatus = () => { if (active) setStatus(window.__OKRI_INSTALL__?.status ?? "unavailable"); };
    queueMicrotask(() => {
      if (!active) return;
      setDetected(/Macintosh/i.test(navigator.userAgent) ? "mac" : /Windows/i.test(navigator.userAgent) ? "windows" : null);
      syncStatus();
    });
    window.addEventListener("okri:installchange", syncStatus);
    return () => {
      active = false;
      window.removeEventListener("okri:installchange", syncStatus);
    };
  }, []);

  const copy = platformCopy[platform];
  const promptReady = status === "ready";
  const busy = status === "prompting" || status === "accepted";

  function selectPlatform(next: Platform) {
    setSelectedPlatform(next);
    document.getElementById(`platform-${next}`)?.focus();
  }

  function onPlatformKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    selectPlatform(platform === "windows" ? "mac" : "windows");
  }

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <Link href="/" className={styles.back}>
          <ArrowLeft size={18} aria-hidden="true" />
          <span>{t("OKRI로 돌아가기")}</span>
        </Link>
      </header>

      <section className={styles.content} aria-labelledby="download-title">
        <div className={styles.intro}>
          <span className={styles.brand}><Laptop size={18} aria-hidden="true" /> OKRI</span>
          <h1 id="download-title">{t("OKRI 데스크톱 앱")}</h1>
          <p>{t("설치 방법을 먼저 확인하고 준비되면 진행하세요.")}</p>
          <p className={styles.notice}>{t("파일은 자동으로 다운로드되지 않습니다.")}</p>
        </div>

        <div
          className={styles.platformTabs}
          role="tablist"
          tabIndex={0}
          aria-label={t("운영체제 선택")}
          onKeyDown={onPlatformKeyDown}
        >
          {(["windows", "mac"] as const).map((item) => (
            <button
              key={item}
              id={`platform-${item}`}
              type="button"
              role="tab"
              aria-selected={platform === item}
              aria-controls={`platform-panel-${item}`}
              tabIndex={platform === item ? 0 : -1}
              className={platform === item ? styles.selected : undefined}
              onClick={() => setSelectedPlatform(item)}
            >
              {item === "windows" ? "Windows" : "Mac"}
              {detected === item ? <span>{t("현재 기기")}</span> : null}
            </button>
          ))}
        </div>

        <div
          id={`platform-panel-${platform}`}
          role="tabpanel"
          aria-labelledby={`platform-${platform}`}
          className={styles.guide}
        >
          <div className={styles.guideHeading}>
            <div>
              <h2>{copy.name}</h2>
              <p>{t(copy.summary)}</p>
            </div>
            <span className={styles.format}>{t("브라우저 앱")}</span>
          </div>

          <ol className={styles.steps}>
            {copy.steps.map((step) => <li key={step}>{t(step)}</li>)}
          </ol>

          <div className={styles.status} aria-live="polite">
            {status === "installed" ? (
              <><Check size={18} aria-hidden="true" /><span>{t("이 기기에 이미 설치되어 있습니다.")}</span></>
            ) : status === "error" ? (
              <span role="alert">{t("설치 창을 열지 못했습니다. 브라우저 메뉴에서 설치해 주세요.")}</span>
            ) : !promptReady && !busy ? (
              <span>{t("설치 버튼이 보이지 않으면 브라우저 메뉴에서 설치할 수 있습니다.")}</span>
            ) : busy ? (
              <><LoaderCircle className="spin" size={18} aria-hidden="true" /><span>{t("브라우저에서 설치를 마쳐 주세요.")}</span></>
            ) : null}
          </div>

          <div className={styles.actions}>
            {status !== "installed" ? (
              <button
                type="button"
                className={styles.install}
                onClick={() => { void window.__OKRI_INSTALL__?.prompt(); }}
                disabled={!promptReady || busy}
                aria-busy={busy}
              >
                {busy ? <LoaderCircle className="spin" size={18} aria-hidden="true" /> : <Download size={18} aria-hidden="true" />}
                <span>{t(copy.action)}</span>
              </button>
            ) : null}
            <a className={styles.help} href={copy.helpUrl} target="_blank" rel="noreferrer">
              <span>{t(copy.help)}</span>
              <ExternalLink size={16} aria-hidden="true" />
            </a>
          </div>
        </div>

        <footer className={styles.footer}>
          <Link href="/">{t("웹에서 계속 사용")}</Link>
        </footer>
      </section>
    </main>
  );
}
