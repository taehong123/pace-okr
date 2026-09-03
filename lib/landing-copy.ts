export const LANDING_LANGUAGE_KEY = "okrptr.intro-language";
export const landingLanguages = [
  { id: "ko", label: "한국어" },
  { id: "en", label: "English" },
  { id: "ja", label: "日本語" },
  { id: "zh", label: "中文" },
  { id: "es", label: "Español" },
] as const;

export type LandingLanguage = (typeof landingLanguages)[number]["id"];
export type LandingSlide = { title: string; description: string; alt: string };
type LandingCopy = {
  language: string; carousel: string; slide: string; previous: string; next: string;
  login: string; loggingIn: string; loginNote: string; loginError: string; unavailable: string;
  sample: string; google: string; intel: string; mcp: string;
  slides: readonly [LandingSlide, LandingSlide, LandingSlide, LandingSlide];
};

export function resolveLandingLanguage(saved: string | null, browserLanguages: readonly string[]): LandingLanguage {
  if (landingLanguages.some(({ id }) => id === saved)) return saved as LandingLanguage;
  for (const language of browserLanguages) {
    const base = language.toLowerCase().split(/[-_]/)[0];
    if (landingLanguages.some(({ id }) => id === base)) return base as LandingLanguage;
  }
  return "en";
}

