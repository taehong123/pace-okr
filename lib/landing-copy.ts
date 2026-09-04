import { ANONYMOUS_LANGUAGE_KEY, languages, isLanguage, resolveLanguage } from "./language";
export const LANDING_LANGUAGE_KEY = ANONYMOUS_LANGUAGE_KEY;
export const landingLanguages = languages;

export type LandingLanguage = (typeof landingLanguages)[number]["id"];
export type LandingSlide = { title: string; description: string; alt: string };
type LandingCopy = {
  language: string; carousel: string; slide: string; previous: string; next: string;
  login: string; loggingIn: string; loginNote: string; loginError: string; unavailable: string;
  sample: string; google: string; intel: string; mcp: string;
  slides: readonly [LandingSlide, LandingSlide, LandingSlide, LandingSlide];
};

export function resolveLandingLanguage(saved: string | null, browserLanguages: readonly string[]): LandingLanguage {
  return isLanguage(saved) ? saved : resolveLanguage(browserLanguages);
}

export function getLandingCopy(translate: (key: string) => string): LandingCopy { return {"language": translate("안내 언어"), "carousel": translate("OKRI 소개"), "slide": translate("슬라이드"), "previous": translate("이전 슬라이드"), "next": translate("다음 슬라이드"), "login": translate("Google로 시작하기"), "loggingIn": translate("Google로 이동 중"), "loginNote": translate("기존 계정은 로그인, 처음이면 회원가입으로 이어집니다."), "loginError": translate("Google 로그인을 완료하지 못했습니다. 다시 시도해 주세요."), "unavailable": translate("Google 로그인 설정을 완료하는 중입니다."), "sample": translate("가상 데이터로 구성한 실제 제품 화면"), "google": translate("Google의 OKR 이야기"), "intel": translate("Intel의 OKR 사례"), "mcp": translate("MCP를 연결하면 사용 중인 AI 대화에서도 이어갈 수 있습니다."), "slides": [{"title": translate("세계적인 기업들이 선택한 목표 관리 방식, OKR."), "description": translate("구글과 인텔이 활용해 온 OKR. 이제 우리 팀의 일하는 방식으로 만드세요."), "alt": translate("고객 경험 개선 목표와 측정 가능한 핵심결과를 함께 보여주는 OKR 화면")}, {"title": translate("모든 일이 연결되고, 성과로 이어지는 과정이 보입니다."), "description": translate("목표부터 프로젝트, 개별 할 일까지 하나로. 지금 내가 하는 일이 팀의 어떤 성과에 기여하는지 한눈에 확인하세요."), "alt": translate("할 일에서 프로젝트, Initiative, 핵심결과와 목표까지 이어지는 업무 관계와 진행 상태")}, {"title": translate("기록은 간편하게, 실행에 더 집중하세요."), "description": translate("AI와 대화하며 업무를 정리하고, 내용을 확인한 뒤 등록하세요."), "alt": translate("대화로 정리한 프로젝트 제안의 내용을 생성 전에 확인하는 화면")}, {"title": translate("데일리를 따로 모으지 않아도, 팀의 일이 한눈에."), "description": translate("Slack 연결은 버튼 하나로 시작하세요. OKRI에 등록된 업무의 담당자·기한·진행 상황을 함께 보고, 반복 업무까지 놓치지 마세요."), "alt": translate("담당 업무의 기한과 진행 상태, 독립적인 Routine을 함께 확인하는 내 업무 화면")}]}; }
