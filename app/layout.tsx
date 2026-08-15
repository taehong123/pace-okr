import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const base = new URL(`${protocol}://${host}`);
  const socialImage = new URL("/og.png", base).toString();

  return {
    metadataBase: base,
    title: "Pace - 성과로 이어지는 일의 흐름",
    description: "대화로 등록하고 OKR부터 실행까지 연결하는 업무 관리 서비스",
    icons: {
      icon: "/favicon.svg",
      shortcut: "/favicon.svg",
    },
    openGraph: {
      title: "Pace - 성과로 이어지는 일의 흐름",
      description: "말하면, Objective부터 Action까지 자연스럽게 연결됩니다.",
      images: [{ url: socialImage, width: 1745, height: 909, alt: "Pace OKR workflow" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "Pace - 성과로 이어지는 일의 흐름",
      description: "말하면, Objective부터 Action까지 자연스럽게 연결됩니다.",
      images: [socialImage],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