export const landingCopy: Record<LandingLanguage, LandingCopy> = {
  ko: {
    language: "안내 언어", carousel: "OKRPTR 소개", slide: "슬라이드", previous: "이전 슬라이드", next: "다음 슬라이드",
    login: "Google로 시작하기", loggingIn: "Google로 이동 중", loginNote: "기존 계정은 로그인, 처음이면 회원가입으로 이어집니다.",
    loginError: "Google 로그인을 완료하지 못했습니다. 다시 시도해 주세요.", unavailable: "Google 로그인 설정을 완료하는 중입니다.",
    sample: "가상 데이터로 구성한 실제 제품 화면", google: "Google의 OKR 이야기", intel: "Intel의 OKR 사례",
    mcp: "MCP를 연결하면 사용 중인 AI 대화에서도 이어갈 수 있습니다.",
    slides: [
      { title: "세계적인 기업들이 선택한 목표 관리 방식, OKR.", description: "구글과 인텔이 활용해 온 OKR. 이제 우리 팀의 일하는 방식으로 만드세요.", alt: "고객 경험 개선 목표와 측정 가능한 핵심결과를 함께 보여주는 OKR 화면" },
      { title: "모든 일이 연결되고, 성과로 이어지는 과정이 보입니다.", description: "목표부터 프로젝트, 개별 할 일까지 하나로. 지금 내가 하는 일이 팀의 어떤 성과에 기여하는지 한눈에 확인하세요.", alt: "할 일에서 프로젝트, Initiative, 핵심결과와 목표까지 이어지는 업무 관계와 진행 상태" },
      { title: "기록은 간편하게, 실행에 더 집중하세요.", description: "AI와 대화하며 업무를 정리하고, 내용을 확인한 뒤 등록하세요.", alt: "대화로 정리한 프로젝트 제안의 내용을 생성 전에 확인하는 화면" },
      { title: "데일리를 따로 모으지 않아도, 팀의 일이 한눈에.", description: "Slack 연결은 버튼 하나로 시작하세요. OKRPTR에 등록된 업무의 담당자·기한·진행 상황을 함께 보고, 반복 업무까지 놓치지 마세요.", alt: "담당 업무의 기한과 진행 상태, 독립적인 Routine을 함께 확인하는 내 업무 화면" },
    ],
  },
  en: {
    language: "Guide language", carousel: "About OKRPTR", slide: "Slide", previous: "Previous slide", next: "Next slide",
    login: "Continue with Google", loggingIn: "Opening Google", loginNote: "Sign in to your account, or create one if you are new.",
    loginError: "Google sign-in could not be completed. Please try again.", unavailable: "Google sign-in is being configured.",
    sample: "Actual product screens with fictional data", google: "OKRs at Google", intel: "Intel's OKR story",
    mcp: "Connect through MCP to continue in your preferred AI conversation.",
    slides: [
      { title: "OKRs. A goal-setting framework chosen by global companies.", description: "Bring the approach used by Google and Intel into the way your team works.", alt: "An OKR screen showing a customer experience objective and measurable key results" },
      { title: "Every task connected. The path to results made visible.", description: "Connect objectives, projects, and individual tasks. See how the work you do supports your team's results.", alt: "Connected tasks, projects, initiatives, key results, and objectives with their progress" },
      { title: "Less time recording. More time doing.", description: "Organize work in an AI conversation, review the details, then create it.", alt: "A project proposal prepared in conversation and reviewed before creation" },
      { title: "See the team's work without chasing daily updates.", description: "Start connecting Slack with one button. See owners, due dates, and progress for work recorded in OKRPTR, and keep recurring routines in view.", alt: "My Work showing assigned tasks, due dates, statuses, and independent routines" },
    ],
  },
  ja: {
    language: "案内言語", carousel: "OKRPTRについて", slide: "スライド", previous: "前のスライド", next: "次のスライド",
    login: "Googleで始める", loggingIn: "Googleへ移動中", loginNote: "アカウントをお持ちの方はログイン、初めての方は新規登録に進みます。",
    loginError: "Googleログインを完了できませんでした。もう一度お試しください。", unavailable: "Googleログインの設定を準備しています。",
    sample: "架空のデータを使用した実際の製品画面", google: "GoogleのOKR", intel: "IntelのOKR事例",
    mcp: "MCPを接続すると、お使いのAIとの会話でも続けられます。",
    slides: [
      { title: "世界の企業が選んだ目標管理の方法、OKR。", description: "GoogleやIntelが活用してきたOKRを、あなたのチームの働き方に。", alt: "顧客体験の改善目標と測定可能な主要な成果を示すOKR画面" },
      { title: "すべての仕事がつながり、成果への道筋が見える。", description: "目標からプロジェクト、一つひとつのタスクまで。今の仕事がチームのどの成果につながるのか、一目で確認できます。", alt: "タスク、プロジェクト、施策、主要な成果、目標のつながりと進捗" },
      { title: "記録は手軽に。実行にもっと集中。", description: "AIとの会話で仕事を整理し、内容を確認してから登録できます。", alt: "会話からまとめたプロジェクト案を作成前に確認する画面" },
      { title: "日報を集めなくても、チームの仕事がひと目で。", description: "Slackとの接続はボタンから。OKRPTRに登録した仕事の担当者・期限・進捗をまとめて確認し、繰り返す仕事も忘れずに。", alt: "担当タスク、期限、進捗、独立したRoutineを確認する画面" },
    ],
  },
  zh: {
    language: "介绍语言", carousel: "了解OKRPTR", slide: "幻灯片", previous: "上一页", next: "下一页",
    login: "使用Google开始", loggingIn: "正在前往Google", loginNote: "已有账号可直接登录，首次使用将创建账号。",
    loginError: "未能完成Google登录，请重试。", unavailable: "正在配置Google登录。",
    sample: "使用虚构数据的真实产品界面", google: "Google的OKR实践", intel: "Intel的OKR案例",
    mcp: "连接MCP后，也可在常用的AI对话中继续管理工作。",
    slides: [
      { title: "全球企业选择的目标管理方法：OKR。", description: "将Google和Intel实践过的OKR，融入团队的日常工作。", alt: "展示客户体验目标和可衡量关键结果的OKR界面" },
      { title: "让每项工作相互连接，让成果路径清晰可见。", description: "从目标、项目到每项任务，串联起来。一眼看清手头的工作如何支持团队成果。", alt: "任务、项目、举措、关键结果和目标之间的关联及进度" },
      { title: "轻松记录，更专注于执行。", description: "通过AI对话整理工作，确认内容后再创建。", alt: "通过对话整理项目提案并在创建前确认内容的界面" },
      { title: "不用逐个收集日报，也能看清团队在做什么。", description: "点击按钮即可开始连接Slack。在OKRPTR中集中查看已登记工作的负责人、截止日期和进度，也不错过周期性任务。", alt: "查看负责的任务、截止日期、状态和独立Routine的界面" },
    ],
  },
  es: {
    language: "Idioma de la guía", carousel: "Acerca de OKRPTR", slide: "Diapositiva", previous: "Diapositiva anterior", next: "Diapositiva siguiente",
    login: "Continuar con Google", loggingIn: "Abriendo Google", loginNote: "Inicia sesión con tu cuenta o crea una si es tu primera visita.",
    loginError: "No se pudo completar el inicio de sesión con Google. Inténtalo de nuevo.", unavailable: "Estamos configurando el inicio de sesión con Google.",
    sample: "Pantallas reales del producto con datos ficticios", google: "Los OKR en Google", intel: "El caso de Intel",
    mcp: "Conecta MCP para continuar desde tu conversación de IA habitual.",
    slides: [
      { title: "OKR: un método elegido por empresas de todo el mundo.", description: "Incorpora a tu equipo el enfoque que han utilizado Google e Intel.", alt: "Una pantalla de OKR con un objetivo de experiencia del cliente y resultados clave medibles" },
      { title: "Todo el trabajo conectado. El camino a los resultados, visible.", description: "Conecta objetivos, proyectos y tareas. Comprueba cómo tu trabajo contribuye a los resultados del equipo.", alt: "Tareas, proyectos, iniciativas, resultados clave y objetivos conectados con su progreso" },
      { title: "Menos tiempo registrando. Más tiempo haciendo.", description: "Organiza el trabajo conversando con la IA, revisa los detalles y después créalo.", alt: "Una propuesta de proyecto preparada en una conversación y revisada antes de crearla" },
      { title: "El trabajo del equipo a la vista, sin recopilar informes diarios.", description: "Inicia la conexión con Slack con un botón. Consulta responsables, fechas y avances del trabajo registrado en OKRPTR, sin perder de vista las rutinas.", alt: "Mis tareas con responsables, fechas, estados y rutinas independientes" },
    ],
  },
};
