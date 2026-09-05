import { ANONYMOUS_LANGUAGE_KEY, languages, isLanguage, resolveLanguage, formatLocale } from "./language";
export const LANDING_LANGUAGE_KEY = ANONYMOUS_LANGUAGE_KEY;
export const landingLanguages = languages;

export type LandingLanguage = (typeof landingLanguages)[number]["id"];
export type LandingExampleKind = "okr" | "connection" | "conversation" | "slack";
export type LandingSlide = { title: string; description: string; example: LandingExampleKind };
export type LandingExampleContent = {
  objective: string; keyResult: string; initiative: string; project: string; task: string; secondTask: string;
  objectiveLabel: string; keyResultLabel: string; initiativeLabel: string; projectLabel: string; taskLabel: string;
  current: string; target: string; currentValue: string; targetValue: string; inProgress: string;
  request: string; proposal: string; review: string;
  daily: string; dailyDetail: string; management: string; managementDetail: string;
  work: string; changes: string; changesDetail: string;
};
type LandingCopy = {
  language: string; carousel: string; slide: string; previous: string; next: string;
  login: string; loggingIn: string; loginNote: string; loginError: string; unavailable: string;
  sample: string; google: string; intel: string; mcp: string; slack: string;
  example: LandingExampleContent;
  slides: readonly [LandingSlide, LandingSlide, LandingSlide, LandingSlide];
};

export function resolveLandingLanguage(saved: string | null, browserLanguages: readonly string[]): LandingLanguage {
  return isLanguage(saved) ? saved : resolveLanguage(browserLanguages);
}

export function getLandingCopy(translate: (key: string) => string, language: LandingLanguage = "ko"): LandingCopy {
  const percent = new Intl.NumberFormat(formatLocale(language), { style: "percent", maximumFractionDigits: 0 });
  return {
    language: translate("안내 언어"), carousel: translate("OKRI 소개"),
    slide: translate("슬라이드"), previous: translate("이전 슬라이드"), next: translate("다음 슬라이드"),
    login: translate("Google로 시작하기"), loggingIn: translate("Google로 이동 중"),
    loginNote: translate("기존 계정은 로그인, 처음이면 가입합니다."),
    loginError: translate("Google 로그인을 완료하지 못했습니다. 다시 시도해 주세요."),
    unavailable: translate("Google 로그인 설정을 완료하는 중입니다."),
    sample: translate("사용 예시"),
    google: translate("Google의 OKR 이야기"), intel: translate("Intel의 OKR 사례"),
    mcp: translate("MCP로 사용 중인 AI에서도 이어가세요."),
    slack: translate("Slack 승인 후 알림 대상과 시간을 설정하세요."),
    example: {
      objective: translate("첫 경험을 더 쉽게"), keyResult: translate("핵심 기능 사용률"),
      initiative: translate("첫 경험의 마찰 줄이기"), project: translate("온보딩 흐름 개선"),
      task: translate("가입 안내 문구 정리"), secondTask: translate("첫 사용 흐름 검토"),
      objectiveLabel: translate("Objective"), keyResultLabel: translate("Key Result"),
      initiativeLabel: translate("Initiative"), projectLabel: translate("Project"), taskLabel: translate("Task"),
      current: translate("현재"), target: translate("목표값"), currentValue: percent.format(0.36), targetValue: percent.format(0.45),
      inProgress: translate("진행 중"), request: translate("온보딩을 개선할 프로젝트로 정리해줘."),
      proposal: translate("Project 제안"), review: translate("등록 전 검토"),
      daily: translate("데일리 봇"), dailyDetail: translate("오늘 할 일과 완료한 일"),
      management: translate("관리 봇"), managementDetail: translate("누락된 담당자·기한 확인"),
      work: translate("업무 관리 봇"), changes: translate("Task 변동 알림 봇"), changesDetail: translate("Task의 변경사항 알림"),
    },
    slides: [
      {
        title: translate("세계적인 기업들이 선택한 OKR."),
        description: translate("구글과 인텔이 활용해 온 목표 관리 방식. 이제 우리 팀에서도."),
        example: "okr",
      },
      {
        title: translate("내 일이 어떤 성과와 연결되는지."),
        description: translate("목표부터 개별 Task까지, 일의 목적과 진행 상황을 함께 보세요."),
        example: "connection",
      },
      {
        title: translate("대화로 정리하고, 확인 후 등록하세요."),
        description: translate("AI와 업무를 정리하고, 제안을 확인한 뒤 Project로 만드세요."),
        example: "conversation",
      },
      {
        title: translate("Slack 연결은 버튼 하나로."),
        description: translate("데일리 스크럼, 누락 확인, Task 생성과 변경 알림을 한곳에서."),
        example: "slack",
      },
    ],
  };
}
