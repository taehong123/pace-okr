import type { Metadata } from "next";
import ProjectReviewScreen from "./review-screen";

export const metadata: Metadata = {
  title: "Project 생성 전 확인 | OKRPTR", robots: { index: false, follow: false },
  openGraph: { title: "Project 생성 전 확인 | OKRPTR", images: [] }, twitter: { images: [] },
};

export default function ProjectReviewPage() { return <ProjectReviewScreen />; }
