import type { Metadata } from "next";
import "./fonts.css";
import "./globals.css";
import "./workspace-design.css";
import "./item-editor.css";
import { themeBootstrapScript, themeCss } from "@/lib/themes";

const bootstrapScript = themeBootstrapScript + `(() => {
  const now = new Date();
  const date = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, "0"), String(now.getDate()).padStart(2, "0")].join("-");
  const path = "/api/bootstrap?date=" + encodeURIComponent(date);
  window.__OKRPTR_BOOTSTRAP_REQUEST__ = {
    path,
    request: fetch(path, { cache: "no-store", credentials: "same-origin" }).then(async (response) => ({
      ok: response.ok,
      status: response.status,
      data: await response.json().catch(() => null),
    })),
  };
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).catch(() => undefined);
    }, { once: true });
  }
})();`;

export async function generateMetadata(): Promise<Metadata> {
  const base = new URL("https://okrptr.com");

  return {
    metadataBase: base,
    title: "OKRPTR - 목표를 오늘의 실행으로",
    description: "Objective부터 Task까지 연결하고 MCP, 데일리 실행과 Routine을 관리하는 워크스페이스",
    icons: {
      icon: "/favicon.svg",
      shortcut: "/favicon.svg",
    },
    openGraph: {
      title: "OKRPTR - 목표를 오늘의 실행으로",
      description: "OKR 계층, Project, Task 데이터베이스와 Routine을 MCP 중심으로 관리합니다.",
    },
    twitter: {
      card: "summary",
      title: "OKRPTR - 목표를 오늘의 실행으로",
      description: "OKR 계층, Project, Task 데이터베이스와 Routine을 MCP 중심으로 관리합니다.",
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        <style id="okrptr-theme-colors" dangerouslySetInnerHTML={{ __html: themeCss }} />
        <script dangerouslySetInnerHTML={{ __html: bootstrapScript }} />
      </head>
      <body>
        {children}
      </body>
    </html>
  );
}
