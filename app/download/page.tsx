import type { Metadata } from "next";
import { DownloadClient } from "./download-client";

export const metadata: Metadata = {
  title: "OKRI 앱 다운로드",
  description: "Windows와 Mac에서 OKRI를 데스크톱 앱처럼 설치하는 방법을 확인합니다.",
};

export default function DownloadPage() {
  return <DownloadClient />;
}
