import type { Metadata } from "next";
import { DownloadClient } from "./download-client";

export const metadata: Metadata = {
  title: "Download OKRI",
  description: "Install OKRI as a desktop app on Windows or Mac.",
};

export default function DownloadPage() {
  return <DownloadClient />;
}
