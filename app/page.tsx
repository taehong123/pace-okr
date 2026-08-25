"use client";

import {
  Activity,
  Archive,
  ArrowLeft,
  ArrowDownUp,
  AtSign,
  Bell,
  Bot,
  CalendarCheck,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Columns3,
  Copy,
  Eye,
  EyeOff,
  Filter,
  Hash,
  Inbox,
  Lightbulb,
  Link2,
  ListChecks,
  Languages,
  LockKeyhole,
  LoaderCircle,
  LogIn,
  LogOut,
  Menu,
  MoreHorizontal,
  Pencil,
  Plus,
  Plug,
  Repeat2,
  RotateCcw,
  Search,
  Settings2,
  Table2,
  Target,
  TextCursorInput,
  Trash2,
  AlertTriangle,
  UserPlus,
  Users,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type KeyboardEvent as ReactKeyboardEvent } from "react";

type View = "home" | "inbox" | "work" | "routines" | "okr" | "scrum" | "recommendations" | "reviews" | "trash";
type Cadence = "daily" | "weekly" | "monthly" | "quarterly";
type ItemStatus = "inbox" | "backlog" | "todo" | "policy_discussion" | "in_progress" | "developing" | "development_done" | "done" | "blocked" | "archived";
type ItemKind = "objective" | "key_result" | "initiative" | "project" | "task";
type Priority = "low" | "medium" | "high" | "urgent";
type PropertyType = "text" | "number" | "select" | "date" | "checkbox";
type PropertyValue = string | number | boolean | null;
type RoutineCadence = "daily" | "weekly" | "monthly";
type TeamRole = "owner" | "admin" | "member" | "viewer";
type GroupColor = "gray" | "blue" | "green" | "yellow" | "orange" | "red" | "purple";
type GroupVisibility = "open" | "private";
type GroupRole = "lead" | "member";
type ProjectTab = "list" | "properties" | "archive";
type ItemAssignmentRole = "project_dri" | "project_worker" | "task_assignee";
type AuthUser = { id: string; email: string | null; displayName: string; provider: "google" | "openai" | "local" };
type AuthState = { status: "loading" | "authenticated" | "unauthenticated"; user: AuthUser | null; reason: string | null };

type ItemAssignment = {
  id: string;
  memberId: string;
  displayName: string;
  email: string;
  role: ItemAssignmentRole;
};

type OkrptrItem = {
  id: string;
  cycleId: string | null;
  parentId: string | null;
  routineId: string | null;
  kind: ItemKind;
  title: string;
  description: string;
  status: ItemStatus;
  priority: Priority;
  cadence: Cadence;
  progress: number;
  dueDate: string | null;
  source: string;
  archivedAt: string | null;
  archivedFromStatus: ItemStatus | null;
  archiveRootId: string | null;
  assignments: ItemAssignment[];
  createdAt: string;
  updatedAt: string;
};

type OkrCycle = {
  id: string;
  name: string;
  department: string;
  version: number;
  startDate: string;
  endDate: string;
  status: "planned" | "active" | "closed";
  createdAt: string;
  updatedAt: string;
};

type PropertyDefinition = {
  id: string;
  name: string;
  type: PropertyType;
  options: string[];
  sortOrder: number;
  valueCount: number;
};

type PropertyValueMap = Record<string, Record<string, PropertyValue>>;
type ProjectHiddenPropertyMap = Record<string, string[]>;
type ArchivedProject = OkrptrItem & { archivedTaskCount: number };
type ChecklistItem = { id: string; taskId: string; title: string; completed: boolean; sortOrder: number };
type Scrum = {
  date: string;
  yesterdayNote: string;
  todayNote: string;
  blockersNote: string;
  yesterdayTasks: OkrptrItem[];
  todayTasks: OkrptrItem[];
  blockers: OkrptrItem[];
  updatedAt: string | null;
};
type Recommendation = {
  id: string;
  kind: "blocked" | "overdue" | "unlinked" | "due_soon" | "empty_project";
  title: string;
  detail: string;
  itemIds: string[];
  score: number;
};
type Routine = {
  id: string;
  title: string;
  description: string;
  triggerPoint: string;
  actionPlace: string;
  actionSteps: string;
  cadence: RoutineCadence;
  active: boolean;
  sortOrder: number;
  date: string;
  completed: boolean;
  completionId: string | null;
  note: string;
};

type WorkspaceRules = {
  workspaceId: string;
  captureInstruction: string;
  structureInstruction: string;
  routineInstruction: string;
  defaultPriority: Priority;
  defaultCadence: Cadence;
  reviewBeforeCreate: boolean;
  configured: boolean;
  updatedAt: string;
};

type OnboardingPlan = {
  objective: string;
  keyResult: string;
  initiative: string;
  project: string;
  tasks: string;
  routineTitle: string;
  routineTrigger: string;
  routinePlace: string;
  routineSteps: string;
};

type OrganizedOkr = {
  assistantMessage: string;
  questions: string[];
  plan: OnboardingPlan;
};

type OrganizeError = {
  code?: string;
  error?: string;
  usage?: { spentWon?: number; budgetWon?: number; remainingWon?: number; requestsToday?: number };
  options?: string[];
};

type TeamMember = {
  id: string;
  email: string;
  displayName: string;
  role: TeamRole;
  status: "invited" | "active";
  isCurrent: boolean;
  createdAt: string;
};

type WorkspaceGroup = {
  id: string;
  name: string;
  handle: string;
  description: string;
  color: GroupColor;
  visibility: GroupVisibility;
  archived: boolean;
  memberCount: number;
  isMember: boolean;
  isLead: boolean;
  canEdit: boolean;
  canArchive: boolean;
  createdAt: string;
  updatedAt: string;
};

type GroupMember = {
  id: string;
  memberId: string;
  email: string;
  displayName: string;
  status: "invited" | "active";
  workspaceRole: TeamRole;
  groupRole: GroupRole;
  isCurrent: boolean;
  createdAt: string;
};

type TeamData = { workspace: { id: string; name: string }; members: TeamMember[]; currentRole: TeamRole; canManage: boolean };
type BootstrapData = {
  user: AuthUser;
  items: OkrptrItem[];
  properties: PropertyDefinition[];
  propertyValues: PropertyValueMap;
  hiddenByProject: ProjectHiddenPropertyMap;
  archivedProjects: ArchivedProject[];
  routines: Routine[];
  workspaces: WorkspaceSummary[];
  rules: WorkspaceRules;
  cycles: OkrCycle[];
  team: TeamData;
};
type GroupDetailData = { group: WorkspaceGroup; members: GroupMember[]; canManageMembers: boolean };
type WorkspaceSummary = { id: string; name: string; personal: boolean; role: TeamRole; current: boolean };
type GoogleConnectionStatus = {
  configured: boolean;
  connected: boolean;
  email: string | null;
  displayName: string | null;
  scope: string;
  connectedAt: string | null;
  updatedAt: string | null;
};
type SlackConnectionStatus = {
  configured: boolean;
  connected: boolean;
  teamName: string | null;
  teamId: string | null;
  botUserId: string | null;
  scope: string;
  connectedAt: string | null;
  updatedAt: string | null;
  redirectUrl: string;
  commandUrl: string;
};
type IntegrationConnection = {
  id: string;
  name: string;
  tokenPrefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
};

type TrashRecord = {
  id: string;
  category: string;
  title: string;
  itemCount: number;
  routineCount: number;
  cycleCount: number;
  archivedAt: string;
};

type IntroLanguage = "ko" | "en" | "ja" | "zh" | "es";

type IntroCopy = {
  languageLabel: string;
  eyebrow: string;
  title: string;
  description: string;
  hierarchyLabel: string;
  routineNote: string;
  points: { title: string; description: string }[];
  mcpAction: string;
  startAction: string;
};

const introLanguages: { id: IntroLanguage; label: string }[] = [
  { id: "ko", label: "한국어" },
  { id: "en", label: "English" },
  { id: "ja", label: "日本語" },
  { id: "zh", label: "中文" },
  { id: "es", label: "Español" },
];

const introCopy: Record<IntroLanguage, IntroCopy> = {
  ko: {
    languageLabel: "안내 언어",
    eyebrow: "목표를 실행으로 바꾸는 워크스페이스",
    title: "OKR이 오늘의 일로 이어지도록.",
    description: "OKRPTR은 목표, 프로젝트, 할 일과 반복 루틴을 한곳에 연결하고 대화와 봇에서도 바로 기록할 수 있는 실행 관리 서비스입니다.",
    hierarchyLabel: "목표에서 실행까지",
    routineNote: "Routine은 이 계층 밖에서 반복되는 일을 관리합니다.",
    points: [
      { title: "대화에서 바로 등록", description: "MCP를 연결하면 AI 대화와 봇에서 Task, 프로젝트, 루틴을 바로 만들 수 있습니다." },
      { title: "책임과 맥락을 선명하게", description: "Project의 DRI와 속성, Task의 담당자와 소속을 한눈에 관리합니다." },
      { title: "매일 실행을 놓치지 않게", description: "루틴, 데일리 스크럼과 추천이 지금 집중할 일을 정리해 줍니다." },
    ],
    mcpAction: "MCP 연결 보기",
    startAction: "워크스페이스 시작",
  },
  en: {
    languageLabel: "Guide language",
    eyebrow: "A workspace that turns goals into action",
    title: "Connect your OKRs to today's work.",
    description: "OKRPTR brings goals, projects, tasks, and recurring routines together, with fast capture from AI conversations and bots.",
    hierarchyLabel: "From goal to execution",
    routineNote: "Routines stay outside this hierarchy and track recurring work.",
    points: [
      { title: "Capture from conversation", description: "Connect MCP to create tasks, projects, and routines directly from AI chats and bots." },
      { title: "Make ownership explicit", description: "Track Project DRIs and properties alongside each Task's assignee and work context." },
      { title: "Keep daily execution visible", description: "Routines, daily scrum, and recommendations keep your next priorities clear." },
    ],
    mcpAction: "View MCP setup",
    startAction: "Start workspace",
  },
  ja: {
    languageLabel: "案内言語",
    eyebrow: "目標を実行に変えるワークスペース",
    title: "OKRを、今日やる仕事までつなげる。",
    description: "OKRPTRは目標、プロジェクト、タスク、繰り返しルーティンを一か所につなぎ、AIとの会話やボットからすぐに記録できる実行管理サービスです。",
    hierarchyLabel: "目標から実行まで",
    routineNote: "Routineはこの階層の外で、繰り返す仕事を管理します。",
    points: [
      { title: "会話からすぐに登録", description: "MCPを接続すると、AIチャットやボットからタスク、プロジェクト、ルーティンを作成できます。" },
      { title: "責任と文脈を明確に", description: "ProjectのDRIとプロパティ、Taskの担当者と所属を一目で管理できます。" },
      { title: "日々の実行を見失わない", description: "ルーティン、デイリースクラム、提案機能が次に集中することを整理します。" },
    ],
    mcpAction: "MCP接続を見る",
    startAction: "ワークスペースを開始",
  },
  zh: {
    languageLabel: "指南语言",
    eyebrow: "把目标变成行动的工作空间",
    title: "让 OKR 真正落到今天的工作。",
    description: "OKRPTR 将目标、项目、任务和周期性例行工作连接在一起，并支持从 AI 对话和机器人中快速记录。",
    hierarchyLabel: "从目标到执行",
    routineNote: "Routine 独立于此层级，用于管理周期性工作。",
    points: [
      { title: "从对话直接记录", description: "连接 MCP 后，可以从 AI 对话和机器人中直接创建任务、项目和例行工作。" },
      { title: "明确责任和工作背景", description: "集中管理 Project 负责人和属性，以及 Task 的负责人和所属关系。" },
      { title: "让每日执行保持清晰", description: "例行工作、每日站会和智能建议会整理下一步重点。" },
    ],
    mcpAction: "查看 MCP 连接",
    startAction: "开始使用",
  },
  es: {
    languageLabel: "Idioma de la guía",
    eyebrow: "Un espacio para convertir objetivos en acción",
    title: "Conecta tus OKR con el trabajo de hoy.",
    description: "OKRPTR reúne objetivos, proyectos, tareas y rutinas recurrentes, con captura rápida desde conversaciones con IA y bots.",
    hierarchyLabel: "Del objetivo a la ejecución",
    routineNote: "Las rutinas quedan fuera de esta jerarquía y organizan el trabajo recurrente.",
    points: [
      { title: "Registra desde una conversación", description: "Conecta MCP para crear tareas, proyectos y rutinas directamente desde chats con IA y bots." },
      { title: "Aclara responsables y contexto", description: "Gestiona responsables y propiedades de Project junto con la persona asignada y el contexto de cada Task." },
      { title: "Mantén visible la ejecución diaria", description: "Las rutinas, el scrum diario y las recomendaciones aclaran tus próximas prioridades." },
    ],
    mcpAction: "Ver conexión MCP",
    startAction: "Empezar",
  },
};

const fallbackItems: OkrptrItem[] = [];

const fallbackProperties: PropertyDefinition[] = [
  { id: "sprint", name: "스프린트", type: "select", options: ["Sprint 18", "Sprint 19", "Backlog"], sortOrder: 20, valueCount: 0 },
  { id: "estimate", name: "예상 시간", type: "number", options: [], sortOrder: 30, valueCount: 0 },
];

const fallbackValues: PropertyValueMap = {};

const navItems: { id: View; label: string; icon: LucideIcon }[] = [
  { id: "okr", label: "OKR", icon: Target },
  { id: "work", label: "Project", icon: Table2 },
  { id: "inbox", label: "Task", icon: Inbox },
  { id: "home", label: "대화", icon: Bot },
  { id: "routines", label: "루틴", icon: Repeat2 },
  { id: "scrum", label: "데일리", icon: CalendarCheck },
  { id: "recommendations", label: "추천", icon: Lightbulb },
  { id: "reviews", label: "리뷰", icon: Activity },
  { id: "trash", label: "휴지통", icon: Trash2 },
];

const cadenceLabels: Record<Cadence, string> = { daily: "일간", weekly: "주간", monthly: "월간", quarterly: "분기" };
const viewTitles: Record<View, string> = {
  home: "대화",
  inbox: "Task",
  work: "Project",
  routines: "루틴",
  okr: "OKR",
  scrum: "데일리 스크럼",
  recommendations: "추천",
  reviews: "리뷰",
  trash: "휴지통",
};

export default function Home() {
  const [items, setItems] = useState<OkrptrItem[]>(fallbackItems);
  const [properties, setProperties] = useState<PropertyDefinition[]>(fallbackProperties);
  const [propertyValues, setPropertyValues] = useState<PropertyValueMap>(fallbackValues);
  const [hiddenProperties, setHiddenProperties] = useState<ProjectHiddenPropertyMap>({});
  const [archivedProjects, setArchivedProjects] = useState<ArchivedProject[]>([]);
  const [projectTab, setProjectTab] = useState<ProjectTab>("list");
  const [teamData, setTeamData] = useState<TeamData | null>(null);
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [okrCycles, setOkrCycles] = useState<OkrCycle[]>([]);
  const [selectedOkrCycleId, setSelectedOkrCycleId] = useState<string | null>(null);
  const [visibleOkrCycleIds, setVisibleOkrCycleIds] = useState<string[]>([]);
  const [activeView, setActiveView] = useState<View>("home");
  const [cadence, setCadence] = useState<Cadence>("weekly");
  const [taskDisplay, setTaskDisplay] = useState<"table" | "board">("table");
  const [capture, setCapture] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [integrationOpen, setIntegrationOpen] = useState(false);
  const [appIntegrationsOpen, setAppIntegrationsOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [propertyPanelOpen, setPropertyPanelOpen] = useState(false);
  const [teamPanelOpen, setTeamPanelOpen] = useState(false);
  const [teamPanelTab, setTeamPanelTab] = useState<"members" | "groups">("members");
  const [profilePromptMember, setProfilePromptMember] = useState<TeamMember | null>(null);
  const [requestedGroupHandle, setRequestedGroupHandle] = useState<string | null>(null);
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [workspaceRules, setWorkspaceRules] = useState<WorkspaceRules | null>(null);
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);
  const [workspaceCreateOpen, setWorkspaceCreateOpen] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState("");
  const [workspaceSaving, setWorkspaceSaving] = useState(false);
  const [createItemOpen, setCreateItemOpen] = useState(false);
  const [createItemKind, setCreateItemKind] = useState<ItemKind>("task");
  const [deletingOkrCycleIds, setDeletingOkrCycleIds] = useState<Set<string>>(new Set());
  const [slowDeletingOkrCycleId, setSlowDeletingOkrCycleId] = useState<string | null>(null);
  const [okrListOpen, setOkrListOpen] = useState(false);
  const [cleanupOpen, setCleanupOpen] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [googleStatus, setGoogleStatus] = useState<GoogleConnectionStatus | null>(null);
  const [slackStatus, setSlackStatus] = useState<SlackConnectionStatus | null>(null);
  const [integrationStatusesLoaded, setIntegrationStatusesLoaded] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [introLanguage, setIntroLanguage] = useState<IntroLanguage>("ko");
  const [authState, setAuthState] = useState<AuthState>({ status: "loading", user: null, reason: null });
  const workspaceNameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const savedLanguage = window.localStorage.getItem("okrptr.intro-language");
      const language = isIntroLanguage(savedLanguage) ? savedLanguage : preferredIntroLanguage();
      setIntroLanguage(language);
    }, 0);
    return () => window.clearTimeout(timeout);
  }, []);

  useEffect(() => {
    let active = true;
    void fetch(`/api/bootstrap?date=${encodeURIComponent(localDate())}`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("unauthenticated");
        return response.json() as Promise<BootstrapData>;
      })
      .then((data) => {
        if (!active) return;
        setItems(data.items);
        setProperties(data.properties);
        setPropertyValues(data.propertyValues);
        setHiddenProperties(data.hiddenByProject ?? {});
        setArchivedProjects(data.archivedProjects);
        setRoutines(data.routines);
        setWorkspaces(data.workspaces);
        setWorkspaceRules(data.rules);
        setOkrCycles(data.cycles);
        setTeamData(data.team);
        const activeCycle = data.cycles.find((cycle) => cycle.status === "active") ?? data.cycles[0];
        setVisibleOkrCycleIds(activeCycle ? [activeCycle.id] : []);
        const currentMember = data.team.members.find((member) => member.isCurrent && member.status === "active");
        if (currentMember && memberNameNeedsConfirmation(currentMember) && window.localStorage.getItem(profileNameConfirmationKey(currentMember)) !== currentMember.displayName) {
          setProfilePromptMember(currentMember);
        }
        setAuthState({ status: "authenticated", user: data.user, reason: null });
      })
      .catch(() => {
        if (!active) return;
        const reason = new URLSearchParams(window.location.search).get("auth");
        setAuthState({ status: "unauthenticated", user: null, reason });
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const group = new URLSearchParams(window.location.search).get("group")?.replace(/^@/, "").trim();
    if (!group) return;
    const timeout = window.setTimeout(() => {
      setRequestedGroupHandle(group);
      setTeamPanelTab("groups");
      setTeamPanelOpen(true);
    }, 0);
    return () => window.clearTimeout(timeout);
  }, []);

  useEffect(() => {
    if (authState.status !== "authenticated" || !appIntegrationsOpen || integrationStatusesLoaded) return;
    let active = true;
    void Promise.all([
      fetch("/api/google/status").then(async (response) => response.ok ? response.json() as Promise<{ google: GoogleConnectionStatus }> : Promise.reject()),
      fetch("/api/slack/status").then(async (response) => response.ok ? response.json() as Promise<{ slack: SlackConnectionStatus }> : Promise.reject()),
    ])
      .then(([googleData, slackData]) => {
        if (!active) return;
        setGoogleStatus(googleData.google);
        setSlackStatus(slackData.slack);
      })
      .catch(() => undefined)
      .finally(() => { if (active) setIntegrationStatusesLoaded(true); });
    return () => { active = false; };
  }, [appIntegrationsOpen, authState.status, integrationStatusesLoaded]);

  useEffect(() => {
    if (workspaceMenuOpen && workspaceCreateOpen) workspaceNameInputRef.current?.focus();
  }, [workspaceMenuOpen, workspaceCreateOpen]);

  useEffect(() => {
    function closeTopmost(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (selectedProjectId) { setSelectedProjectId(null); return; }
      if (selectedTaskId) { setSelectedTaskId(null); return; }
      if (cleanupOpen) { setCleanupOpen(false); return; }
      if (okrListOpen) { setOkrListOpen(false); return; }
      if (createItemOpen) { setCreateItemOpen(false); return; }
      if (teamPanelOpen) { setTeamPanelOpen(false); return; }
      if (propertyPanelOpen) { setPropertyPanelOpen(false); return; }
      if (appIntegrationsOpen) { setAppIntegrationsOpen(false); return; }
      if (integrationOpen) { setIntegrationOpen(false); return; }
      if (mobileMenuOpen) { setMobileMenuOpen(false); return; }
      if (profilePromptMember) { setProfilePromptMember(null); return; }
      if (onboardingOpen) { setOnboardingOpen(false); return; }
      if (workspaceCreateOpen) { setWorkspaceCreateOpen(false); setNewWorkspaceName(""); return; }
      if (workspaceMenuOpen) setWorkspaceMenuOpen(false);
    }
    window.addEventListener("keydown", closeTopmost);
    return () => window.removeEventListener("keydown", closeTopmost);
  }, [appIntegrationsOpen, cleanupOpen, createItemOpen, integrationOpen, mobileMenuOpen, okrListOpen, onboardingOpen, profilePromptMember, propertyPanelOpen, selectedProjectId, selectedTaskId, teamPanelOpen, workspaceCreateOpen, workspaceMenuOpen]);

  const teamMembers = teamData?.members ?? [];
  const activeItems = items.filter((entry) => !entry.archivedAt && entry.status !== "archived");
  const inboxItems = activeItems.filter((entry) => entry.status === "inbox");
  const taskItems = activeItems.filter((entry) => entry.kind === "task");
  const executionItems = activeItems.filter((entry) => entry.kind === "project");
  const structuredItems = activeItems.filter((entry) => entry.status !== "inbox");
  const defaultOkrCycle = okrCycles.find((cycle) => cycle.status === "active") ?? okrCycles[0] ?? null;
  const selectedOkrCycle = okrCycles.find((cycle) => cycle.id === selectedOkrCycleId) ?? defaultOkrCycle;
  const visibleOkrCycles = okrCycles.filter((cycle) => visibleOkrCycleIds.includes(cycle.id));
  const displayedOkrCycles = visibleOkrCycles.length ? visibleOkrCycles : selectedOkrCycle ? [selectedOkrCycle] : [];
  const okrViews = useMemo(() => {
    const views: Record<string, { items: OkrptrItem[]; objective?: OkrptrItem; depths: Record<string, number> }> = {};
    for (const cycle of okrCycles) {
      const cycleItems = filterTreeItemsByCycle(structuredItems, cycle.id);
      views[cycle.id] = { items: cycleItems, objective: cycleItems.find((entry) => entry.kind === "objective"), depths: buildDepths(cycleItems) };
    }
    return views;
  }, [okrCycles, structuredItems]);
  const okrCycleItemCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const cycle of okrCycles) counts[cycle.id] = filterTreeItemsByCycle(structuredItems, cycle.id).length;
    return counts;
  }, [okrCycles, structuredItems]);
  const periodItems = activeItems.filter(
    (entry) => entry.status !== "inbox" && (cadence === "quarterly" || entry.cadence === cadence || entry.kind === "objective"),
  );
  const completed = periodItems.filter((entry) => isCompletedStatus(entry.status)).length;
  const blocked = periodItems.filter((entry) => entry.status === "blocked").length;
  const averageProgress = periodItems.length
    ? Math.round(periodItems.reduce((sum, entry) => sum + entry.progress, 0) / periodItems.length)
    : 0;
  const selectedTask = activeItems.find((entry) => entry.id === selectedTaskId && entry.kind === "task");
  const selectedProject = activeItems.find((entry) => entry.id === selectedProjectId && entry.kind === "project");
  const currentWorkspace = workspaces.find((entry) => entry.current) ?? workspaces[0];
  const currentTeamMember = teamMembers.find((member) => member.isCurrent && member.status === "active");
  const accountDisplayName = currentTeamMember?.displayName || authState.user?.displayName || "내 계정";
  const accountInitial = accountDisplayName.slice(0, 1).toLocaleUpperCase() || "O";

  async function switchWorkspace(workspaceId: string) {
    if (workspaceSaving || workspaceId === currentWorkspace?.id) {
      setWorkspaceMenuOpen(false);
      return;
    }
    setWorkspaceSaving(true);
    const response = await fetch("/api/workspaces", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId }),
    });
    if (response.ok) window.location.reload();
    else {
      setWorkspaceSaving(false);
      showNotice("워크스페이스를 전환하지 못했습니다.");
    }
  }

  async function createWorkspace(event: FormEvent) {
    event.preventDefault();
    const name = newWorkspaceName.trim();
    if (!name || workspaceSaving) return;
    setWorkspaceSaving(true);
    const response = await fetch("/api/workspaces", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (response.ok) window.location.reload();
    else {
      setWorkspaceSaving(false);
      showNotice("워크스페이스를 만들지 못했습니다.");
    }
  }

  async function deleteWorkspace(workspace: WorkspaceSummary) {
    if (workspace.personal || workspace.role !== "owner" || workspaceSaving) return;
    if (!window.confirm(`'${workspace.name}' 워크스페이스를 삭제할까요?\n멤버, 그룹, OKR, Task, 루틴, 연동 데이터가 함께 삭제됩니다.`)) return;
    setWorkspaceSaving(true);
    const response = await fetch(`/api/workspaces?workspaceId=${encodeURIComponent(workspace.id)}`, { method: "DELETE" });
    if (response.ok) window.location.reload();
    else {
      const data = await response.json().catch(() => ({})) as { error?: string };
      setWorkspaceSaving(false);
      showNotice(data.error ?? "워크스페이스를 삭제하지 못했습니다.");
    }
  }

  async function submitCapture(event: FormEvent) {
    event.preventDefault();
    const title = capture.trim();
    if (!title || saving) return;
    setSaving(true);
    try {
      const response = await fetch("/api/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, kind: "task", source: "web" }),
      });
      if (!response.ok) throw new Error("save failed");
      const data = (await response.json()) as { item: OkrptrItem };
      setItems((current) => [...current, data.item]);
    } catch {
      setItems((current) => [...current, item(crypto.randomUUID(), null, "task", title, "inbox", "weekly", 0)]);
    } finally {
      setCapture("");
      setSaving(false);
      showNotice("인박스에 추가했습니다.");
    }
  }

  async function patchItem(id: string, patch: Partial<OkrptrItem>) {
    const previous = items;
    setItems((current) => current.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)));
    try {
      const response = await fetch("/api/items", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...patch }),
      });
      if (!response.ok) throw new Error("update failed");
      const data = (await response.json()) as { item: OkrptrItem };
      setItems((current) => current.map((entry) => (entry.id === id ? data.item : entry)));
    } catch {
      setItems(previous);
      showNotice("변경사항을 저장하지 못했습니다.");
    }
  }

  async function setPropertyValue(itemId: string, propertyId: string, value: PropertyValue) {
    const previous = propertyValues;
    setPropertyValues((current) => ({ ...current, [itemId]: { ...current[itemId], [propertyId]: value } }));
    try {
      const response = await fetch("/api/property-values", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId, propertyId, value }),
      });
      if (!response.ok) throw new Error("property save failed");
    } catch {
      setPropertyValues(previous);
      showNotice("속성값을 저장하지 못했습니다.");
    }
  }

  function updateItemAssignments(itemId: string, assignments: ItemAssignment[]) {
    setItems((current) => current.map((entry) => entry.id === itemId ? { ...entry, assignments } : entry));
  }

  async function setProjectPropertyVisibility(projectId: string, propertyId: string, hidden: boolean) {
    const previous = hiddenProperties;
    setHiddenProperties((current) => {
      const next = new Set(current[projectId] ?? []);
      if (hidden) next.add(propertyId); else next.delete(propertyId);
      return { ...current, [projectId]: [...next] };
    });
    const response = await fetch("/api/project-property-visibility", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, propertyId, hidden }),
    });
    if (!response.ok) {
      setHiddenProperties(previous);
      showNotice("속성 표시 설정을 저장하지 못했습니다.");
    }
  }

  async function archiveProjectItem(project: OkrptrItem) {
    const response = await fetch("/api/project-archives", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: project.id }),
    });
    if (!response.ok) {
      showNotice("프로젝트를 아카이브하지 못했습니다.");
      return;
    }
    const data = await response.json() as { project: OkrptrItem; archivedTaskCount: number };
    setItems((current) => current.filter((entry) => entry.id !== project.id && entry.parentId !== project.id));
    setArchivedProjects((current) => [{ ...data.project, archivedTaskCount: data.archivedTaskCount }, ...current.filter((entry) => entry.id !== project.id)]);
    setSelectedProjectId(null);
    showNotice(`프로젝트와 하위 Task ${data.archivedTaskCount}개를 보관했습니다.`);
  }

  async function restoreProjectItem(projectId: string) {
    const response = await fetch(`/api/project-archives?projectId=${encodeURIComponent(projectId)}`, { method: "DELETE" });
    if (!response.ok) {
      showNotice("프로젝트를 복구하지 못했습니다.");
      return;
    }
    const [itemsResponse, archivesResponse] = await Promise.all([fetch("/api/items"), fetch("/api/project-archives")]);
    if (!itemsResponse.ok || !archivesResponse.ok) {
      showNotice("복구 결과를 다시 불러오지 못했습니다.");
      return;
    }
    const itemData = await itemsResponse.json() as { items: OkrptrItem[] };
    const archiveData = await archivesResponse.json() as { projects: ArchivedProject[] };
    setItems(itemData.items);
    setArchivedProjects(archiveData.projects);
    showNotice("프로젝트와 하위 Task를 원래 상태로 복구했습니다.");
  }

  async function permanentlyDeleteProjectItem(project: ArchivedProject) {
    if (!window.confirm(`'${project.title}'을 영구 삭제할까요?\n프로젝트와 하위 Task ${project.archivedTaskCount}개, 체크리스트, 속성값, 담당자 연결이 모두 삭제되며 복구할 수 없습니다.`)) return;
    const response = await fetch("/api/project-archives/permanent", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: project.id, confirmationTitle: project.title }),
    });
    if (!response.ok) {
      showNotice("프로젝트를 영구 삭제하지 못했습니다.");
      return;
    }
    setArchivedProjects((current) => current.filter((entry) => entry.id !== project.id));
    setPropertyValues((current) => Object.fromEntries(Object.entries(current).filter(([itemId]) => itemId !== project.id)));
    setHiddenProperties((current) => Object.fromEntries(Object.entries(current).filter(([projectId]) => projectId !== project.id)));
    showNotice(`'${project.title}'과 하위 Task를 영구 삭제했습니다.`);
  }

  function showNotice(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 2200);
  }

  function connectInbox(entry: OkrptrItem) {
    const project = items.find((itemEntry) => itemEntry.kind === "project");
    if (!project) {
      setCreateItemKind("project");
      setCreateItemOpen(true);
      showNotice("먼저 Project를 만들어 주세요.");
      return;
    }
    void patchItem(entry.id, { parentId: project.id, status: "todo" });
    showNotice(`‘${project.title}’에 연결했습니다.`);
  }

  function openProjectPage(id: string) {
    setSelectedTaskId(null);
    setSelectedProjectId(id);
    setActiveView("work");
    setProjectTab("list");
  }

  function addCreatedItem(created: OkrptrItem, initialValues: Record<string, PropertyValue> = {}) {
    setItems((current) => [...current, created]);
    if (Object.keys(initialValues).length) {
      setPropertyValues((current) => ({ ...current, [created.id]: { ...current[created.id], ...initialValues } }));
    }
    setCreateItemOpen(false);
    showNotice(`${kindLabel(created.kind)}를 만들었습니다.`);
  }

  async function createOkrFile() {
    try {
      const response = await fetch("/api/okr-cycles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "새 OKR 파일", status: "planned" }),
      });
      if (!response.ok) throw new Error("cycle");
      const data = await response.json() as { cycle: OkrCycle };
      setOkrCycles((current) => [data.cycle, ...current]);
      setSelectedOkrCycleId(data.cycle.id);
      setVisibleOkrCycleIds((current) => current.includes(data.cycle.id) ? current : [data.cycle.id, ...current]);
      setActiveView("okr");
      showNotice("새 OKR 파일을 만들었습니다.");
    } catch {
      showNotice("OKR 파일을 만들지 못했습니다.");
    }
  }

  async function renameOkrFile(id: string, name: string) {
    const previous = okrCycles;
    setOkrCycles((current) => current.map((cycle) => cycle.id === id ? { ...cycle, name } : cycle));
    try {
      const response = await fetch("/api/okr-cycles", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, name }),
      });
      if (!response.ok) throw new Error("cycle");
      const data = await response.json() as { cycle: OkrCycle };
      setOkrCycles((current) => current.map((cycle) => cycle.id === id ? data.cycle : cycle));
      showNotice("OKR 파일 이름을 저장했습니다.");
    } catch {
      setOkrCycles(previous);
      showNotice("OKR 파일 이름을 저장하지 못했습니다.");
    }
  }

  async function setOkrFileDepartment(id: string, department: string) {
    const previous = okrCycles;
    setOkrCycles((current) => current.map((cycle) => cycle.id === id ? { ...cycle, department } : cycle));
    try {
      const response = await fetch("/api/okr-cycles", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, department }),
      });
      if (!response.ok) throw new Error("cycle");
      const data = await response.json() as { cycle: OkrCycle };
      setOkrCycles((current) => current.map((cycle) => cycle.id === id ? data.cycle : cycle));
      showNotice("OKR 부서를 저장했습니다.");
    } catch {
      setOkrCycles(previous);
      showNotice("OKR 부서를 저장하지 못했습니다.");
    }
  }

  function toggleOkrFileVisible(id: string) {
    setSelectedOkrCycleId(id);
    setVisibleOkrCycleIds((current) => current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]);
  }

  async function setDefaultOkrFile(id: string) {
    const previous = okrCycles;
    setOkrCycles((current) => current.map((cycle) => ({ ...cycle, status: cycle.id === id ? "active" : cycle.status === "active" ? "planned" : cycle.status })));
    setSelectedOkrCycleId(id);
    setVisibleOkrCycleIds((current) => current.includes(id) ? current : [id, ...current]);
    try {
      const response = await fetch("/api/okr-cycles", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status: "active" }),
      });
      if (!response.ok) throw new Error("cycle");
      const data = await response.json() as { cycle: OkrCycle };
      setOkrCycles((current) => current.map((cycle) => ({ ...cycle, status: cycle.id === data.cycle.id ? data.cycle.status : cycle.status === "active" ? "planned" : cycle.status })));
      showNotice("기본으로 열 OKR 파일을 바꿨습니다.");
    } catch {
      setOkrCycles(previous);
      showNotice("기본 OKR 파일을 바꾸지 못했습니다.");
    }
  }

  async function deleteOkrFile(id: string) {
    const cycle = okrCycles.find((entry) => entry.id === id);
    if (!cycle) return;
    if (deletingOkrCycleIds.has(id)) return;
    if (okrCycles.length <= 1) {
      showNotice("OKR 파일은 최소 1개가 필요합니다.");
      return;
    }
    if (!window.confirm(`'${cycle.name}' OKR 파일을 삭제할까요?\n파일 연결만 해제하고 작업 항목 자체는 삭제하지 않습니다.`)) return;
    setDeletingOkrCycleIds((current) => new Set(current).add(id));
    const slowTimer = window.setTimeout(() => setSlowDeletingOkrCycleId(id), 800);
    try {
      const response = await fetch(`/api/okr-cycles?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!response.ok) throw new Error("cycle");
      const data = await response.json() as { deletedId: string; nextActiveId: string | null };
      const remaining = okrCycles.filter((entry) => entry.id !== data.deletedId);
      const nextSelectedId = data.nextActiveId ?? remaining[0]?.id ?? null;
      setOkrCycles(remaining.map((entry) => ({ ...entry, status: entry.id === data.nextActiveId ? "active" : entry.status === "active" && cycle.status === "active" ? "planned" : entry.status })));
      if (selectedOkrCycle?.id === id) setSelectedOkrCycleId(nextSelectedId);
      setVisibleOkrCycleIds((current) => current.filter((entry) => entry !== id));
      setItems((current) => current.map((entry) => entry.cycleId === id ? { ...entry, cycleId: null } : entry));
      showNotice("OKR 파일을 삭제했습니다.");
    } catch {
      showNotice("OKR 파일을 삭제하지 못했습니다.");
    } finally {
      window.clearTimeout(slowTimer);
      setSlowDeletingOkrCycleId((current) => current === id ? null : current);
      setDeletingOkrCycleIds((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    }
  }

  async function createOnboardingPlan(plan: OnboardingPlan) {
    const objectiveTitle = plan.objective.trim();
    const routineTitle = plan.routineTitle.trim();
    if (!objectiveTitle && !routineTitle) {
      showNotice("Objective나 루틴 이름을 먼저 적어 주세요.");
      return false;
    }
    const createdItems: OkrptrItem[] = [];
    async function createPlannedItem(body: Record<string, unknown>) {
      const response = await fetch("/api/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error("item");
      const data = await response.json() as { item: OkrptrItem };
      createdItems.push(data.item);
      return data.item;
    }
    async function createPlannedRoutine() {
      if (!routineTitle) return;
      const response = await fetch("/api/routines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: routineTitle,
          triggerPoint: plan.routineTrigger,
          actionPlace: plan.routinePlace,
          actionSteps: plan.routineSteps,
          cadence: "daily",
        }),
      });
      if (!response.ok) throw new Error("routine");
    }
    try {
      if (!objectiveTitle) {
        await createPlannedRoutine();
        if (workspaceRules) {
          const response = await fetch("/api/workspace-rules", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...workspaceRules, configured: true }),
          });
          if (response.ok) {
            const data = await response.json() as { rules: WorkspaceRules };
            setWorkspaceRules(data.rules);
          }
        }
        setActiveView("routines");
        showNotice("루틴을 만들었습니다.");
        return true;
      }
      const objectiveItem = await createPlannedItem({ title: objectiveTitle, kind: "objective", status: "in_progress", progress: 0 });
      const keyResultTitle = plan.keyResult.trim() || "첫 핵심 결과 정의";
      const keyResultItem = await createPlannedItem({ title: keyResultTitle, kind: "key_result", parentId: objectiveItem.id, status: "todo" });
      const initiativeTitle = plan.initiative.trim() || "첫 실행 방향 정리";
      const initiativeItem = await createPlannedItem({ title: initiativeTitle, kind: "initiative", parentId: keyResultItem.id, status: "todo" });
      const projectTitle = plan.project.trim();
      const projectItem = projectTitle
        ? await createPlannedItem({ title: projectTitle, kind: "project", parentId: initiativeItem.id, status: "in_progress" })
        : null;
      const taskTitles = plan.tasks.split("\n").map((entry) => entry.trim()).filter(Boolean);
      for (const taskTitle of taskTitles) {
        await createPlannedItem({
          title: taskTitle,
          kind: "task",
          parentId: projectItem?.id,
          status: projectItem ? "todo" : "inbox",
        });
      }
      await createPlannedRoutine();
      if (workspaceRules) {
        const response = await fetch("/api/workspace-rules", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...workspaceRules, configured: true }),
        });
        if (response.ok) {
          const data = await response.json() as { rules: WorkspaceRules };
          setWorkspaceRules(data.rules);
        }
      }
      setItems((current) => [...current, ...createdItems]);
      setActiveView("okr");
      showNotice("OKR 시작 구성을 만들었습니다.");
      return true;
    } catch {
      showNotice("OKR 구성을 만들지 못했습니다.");
      return false;
    }
  }

  if (authState.status !== "authenticated") {
    return <AuthScreen loading={authState.status === "loading"} reason={authState.reason} />;
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="workspace-control">
          <button
            className="workspace-switcher"
            onClick={() => {
              setWorkspaceMenuOpen((open) => {
                const nextOpen = !open;
                if (!nextOpen) {
                  setWorkspaceCreateOpen(false);
                  setNewWorkspaceName("");
                }
                return nextOpen;
              });
            }}
            aria-expanded={workspaceMenuOpen}
          >
            <span className="brand-mark">{currentWorkspace?.name.slice(0, 1).toLocaleUpperCase() || "O"}</span>
            <span><strong>{currentWorkspace?.name || "개인 워크스페이스"}</strong><small>{currentWorkspace?.personal ? "개인 워크스페이스" : "팀 워크스페이스"}</small></span>
            <ChevronDown size={14} />
          </button>
          {workspaceMenuOpen && (
            <div className="workspace-menu">
              <header><b>워크스페이스</b><span>{workspaces.length}</span></header>
              <div className="workspace-list">
                {workspaces.map((workspace) => (
                  <div className="workspace-row" key={workspace.id}>
                    <button onClick={() => void switchWorkspace(workspace.id)} disabled={workspaceSaving}>
                      <span className="workspace-avatar">{workspace.name.slice(0, 1).toLocaleUpperCase()}</span>
                      <span><b>{workspace.name}</b><small>{workspace.personal ? "개인" : teamRoleLabel(workspace.role)}</small></span>
                      {workspace.current && <Check size={14} />}
                    </button>
                    {!workspace.personal && workspace.role === "owner" && (
                      <button className="workspace-delete" onClick={() => void deleteWorkspace(workspace)} disabled={workspaceSaving} aria-label={`${workspace.name} 워크스페이스 삭제`} title="워크스페이스 삭제">
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <div className="workspace-create">
                {workspaceCreateOpen ? (
                  <form className="workspace-create-form" onSubmit={createWorkspace}>
                    <input
                      value={newWorkspaceName}
                      onChange={(event) => setNewWorkspaceName(event.target.value)}
                      placeholder="팀 워크스페이스 이름"
                      aria-label="팀 워크스페이스 이름"
                      maxLength={80}
                      ref={workspaceNameInputRef}
                    />
                    <button disabled={!newWorkspaceName.trim() || workspaceSaving} aria-label="워크스페이스 만들기" title="워크스페이스 만들기"><Check size={14} /></button>
                    <button
                      type="button"
                      onClick={() => {
                        setWorkspaceCreateOpen(false);
                        setNewWorkspaceName("");
                      }}
                      aria-label="취소"
                      title="취소"
                    >
                      <X size={14} />
                    </button>
                  </form>
                ) : (
                  <button className="workspace-create-trigger" onClick={() => setWorkspaceCreateOpen(true)}>
                    <Plus size={14} />
                    <span>새 팀 워크스페이스</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
        <nav className="desktop-navigation">
          {navItems.map((entry) => {
            const Icon = entry.icon;
            return (
              <button className={`nav-item ${activeView === entry.id && !selectedProject ? "active" : ""}`} key={entry.id} onClick={() => { setSelectedProjectId(null); setSelectedTaskId(null); setActiveView(entry.id); }}>
                <Icon size={16} /><span>{entry.label}</span>
                {entry.id === "inbox" && inboxItems.length > 0 && <b>{inboxItems.length}</b>}
              </button>
            );
          })}
        </nav>
        <nav className="mobile-navigation" aria-label="주요 메뉴">
          {navItems.slice(0, 4).map((entry) => {
            const Icon = entry.icon;
            return (
              <button className={`nav-item ${activeView === entry.id && !selectedProject ? "active" : ""}`} key={entry.id} onClick={() => { setSelectedProjectId(null); setSelectedTaskId(null); setActiveView(entry.id); }}>
                <Icon size={16} /><span>{entry.label}</span>
                {entry.id === "inbox" && inboxItems.length > 0 && <b>{inboxItems.length}</b>}
              </button>
            );
          })}
          <button className={`nav-item ${mobileMenuOpen ? "active" : ""}`} onClick={() => setMobileMenuOpen(true)}><Menu size={16} /><span>더보기</span></button>
        </nav>
        <div className="sidebar-bottom">
          <button className="nav-item" onClick={() => setIntegrationOpen(true)}><Link2 size={16} /><span>ChatGPT 연동</span></button>
          <button className="nav-item" onClick={() => setAppIntegrationsOpen(true)}><Plug size={16} /><span>앱 연동</span></button>
          <button className="nav-item" onClick={() => { setTeamPanelTab("members"); setTeamPanelOpen(true); }}><Users size={16} /><span>팀 멤버</span></button>
          <button className="nav-item" onClick={() => { setTeamPanelTab("groups"); setTeamPanelOpen(true); }}><AtSign size={16} /><span>그룹 관리</span></button>
          <button className="nav-item" onClick={() => setPropertyPanelOpen(true)}><Settings2 size={16} /><span>내 설정</span></button>
          <button className="profile-row" onClick={() => setPropertyPanelOpen(true)}><span className="avatar">{accountInitial}</span><span>{accountDisplayName}</span><MoreHorizontal size={15} /></button>
        </div>
      </aside>

      {mobileMenuOpen && (
        <div className="mobile-menu-backdrop">
          <button type="button" className="mobile-menu-dismiss" onClick={() => setMobileMenuOpen(false)} aria-label="모바일 메뉴 닫기" />
          <aside className="mobile-menu-sheet">
            <header><div><b>{currentWorkspace?.name || "개인 워크스페이스"}</b><small>{currentWorkspace?.personal ? "개인 워크스페이스" : "팀 워크스페이스"}</small></div><button className="icon-button" onClick={() => setMobileMenuOpen(false)} aria-label="닫기"><X size={17} /></button></header>
            <div className="mobile-menu-list">
              {navItems.slice(4).map((entry) => { const Icon = entry.icon; return <button key={entry.id} onClick={() => { setSelectedProjectId(null); setSelectedTaskId(null); setActiveView(entry.id); setMobileMenuOpen(false); }}><Icon size={16} /><span>{entry.label}</span><ChevronRight size={14} /></button>; })}
              <button onClick={() => { setMobileMenuOpen(false); setIntegrationOpen(true); }}><Link2 size={16} /><span>ChatGPT 연동</span><ChevronRight size={14} /></button>
              <button onClick={() => { setMobileMenuOpen(false); setAppIntegrationsOpen(true); }}><Plug size={16} /><span>앱 연동</span><ChevronRight size={14} /></button>
              <button onClick={() => { setMobileMenuOpen(false); setTeamPanelTab("members"); setTeamPanelOpen(true); }}><Users size={16} /><span>팀 멤버</span><ChevronRight size={14} /></button>
              <button onClick={() => { setMobileMenuOpen(false); setTeamPanelTab("groups"); setTeamPanelOpen(true); }}><AtSign size={16} /><span>그룹 관리</span><ChevronRight size={14} /></button>
              <button onClick={() => { setMobileMenuOpen(false); setPropertyPanelOpen(true); }}><Settings2 size={16} /><span>내 설정</span><ChevronRight size={14} /></button>
            </div>
          </aside>
        </div>
      )}

      <section className="workspace">
        <header className="workspace-topbar">
          <span>OKRPTR</span><ChevronRight size={13} /><b>{selectedProject ? "Project" : viewTitles[activeView]}</b>
          <div><button aria-label="팀 멤버" title="팀 멤버" onClick={() => { setTeamPanelTab("members"); setTeamPanelOpen(true); }}><Users size={15} /></button><button aria-label="알림" title="알림"><Bell size={15} /></button><button aria-label="서비스 안내" title="서비스 안내" onClick={() => setOnboardingOpen(true)}><CircleHelp size={15} /></button></div>
        </header>
        <div className="page-body">
          {activeView !== "home" && !selectedProject && <header className="page-header">
            <div><h1>{viewTitles[activeView]}</h1><p>{pageSubtitle(activeView)}</p></div>
            {activeView === "okr" ? (
              <button className="primary-action" onClick={() => setOkrListOpen(true)}><Archive size={14} />목록보기</button>
            ) : activeView === "work" && projectTab === "list" ? (
              <button className="primary-action" onClick={() => { setCreateItemKind("project"); setCreateItemOpen(true); }}><Plus size={14} />Project 추가</button>
            ) : activeView === "reviews" ? (
              <CadenceSwitch value={cadence} onChange={setCadence} />
            ) : null}
          </header>}

          {activeView === "inbox" && (
            <form className="quick-capture" onSubmit={submitCapture}>
              <Plus size={15} />
              <input value={capture} onChange={(event) => setCapture(event.target.value)} placeholder="할 일을 입력하면 인박스에 저장됩니다" aria-label="인박스에 할 일 추가" />
              <button disabled={!capture.trim() || saving}>{saving ? "저장 중" : "추가"}</button>
            </form>
          )}

          {selectedProject ? (
            <ProjectPageView
              project={selectedProject}
              allItems={items}
              properties={properties}
              propertyValues={propertyValues}
              hiddenPropertyIds={hiddenProperties[selectedProject.id] ?? []}
              teamMembers={teamMembers}
              onClose={() => setSelectedProjectId(null)}
              onPatch={patchItem}
              onPropertyChange={setPropertyValue}
              onPropertyVisibility={(propertyId, hidden) => void setProjectPropertyVisibility(selectedProject.id, propertyId, hidden)}
              onAssignmentsChange={(assignments) => updateItemAssignments(selectedProject.id, assignments)}
              onArchive={() => void archiveProjectItem(selectedProject)}
            />
          ) : (
            <>
          {activeView === "home" && <HomeView onCreatePlan={createOnboardingPlan} />}
          {activeView === "inbox" && <TaskListView items={taskItems} allItems={items} routines={routines} onOpenTask={setSelectedTaskId} onConnect={connectInbox} />}
          {activeView === "work" && (
            <section className="project-workspace">
              <div className="project-tabs" role="tablist" aria-label="Project 보기">
                <button className={projectTab === "list" ? "active" : ""} onClick={() => setProjectTab("list")}><Table2 size={14} />목록</button>
                <button className={projectTab === "properties" ? "active" : ""} onClick={() => setProjectTab("properties")}><Settings2 size={14} />속성 관리</button>
                <button className={projectTab === "archive" ? "active" : ""} onClick={() => setProjectTab("archive")}><Archive size={14} />아카이브{archivedProjects.length > 0 && <span>{archivedProjects.length}</span>}</button>
              </div>
              {projectTab === "list" && <TaskDatabase
                items={executionItems}
                allItems={activeItems}
                properties={properties}
                values={propertyValues}
                hiddenProperties={hiddenProperties}
                display={taskDisplay}
                onDisplayChange={setTaskDisplay}
                onPatch={patchItem}
                onPropertyChange={setPropertyValue}
                onOpenProperties={() => setProjectTab("properties")}
                onOpenTask={setSelectedTaskId}
                onOpenProject={openProjectPage}
              />}
              {projectTab === "properties" && <ProjectPropertyManager
                properties={properties}
                onCreated={(property) => setProperties((current) => [...current, property])}
                onDeleted={(id) => {
                  setProperties((current) => current.filter((entry) => entry.id !== id));
                  setPropertyValues((current) => Object.fromEntries(Object.entries(current).map(([itemId, values]) => [itemId, Object.fromEntries(Object.entries(values).filter(([propertyId]) => propertyId !== id))])));
                  setHiddenProperties((current) => Object.fromEntries(Object.entries(current).map(([projectId, ids]) => [projectId, ids.filter((entry) => entry !== id)])));
                }}
                onNotice={showNotice}
              />}
              {projectTab === "archive" && <ProjectArchiveView projects={archivedProjects} onRestore={(id) => void restoreProjectItem(id)} onDelete={(project) => void permanentlyDeleteProjectItem(project)} />}
            </section>
          )}
          {activeView === "routines" && <RoutineView onNotice={showNotice} onRoutinesChange={setRoutines} />}
          {activeView === "okr" && (
            <section className="okr-workbench">
              <section className="okr-document">
                {displayedOkrCycles.length ? displayedOkrCycles.map((cycle) => {
                  const view = okrViews[cycle.id] ?? { items: [], depths: {} };
                  return (
                    <article className="okr-document-card" key={cycle.id}>
                      <OkrCurrentFile key={`${cycle.id}-${cycle.name}-${cycle.department}`} cycle={cycle} onRename={(id, name) => void renameOkrFile(id, name)} onDepartmentChange={(id, department) => void setOkrFileDepartment(id, department)} onAddItem={() => { setCreateItemKind("task"); setCreateItemOpen(true); }} />
                      <TreeView objective={view.objective} items={view.items} depths={view.depths} onComplete={(id) => void patchItem(id, { status: "done", progress: 100 })} />
                    </article>
                  );
                }) : <EmptyState icon={Archive} title="OKR 파일이 없습니다" />}
              </section>
            </section>
          )}
          {activeView === "scrum" && <DailyScrumView onOpenTask={setSelectedTaskId} onNotice={showNotice} />}
          {activeView === "recommendations" && <RecommendationsView onNavigate={setActiveView} />}
          {activeView === "reviews" && <ReviewView items={periodItems} cadence={cadence} completed={completed} blocked={blocked} averageProgress={averageProgress} />}
          {activeView === "trash" && <TrashView onNotice={showNotice} />}
            </>
          )}
        </div>
      </section>

      {notice && <div className="toast">{notice}</div>}
      {okrListOpen && (
        <div className="modal-backdrop align-right">
          <OkrFileManager
            cycles={okrCycles}
            selectedCycle={selectedOkrCycle}
            visibleCycleIds={visibleOkrCycleIds}
            itemCounts={okrCycleItemCounts}
            deletingIds={deletingOkrCycleIds}
            slowDeletingId={slowDeletingOkrCycleId}
            onSelect={(id) => {
              setSelectedOkrCycleId(id);
              setVisibleOkrCycleIds((current) => current.includes(id) ? current : [id]);
            }}
            onRename={(id, name) => void renameOkrFile(id, name)}
            onDepartmentChange={(id, department) => void setOkrFileDepartment(id, department)}
            onToggleVisible={toggleOkrFileVisible}
            onSetDefault={(id) => void setDefaultOkrFile(id)}
            onDelete={(id) => void deleteOkrFile(id)}
            onCreate={() => void createOkrFile()}
            onClose={() => setOkrListOpen(false)}
          />
        </div>
      )}
      {onboardingOpen && (
        <WelcomeModal
          language={introLanguage}
          onLanguageChange={(language) => {
            setIntroLanguage(language);
            window.localStorage.setItem("okrptr.intro-language", language);
          }}
          onClose={() => {
            window.localStorage.setItem("okrptr.intro-seen", "1");
            setOnboardingOpen(false);
          }}
          onOpenMcp={() => {
            window.localStorage.setItem("okrptr.intro-seen", "1");
            setOnboardingOpen(false);
            setIntegrationOpen(true);
          }}
        />
      )}
      {profilePromptMember && (
        <ProfileNamePrompt
          key={profilePromptMember.id}
          member={profilePromptMember}
          onClose={() => setProfilePromptMember(null)}
          onSaved={(member) => {
            window.localStorage.setItem(profileNameConfirmationKey(member), member.displayName);
            setTeamData((current) => current ? { ...current, members: current.members.map((entry) => entry.id === member.id ? member : entry) } : current);
            setProfilePromptMember(null);
            showNotice("실명을 저장했습니다.");
          }}
        />
      )}
      {integrationOpen && <IntegrationModal onNotice={showNotice} onClose={() => setIntegrationOpen(false)} />}
      {appIntegrationsOpen && <AppIntegrationsModal google={googleStatus} slack={slackStatus} workspaceName={currentWorkspace?.name || "개인 워크스페이스"} canManageSlack={currentWorkspace?.role === "owner" || currentWorkspace?.role === "admin"} onGoogleChange={setGoogleStatus} onSlackChange={setSlackStatus} onNotice={showNotice} onClose={() => setAppIntegrationsOpen(false)} />}
      {propertyPanelOpen && (
        <PropertyPanel
          currentWorkspace={currentWorkspace}
          workspaceCount={workspaces.length}
          onClose={() => setPropertyPanelOpen(false)}
          onCleanup={() => { setPropertyPanelOpen(false); setCleanupOpen(true); }}
          onOpenWorkspaceMenu={() => { setPropertyPanelOpen(false); setWorkspaceMenuOpen(true); }}
          onOpenTeamMembers={() => { setPropertyPanelOpen(false); setTeamPanelTab("members"); setTeamPanelOpen(true); }}
          onOpenGroups={() => { setPropertyPanelOpen(false); setTeamPanelTab("groups"); setTeamPanelOpen(true); }}
          onSignOut={() => { window.location.href = "/api/auth/logout"; }}
        />
      )}
      {teamPanelOpen && <TeamPanel initialTeam={teamData} initialTab={teamPanelTab} initialGroupHandle={requestedGroupHandle} onMembersChange={(members) => setTeamData((current) => current ? { ...current, members } : current)} onClose={() => setTeamPanelOpen(false)} onNotice={showNotice} />}
      {createItemOpen && <CreateItemPanel initialKind={createItemKind} items={items} routines={routines} properties={properties} teamMembers={teamMembers} onClose={() => setCreateItemOpen(false)} onCreated={addCreatedItem} />}
      {cleanupOpen && <CleanupModal onClose={() => setCleanupOpen(false)} onCleaned={(cycle) => { setItems([]); setArchivedProjects([]); setPropertyValues({}); setOkrCycles([cycle]); setVisibleOkrCycleIds([cycle.id]); setSelectedTaskId(null); setActiveView("trash"); setCleanupOpen(false); showNotice("OKR 데이터를 휴지통에 보관하고 정리했습니다."); }} onNotice={showNotice} />}
      {selectedTask && (
        <TaskDetailPanel
          task={selectedTask}
          allItems={activeItems}
          routines={routines}
          teamMembers={teamMembers}
          onClose={() => setSelectedTaskId(null)}
          onProgress={(progress) => setItems((current) => current.map((entry) => entry.id === selectedTask.id ? { ...entry, progress } : entry))}
          onAssignmentsChange={(assignments) => updateItemAssignments(selectedTask.id, assignments)}
          onNotice={showNotice}
        />
      )}
    </main>
  );
}

function AuthScreen({ loading, reason }: { loading: boolean; reason: string | null }) {
  const unavailable = reason === "missing_config";
  return (
    <main className="auth-shell">
      <section className="auth-panel">
        <header><span className="brand-mark">O</span><div><b>OKRPTR</b><span>목표를 오늘의 실행으로</span></div></header>
        <div className="auth-content">
          <h1>워크스페이스 로그인</h1>
          <p>초대에 사용된 Google 계정으로 안전하게 접속하세요.</p>
          {reason === "failed" && <p className="auth-error">Google 로그인을 완료하지 못했습니다. 다시 시도해 주세요.</p>}
          {unavailable && <p className="auth-error">Google 로그인 설정을 완료하는 중입니다.</p>}
          <button disabled={loading || unavailable} onClick={() => { window.location.href = "/api/auth/google?returnTo=%2F"; }}>
            {loading ? <LoaderCircle className="spin" size={17} /> : <LogIn size={17} />}
            {loading ? "세션 확인 중" : "Google 계정으로 계속"}
          </button>
        </div>
        <footer>개인 워크스페이스와 초대받은 팀 워크스페이스가 계정별로 분리됩니다.</footer>
      </section>
    </main>
  );
}

function WelcomeModal({ language, onLanguageChange, onClose, onOpenMcp }: {
  language: IntroLanguage;
  onLanguageChange: (language: IntroLanguage) => void;
  onClose: () => void;
  onOpenMcp: () => void;
}) {
  const copy = introCopy[language];
  const pointIcons = [Bot, Table2, CalendarCheck];
  return (
    <div className="modal-backdrop welcome-backdrop">
      <section className="welcome-modal" role="dialog" aria-modal="true" aria-labelledby="welcome-title">
        <header className="welcome-toolbar">
          <div className="welcome-brand"><span className="brand-mark">O</span><strong>OKRPTR</strong></div>
          <div className="language-select">
            <Languages size={14} />
            <label className="sr-only" htmlFor="intro-language">{copy.languageLabel}</label>
            <select id="intro-language" value={language} onChange={(event) => onLanguageChange(event.target.value as IntroLanguage)}>
              {introLanguages.map((entry) => <option value={entry.id} key={entry.id}>{entry.label}</option>)}
            </select>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close"><X size={17} /></button>
        </header>
        <div className="welcome-content">
          <p className="welcome-eyebrow">{copy.eyebrow}</p>
          <h1 id="welcome-title">{copy.title}</h1>
          <p className="welcome-description">{copy.description}</p>
          <section className="welcome-hierarchy">
            <span>{copy.hierarchyLabel}</span>
            <div>{["Objective", "Key Result", "Initiative", "Project", "Task"].map((entry, index) => <span key={entry}><b>{entry}</b>{index < 4 && <ChevronRight size={13} />}</span>)}</div>
            <small>{copy.routineNote}</small>
          </section>
          <div className="welcome-points">
            {copy.points.map((point, index) => {
              const Icon = pointIcons[index];
              return <div key={point.title}><span><Icon size={16} /></span><div><b>{point.title}</b><p>{point.description}</p></div></div>;
            })}
          </div>
        </div>
        <footer className="welcome-actions">
          <button className="welcome-secondary" onClick={onOpenMcp}><Bot size={14} />{copy.mcpAction}</button>
          <button className="welcome-primary" onClick={onClose}>{copy.startAction}<ChevronRight size={14} /></button>
        </footer>
      </section>
    </div>
  );
}

function ProfileNamePrompt({ member, onClose, onSaved }: { member: TeamMember; onClose: () => void; onSaved: (member: TeamMember) => void }) {
  const suggestedName = memberNameNeedsConfirmation(member) ? "" : member.displayName;
  const [name, setName] = useState(suggestedName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save(event: FormEvent) {
    event.preventDefault();
    const displayName = name.trim();
    if (!displayName || saving) return;
    setSaving(true);
    setError("");
    const response = await fetch("/api/team", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: member.id, displayName }),
    });
    const data = await response.json() as { member?: TeamMember; error?: string };
    setSaving(false);
    if (!response.ok || !data.member) {
      setError(data.error ?? "실명을 저장하지 못했습니다.");
      return;
    }
    onSaved(data.member);
  }

  return (
    <div className="modal-backdrop profile-name-backdrop">
      <section className="profile-name-modal" role="dialog" aria-modal="true" aria-labelledby="profile-name-title">
        <header>
          <div>
            <h2 id="profile-name-title">실명 확인</h2>
            <p>팀에서 사용할 이름</p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="나중에"><X size={17} /></button>
        </header>
        <form onSubmit={save}>
          <label>
            <span>내 실명</span>
            <input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} placeholder="홍길동" />
          </label>
          {error && <p>{error}</p>}
          <footer>
            <button type="button" onClick={onClose}>나중에</button>
            <button disabled={!name.trim() || saving}><Check size={14} />저장</button>
          </footer>
        </form>
      </section>
    </div>
  );
}

function CleanupModal({ onClose, onCleaned, onNotice }: { onClose: () => void; onCleaned: (cycle: OkrCycle) => void; onNotice: (message: string) => void }) {
  const confirmationText = "DELETE OKR DATA";
  const [confirm, setConfirm] = useState("");
  const [cleaning, setCleaning] = useState(false);

  async function clean() {
    if (confirm !== confirmationText || cleaning) return;
    setCleaning(true);
    const response = await fetch("/api/workspace-cleanup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmation: confirmationText }),
    });
    setCleaning(false);
    if (!response.ok) {
      onNotice("OKR 데이터를 정리하지 못했습니다.");
      return;
    }
    const data = await response.json() as { activeCycle: OkrCycle };
    onCleaned(data.activeCycle);
  }

  return (
    <div className="modal-backdrop">
      <section className="cleanup-modal" role="dialog" aria-modal="true" aria-labelledby="cleanup-title">
        <header>
          <div>
            <AlertTriangle size={18} />
            <h2 id="cleanup-title">OKR 데이터 클린업</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="닫기"><X size={17} /></button>
        </header>
        <p>
          현재 워크스페이스의 Objective, Key Result, Initiative, Project, Task, Routine, Scrum 기록을 휴지통에 보관한 뒤 작업 화면에서 비웁니다.
          워크스페이스, 멤버, 그룹, 연동, 속성 설정은 그대로 유지됩니다.
        </p>
        <label>
          <span>확인 문구</span>
          <input value={confirm} onChange={(event) => setConfirm(event.target.value)} placeholder={confirmationText} />
        </label>
        <footer>
          <button onClick={onClose}>취소</button>
          <button className="danger" disabled={confirm !== confirmationText || cleaning} onClick={() => void clean()}>
            {cleaning ? "정리 중" : "휴지통으로 이동"}
          </button>
        </footer>
      </section>
    </div>
  );
}

function CadenceSwitch({ value, onChange }: { value: Cadence; onChange: (value: Cadence) => void }) {
  return <div className="cadence-switch">{(Object.keys(cadenceLabels) as Cadence[]).map((entry) => <button className={value === entry ? "selected" : ""} key={entry} onClick={() => onChange(entry)}>{cadenceLabels[entry]}</button>)}</div>;
}

function TaskDatabase({ items, allItems, properties, values, hiddenProperties, display, onDisplayChange, onPatch, onPropertyChange, onOpenProperties, onOpenTask, onOpenProject }: {
  items: OkrptrItem[];
  allItems: OkrptrItem[];
  properties: PropertyDefinition[];
  values: PropertyValueMap;
  hiddenProperties: ProjectHiddenPropertyMap;
  display: "table" | "board";
  onDisplayChange: (display: "table" | "board") => void;
  onPatch: (id: string, patch: Partial<OkrptrItem>) => Promise<void>;
  onPropertyChange: (itemId: string, propertyId: string, value: PropertyValue) => Promise<void>;
  onOpenProperties: () => void;
  onOpenTask: (id: string) => void;
  onOpenProject: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const visible = items.filter((entry) => entry.title.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  const byId = new Map(allItems.map((entry) => [entry.id, entry]));
  const emptyLabel = items.every((entry) => entry.kind === "project") ? "Project" : "Task";
  return (
    <section className="database-section">
      <div className="database-toolbar">
        <div className="view-tabs">
          <button className={display === "table" ? "active" : ""} onClick={() => onDisplayChange("table")}><Table2 size={13} />테이블</button>
          <button className={display === "board" ? "active" : ""} onClick={() => onDisplayChange("board")}><Columns3 size={13} />보드</button>
        </div>
        <div className="database-actions">
          <label className="table-search"><Search size={13} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="검색" /></label>
          <button><Filter size={13} /><span>필터</span></button>
          <button><ArrowDownUp size={13} /><span>정렬</span></button>
          <button onClick={onOpenProperties}><Plus size={13} /><span>속성</span></button>
        </div>
      </div>
      {display === "board" ? <BoardView items={visible} onOpenItem={(entry) => entry.kind === "project" ? onOpenProject(entry.id) : onOpenTask(entry.id)} /> : (
        <div className="database-scroll">
          <div className="task-table" style={{ "--custom-columns": properties.length } as CSSProperties}>
            <div className="task-table-row task-table-head">
              <span><ListChecks size={12} />이름</span><span><Activity size={12} />상태</span><span><Zap size={12} />우선순위</span><span><CalendarDays size={12} />기한</span><span><Link2 size={12} />상위 Initiative</span><span><Users size={12} />DRI</span>
              {properties.map((property) => <span key={property.id}>{property.type === "number" ? <Hash size={12} /> : <TextCursorInput size={12} />}{property.name}</span>)}
              <button aria-label="속성 추가" title="속성 추가" onClick={onOpenProperties}><Plus size={13} /></button>
            </div>
            {visible.map((entry) => (
              <div className="task-table-row" key={entry.id}>
                <div className="name-cell"><span className={`type-icon type-${entry.kind}`}>{kindAbbr(entry.kind)}</span><button className={`task-check ${isCompletedStatus(entry.status) ? "checked" : ""}`} onClick={() => void onPatch(entry.id, { status: isCompletedStatus(entry.status) ? "todo" : "done", progress: isCompletedStatus(entry.status) ? entry.progress : 100 })}><Check size={12} /></button>{entry.kind === "project" ? <button className="name-open-button" onClick={() => onOpenProject(entry.id)}>{entry.title}</button> : <input defaultValue={entry.title} onBlur={(event) => event.target.value.trim() !== entry.title && void onPatch(entry.id, { title: event.target.value })} />}</div>
                <select className={`status-select status-${entry.status}`} value={entry.status} onChange={(event) => void onPatch(entry.id, { status: event.target.value as ItemStatus })}>{Object.entries(statusLabels).filter(([value]) => value !== "archived" && value !== "inbox").map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select>
                <select className={`priority-${entry.priority}`} value={entry.priority} onChange={(event) => void onPatch(entry.id, { priority: event.target.value as Priority })}>{Object.entries(priorityLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select>
                <input className="date-cell" type="date" value={entry.dueDate ?? ""} onChange={(event) => void onPatch(entry.id, { dueDate: event.target.value || null })} />
                <span className="relation-cell">{entry.parentId ? byId.get(entry.parentId)?.title ?? "연결 없음" : "인박스"}</span>
                <span className="relation-cell assignment-cell">{assignmentLabel(entry, "project_dri")}</span>
                {properties.map((property) => (hiddenProperties[entry.id] ?? []).includes(property.id)
                  ? <span className="hidden-property-cell" key={property.id} title="이 Project에서 숨긴 속성">—</span>
                  : <PropertyCell key={property.id} itemId={entry.id} property={property} value={values[entry.id]?.[property.id] ?? null} onChange={onPropertyChange} />)}
                {entry.kind === "task" ? <button className="row-menu" aria-label="Task detail" title="Task detail" onClick={() => onOpenTask(entry.id)}><MoreHorizontal size={15} /></button> : entry.kind === "project" ? <button className="row-menu" aria-label="Project 속성" title="Project 속성" onClick={() => onOpenProject(entry.id)}><MoreHorizontal size={15} /></button> : <span className="row-menu" />}
              </div>
            ))}
            {!visible.length && <div className="table-empty">표시할 {emptyLabel}가 없습니다.</div>}
          </div>
        </div>
      )}
    </section>
  );
}

function PropertyCell({ itemId, property, value, onChange }: { itemId: string; property: PropertyDefinition; value: PropertyValue; onChange: (itemId: string, propertyId: string, value: PropertyValue) => Promise<void> }) {
  if (property.type === "checkbox") return <label className="property-checkbox"><input type="checkbox" checked={Boolean(value)} onChange={(event) => void onChange(itemId, property.id, event.target.checked)} /><span><Check size={11} /></span></label>;
  if (property.type === "select") return <select className="property-input" value={typeof value === "string" ? value : ""} onChange={(event) => void onChange(itemId, property.id, event.target.value || null)}><option value="">-</option>{property.options.map((option) => <option key={option}>{option}</option>)}</select>;
  return <input className="property-input" type={property.type === "number" ? "number" : property.type === "date" ? "date" : "text"} value={value === null ? "" : String(value)} onChange={(event) => { const raw = event.target.value; void onChange(itemId, property.id, property.type === "number" ? (raw ? Number(raw) : null) : raw || null); }} />;
}

function ProjectPageView({ project, allItems, properties, propertyValues, hiddenPropertyIds, teamMembers, onClose, onPatch, onPropertyChange, onPropertyVisibility, onAssignmentsChange, onArchive }: {
  project: OkrptrItem;
  allItems: OkrptrItem[];
  properties: PropertyDefinition[];
  propertyValues: PropertyValueMap;
  hiddenPropertyIds: string[];
  teamMembers: TeamMember[];
  onClose: () => void;
  onPatch: (id: string, patch: Partial<OkrptrItem>) => Promise<void>;
  onPropertyChange: (itemId: string, propertyId: string, value: PropertyValue) => Promise<void>;
  onPropertyVisibility: (propertyId: string, hidden: boolean) => void;
  onAssignmentsChange: (assignments: ItemAssignment[]) => void;
  onArchive: () => void;
}) {
  const byId = new Map(allItems.map((entry) => [entry.id, entry]));
  const initiative = project.parentId ? byId.get(project.parentId) : undefined;
  const keyResult = initiative?.parentId ? byId.get(initiative.parentId) : undefined;
  const objective = keyResult?.parentId ? byId.get(keyResult.parentId) : undefined;
  const initiatives = allItems.filter((entry) => entry.kind === "initiative");
  const visibleProperties = properties.filter((property) => !hiddenPropertyIds.includes(property.id));
  const hiddenPropertyDefinitions = properties.filter((property) => hiddenPropertyIds.includes(property.id));
  const driIds = project.assignments.filter((entry) => entry.role === "project_dri").map((entry) => entry.memberId);
  const workerIds = project.assignments.filter((entry) => entry.role === "project_worker").map((entry) => entry.memberId);

  async function saveAssignments(role: "project_dri" | "project_worker", memberIds: string[]) {
    const response = await fetch("/api/item-assignments", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId: project.id, role, memberIds }),
    });
    if (!response.ok) return;
    const data = await response.json() as { assignments: ItemAssignment[] };
    onAssignmentsChange(data.assignments);
  }
  return (
    <div className="modal-backdrop align-right">
      <aside className={`property-panel project-detail-panel ${project.status === "archived" ? "archived" : ""}`}>
        <header className="project-page-head">
          <div>
            <p>Project page</p>
            <input
              className="project-title-input"
              defaultValue={project.title}
              onBlur={(event) => event.target.value.trim() !== project.title && void onPatch(project.id, { title: event.target.value })}
              aria-label="Project 이름"
            />
          </div>
          <div className="project-page-actions">
            <button type="button" onClick={onArchive}><Archive size={13} />아카이브</button>
            <button className="icon-button" onClick={onClose} aria-label="닫기"><X size={17} /></button>
          </div>
        </header>
        <form className="property-form project-detail-form">
          <label><span>상위 Initiative</span><select value={project.parentId ?? ""} onChange={(event) => void onPatch(project.id, { parentId: event.target.value || null })}><option value="">선택</option>{initiatives.map((entry) => <option value={entry.id} key={entry.id}>{entry.title}</option>)}</select></label>
          <div className="project-field-grid">
            <label><span>우선순위</span><select className={`priority-${project.priority}`} value={project.priority} onChange={(event) => void onPatch(project.id, { priority: event.target.value as Priority })}>{Object.entries(priorityLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
            <label><span>상태</span><select value={project.status} onChange={(event) => void onPatch(project.id, { status: event.target.value as ItemStatus })}>{Object.entries(statusLabels).filter(([value]) => value !== "inbox" && value !== "archived").map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
            <label><span>주기</span><select value={project.cadence} onChange={(event) => void onPatch(project.id, { cadence: event.target.value as Cadence })}>{Object.entries(cadenceLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
            <label><span>기한</span><input type="date" value={project.dueDate ?? ""} onChange={(event) => void onPatch(project.id, { dueDate: event.target.value || null })} /></label>
          </div>
          {teamMembers.length > 0 && <MemberMentionPicker label="DRI" members={teamMembers} selectedIds={driIds} onChange={(ids) => void saveAssignments("project_dri", ids)} placeholder="@실명으로 찾기" maxSelected={1} />}
          {teamMembers.length > 0 && <MemberMentionPicker label="하위 업무자" members={teamMembers} selectedIds={workerIds} onChange={(ids) => void saveAssignments("project_worker", ids)} placeholder="@실명으로 여러 명 태그" />}
        </form>
        <section className="project-page-body">
          <label>
            <span>본문</span>
            <textarea
              defaultValue={project.description}
              rows={13}
              placeholder={"# 배경\n\n## 범위\n\n## 결정사항\n\n## 다음 액션"}
              onBlur={(event) => event.target.value !== project.description && void onPatch(project.id, { description: event.target.value })}
            />
          </label>
        </section>
        <section className="task-lineage">
          <header><b>상위 OKR</b><span>Objective → KR → Initiative</span></header>
          <LineageRow label="Objective" value={objective?.title ?? "미연결"} />
          <LineageRow label="Key Result" value={keyResult?.title ?? "미연결"} />
          <LineageRow label="Initiative" value={initiative?.title ?? "미연결"} />
        </section>
        <section className="project-custom-properties">
          <header><b>Project 속성</b><span>변경 즉시 저장</span></header>
          {visibleProperties.length ? visibleProperties.map((property) => <ProjectPropertyField key={property.id} projectId={project.id} property={property} value={propertyValues[project.id]?.[property.id] ?? null} onChange={onPropertyChange} onHide={() => onPropertyVisibility(property.id, true)} />) : <EmptyState icon={Settings2} title="표시 중인 Project 속성이 없습니다" />}
          {hiddenPropertyDefinitions.length > 0 && <div className="hidden-property-list"><span>숨긴 속성 {hiddenPropertyDefinitions.length}</span>{hiddenPropertyDefinitions.map((property) => <button key={property.id} onClick={() => onPropertyVisibility(property.id, false)}><Eye size={13} />{property.name}</button>)}</div>}
        </section>
      </aside>
    </div>
  );
}

function ProjectPropertyField({ projectId, property, value, onChange, onHide }: { projectId: string; property: PropertyDefinition; value: PropertyValue; onChange: (itemId: string, propertyId: string, value: PropertyValue) => Promise<void>; onHide: () => void }) {
  return (
    <div className="project-property-field-row">
      <label className="project-property-field">
        <span>{property.name}</span>
        {property.type === "checkbox" ? (
          <input type="checkbox" checked={Boolean(value)} onChange={(event) => void onChange(projectId, property.id, event.target.checked)} />
        ) : property.type === "select" ? (
          <select value={typeof value === "string" ? value : ""} onChange={(event) => void onChange(projectId, property.id, event.target.value || null)}><option value="">선택 안 함</option>{property.options.map((option) => <option key={option}>{option}</option>)}</select>
        ) : (
          <input type={property.type === "number" ? "number" : property.type === "date" ? "date" : "text"} value={value === null ? "" : String(value)} onChange={(event) => { const raw = event.target.value; void onChange(projectId, property.id, property.type === "number" ? (raw ? Number(raw) : null) : raw || null); }} />
        )}
      </label>
      <button className="icon-button" onClick={onHide} aria-label={`${property.name} 숨기기`} title="이 Project에서 숨기기"><EyeOff size={14} /></button>
    </div>
  );
}

function TaskDetailPanel({ task, allItems, routines, teamMembers, onClose, onProgress, onAssignmentsChange, onNotice }: {
  task: OkrptrItem;
  allItems: OkrptrItem[];
  routines: Routine[];
  teamMembers: TeamMember[];
  onClose: () => void;
  onProgress: (progress: number) => void;
  onAssignmentsChange: (assignments: ItemAssignment[]) => void;
  onNotice: (message: string) => void;
}) {
  const [rows, setRows] = useState<ChecklistItem[]>([]);
  const [title, setTitle] = useState("");
  const [syncingCalendar, setSyncingCalendar] = useState(false);
  const byId = new Map(allItems.map((entry) => [entry.id, entry]));
  const project = task.parentId ? byId.get(task.parentId) : undefined;
  const initiative = project?.parentId ? byId.get(project.parentId) : undefined;
  const keyResult = initiative?.parentId ? byId.get(initiative.parentId) : undefined;
  const objective = keyResult?.parentId ? byId.get(keyResult.parentId) : undefined;
  const routine = task.routineId ? routines.find((entry) => entry.id === task.routineId) : undefined;
  const projectDri = project ? assignmentLabel(project, "project_dri") : "미지정";
  const assigneeIds = task.assignments.filter((entry) => entry.role === "task_assignee").map((entry) => entry.memberId);
  const lineageTitle = routine ? `Routine · ${routine.title}` : project ? `Project · ${project.title}` : "인박스";
  useEffect(() => {
    fetch(`/api/checklists?taskId=${encodeURIComponent(task.id)}`)
      .then(async (response) => response.ok ? response.json() as Promise<{ items: ChecklistItem[] }> : Promise.reject())
      .then((data) => setRows(data.items))
      .catch(() => setRows([]));
  }, [task.id]);

  function updateProgress(nextRows: ChecklistItem[]) {
    onProgress(nextRows.length ? Math.round((nextRows.filter((entry) => entry.completed).length / nextRows.length) * 100) : 0);
  }

  async function saveAssignee(memberIds: string[]) {
    const response = await fetch("/api/item-assignments", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId: task.id, role: "task_assignee", memberIds }),
    });
    if (!response.ok) {
      onNotice("담당자를 저장하지 못했습니다.");
      return;
    }
    const data = await response.json() as { assignments: ItemAssignment[] };
    onAssignmentsChange(data.assignments);
  }

  async function addRow(event: FormEvent) {
    event.preventDefault();
    if (!title.trim()) return;
    const response = await fetch("/api/checklists", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ taskId: task.id, title }) });
    if (!response.ok) return;
    const data = await response.json() as { item: ChecklistItem };
    const next = [...rows, data.item];
    setRows(next); setTitle(""); updateProgress(next);
  }

  async function toggleRow(row: ChecklistItem) {
    const completed = !row.completed;
    const next = rows.map((entry) => entry.id === row.id ? { ...entry, completed } : entry);
    setRows(next); updateProgress(next);
    await fetch("/api/checklists", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: row.id, completed }) });
  }

  async function deleteRow(id: string) {
    const next = rows.filter((entry) => entry.id !== id);
    setRows(next); updateProgress(next);
    await fetch(`/api/checklists?id=${encodeURIComponent(id)}`, { method: "DELETE" });
  }

  async function syncCalendar() {
    if (!task.dueDate) {
      onNotice("기한이 있는 Task만 Google Calendar로 보낼 수 있습니다.");
      return;
    }
    setSyncingCalendar(true);
    try {
      const response = await fetch("/api/google/calendar-event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: task.id }),
      });
      const data = await response.json() as { event?: { htmlLink?: string }; code?: string; error?: string };
      if (!response.ok) {
        if (data.code === "google_not_connected") onNotice("먼저 연동에서 Google Calendar를 연결해 주세요.");
        else if (data.code === "missing_google_config") onNotice("Google OAuth 설정이 아직 필요합니다.");
        else onNotice(data.error ?? "Google Calendar 동기화에 실패했습니다.");
        return;
      }
      onNotice("Google Calendar에 반영했습니다.");
      if (data.event?.htmlLink) window.open(data.event.htmlLink, "_blank", "noopener,noreferrer");
    } finally {
      setSyncingCalendar(false);
    }
  }

  return (
    <div className="modal-backdrop align-right">
      <aside className="property-panel task-detail-panel">
        <header><div><p>{lineageTitle}</p><h2>{task.title}</h2></div><button className="icon-button" onClick={onClose} aria-label="닫기"><X size={17} /></button></header>
        <div className="task-meta"><span className={`status-tag status-${task.status}`}>{statusLabel(task.status)}</span><span><CalendarDays size={13} />{dueLabel(task.dueDate)}</span><b>{task.progress}%</b></div>
        {teamMembers.length > 0 && <section className="task-assignee-editor"><MemberMentionPicker label="담당자" members={teamMembers} selectedIds={assigneeIds} onChange={(ids) => void saveAssignee(ids)} placeholder="@실명으로 찾기" maxSelected={1} /></section>}
        <section className="task-lineage">
          <header><b>상위 맵핑</b><span>{routine ? "Routine 기반 Task" : project ? "OKR 실행 구조" : "아직 연결 전"}</span></header>
          {routine ? (
            <>
              <LineageRow label="Routine" value={routine.title} />
              <LineageRow label="트리거" value={routine.triggerPoint || "미지정"} />
              <LineageRow label="어디서/어떻게" value={[routine.actionPlace, routine.actionSteps].filter(Boolean).join(" · ") || "미지정"} />
            </>
          ) : (
            <>
              <LineageRow label="Objective" value={objective?.title ?? "미연결"} />
              <LineageRow label="Key Result" value={keyResult?.title ?? "미연결"} />
              <LineageRow label="Initiative" value={initiative?.title ?? "미연결"} />
              <LineageRow label="Project" value={project?.title ?? "미연결"} />
              {project && <div className="lineage-project-meta"><span>우선순위 <b>{priorityLabels[project.priority]}</b></span><span>DRI <b>{projectDri}</b></span><span>상태 <b>{statusLabel(project.status)}</b></span><span>기한 <b>{dueLabel(project.dueDate)}</b></span></div>}
            </>
          )}
        </section>
        <div className="task-calendar-action"><button onClick={() => void syncCalendar()} disabled={syncingCalendar || !task.dueDate}><CalendarDays size={13} />{syncingCalendar ? "동기화 중" : "Google Calendar에 보내기"}</button></div>
        <section className="checklist-section"><header><b>체크리스트</b><span>{rows.filter((entry) => entry.completed).length}/{rows.length}</span></header><div>{rows.map((row) => <div className="checklist-row" key={row.id}><button className={`task-check ${row.completed ? "checked" : ""}`} onClick={() => void toggleRow(row)}><Check size={12} /></button><span className={row.completed ? "completed" : ""}>{row.title}</span><button className="icon-button" onClick={() => void deleteRow(row.id)} aria-label="삭제"><Trash2 size={13} /></button></div>)}</div><form className="checklist-form" onSubmit={addRow}><Plus size={14} /><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="항목 추가" /><button disabled={!title.trim()}>추가</button></form></section>
      </aside>
    </div>
  );
}

function LineageRow({ label, value }: { label: string; value: string }) {
  return <div className="lineage-row"><span>{label}</span><b>{value}</b></div>;
}

function memberInitial(member: Pick<TeamMember, "displayName" | "email">) {
  return (member.displayName || member.email || "?").slice(0, 1).toLocaleUpperCase();
}

function memberNameNeedsConfirmation(member: Pick<TeamMember, "displayName" | "email">) {
  const name = member.displayName.trim();
  if (!name || name === "Member" || /^\S+@\S+\.\S+$/.test(name)) return true;
  const emailName = member.email.split("@")[0]?.trim();
  return Boolean(emailName && name.toLocaleLowerCase() === emailName.toLocaleLowerCase());
}

function profileNameConfirmationKey(member: Pick<TeamMember, "id">) {
  return `okrptr.profile-name-confirmed.${member.id}`;
}

function matchesMember(member: TeamMember, query: string) {
  const normalized = query.replace(/^@/, "").trim().toLocaleLowerCase();
  if (!normalized) return true;
  return `${member.displayName} ${member.email}`.toLocaleLowerCase().includes(normalized);
}

function pickMembers(members: TeamMember[], ids: string[]) {
  const byId = new Map(members.map((member) => [member.id, member]));
  return ids.map((id) => byId.get(id)).filter((member): member is TeamMember => Boolean(member));
}

function assignmentLabel(item: OkrptrItem, role: ItemAssignmentRole) {
  const names = item.assignments.filter((entry) => entry.role === role).map((entry) => `@${entry.displayName}`);
  return names.length ? names.join(", ") : "미지정";
}

function MemberMentionPicker({
  label,
  members,
  selectedIds,
  onChange,
  placeholder,
  maxSelected,
  disabled = false,
}: {
  label: string;
  members: TeamMember[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  placeholder: string;
  maxSelected?: number;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const selectedMembers = pickMembers(members, selectedIds);
  const selectedSet = new Set(selectedIds);
  const candidates = members
    .filter((member) => !selectedSet.has(member.id) && matchesMember(member, query))
    .slice(0, 7);
  const atLimit = typeof maxSelected === "number" && selectedIds.length >= maxSelected;

  function add(id: string) {
    if (disabled || selectedSet.has(id)) return;
    onChange(maxSelected === 1 ? [id] : [...selectedIds, id]);
    setQuery("");
    setOpen(false);
  }

  function remove(id: string) {
    if (disabled) return;
    onChange(selectedIds.filter((entry) => entry !== id));
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" && candidates[0] && !atLimit) {
      event.preventDefault();
      add(candidates[0].id);
      return;
    }
    if (event.key === "Backspace" && !query && selectedIds.length) {
      onChange(selectedIds.slice(0, -1));
    }
  }

  return (
    <label className="member-mention-field">
      <span>{label}</span>
      <div className={`member-mention-box ${open ? "active" : ""} ${disabled ? "disabled" : ""}`}>
        {selectedMembers.map((member) => (
          <button type="button" className="member-chip" key={member.id} onClick={() => remove(member.id)} disabled={disabled} title={`${member.displayName} 제거`}>
            <span className="team-avatar">{memberInitial(member)}</span>
            <b>@{member.displayName}</b>
            <X size={11} />
          </button>
        ))}
        {!atLimit && (
          <div className="member-mention-input">
            <AtSign size={13} />
            <input
              value={query}
              onChange={(event) => { setQuery(event.target.value); setOpen(true); }}
              onFocus={() => setOpen(true)}
              onBlur={() => window.setTimeout(() => setOpen(false), 120)}
              onKeyDown={handleKeyDown}
              placeholder={selectedMembers.length ? "" : placeholder}
              disabled={disabled}
            />
          </div>
        )}
      </div>
      {open && !disabled && !atLimit && (
        <div className="member-mention-menu">
          {candidates.length ? candidates.map((member) => (
            <button type="button" key={member.id} onMouseDown={(event) => event.preventDefault()} onClick={() => add(member.id)}>
              <span className="team-avatar">{memberInitial(member)}</span>
              <b>{member.displayName}</b>
              <small>{member.email || teamRoleLabel(member.role)}</small>
            </button>
          )) : <p>일치하는 멤버가 없습니다</p>}
        </div>
      )}
    </label>
  );
}

function CreateItemPanel({ initialKind, items, routines, properties, teamMembers, onClose, onCreated }: {
  initialKind: ItemKind;
  items: OkrptrItem[];
  routines: Routine[];
  properties: PropertyDefinition[];
  teamMembers: TeamMember[];
  onClose: () => void;
  onCreated: (item: OkrptrItem, initialValues?: Record<string, PropertyValue>) => void;
}) {
  const [kind, setKind] = useState<ItemKind>(initialKind);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [parentId, setParentId] = useState("");
  const [taskContainer, setTaskContainer] = useState("");
  const [status, setStatus] = useState<ItemStatus>("todo");
  const [priority, setPriority] = useState<Priority>("medium");
  const [cadence, setCadence] = useState<Cadence>("weekly");
  const [dueDate, setDueDate] = useState("");
  const [customValues, setCustomValues] = useState<Record<string, PropertyValue>>({});
  const [projectDriIds, setProjectDriIds] = useState<string[]>([]);
  const [projectWorkerIds, setProjectWorkerIds] = useState<string[]>([]);
  const [taskAssigneeIds, setTaskAssigneeIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const requiredParent: Record<ItemKind, ItemKind | null> = { objective: null, key_result: "objective", initiative: "key_result", project: "initiative", task: "project" };
  const parentKind = requiredParent[kind];
  const parentOptions = parentKind ? items.filter((entry) => entry.kind === parentKind) : [];
  const projectProperties = kind === "project" ? properties : [];

  function updateCustomValue(property: PropertyDefinition, value: string | boolean) {
    setCustomValues((current) => ({
      ...current,
      [property.id]: property.type === "number" ? (value === "" ? null : Number(value)) : value === "" ? null : value,
    }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!title.trim() || saving || (kind !== "objective" && kind !== "task" && !parentId)) return;
    setSaving(true);
    const routineId = kind === "task" && taskContainer.startsWith("routine:") ? taskContainer.slice(8) : null;
    const taskParentId = kind === "task" && taskContainer.startsWith("project:") ? taskContainer.slice(8) : null;
    const nextParentId = kind === "task" ? taskParentId : parentId || null;
    const nextDescription = kind === "project" ? description.trim() : "";
    const response = await fetch("/api/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        kind,
        description: nextDescription,
        parentId: nextParentId,
        routineId,
        status: kind === "task" && !nextParentId && !routineId ? "inbox" : status,
        priority,
        cadence,
        dueDate: dueDate || null,
        driMemberId: kind === "project" ? projectDriIds[0] ?? "" : undefined,
        workerMemberIds: kind === "project" ? projectWorkerIds : undefined,
        assigneeMemberId: kind === "task" ? taskAssigneeIds[0] ?? "" : undefined,
      }),
    });
    if (!response.ok) { setSaving(false); return; }
    const data = await response.json() as { item: OkrptrItem };
    const filledValues = Object.fromEntries(Object.entries(customValues).filter(([, value]) => value !== null && value !== ""));
    for (const [propertyId, value] of kind === "project" ? Object.entries(filledValues) : []) {
      const propertyResponse = await fetch("/api/property-values", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: data.item.id, propertyId, value }),
      });
      if (!propertyResponse.ok) break;
    }
    setSaving(false);
    onCreated(data.item, filledValues);
  }
  return (
    <div className="modal-backdrop align-right">
      <aside className="property-panel">
        <header><div><h2>새 항목</h2><p>{kind === "project" ? "Project 속성을 지정해서 추가" : "OKR 실행 구조에 추가"}</p></div><button className="icon-button" onClick={onClose}><X size={17} /></button></header>
        <form className="property-form create-item-form" onSubmit={submit}>
          <label><span>유형</span><select value={kind} onChange={(event) => { setKind(event.target.value as ItemKind); setParentId(""); setTaskContainer(""); }} disabled={initialKind === "project"}>{(["objective", "key_result", "initiative", "project", "task"] as ItemKind[]).map((entry) => <option value={entry} key={entry}>{kindLabel(entry)}</option>)}</select></label>
          <label><span>이름</span><input value={title} onChange={(event) => setTitle(event.target.value)} /></label>
          {kind === "task" ? (
            <label><span>상위 연결</span><select value={taskContainer} onChange={(event) => setTaskContainer(event.target.value)}><option value="">인박스에 저장</option><optgroup label="Project">{items.filter((entry) => entry.kind === "project").map((entry) => <option value={`project:${entry.id}`} key={entry.id}>{entry.title}</option>)}</optgroup><optgroup label="Routine">{routines.map((entry) => <option value={`routine:${entry.id}`} key={entry.id}>{entry.title}</option>)}</optgroup></select></label>
          ) : parentKind && (
            <label><span>상위 {kindLabel(parentKind)}</span><select value={parentId} onChange={(event) => setParentId(event.target.value)}><option value="">선택</option>{parentOptions.map((entry) => <option value={entry.id} key={entry.id}>{entry.title}</option>)}</select></label>
          )}
          {kind === "project" && (
            <section className="create-project-fields">
              <header><b>Project 속성</b><span>생성할 때 바로 지정</span></header>
              <label><span>본문</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={6} placeholder={"# 배경\n\n## 범위\n\n## 다음 액션"} /></label>
              <div className="project-field-grid">
                <label><span>우선순위</span><select className={`priority-${priority}`} value={priority} onChange={(event) => setPriority(event.target.value as Priority)}>{Object.entries(priorityLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
                <label><span>상태</span><select value={status} onChange={(event) => setStatus(event.target.value as ItemStatus)}>{Object.entries(statusLabels).filter(([value]) => value !== "inbox" && value !== "archived").map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
                <label><span>주기</span><select value={cadence} onChange={(event) => setCadence(event.target.value as Cadence)}>{Object.entries(cadenceLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
                <label><span>기한</span><input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></label>
              </div>
              {teamMembers.length > 0 && (
                <MemberMentionPicker label="DRI" members={teamMembers} selectedIds={projectDriIds} onChange={setProjectDriIds} placeholder="@실명으로 찾기" maxSelected={1} />
              )}
              {teamMembers.length > 0 && (
                <MemberMentionPicker label="하위 업무자" members={teamMembers} selectedIds={projectWorkerIds} onChange={setProjectWorkerIds} placeholder="@실명으로 여러 명 태그" />
              )}
              {projectProperties.length > 0 && <div className="project-field-grid custom-project-fields">{projectProperties.map((property) => <CreatePropertyField key={property.id} property={property} value={customValues[property.id] ?? null} onChange={updateCustomValue} />)}</div>}
            </section>
          )}
          {kind === "task" && teamMembers.length > 0 && (
            <MemberMentionPicker label="담당자" members={teamMembers} selectedIds={taskAssigneeIds} onChange={setTaskAssigneeIds} placeholder="@실명으로 찾기" maxSelected={1} />
          )}
          <button disabled={!title.trim() || saving}>{saving ? "저장 중" : "만들기"}</button>
        </form>
      </aside>
    </div>
  );
}

function CreatePropertyField({ property, value, onChange }: { property: PropertyDefinition; value: PropertyValue; onChange: (property: PropertyDefinition, value: string | boolean) => void }) {
  if (property.type === "checkbox") {
    return <label><span>{property.name}</span><input type="checkbox" checked={Boolean(value)} onChange={(event) => onChange(property, event.target.checked)} /></label>;
  }
  if (property.type === "select") {
    return <label><span>{property.name}</span><select value={typeof value === "string" ? value : ""} onChange={(event) => onChange(property, event.target.value)}><option value="">선택 안 함</option>{property.options.map((option) => <option key={option}>{option}</option>)}</select></label>;
  }
  return <label><span>{property.name}</span><input type={property.type === "number" ? "number" : property.type === "date" ? "date" : "text"} value={value === null ? "" : String(value)} onChange={(event) => onChange(property, event.target.value)} /></label>;
}

function RoutineView({ onNotice, onRoutinesChange }: { onNotice: (message: string) => void; onRoutinesChange: (routines: Routine[]) => void }) {
  const [date, setDate] = useState(localDate());
  const [rows, setRows] = useState<Routine[] | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [triggerPoint, setTriggerPoint] = useState("");
  const [actionPlace, setActionPlace] = useState("");
  const [actionSteps, setActionSteps] = useState("");
  const [cadence, setCadence] = useState<RoutineCadence>("daily");
  const [drafts, setDrafts] = useState<Record<string, Pick<Routine, "description" | "triggerPoint" | "actionPlace" | "actionSteps">>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`/api/routines?date=${date}`)
      .then(async (response) => response.ok ? response.json() as Promise<{ routines: Routine[] }> : Promise.reject())
      .then((data) => { setRows(data.routines); onRoutinesChange(data.routines); })
      .catch(() => setRows([]));
  }, [date, onRoutinesChange]);

  async function create(event: FormEvent) {
    event.preventDefault();
    if (!title.trim() || saving) return;
    setSaving(true);
    const response = await fetch("/api/routines", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, description, triggerPoint, actionPlace, actionSteps, cadence, date }),
    });
    setSaving(false);
    if (!response.ok) return;
    const data = await response.json() as { routine: Routine };
    setRows((current) => {
      const next = [...(current ?? []), data.routine];
      onRoutinesChange(next);
      return next;
    });
    setTitle("");
    setDescription("");
    setTriggerPoint("");
    setActionPlace("");
    setActionSteps("");
    onNotice("루틴을 추가했습니다.");
  }

  async function toggleCompletion(routine: Routine) {
    const completed = !routine.completed;
    setRows((current) => current?.map((entry) => entry.id === routine.id ? { ...entry, completed } : entry) ?? null);
    const response = await fetch("/api/routine-completions", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ routineId: routine.id, date, completed }),
    });
    if (response.ok) {
      const data = await response.json() as { routine: Routine };
      setRows((current) => {
        const next = current?.map((entry) => entry.id === routine.id ? data.routine : entry) ?? [];
        onRoutinesChange(next);
        return next;
      });
    }
  }

  async function toggleActive(routine: Routine) {
    const active = !routine.active;
    setRows((current) => current?.map((entry) => entry.id === routine.id ? { ...entry, active } : entry) ?? null);
    await fetch("/api/routines", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: routine.id, active, date }),
    });
  }

  function routineDraft(routine: Routine) {
    return drafts[routine.id] ?? {
      description: routine.description,
      triggerPoint: routine.triggerPoint,
      actionPlace: routine.actionPlace,
      actionSteps: routine.actionSteps,
    };
  }

  function updateDraft(routine: Routine, field: "description" | "triggerPoint" | "actionPlace" | "actionSteps", value: string) {
    setDrafts((current) => ({ ...current, [routine.id]: { ...routineDraft(routine), [field]: value } }));
  }

  function hasDraftChange(routine: Routine) {
    const draft = drafts[routine.id];
    return Boolean(draft) && (
      draft.description !== routine.description ||
      draft.triggerPoint !== routine.triggerPoint ||
      draft.actionPlace !== routine.actionPlace ||
      draft.actionSteps !== routine.actionSteps
    );
  }

  async function saveRoutineGuide(routine: Routine) {
    const draft = routineDraft(routine);
    setSaving(true);
    const response = await fetch("/api/routines", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: routine.id, date, ...draft }),
    });
    setSaving(false);
    if (!response.ok) return;
    const data = await response.json() as { routine: Routine };
    setRows((current) => {
      const next = current?.map((entry) => entry.id === routine.id ? data.routine : entry) ?? [];
      onRoutinesChange(next);
      return next;
    });
    setDrafts((current) => {
      const next = { ...current };
      delete next[routine.id];
      return next;
    });
    onNotice("루틴 실행 방법을 저장했습니다.");
  }

  async function remove(id: string) {
    const response = await fetch(`/api/routines?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (response.ok) {
      setRows((current) => {
        const next = current?.filter((entry) => entry.id !== id) ?? [];
        onRoutinesChange(next);
        return next;
      });
      onNotice("루틴을 삭제했습니다.");
    }
  }

  return (
    <section className="routine-section">
      <div className="routine-toolbar">
        <label><CalendarDays size={14} /><input type="date" value={date} onChange={(event) => { setRows(null); setDate(event.target.value); }} /></label>
        <form className="routine-create" onSubmit={create}>
          <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="루틴 이름" aria-label="루틴 이름" />
          <select value={cadence} onChange={(event) => setCadence(event.target.value as RoutineCadence)} aria-label="반복 주기"><option value="daily">매일</option><option value="weekly">매주</option><option value="monthly">매월</option></select>
          <input value={triggerPoint} onChange={(event) => setTriggerPoint(event.target.value)} placeholder="트리거 포인트" aria-label="트리거 포인트" />
          <input value={actionPlace} onChange={(event) => setActionPlace(event.target.value)} placeholder="어디서" aria-label="어디서 실행" />
          <input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="목적/메모" aria-label="루틴 목적" />
          <textarea value={actionSteps} onChange={(event) => setActionSteps(event.target.value)} placeholder="무엇을 어떻게 할지" aria-label="실행 방법" rows={2} />
          <button disabled={!title.trim() || saving} aria-label="루틴 추가" title="루틴 추가"><Plus size={14} /></button>
        </form>
      </div>
      <div className="routine-cards">
        {rows === null ? <EmptyState icon={Repeat2} title="루틴을 불러오는 중입니다" /> : rows.length ? rows.map((routine) => {
          const draft = routineDraft(routine);
          return (
            <article className={`routine-card ${routine.active ? "" : "inactive"}`} key={routine.id}>
              <header>
                <button className={`task-check ${routine.completed ? "checked" : ""}`} disabled={!routine.active} onClick={() => void toggleCompletion(routine)} aria-label={routine.completed ? "완료 취소" : "완료 처리"}><Check size={12} /></button>
                <div><b>{routine.title}</b><small>{routineCadenceLabel(routine.cadence)} · {routine.completed ? "오늘 완료" : "오늘 미완료"}</small></div>
                <label className="routine-switch"><input type="checkbox" checked={routine.active} onChange={() => void toggleActive(routine)} /><span /><em className="sr-only">루틴 활성 상태</em></label>
                <button className="icon-button" onClick={() => void remove(routine.id)} aria-label="루틴 삭제" title="루틴 삭제"><Trash2 size={13} /></button>
              </header>
              <div className="routine-guide-grid">
                <label><span>트리거 포인트</span><input value={draft.triggerPoint} onChange={(event) => updateDraft(routine, "triggerPoint", event.target.value)} placeholder="예: 오전 9시, Slack 알림 확인 후" /></label>
                <label><span>어디서</span><input value={draft.actionPlace} onChange={(event) => updateDraft(routine, "actionPlace", event.target.value)} placeholder="예: OKRPTR 작업 탭, 캘린더, 책상" /></label>
                <label><span>목적/메모</span><input value={draft.description} onChange={(event) => updateDraft(routine, "description", event.target.value)} placeholder="왜 반복하는지" /></label>
                <label className="routine-steps"><span>무엇을 어떻게</span><textarea value={draft.actionSteps} onChange={(event) => updateDraft(routine, "actionSteps", event.target.value)} placeholder="1. 확인할 것&#10;2. 실행할 것&#10;3. 끝났다고 판단하는 기준" rows={3} /></label>
              </div>
              <footer>
                <button className="primary-action" disabled={!hasDraftChange(routine) || saving} onClick={() => void saveRoutineGuide(routine)}><Check size={14} />저장</button>
              </footer>
            </article>
          );
        }) : <EmptyState icon={Repeat2} title="등록된 루틴이 없습니다" />}
      </div>
    </section>
  );
}

function DailyScrumView({ onOpenTask, onNotice }: { onOpenTask: (id: string) => void; onNotice: (message: string) => void }) {
  const [date, setDate] = useState(localDate());
  const [scrum, setScrum] = useState<Scrum | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    fetch(`/api/daily-scrum?date=${date}`).then(async (response) => response.json() as Promise<{ scrum: Scrum }>).then((data) => setScrum(data.scrum));
  }, [date]);
  if (!scrum) return <EmptyState icon={CalendarCheck} title="데일리 스크럼을 불러오는 중입니다" />;
  async function save() {
    setSaving(true);
    const response = await fetch("/api/daily-scrum", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(scrum) });
    setSaving(false);
    if (response.ok) onNotice("데일리 스크럼을 저장했습니다.");
  }
  const sections: { key: "yesterdayNote" | "todayNote" | "blockersNote"; title: string; tasks: OkrptrItem[]; icon: LucideIcon }[] = [
    { key: "yesterdayNote", title: "어제 완료", tasks: scrum.yesterdayTasks, icon: CheckCircle2 },
    { key: "todayNote", title: "오늘 집중", tasks: scrum.todayTasks, icon: Target },
    { key: "blockersNote", title: "막힘", tasks: scrum.blockers, icon: CircleHelp },
  ];
  return <section className="scrum-section"><div className="scrum-toolbar"><label><CalendarDays size={14} /><input type="date" value={date} onChange={(event) => { setScrum(null); setDate(event.target.value); }} /></label><button className="primary-action" onClick={() => void save()} disabled={saving}><Check size={14} />{saving ? "저장 중" : "저장"}</button></div><div className="scrum-grid">{sections.map((section) => { const Icon = section.icon; return <section className="scrum-column" key={section.key}><header><Icon size={15} /><b>{section.title}</b><span>{section.tasks.length}</span></header><div className="scrum-task-list">{section.tasks.map((task) => <button key={task.id} onClick={() => onOpenTask(task.id)}><span className={`status-dot status-${task.status}`} /><b>{task.title}</b><small>{dueLabel(task.dueDate)}</small></button>)}{!section.tasks.length && <span className="empty-column">자동으로 모인 Task가 없습니다</span>}</div><textarea value={scrum[section.key]} onChange={(event) => setScrum({ ...scrum, [section.key]: event.target.value })} placeholder="메모" /></section>; })}</div></section>;
}

function RecommendationsView({ onNavigate }: { onNavigate: (view: View) => void }) {
  const [rows, setRows] = useState<Recommendation[] | null>(null);
  useEffect(() => { fetch(`/api/recommendations?date=${localDate()}`).then(async (response) => response.json() as Promise<{ recommendations: Recommendation[] }>).then((data) => setRows(data.recommendations)).catch(() => setRows([])); }, []);
  if (!rows) return <EmptyState icon={Lightbulb} title="추천을 계산하는 중입니다" />;
  if (!rows.length) return <EmptyState icon={CheckCircle2} title="지금 바로 정리할 항목이 없습니다" />;
  return <section className="recommendation-list">{rows.map((row) => <article className="recommendation-row" key={row.id}><span className={`recommendation-icon recommendation-${row.kind}`}>{recommendationIcon(row.kind)}</span><div><h3>{row.title}</h3><p>{row.detail}</p><small>{row.itemIds.length}개 항목 · 우선순위 {row.score}</small></div><button onClick={() => onNavigate(row.kind === "unlinked" ? "inbox" : row.kind === "empty_project" ? "okr" : "work")}><ChevronRight size={15} /></button></article>)}</section>;
}

function HomeView({ onCreatePlan }: {
  onCreatePlan: (plan: OnboardingPlan) => Promise<boolean>;
}) {
  return (
    <div className="home-layout">
      <HomeOkrChat onCreate={onCreatePlan} />
    </div>
  );
}

function HomeOkrChat({ onCreate }: { onCreate: (plan: OnboardingPlan) => Promise<boolean> }) {
  const emptyPlan: OnboardingPlan = {
    objective: "",
    keyResult: "",
    initiative: "",
    project: "",
    tasks: "",
    routineTitle: "",
    routineTrigger: "",
    routinePlace: "",
    routineSteps: "",
  };
  const [message, setMessage] = useState("");
  const [plan, setPlan] = useState<OnboardingPlan>({
    ...emptyPlan,
  });
  const [assistantMessage, setAssistantMessage] = useState("OKR에 대해 편하게 적어 주세요. 목표, 지표, 실행 프로젝트, 할 일, 루틴 후보로 정리해드립니다. 처음이면 아래 버튼으로 시작해도 됩니다.");
  const [guideQuestions, setGuideQuestions] = useState<string[]>([]);
  const [draftOpen, setDraftOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const saveLabel = !plan.objective.trim() && plan.routineTitle.trim() ? "루틴 만들기" : "OKR 만들기";
  function patch(field: keyof OnboardingPlan, value: string) {
    setPlan((current) => ({ ...current, [field]: value }));
  }
  function organizeLocally(text: string) {
    const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
    const metricLine = lines.find((line) => /kr|key result|핵심|지표|측정|%|명|건|회|원/i.test(line));
    const actionLines = lines.filter((line) => /해야|하기|정리|확인|만들|준비|진행|검토|배포|인터뷰|실험|측정|개선/i.test(line));
    setPlan((current) => ({
      ...current,
      objective: current.objective || lines[0] || text,
      keyResult: current.keyResult || metricLine || "",
      initiative: current.initiative || lines[1] || "",
      project: current.project || "",
      tasks: current.tasks || actionLines.slice(0, 5).join("\n"),
    }));
    setDraftOpen(true);
    setAssistantMessage("말씀하신 내용을 기본 방식으로 OKR 초안으로 나눴습니다. OpenAI API 키가 설정되면 문맥을 더 깊게 읽어 정리합니다.");
    setGuideQuestions([]);
  }
  async function organizeMessage() {
    const text = message.trim();
    if (!text) return;
    setSaving(true);
    try {
      const response = await fetch("/api/okr-organize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, plan }),
      });
      const data = await response.json() as ({ organized: OrganizedOkr } & OrganizeError);
      if (!response.ok) {
        if (data.code?.startsWith("ai_")) {
          organizeLocally(text);
          setAssistantMessage(aiLimitMessage(data));
          setGuideQuestions(data.options?.length ? data.options : ["유료 플랜으로 서버 AI 정리 계속 사용", "개인 OpenAI API 키 연결", "ChatGPT에서 OKRPTR MCP로 연결해 직접 정리"]);
          return;
        }
        throw new Error("organize failed");
      }
      setPlan(data.organized.plan);
      setDraftOpen(true);
      setAssistantMessage(data.organized.assistantMessage);
      setGuideQuestions(data.organized.questions);
    } catch {
      organizeLocally(text);
    } finally {
      setSaving(false);
    }
  }
  function chooseGuide(kind: "team" | "personal" | "routine" | "free") {
    setPlan({ ...emptyPlan });
    setMessage("");
    if (kind === "team") {
      setAssistantMessage("팀 OKR로 시작하겠습니다. 팀이 이번 주기 끝에 달라져야 하는 상태부터 잡고, 공동 지표와 실행 책임을 나눕니다.");
      setGuideQuestions(["팀이 달성해야 하는 결과는 무엇인가요?", "성공 여부를 숫자나 상태로 어떻게 확인할까요?", "어떤 프로젝트와 담당자가 먼저 움직여야 하나요?"]);
      setDraftOpen(true);
      return;
    }
    if (kind === "personal") {
      setAssistantMessage("개인 OKR로 시작하겠습니다. 역할 안에서 만들고 싶은 변화, 측정 기준, 바로 실행할 일을 분리합니다.");
      setGuideQuestions(["이번 주기 동안 본인이 만들고 싶은 변화는 무엇인가요?", "완료가 아니라 성과를 보여주는 기준은 무엇인가요?", "이번 주에 바로 시작할 일은 무엇인가요?"]);
      setDraftOpen(true);
      return;
    }
    if (kind === "routine") {
      setAssistantMessage("루틴부터 정리하겠습니다. 반복할 시점, 장소나 도구, 실제 행동 순서를 먼저 잡고 필요하면 OKR에 연결합니다.");
      setGuideQuestions(["언제 이 루틴이 시작돼야 하나요?", "어디서 또는 어떤 도구에서 실행하나요?", "무엇을 어떤 순서로 하면 되나요?"]);
      setDraftOpen(true);
      return;
    }
    setAssistantMessage("좋습니다. 정해진 양식 없이 지금 생각나는 대로 적어 주세요. 제가 OKR 구조로 나눠드립니다.");
    setGuideQuestions([]);
    setDraftOpen(false);
  }
  async function save() {
    if (!plan.objective.trim() && !plan.routineTitle.trim()) {
      await organizeMessage();
      return;
    }
    setSaving(true);
    const created = await onCreate(plan);
    setSaving(false);
    if (created) {
      setMessage("");
      setPlan({ ...emptyPlan });
      setGuideQuestions([]);
      setDraftOpen(false);
      setAssistantMessage("OKR 구조를 만들었습니다. 다음 목표나 루틴도 이어서 이야기할 수 있습니다.");
    }
  }
  return (
    <section className="home-okr-chat" aria-labelledby="home-okr-chat-title">
      <header>
        <div><Bot size={16} /><div><h2 id="home-okr-chat-title">OKR 대화</h2><p>자유롭게 이야기하면 목표, 지표, 프로젝트, 할 일, 루틴으로 정리해드립니다.</p></div></div>
      </header>
      <div className="home-chat-surface">
        <div className="chat-thread">
          <p className="assistant-message">{assistantMessage}</p>
          {guideQuestions.length > 0 && <div className="assistant-followups">{guideQuestions.map((question) => <p className="assistant-message followup-message" key={question}>{question}</p>)}</div>}
          <label className="chat-input"><span>지금 생각 중인 OKR</span><textarea value={message} onChange={(event) => setMessage(event.target.value)} rows={4} placeholder="목표, 고민, 지표, 해야 할 일을 편하게 적어 주세요." /></label>
          <div className="chat-presets">
            <button onClick={() => chooseGuide("team")}>팀 OKR</button>
            <button onClick={() => chooseGuide("personal")}>개인 OKR</button>
            <button onClick={() => chooseGuide("routine")}>루틴부터</button>
            <button onClick={() => chooseGuide("free")}>그냥 말하기</button>
          </div>
          <div className="chat-actions">
            <button className="chat-apply" onClick={() => void organizeMessage()} disabled={saving || !message.trim()}><TextCursorInput size={13} />{saving ? "정리 중" : "정리하기"}</button>
            <button className="welcome-primary" onClick={() => void save()} disabled={saving || (!plan.objective.trim() && !plan.routineTitle.trim() && !message.trim())}>{saving ? "생성 중" : saveLabel}<ChevronRight size={14} /></button>
          </div>
        </div>
        {draftOpen && <div className="okr-setup-fields home-draft-fields">
          <label><span>Objective</span><textarea value={plan.objective} onChange={(event) => patch("objective", event.target.value)} rows={3} placeholder="달성하고 싶은 결과" /></label>
          <label><span>Key Result</span><textarea value={plan.keyResult} onChange={(event) => patch("keyResult", event.target.value)} rows={3} placeholder="성공을 확인할 수 있는 기준" /></label>
          <label><span>Initiative</span><input value={plan.initiative} onChange={(event) => patch("initiative", event.target.value)} placeholder="성과를 만들 큰 방향" /></label>
          <label><span>Project</span><input value={plan.project} onChange={(event) => patch("project", event.target.value)} placeholder="실제로 진행할 프로젝트" /></label>
          <label className="wide"><span>첫 Task</span><textarea value={plan.tasks} onChange={(event) => patch("tasks", event.target.value)} rows={4} placeholder="한 줄에 하나씩 입력" /></label>
          <label><span>루틴 이름</span><input value={plan.routineTitle} onChange={(event) => patch("routineTitle", event.target.value)} placeholder="반복해서 할 일의 이름" /></label>
          <label><span>루틴 트리거</span><input value={plan.routineTrigger} onChange={(event) => patch("routineTrigger", event.target.value)} placeholder="루틴이 시작되는 시점" /></label>
          <label><span>어디서</span><input value={plan.routinePlace} onChange={(event) => patch("routinePlace", event.target.value)} placeholder="실행할 장소나 도구" /></label>
          <label className="wide"><span>무엇을 어떻게</span><textarea value={plan.routineSteps} onChange={(event) => patch("routineSteps", event.target.value)} rows={3} placeholder="루틴 실행 방법" /></label>
        </div>}
      </div>
    </section>
  );
}

function aiLimitMessage(error: OrganizeError) {
  if (error.code === "ai_rate_limited") {
    return "AI 정리 요청이 너무 빠르게 반복되고 있습니다. 지금 화면에는 비용이 들지 않는 기본 정리만 반영했습니다. 잠시 후 다시 시도해 주세요.";
  }
  const spent = typeof error.usage?.spentWon === "number" ? `${error.usage.spentWon.toLocaleString()}원` : "무료 사용량";
  const budget = typeof error.usage?.budgetWon === "number" ? `${error.usage.budgetWon.toLocaleString()}원` : "무료 한도";
  return `무료 AI 정리 예산을 다 썼습니다. 지금 화면에는 비용이 들지 않는 기본 정리만 반영했습니다. 현재 사용량은 ${spent} / ${budget} 기준입니다.`;
}

function OkrFileManager({
  cycles,
  selectedCycle,
  visibleCycleIds,
  itemCounts,
  deletingIds,
  slowDeletingId,
  onSelect,
  onRename,
  onDepartmentChange,
  onToggleVisible,
  onSetDefault,
  onDelete,
  onCreate,
  onClose,
}: {
  cycles: OkrCycle[];
  selectedCycle: OkrCycle | null;
  visibleCycleIds: string[];
  itemCounts: Record<string, number>;
  deletingIds: Set<string>;
  slowDeletingId: string | null;
  onSelect: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onDepartmentChange: (id: string, department: string) => void;
  onToggleVisible: (id: string) => void;
  onSetDefault: (id: string) => void;
  onDelete: (id: string) => void;
  onCreate: () => void;
  onClose: () => void;
}) {
  return (
    <section className="okr-file-manager">
      <header>
        <div><b>OKR 파일</b><span>{cycles.length}개</span></div>
        <div>
          <button type="button" onClick={onCreate}><Plus size={13} />새로 만들기</button>
          <button className="icon-button" type="button" onClick={onClose} aria-label="목록 닫기" title="목록 닫기"><X size={15} /></button>
        </div>
      </header>
      <div className="okr-file-list" aria-label="OKR 파일 목록">
        {cycles.map((cycle, index) => (
          <OkrFileRow
            key={`${cycle.id}-${cycle.name}-${cycle.department}`}
            cycle={cycle}
            selected={cycle.id === selectedCycle?.id}
            visible={visibleCycleIds.includes(cycle.id)}
            latest={index === 0}
            itemCount={itemCounts[cycle.id] ?? 0}
            canDelete={cycles.length > 1}
            deleting={deletingIds.has(cycle.id)}
            slowDeleting={slowDeletingId === cycle.id}
            onSelect={onSelect}
            onRename={onRename}
            onDepartmentChange={onDepartmentChange}
            onToggleVisible={onToggleVisible}
            onSetDefault={onSetDefault}
            onDelete={onDelete}
          />
        ))}
        {!cycles.length && <EmptyState icon={Archive} title="OKR 파일이 없습니다" />}
      </div>
    </section>
  );
}

function OkrFileRow({
  cycle,
  selected,
  visible,
  latest,
  itemCount,
  canDelete,
  deleting,
  slowDeleting,
  onSelect,
  onRename,
  onDepartmentChange,
  onToggleVisible,
  onSetDefault,
  onDelete,
}: {
  cycle: OkrCycle;
  selected: boolean;
  visible: boolean;
  latest: boolean;
  itemCount: number;
  canDelete: boolean;
  deleting: boolean;
  slowDeleting: boolean;
  onSelect: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onDepartmentChange: (id: string, department: string) => void;
  onToggleVisible: (id: string) => void;
  onSetDefault: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const [nameDraft, setNameDraft] = useState(cycle.name);
  const [departmentDraft, setDepartmentDraft] = useState(cycle.department);

  function commitName() {
    const name = nameDraft.trim();
    if (!name) {
      setNameDraft(cycle.name);
      return;
    }
    if (name !== cycle.name) onRename(cycle.id, name);
  }

  function commitDepartment() {
    const department = departmentDraft.trim();
    if (department !== cycle.department) onDepartmentChange(cycle.id, department);
  }

  return (
    <article className={`okr-file-row ${selected ? "active" : ""}`}>
      <button className="okr-file-open" type="button" onClick={() => onSelect(cycle.id)} aria-label={`${cycle.name} 열기`}>
        <Archive size={15} />
      </button>
      <div className="okr-file-row-main">
        <input
          value={nameDraft}
          onFocus={() => onSelect(cycle.id)}
          onChange={(event) => setNameDraft(event.target.value)}
          onBlur={commitName}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
            if (event.key === "Escape") {
              setNameDraft(cycle.name);
              event.currentTarget.blur();
            }
          }}
          aria-label="OKR 파일 이름"
        />
        <small>v{cycle.version} · {cycle.startDate} - {cycle.endDate} · {itemCount}개 항목{slowDeleting ? " · 삭제 중" : ""}</small>
        <label className="okr-department-input">
          <span>부서</span>
          <input
            value={departmentDraft}
            onFocus={() => onSelect(cycle.id)}
            onChange={(event) => setDepartmentDraft(event.target.value)}
            onBlur={commitDepartment}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
              if (event.key === "Escape") {
                setDepartmentDraft(cycle.department);
                event.currentTarget.blur();
              }
            }}
            placeholder="부서 미지정"
            aria-label="OKR 담당 부서"
          />
        </label>
      </div>
      <div className="okr-file-row-actions">
        <button type="button" className={visible ? "is-on" : ""} onClick={() => onToggleVisible(cycle.id)}>{visible ? "보는 중" : "보기"}</button>
        {cycle.status === "active" ? <em>기본</em> : <button type="button" onClick={() => onSetDefault(cycle.id)}>기본</button>}
        {latest && <em>최신</em>}
        <button type="button" className={deleting ? "is-loading" : ""} onClick={() => onDelete(cycle.id)} disabled={!canDelete || deleting} aria-label={`${cycle.name} 삭제`} title={deleting ? "삭제 중" : canDelete ? "삭제" : "마지막 파일은 삭제할 수 없습니다"}>{deleting ? <LoaderCircle size={12} /> : <Trash2 size={12} />}</button>
      </div>
    </article>
  );
}

function OkrCurrentFile({ cycle, onRename, onDepartmentChange, onAddItem }: { cycle: OkrCycle; onRename: (id: string, name: string) => void; onDepartmentChange: (id: string, department: string) => void; onAddItem: () => void }) {
  const [nameDraft, setNameDraft] = useState(cycle.name);
  const [departmentDraft, setDepartmentDraft] = useState(cycle.department);

  function commitName() {
    const name = nameDraft.trim();
    if (!name) {
      setNameDraft(cycle.name);
      return;
    }
    if (name !== cycle.name) onRename(cycle.id, name);
  }

  function commitDepartment() {
    const department = departmentDraft.trim();
    if (department !== cycle.department) onDepartmentChange(cycle.id, department);
  }

  return (
    <header className="okr-document-header">
      <span className="okr-file-icon"><Archive size={17} /></span>
      <div>
      <label className="okr-file-title">
        <span>열린 OKR 파일</span>
        <input
          value={nameDraft}
          onChange={(event) => setNameDraft(event.target.value)}
          onBlur={commitName}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
            if (event.key === "Escape") {
              setNameDraft(cycle.name);
              event.currentTarget.blur();
            }
          }}
          aria-label="OKR 파일 이름"
        />
      </label>
      <p>v{cycle.version} · {cycle.startDate} - {cycle.endDate} · {cycleStatusLabel(cycle.status)} · {cycle.department || "부서 미지정"}</p>
      <label className="okr-document-department">
        <span>부서</span>
        <input
          value={departmentDraft}
          onChange={(event) => setDepartmentDraft(event.target.value)}
          onBlur={commitDepartment}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
            if (event.key === "Escape") {
              setDepartmentDraft(cycle.department);
              event.currentTarget.blur();
            }
          }}
          placeholder="부서 미지정"
          aria-label="OKR 담당 부서"
        />
      </label>
      </div>
      <button type="button" onClick={onAddItem}><Plus size={13} />항목 추가</button>
    </header>
  );
}

function TreeView({ objective, items, depths, onComplete }: { objective?: OkrptrItem; items: OkrptrItem[]; depths: Record<string, number>; onComplete: (id: string) => void }) {
  if (!objective) return <EmptyState icon={Target} title="Objective가 없습니다" />;
  return <section className="outline-section"><div className="objective-row"><Target size={18} /><div><span>Objective</span><h2>{objective.title}</h2></div><b>{objective.progress}%</b></div><div className="hierarchy">{items.filter((entry) => entry.id !== objective.id).map((entry) => <div className="hierarchy-row" key={entry.id} style={{ "--depth": Math.min(depths[entry.id] ?? 1, 4) } as CSSProperties}><span className={`type-icon type-${entry.kind}`}>{kindAbbr(entry.kind)}</span><span className="hierarchy-copy"><small>{kindLabel(entry.kind)}</small><b>{entry.title}</b></span><span className={`status-tag status-${entry.status}`}>{statusLabel(entry.status)}</span><em>{entry.progress}%</em>{!isCompletedStatus(entry.status) && ["project", "task"].includes(entry.kind) ? <button className="row-action" aria-label="완료 처리" title="완료 처리" onClick={() => onComplete(entry.id)}><Check size={13} /></button> : <ChevronRight className="row-chevron" size={15} />}</div>)}</div></section>;
}

function BoardView({ items, onOpenItem }: { items: OkrptrItem[]; onOpenItem: (item: OkrptrItem) => void }) {
  const columns: { status: ItemStatus; label: string }[] = [
    { status: "backlog", label: "백로그" },
    { status: "todo", label: "할 일" },
    { status: "policy_discussion", label: "정책 논의" },
    { status: "in_progress", label: "진행 중" },
    { status: "developing", label: "개발 중" },
    { status: "development_done", label: "개발 완료" },
    { status: "blocked", label: "막힘" },
    { status: "archived", label: "아카이브" },
  ];
  return <div className="board">{columns.map((column) => { const rows = items.filter((entry) => entry.status === column.status); return <section className="board-column" key={column.status}><header><span className={`status-dot status-${column.status}`} /><b>{column.label}</b><em>{rows.length}</em></header><div>{rows.map((entry) => <button className="board-item" key={entry.id} onClick={() => onOpenItem(entry)}><b>{entry.title}</b><span><CalendarDays size={13} />{dueLabel(entry.dueDate)}</span></button>)}{!rows.length && <span className="empty-column">작업 없음</span>}</div></section>; })}</div>;
}

function TaskListView({ items, allItems, routines, onOpenTask, onConnect }: { items: OkrptrItem[]; allItems: OkrptrItem[]; routines: Routine[]; onOpenTask: (id: string) => void; onConnect: (item: OkrptrItem) => void }) {
  const byId = new Map(allItems.map((entry) => [entry.id, entry]));
  if (!items.length) return <EmptyState icon={Inbox} title="Task가 없습니다" />;
  return (
    <section className="inbox-list task-list">
      <div className="list-head task-list-head"><span>이름</span><span>담당자</span><span>상위 연결</span><span>등록 경로</span><span /></div>
      {items.map((entry) => {
        const project = entry.parentId ? byId.get(entry.parentId) : undefined;
        const routine = entry.routineId ? routines.find((row) => row.id === entry.routineId) : undefined;
        const relation = routine ? `Routine · ${routine.title}` : project ? `Project · ${project.title}` : "인박스";
        const disconnected = !entry.parentId && !entry.routineId;
        return (
          <article className="inbox-item task-list-item" key={entry.id}>
            <button className="task-list-title" onClick={() => onOpenTask(entry.id)}>
              <span className="page-icon"><ListChecks size={15} /></span>
              <span><b>{entry.title}</b><small>{statusLabel(entry.status)} · {priorityLabels[entry.priority]}</small></span>
            </button>
            <span className="task-assignee-cell">{assignmentLabel(entry, "task_assignee")}</span>
            <button className="task-relation-button" onClick={() => onOpenTask(entry.id)}>{relation}</button>
            <span className={`source-badge source-${entry.source}`}>{sourceLabel(entry.source)}</span>
            {disconnected ? <button onClick={() => onConnect(entry)}><Link2 size={14} />연결</button> : <button onClick={() => onOpenTask(entry.id)}><MoreHorizontal size={14} />상세</button>}
          </article>
        );
      })}
    </section>
  );
}

function TrashView({ onNotice }: { onNotice: (message: string) => void }) {
  const [rows, setRows] = useState<TrashRecord[] | null>(null);
  useEffect(() => {
    let active = true;
    fetch("/api/trash")
      .then(async (response) => response.ok ? response.json() as Promise<{ trash: TrashRecord[] }> : Promise.reject())
      .then((data) => { if (active) setRows(data.trash); })
      .catch(() => { if (active) setRows([]); });
    return () => { active = false; };
  }, []);

  async function permanentlyDelete(record: TrashRecord) {
    if (!window.confirm(`'${record.title}' 휴지통 기록을 영구 삭제할까요?`)) return;
    const response = await fetch(`/api/trash?id=${encodeURIComponent(record.id)}`, { method: "DELETE" });
    if (!response.ok) {
      onNotice("휴지통 기록을 삭제하지 못했습니다.");
      return;
    }
    setRows((current) => current?.filter((entry) => entry.id !== record.id) ?? []);
    onNotice("휴지통 기록을 영구 삭제했습니다.");
  }

  if (rows === null) return <EmptyState icon={Trash2} title="휴지통을 불러오는 중입니다" />;
  if (!rows.length) return <EmptyState icon={Trash2} title="휴지통이 비어 있습니다" />;

  return (
    <section className="trash-list">
      {rows.map((record) => (
        <article className="trash-record" key={record.id}>
          <span className="trash-icon"><Archive size={15} /></span>
          <div>
            <h3>{record.title}</h3>
            <p>{trashSummary(record)}</p>
            <small>{formatDateTime(record.archivedAt)}</small>
          </div>
          <button className="danger" onClick={() => void permanentlyDelete(record)}><Trash2 size={13} />영구 삭제</button>
        </article>
      ))}
    </section>
  );
}

function ReviewView({ items, cadence, completed, blocked, averageProgress }: { items: OkrptrItem[]; cadence: Cadence; completed: number; blocked: number; averageProgress: number }) {
  return <section className="review-content"><div className="metrics-row"><div><span>완료</span><strong>{completed}<small> / {items.length}</small></strong></div><div><span>평균 진행</span><strong>{averageProgress}<small>%</small></strong></div><div><span>막힘</span><strong>{blocked}</strong></div></div><div className="review-progress"><div><b>{cadenceLabels[cadence]} 진행률</b><span>{averageProgress}%</span></div><span><i style={{ width: `${averageProgress}%` }} /></span></div><div className="review-list"><span>검토할 항목</span>{items.slice(0, 7).map((entry) => <div key={entry.id}><span className={`status-dot status-${entry.status}`} /><b>{entry.title}</b><em>{entry.progress}%</em></div>)}</div></section>;
}

function ProjectPropertyManager({ properties, onCreated, onDeleted, onNotice }: { properties: PropertyDefinition[]; onCreated: (property: PropertyDefinition) => void; onDeleted: (id: string) => void; onNotice: (message: string) => void }) {
  const [name, setName] = useState("");
  const [type, setType] = useState<PropertyType>("text");
  const [options, setOptions] = useState("");
  const [saving, setSaving] = useState(false);

  async function create(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || saving) return;
    setSaving(true);
    const response = await fetch("/api/properties", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, type, options: options.split(",").map((entry) => entry.trim()).filter(Boolean) }),
    });
    setSaving(false);
    if (!response.ok) { onNotice("속성을 추가하지 못했습니다."); return; }
    const data = await response.json() as { property: PropertyDefinition };
    onCreated({ ...data.property, valueCount: data.property.valueCount ?? 0 });
    setName("");
    setOptions("");
    onNotice("모든 Project에 새 속성을 추가했습니다.");
  }

  async function remove(property: PropertyDefinition) {
    const detail = property.valueCount > 0 ? `\n${property.valueCount}개 Project에 저장된 값도 함께 삭제됩니다.` : "";
    if (!window.confirm(`'${property.name}' 속성을 삭제할까요?${detail}`)) return;
    const response = await fetch(`/api/properties?id=${encodeURIComponent(property.id)}`, { method: "DELETE" });
    if (!response.ok) { onNotice("속성을 삭제하지 못했습니다."); return; }
    onDeleted(property.id);
    onNotice("Project 속성을 삭제했습니다.");
  }

  return <section className="project-property-manager"><header><div><h2>Project 속성</h2><p>모든 Project에 적용되는 필드를 관리합니다.</p></div><span>{properties.length}개</span></header><div className="project-property-layout"><div className="project-property-catalog">{properties.length ? properties.map((property) => <article className="project-property-item" key={property.id}><span className="property-type-icon">{property.type === "number" ? <Hash size={14} /> : <TextCursorInput size={14} />}</span><div><b>{property.name}</b><small>{propertyTypeLabel(property.type)} · 값이 있는 Project {property.valueCount}개</small></div><button className="icon-button" onClick={() => void remove(property)} aria-label={`${property.name} 삭제`} title="속성 삭제"><Trash2 size={14} /></button></article>) : <EmptyState icon={Settings2} title="아직 Project 속성이 없습니다" />}</div><form className="project-property-create" onSubmit={create}><h3>새 속성</h3><label><span>이름</span><input value={name} onChange={(event) => setName(event.target.value)} placeholder="예: 리스크, 예산, 출시일" /></label><label><span>유형</span><select value={type} onChange={(event) => setType(event.target.value as PropertyType)}>{(["text", "number", "select", "date", "checkbox"] as PropertyType[]).map((entry) => <option value={entry} key={entry}>{propertyTypeLabel(entry)}</option>)}</select></label>{type === "select" && <label><span>선택 옵션</span><input value={options} onChange={(event) => setOptions(event.target.value)} placeholder="쉼표로 구분" /></label>}<button className="primary-action" disabled={!name.trim() || saving}><Plus size={14} />{saving ? "추가 중" : "속성 추가"}</button></form></div></section>;
}

function ProjectArchiveView({ projects, onRestore, onDelete }: { projects: ArchivedProject[]; onRestore: (id: string) => void; onDelete: (project: ArchivedProject) => void }) {
  if (!projects.length) return <div className="project-archive-empty"><EmptyState icon={Archive} title="보관된 Project가 없습니다" /></div>;
  return <section className="project-archive-list">{projects.map((project) => <article className="project-archive-row" key={project.id}><span className="archive-project-icon"><Archive size={15} /></span><div className="project-archive-copy"><b>{project.title}</b><small>하위 Task {project.archivedTaskCount}개 · {project.archivedAt ? formatDateTime(project.archivedAt) : "보관됨"}</small></div><span className={`status-tag status-${project.archivedFromStatus ?? "backlog"}`}>{statusLabel(project.archivedFromStatus ?? "backlog")}</span><div className="project-archive-actions"><button onClick={() => onRestore(project.id)}><RotateCcw size={14} />함께 복구</button><button className="danger" onClick={() => onDelete(project)} aria-label={`${project.title} 영구 삭제`} title="영구 삭제"><Trash2 size={14} /></button></div></article>)}</section>;
}

function PropertyPanel({ currentWorkspace, workspaceCount, onClose, onCleanup, onOpenWorkspaceMenu, onOpenTeamMembers, onOpenGroups, onSignOut }: { currentWorkspace?: WorkspaceSummary; workspaceCount: number; onClose: () => void; onCleanup: () => void; onOpenWorkspaceMenu: () => void; onOpenTeamMembers: () => void; onOpenGroups: () => void; onSignOut: () => void }) {
  return <div className="modal-backdrop align-right"><aside className="property-panel"><header><div><h2>내 설정</h2><p>워크스페이스와 팀 설정</p></div><button className="icon-button" onClick={onClose}><X size={17} /></button></header><section className="settings-section"><h3>워크스페이스</h3><div className="settings-workspace-card"><span className="workspace-avatar">{currentWorkspace?.name.slice(0, 1).toLocaleUpperCase() || "O"}</span><div><b>{currentWorkspace?.name || "개인 워크스페이스"}</b><small>{currentWorkspace?.personal ? "개인 워크스페이스" : `${teamRoleLabel(currentWorkspace?.role ?? "member")} · 전체 ${workspaceCount}개`}</small></div></div><div className="settings-action-grid"><button onClick={onOpenWorkspaceMenu}><Columns3 size={13} />워크스페이스 관리</button><button onClick={onOpenTeamMembers}><Users size={13} />멤버 관리</button><button onClick={onOpenGroups}><AtSign size={13} />그룹 관리</button></div></section><section className="settings-hint"><Settings2 size={15} /><div><b>Project 속성</b><p>Project 화면의 속성 관리 탭에서 추가하거나 삭제할 수 있습니다.</p></div></section><section className="settings-account-actions"><button onClick={onSignOut}><LogOut size={13} />Google 계정 로그아웃</button></section><section className="settings-danger-zone"><div><b>OKR 데이터 정리</b><p>워크스페이스와 그룹은 남기고 OKR 실행 데이터를 휴지통으로 보냅니다.</p></div><button onClick={onCleanup}><Trash2 size={13} />클린업 열기</button></section></aside></div>;
}

function TeamPanel({ initialTeam, initialTab, initialGroupHandle, onMembersChange, onClose, onNotice }: { initialTeam: TeamData | null; initialTab: "members" | "groups"; initialGroupHandle: string | null; onMembersChange: (members: TeamMember[]) => void; onClose: () => void; onNotice: (message: string) => void }) {
  const [team, setTeam] = useState<TeamData | null>(initialTeam);
  const initialTeamRef = useRef(initialTeam);
  const [groups, setGroups] = useState<WorkspaceGroup[] | null>(null);
  const [tab, setTab] = useState<"members" | "groups">(initialTab);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [groupDetail, setGroupDetail] = useState<GroupDetailData | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [email, setEmail] = useState("");
  const [inviteDisplayName, setInviteDisplayName] = useState("");
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [memberNameDraft, setMemberNameDraft] = useState("");
  const memberNameInputRef = useRef<HTMLInputElement>(null);
  const [role, setRole] = useState<Exclude<TeamRole, "owner">>("member");
  const [groupName, setGroupName] = useState("");
  const [groupColor, setGroupColor] = useState<GroupColor>("blue");
  const [groupVisibility, setGroupVisibility] = useState<GroupVisibility>("open");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      initialTeamRef.current ? Promise.resolve(initialTeamRef.current) : fetch("/api/team").then(async (response) => response.ok ? response.json() as Promise<TeamData> : Promise.reject()),
      fetch("/api/groups?includeArchived=true").then(async (response) => response.ok ? response.json() as Promise<{ groups: WorkspaceGroup[] }> : Promise.reject()),
    ])
      .then(([loadedTeam, groupData]) => { setTeam(loadedTeam); setGroups(groupData.groups); })
      .catch(() => setError("팀 정보를 불러오지 못했습니다."));
  }, []);

  useEffect(() => {
    if (!selectedGroupId) return;
    const controller = new AbortController();
    fetch(`/api/group-members?groupId=${encodeURIComponent(selectedGroupId)}`, { signal: controller.signal })
      .then(async (response) => response.ok ? response.json() as Promise<GroupDetailData> : Promise.reject())
      .then((data) => setGroupDetail(data))
      .catch((loadError: unknown) => { if (!(loadError instanceof DOMException && loadError.name === "AbortError")) setError("그룹 정보를 불러오지 못했습니다."); });
    return () => controller.abort();
  }, [selectedGroupId]);

  useEffect(() => {
    if (!initialGroupHandle || !groups?.length || selectedGroupId) return;
    const group = groups.find((entry) => entry.handle === initialGroupHandle);
    const timeout = window.setTimeout(() => {
      if (!group) {
        setError("주소에 해당하는 그룹을 찾지 못했습니다.");
        return;
      }
      setTab("groups");
      setGroupDetail(null);
      setSelectedGroupId(group.id);
      const url = new URL(window.location.href);
      url.searchParams.set("group", group.handle);
      window.history.replaceState(null, "", url);
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [groups, initialGroupHandle, selectedGroupId]);

  useEffect(() => {
    if (!editingMemberId) return;
    memberNameInputRef.current?.focus();
    memberNameInputRef.current?.select();
  }, [editingMemberId]);

  function clearGroupUrl() {
    const url = new URL(window.location.href);
    url.searchParams.delete("group");
    window.history.replaceState(null, "", url);
  }

  function applyMembers(members: TeamMember[]) {
    setTeam((current) => current ? { ...current, members } : current);
    onMembersChange(members);
  }

  function openGroup(id: string) {
    setGroupDetail(null);
    setSelectedGroupId(id);
    const group = groups?.find((entry) => entry.id === id);
    if (group) {
      const url = new URL(window.location.href);
      url.searchParams.set("group", group.handle);
      window.history.replaceState(null, "", url);
    }
  }

  async function invite(event: FormEvent) {
    event.preventDefault();
    if (!email.trim() || saving) return;
    setSaving(true);
    setError("");
    const response = await fetch("/api/team", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, displayName: inviteDisplayName, role }) });
    const data = await response.json() as { member?: TeamMember; error?: string };
    setSaving(false);
    if (!response.ok || !data.member) {
      setError(data.error ?? "초대를 등록하지 못했습니다.");
      return;
    }
    applyMembers([...(team?.members ?? []), data.member]);
    setEmail("");
    setInviteDisplayName("");
    setError("");
    onNotice("팀 초대를 등록했습니다.");
  }

  async function changeRole(member: TeamMember, nextRole: Exclude<TeamRole, "owner">) {
    const response = await fetch("/api/team", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: member.id, role: nextRole }) });
    if (!response.ok) return;
    const data = await response.json() as { member: TeamMember };
    applyMembers((team?.members ?? []).map((entry) => entry.id === member.id ? data.member : entry));
    onNotice("멤버 역할을 변경했습니다.");
  }

  function editMemberName(member: TeamMember) {
    setEditingMemberId(member.id);
    setMemberNameDraft(member.displayName);
    setError("");
  }

  function cancelMemberNameEdit() {
    setEditingMemberId(null);
    setMemberNameDraft("");
  }

  async function saveMemberName(event: FormEvent, member: TeamMember) {
    event.preventDefault();
    const displayName = memberNameDraft.trim();
    if (!displayName || saving) return;
    if (displayName === member.displayName) {
      cancelMemberNameEdit();
      return;
    }
    setSaving(true);
    setError("");
    const response = await fetch("/api/team", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: member.id, displayName }) });
    const data = await response.json() as { member?: TeamMember; error?: string };
    setSaving(false);
    if (!response.ok || !data.member) {
      setError(data.error ?? "멤버 실명을 저장하지 못했습니다.");
      return;
    }
    if (data.member.isCurrent) window.localStorage.setItem(profileNameConfirmationKey(data.member), data.member.displayName);
    applyMembers((team?.members ?? []).map((entry) => entry.id === data.member!.id ? data.member! : entry));
    cancelMemberNameEdit();
    setError("");
    onNotice(data.member.isCurrent ? "내 실명을 저장했습니다." : "멤버 실명을 저장했습니다.");
  }

  async function remove(member: TeamMember) {
    const response = await fetch(`/api/team?id=${encodeURIComponent(member.id)}`, { method: "DELETE" });
    if (!response.ok) return;
    applyMembers((team?.members ?? []).filter((entry) => entry.id !== member.id));
    onNotice(member.status === "invited" ? "초대를 취소했습니다." : "팀에서 제거했습니다.");
  }

  async function createWorkspaceGroup(event: FormEvent) {
    event.preventDefault();
    if (!groupName.trim() || saving) return;
    setSaving(true);
    setError("");
    const response = await fetch("/api/groups", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: groupName, color: groupColor, visibility: groupVisibility }) });
    const data = await response.json() as { group?: WorkspaceGroup; error?: string };
    setSaving(false);
    if (!response.ok || !data.group) { setError(data.error ?? "그룹을 만들지 못했습니다."); return; }
    setGroups((current) => [...(current ?? []), data.group!].sort((left, right) => left.name.localeCompare(right.name)));
    setGroupName("");
    openGroup(data.group.id);
    onNotice("그룹을 만들었습니다.");
  }

  function applyGroup(group: WorkspaceGroup) {
    setGroups((current) => current?.map((entry) => entry.id === group.id ? group : entry) ?? null);
    setGroupDetail((current) => current?.group.id === group.id ? { ...current, group } : current);
  }

  function removeGroupFromState(id: string) {
    setGroups((current) => current?.filter((entry) => entry.id !== id) ?? null);
    setSelectedGroupId(null);
    clearGroupUrl();
  }

  const visibleGroups = (groups ?? []).filter((group) => showArchived || !group.archived);
  const activeGroupCount = (groups ?? []).filter((group) => !group.archived).length;

  return (
    <div className="modal-backdrop align-right">
      <aside className="property-panel team-panel">
        <header>
          <div><h2>팀</h2><p>{team ? `${team.workspace.name} · ${team.members.length}명 · ${activeGroupCount}개 그룹` : "불러오는 중"}</p></div>
          <button className="icon-button" onClick={onClose} aria-label="닫기"><X size={17} /></button>
        </header>
        <nav className="team-tabs" aria-label="팀 관리">
          <button className={tab === "members" ? "active" : ""} onClick={() => { setTab("members"); setSelectedGroupId(null); clearGroupUrl(); }}><Users size={14} />멤버</button>
          <button className={tab === "groups" ? "active" : ""} onClick={() => setTab("groups")}><AtSign size={14} />그룹</button>
        </nav>
        {tab === "members" ? (
          <>
            {team?.canManage && (
              <form className="team-invite" onSubmit={invite}>
                <label><span>실명과 이메일로 초대</span><div><input value={inviteDisplayName} onChange={(event) => setInviteDisplayName(event.target.value)} maxLength={80} placeholder="홍길동" aria-label="초대 실명" /><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@company.com" aria-label="초대 이메일" /><select value={role} onChange={(event) => setRole(event.target.value as Exclude<TeamRole, "owner">)} aria-label="초대 역할"><option value="admin">Admin</option><option value="member">Member</option><option value="viewer">Viewer</option></select><button disabled={!email.trim() || saving} aria-label="멤버 초대" title="멤버 초대"><UserPlus size={14} /></button></div></label>
              </form>
            )}
            {error && <p className="team-panel-error">{error}</p>}
            <div className="team-list">
              {team ? team.members.map((member) => {
                const canEditName = team.canManage || member.isCurrent;
                const editingName = editingMemberId === member.id;
                return (
                  <div className="team-member" key={member.id}>
                    <span className="team-avatar">{memberInitial(member)}</span>
                    <div className="team-member-identity">
                      {editingName ? (
                        <form className="member-name-editor" onSubmit={(event) => void saveMemberName(event, member)}>
                          <input ref={memberNameInputRef} value={memberNameDraft} onChange={(event) => setMemberNameDraft(event.target.value)} maxLength={80} aria-label={`${member.displayName} 실명 편집`} />
                          <button disabled={!memberNameDraft.trim() || saving} aria-label="실명 저장" title="실명 저장"><Check size={12} /></button>
                          <button type="button" onClick={cancelMemberNameEdit} aria-label="수정 취소" title="수정 취소"><X size={12} /></button>
                        </form>
                      ) : canEditName ? (
                        <button className="member-name-button" onClick={() => editMemberName(member)} aria-label={`${member.displayName} 실명 수정`} title="실명 수정">
                          <span>{member.displayName}{member.isCurrent && <em>나</em>}</span><Pencil size={11} />
                        </button>
                      ) : <b>{member.displayName}{member.isCurrent && <em>나</em>}</b>}
                      <small>{member.email || (member.role === "owner" ? "Workspace owner" : "이메일 없음")}</small>
                    </div>
                    <span className={`member-status member-${member.status}`}>{member.status === "active" ? "활성" : "초대 대기"}</span>
                    {team.canManage && member.role !== "owner" ? <select value={member.role} onChange={(event) => void changeRole(member, event.target.value as Exclude<TeamRole, "owner">)} aria-label={`${member.displayName} 역할`}><option value="admin">Admin</option><option value="member">Member</option><option value="viewer">Viewer</option></select> : <span className="member-role">{teamRoleLabel(member.role)}</span>}
                    <div className="team-member-actions">
                      {member.status === "invited" && <button className="icon-button" onClick={() => { void navigator.clipboard.writeText(window.location.origin); onNotice("워크스페이스 주소를 복사했습니다."); }} aria-label="초대 주소 복사" title="초대 주소 복사"><Copy size={13} /></button>}
                      {team.canManage && member.role !== "owner" && !member.isCurrent && <button className="icon-button danger" onClick={() => void remove(member)} aria-label={member.status === "invited" ? "초대 취소" : "팀에서 제거"} title={member.status === "invited" ? "초대 취소" : "팀에서 제거"}><Trash2 size={13} /></button>}
                    </div>
                  </div>
                );
              }) : !error ? <EmptyState icon={Users} title="팀 정보를 불러오는 중입니다" /> : <EmptyState icon={Users} title={error} />}
            </div>
          </>
        ) : selectedGroupId ? (
          groupDetail && team ? <GroupDetail detail={groupDetail} team={team} onBack={() => { setSelectedGroupId(null); clearGroupUrl(); }} onChange={setGroupDetail} onGroupChange={applyGroup} onDeleted={removeGroupFromState} onNotice={onNotice} /> : <EmptyState icon={Users} title="그룹 정보를 불러오는 중입니다" />
        ) : (
          <>
            <div className="group-toolbar"><label className="archive-toggle"><input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} /><span /><Archive size={13} />보관됨</label></div>
            {team?.canManage && <form className="group-create" onSubmit={createWorkspaceGroup}><div className="group-create-main"><input value={groupName} onChange={(event) => setGroupName(event.target.value)} placeholder="새 그룹 이름" aria-label="새 그룹 이름" /><button disabled={!groupName.trim() || saving} aria-label="그룹 만들기" title="그룹 만들기"><Plus size={14} /></button></div><div className="group-create-options"><div className="color-swatches" aria-label="그룹 색상">{groupColors.map((color) => <button type="button" className={groupColor === color ? "active" : ""} key={color} onClick={() => setGroupColor(color)} title={groupColorLabel(color)} aria-label={groupColorLabel(color)}><i className={`group-swatch group-${color}`} /></button>)}</div><div className="visibility-control"><button type="button" className={groupVisibility === "open" ? "active" : ""} onClick={() => setGroupVisibility("open")}><Users size={12} />공개</button><button type="button" className={groupVisibility === "private" ? "active" : ""} onClick={() => setGroupVisibility("private")}><LockKeyhole size={12} />비공개</button></div></div>{error && <p>{error}</p>}</form>}
            <div className="group-list">{groups === null ? <EmptyState icon={Users} title="그룹을 불러오는 중입니다" /> : visibleGroups.length ? visibleGroups.map((group) => <button className={`group-row ${group.archived ? "archived" : ""}`} key={group.id} onClick={() => openGroup(group.id)}><i className={`group-swatch group-${group.color}`} /><span><b>{group.name}</b><small>@{group.handle}</small></span><em>{group.visibility === "private" ? <LockKeyhole size={11} /> : <Users size={11} />}{group.memberCount}</em>{group.archived && <span className="group-archived">보관됨</span>}<ChevronRight size={14} /></button>) : <EmptyState icon={Users} title={showArchived ? "그룹이 없습니다" : "활성 그룹이 없습니다"} />}</div>
          </>
        )}
      </aside>
    </div>
  );
}

function GroupDetail({ detail, team, onBack, onChange, onGroupChange, onDeleted, onNotice }: { detail: GroupDetailData; team: TeamData; onBack: () => void; onChange: (next: GroupDetailData) => void; onGroupChange: (group: WorkspaceGroup) => void; onDeleted: (id: string) => void; onNotice: (message: string) => void }) {
  const [name, setName] = useState(detail.group.name);
  const [handle, setHandle] = useState(detail.group.handle);
  const [description, setDescription] = useState(detail.group.description);
  const [color, setColor] = useState<GroupColor>(detail.group.color);
  const [visibility, setVisibility] = useState<GroupVisibility>(detail.group.visibility);
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [memberRole, setMemberRole] = useState<GroupRole>("member");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const availableMembers = team.members.filter((member) => !detail.members.some((entry) => entry.memberId === member.id));
  const selectedWorkspaceMembers = pickMembers(team.members, memberIds);
  const selectedHasViewer = selectedWorkspaceMembers.some((member) => member.role === "viewer");
  const groupUrl = typeof window === "undefined" ? `/?group=${encodeURIComponent(detail.group.handle)}` : `${window.location.origin}${window.location.pathname}?group=${encodeURIComponent(detail.group.handle)}`;

  function copyGroupUrl() {
    void navigator.clipboard.writeText(groupUrl);
    onNotice("그룹 주소를 복사했습니다.");
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true); setError("");
    const response = await fetch("/api/groups", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: detail.group.id, name, handle, description, color, visibility }) });
    const data = await response.json() as { group?: WorkspaceGroup; error?: string };
    setSaving(false);
    if (!response.ok || !data.group) { setError(data.error ?? "그룹을 저장하지 못했습니다."); return; }
    onGroupChange(data.group); onNotice("그룹을 저장했습니다.");
  }

  async function setArchived(archived: boolean) {
    const response = await fetch("/api/groups", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: detail.group.id, archived }) });
    const data = await response.json() as { group?: WorkspaceGroup; error?: string };
    if (!response.ok || !data.group) { setError(data.error ?? "그룹 상태를 변경하지 못했습니다."); return; }
    onGroupChange(data.group); onChange({ ...detail, group: data.group, canManageMembers: !archived && (team.canManage || data.group.isLead) }); onNotice(archived ? "그룹을 보관했습니다." : "그룹을 복구했습니다.");
  }

  async function permanentlyDelete() {
    if (!window.confirm(`'${detail.group.name}' 그룹을 삭제할까요?\n그룹 멤버와 설정이 함께 삭제됩니다.`)) return;
    setError("");
    if (!detail.group.archived) {
      const archiveResponse = await fetch("/api/groups", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: detail.group.id, archived: true }) });
      if (!archiveResponse.ok) { const data = await archiveResponse.json() as { error?: string }; setError(data.error ?? "그룹을 보관하지 못했습니다."); return; }
    }
    const response = await fetch(`/api/groups?id=${encodeURIComponent(detail.group.id)}`, { method: "DELETE" });
    if (!response.ok) { const data = await response.json() as { error?: string }; setError(data.error ?? "그룹을 삭제하지 못했습니다."); return; }
    onDeleted(detail.group.id); onNotice("그룹을 삭제했습니다.");
  }

  async function addMember(event: FormEvent) {
    event.preventDefault();
    if (!memberIds.length) return;
    const added: GroupMember[] = [];
    for (const memberId of memberIds) {
      const response = await fetch("/api/group-members", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ groupId: detail.group.id, memberId, role: memberRole }) });
      const data = await response.json() as { member?: GroupMember; error?: string };
      if (!response.ok || !data.member) { setError(data.error ?? "그룹 멤버를 추가하지 못했습니다."); return; }
      added.push(data.member);
    }
    const next = { ...detail, group: { ...detail.group, memberCount: detail.group.memberCount + added.length }, members: [...detail.members, ...added] };
    onChange(next); onGroupChange(next.group); setMemberIds([]); onNotice(`${added.length}명을 그룹에 추가했습니다.`);
  }

  async function changeGroupRole(member: GroupMember, role: GroupRole) {
    const response = await fetch("/api/group-members", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ groupId: detail.group.id, memberId: member.memberId, role }) });
    const data = await response.json() as { member?: GroupMember; error?: string };
    if (!response.ok || !data.member) { setError(data.error ?? "그룹 역할을 변경하지 못했습니다."); return; }
    const group = member.isCurrent
      ? { ...detail.group, isLead: role === "lead", canEdit: team.canManage || role === "lead" }
      : detail.group;
    onChange({ ...detail, group, canManageMembers: !group.archived && (team.canManage || group.isLead), members: detail.members.map((entry) => entry.memberId === member.memberId ? data.member! : entry) });
    if (member.isCurrent) onGroupChange(group);
    onNotice("그룹 역할을 변경했습니다.");
  }

  async function removeMember(member: GroupMember) {
    const response = await fetch(`/api/group-members?groupId=${encodeURIComponent(detail.group.id)}&memberId=${encodeURIComponent(member.memberId)}`, { method: "DELETE" });
    if (!response.ok) { const data = await response.json() as { error?: string }; setError(data.error ?? "그룹에서 제거하지 못했습니다."); return; }
    const group = { ...detail.group, memberCount: Math.max(0, detail.group.memberCount - 1), isMember: member.isCurrent ? false : detail.group.isMember, isLead: member.isCurrent ? false : detail.group.isLead, canEdit: member.isCurrent ? team.canManage : detail.group.canEdit };
    if (member.isCurrent && !team.canManage && group.visibility === "private") {
      onDeleted(group.id);
    } else {
      const next = { ...detail, group, canManageMembers: !group.archived && (team.canManage || group.isLead), members: detail.members.filter((entry) => entry.memberId !== member.memberId) };
      onChange(next); onGroupChange(group);
    }
    onNotice(member.isCurrent ? "그룹에서 나갔습니다." : "그룹에서 멤버를 제거했습니다.");
  }

  return (
    <div className="group-detail">
      <header className="group-detail-head">
        <button className="icon-button" onClick={onBack} aria-label="그룹 목록" title="그룹 목록"><ArrowLeft size={16} /></button>
        <i className={`group-swatch group-${detail.group.color}`} />
        <div><b>{detail.group.name}</b><small>@{detail.group.handle}</small></div>
        <div className="group-head-actions">
          {detail.group.archived && <span className="group-archived">보관됨</span>}
          <button className="icon-button" onClick={copyGroupUrl} aria-label="그룹 주소 복사" title="그룹 주소 복사"><Copy size={13} /></button>
          {detail.group.canArchive && <button className="icon-button danger" onClick={() => void permanentlyDelete()} aria-label="그룹 삭제" title="그룹 삭제"><Trash2 size={13} /></button>}
        </div>
      </header>
      <div className="group-address-row">
        <div><b>그룹 주소</b><code>{groupUrl}</code></div>
        <button className="icon-button" onClick={copyGroupUrl} aria-label="그룹 주소 복사" title="그룹 주소 복사"><Copy size={13} /></button>
      </div>
      {detail.group.canEdit ? (
        <form className="group-detail-form" onSubmit={save}>
          <label><span>이름</span><input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} /></label>
          <label><span>핸들</span><div className="handle-input"><AtSign size={13} /><input value={handle} onChange={(event) => setHandle(event.target.value)} maxLength={32} /></div></label>
          <label><span>설명</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={500} rows={3} /></label>
          <div className="group-setting-row"><span>색상</span><div className="color-swatches">{groupColors.map((entry) => <button type="button" className={color === entry ? "active" : ""} key={entry} onClick={() => setColor(entry)} title={groupColorLabel(entry)} aria-label={groupColorLabel(entry)}><i className={`group-swatch group-${entry}`} /></button>)}</div></div>
          <div className="group-setting-row"><span>공개 범위</span><div className="visibility-control"><button type="button" className={visibility === "open" ? "active" : ""} onClick={() => setVisibility("open")}><Users size={12} />공개</button><button type="button" className={visibility === "private" ? "active" : ""} onClick={() => setVisibility("private")}><LockKeyhole size={12} />비공개</button></div></div>
          {error && <p className="form-error">{error}</p>}
          <div className="group-form-actions">
            <button className="save-group" disabled={!name.trim() || !handle.trim() || saving}><Check size={13} />저장</button>
            {detail.group.canArchive && (detail.group.archived ? (
              <>
                <button type="button" onClick={() => void setArchived(false)}><RotateCcw size={13} />복구</button>
                <button type="button" className="danger" onClick={() => void permanentlyDelete()}><Trash2 size={13} />영구 삭제</button>
              </>
            ) : (
              <>
                <button type="button" onClick={() => void setArchived(true)}><Archive size={13} />보관</button>
                <button type="button" className="danger" onClick={() => void permanentlyDelete()}><Trash2 size={13} />삭제</button>
              </>
            ))}
          </div>
        </form>
      ) : (
        <div className="group-summary">
          <p>{detail.group.description || "설명 없음"}</p>
          <span>{detail.group.visibility === "private" ? <LockKeyhole size={12} /> : <Users size={12} />}{detail.group.visibility === "private" ? "비공개" : "공개"}</span>
        </div>
      )}
      <section className="group-members">
        <header><b>멤버</b><span>{detail.members.length}</span></header>
        {detail.canManageMembers && (
          <form className="group-member-add" onSubmit={addMember}>
            <MemberMentionPicker label="실명 태그" members={availableMembers} selectedIds={memberIds} onChange={(ids) => {
              setMemberIds(ids);
              if (memberRole === "lead" && pickMembers(team.members, ids).some((member) => member.role === "viewer")) setMemberRole("member");
            }} placeholder="@실명 또는 이메일" />
            <select value={memberRole} onChange={(event) => setMemberRole(event.target.value as GroupRole)} aria-label="그룹 역할">
              <option value="member">Member</option>
              <option value="lead" disabled={selectedHasViewer}>Lead</option>
            </select>
            <button disabled={!memberIds.length} aria-label="그룹에 추가" title="그룹에 추가"><UserPlus size={13} /></button>
          </form>
        )}
        <div className="group-member-list">
          {detail.members.map((member) => (
            <div className="group-member-row" key={member.memberId}>
              <span className="team-avatar">{memberInitial(member)}</span>
              <div><b>{member.displayName}{member.isCurrent && <em>나</em>}</b><small>{member.status === "invited" ? `${member.email} · 초대 대기` : member.email || teamRoleLabel(member.workspaceRole)}</small></div>
              {detail.canManageMembers ? <select value={member.groupRole} onChange={(event) => void changeGroupRole(member, event.target.value as GroupRole)} aria-label={`${member.displayName} 그룹 역할`}><option value="lead" disabled={member.workspaceRole === "viewer"}>Lead</option><option value="member">Member</option></select> : <span className="member-role">{member.groupRole === "lead" ? "Lead" : "Member"}</span>}
              {detail.canManageMembers && <button className="icon-button danger" onClick={() => void removeMember(member)} aria-label="그룹에서 제거" title="그룹에서 제거"><X size={13} /></button>}
            </div>
          ))}
          {!detail.members.length && <EmptyState icon={Users} title="그룹 멤버가 없습니다" />}
        </div>
      </section>
    </div>
  );
}

function IntegrationModal({ onNotice, onClose }: { onNotice: (message: string) => void; onClose: () => void }) {
  const [connections, setConnections] = useState<IntegrationConnection[]>([]);
  const [loadingConnections, setLoadingConnections] = useState(true);
  const [creatingConnection, setCreatingConnection] = useState(false);
  const [revokingConnections, setRevokingConnections] = useState(false);

  useEffect(() => {
    let active = true;
    const refreshConnections = () => {
      void fetch("/api/integration-tokens")
        .then(async (response) => response.ok ? response.json() as Promise<{ connections: IntegrationConnection[] }> : Promise.reject())
        .then((data) => { if (active) setConnections(data.connections); })
        .catch(() => undefined)
        .finally(() => { if (active) setLoadingConnections(false); });
    };
    refreshConnections();
    const interval = window.setInterval(refreshConnections, 5000);
    return () => { active = false; window.clearInterval(interval); };
  }, []);

  async function copyChatGptConnectionPrompt() {
    setCreatingConnection(true);
    try {
      const response = await fetch("/api/integration-tokens", { method: "POST" });
      const data = await response.json() as { prompt?: string; connection?: IntegrationConnection; error?: string };
      if (!response.ok || !data.prompt || !data.connection) {
        onNotice(data.error || "연결 내용을 만들지 못했습니다.");
        return;
      }
      try {
        await navigator.clipboard.writeText(data.prompt);
      } catch {
        await fetch(`/api/integration-tokens?id=${encodeURIComponent(data.connection.id)}`, { method: "DELETE" });
        onNotice("클립보드에 복사하지 못했습니다. 브라우저의 클립보드 권한을 확인해 주세요.");
        return;
      }
      setConnections((current) => [data.connection!, ...current]);
      onNotice("연결 내용을 복사했습니다. 브라우저 제어가 가능한 ChatGPT 대화에 붙여넣으세요.");
    } catch {
      onNotice("연결 내용을 만들지 못했습니다.");
    } finally {
      setCreatingConnection(false);
    }
  }

  async function revokeChatGptConnections() {
    setRevokingConnections(true);
    try {
      const response = await fetch("/api/integration-tokens", { method: "DELETE" });
      if (!response.ok) throw new Error("revoke failed");
      setConnections([]);
      onNotice("이 워크스페이스의 대화 연결을 해제했습니다.");
    } catch {
      onNotice("대화 연결을 해제하지 못했습니다.");
    } finally {
      setRevokingConnections(false);
    }
  }

  const hasConnectedConversation = connections.some((connection) => connection.lastUsedAt);
  const connectionStatus = loadingConnections ? "확인 중" : hasConnectedConversation ? "연결됨" : connections.length > 0 ? "연결 대기" : "연결 없음";
  return <div className="modal-backdrop"><section className="integration-modal"><header><h2>ChatGPT 연동</h2><button className="icon-button" onClick={onClose} aria-label="닫기"><X size={17} /></button></header><div className="integration-sections">
    <section className="integration-card chatgpt-simple">
      <header><Bot size={18} /><div><b>ChatGPT에 OKRPTR MCP 연결</b><p>문구를 복사해 브라우저 제어가 가능한 ChatGPT 대화에 붙여넣으면 설정 화면에서 연결을 진행합니다.</p></div><div className={`connection-state ${hasConnectedConversation ? "active" : connections.length > 0 ? "pending" : "inactive"}`}><i />{connectionStatus}</div></header>
      <div className="chatgpt-simple-actions"><button className="copy-primary" onClick={() => void copyChatGptConnectionPrompt()} disabled={creatingConnection}>{creatingConnection ? <LoaderCircle className="spin" size={13} /> : <Copy size={13} />}{creatingConnection ? "복사 준비 중" : "ChatGPT 연결 문구 복사"}</button></div>
      <details className="connection-management"><summary><span>연결 관리</span><ChevronDown size={13} /></summary><div><span>발급된 연결 키 {connections.length}개</span>{connections.length > 0 && <button onClick={() => void revokeChatGptConnections()} disabled={revokingConnections}>{revokingConnections ? "해제 중" : "연결 해제"}</button>}</div></details>
    </section>
  </div><footer><span><CheckCircle2 size={15} />Objective → Key Result → Initiative → Project → Task</span><button onClick={onClose}>닫기</button></footer></section></div>;
}

function AppIntegrationsModal({ google, slack, workspaceName, canManageSlack, onGoogleChange, onSlackChange, onNotice, onClose }: { google: GoogleConnectionStatus | null; slack: SlackConnectionStatus | null; workspaceName: string; canManageSlack: boolean; onGoogleChange: (status: GoogleConnectionStatus | null) => void; onSlackChange: (status: SlackConnectionStatus | null) => void; onNotice: (message: string) => void; onClose: () => void }) {
  const [disconnectingGoogle, setDisconnectingGoogle] = useState(false);
  const [disconnectingSlack, setDisconnectingSlack] = useState(false);

  async function disconnectGoogle() {
    setDisconnectingGoogle(true);
    const response = await fetch("/api/google/disconnect", { method: "POST" });
    setDisconnectingGoogle(false);
    if (!response.ok) { onNotice("Google 연결을 해제하지 못했습니다."); return; }
    onGoogleChange(google ? { ...google, connected: false, email: null, displayName: null, connectedAt: null, updatedAt: null } : null);
    onNotice("Google Calendar 연결을 해제했습니다.");
  }

  async function disconnectSlack() {
    setDisconnectingSlack(true);
    const response = await fetch("/api/slack/disconnect", { method: "POST" });
    setDisconnectingSlack(false);
    if (!response.ok) { onNotice("Slack 연결을 해제하지 못했습니다."); return; }
    onSlackChange(slack ? { ...slack, connected: false, teamName: null, teamId: null, botUserId: null, connectedAt: null, updatedAt: null } : null);
    onNotice("Slack bot 연결을 해제했습니다.");
  }

  function connectGoogle() {
    if (!google?.configured) return;
    window.location.href = `/api/google/auth?returnTo=${encodeURIComponent("/")}`;
  }

  function connectSlack() {
    if (!slack?.configured || !canManageSlack) return;
    window.location.href = `/api/slack/auth?returnTo=${encodeURIComponent("/")}`;
  }

  return <div className="modal-backdrop"><section className="integration-modal app-integrations-modal"><header><div><h2>앱 연동</h2><p>개인 계정과 워크스페이스 앱을 구분해 관리합니다.</p></div><button className="icon-button" onClick={onClose} aria-label="닫기"><X size={17} /></button></header><div className="integration-sections">
    <section className="integration-card"><header><CalendarDays size={18} /><div><b>Google Calendar</b><p>{google?.connected ? `${google.email} 계정으로 연결됨` : "내 Task 일정을 개인 캘린더와 연결"}</p></div><span className={google?.connected ? "connection-live" : "connection-local"} /></header><div className="integration-scope"><b>개인 연결</b><span>현재 사용자에게만 적용</span></div><div className="integration-actions">{google?.connected ? <button className="secondary-danger" onClick={() => void disconnectGoogle()} disabled={disconnectingGoogle}>{disconnectingGoogle ? "해제 중" : "연결 해제"}</button> : <button onClick={connectGoogle} disabled={!google?.configured}>{google?.configured ? "Google로 연결" : "준비 중"}</button>}<small>{google?.configured ? "Google 계정 확인 · Calendar 이벤트 생성 및 수정" : "서비스 연결 설정을 준비 중입니다."}</small></div></section>
    <section className="integration-card"><header><Hash size={18} /><div><b>Slack bot</b><p>{slack?.connected ? `${slack.teamName}에 설치됨` : "/okrptr 명령으로 Task를 워크스페이스에 저장"}</p></div><span className={slack?.connected ? "connection-live" : "connection-local"} /></header><div className="integration-scope"><b>워크스페이스 연결</b><span>{workspaceName} 전체에 적용</span></div><div className="integration-actions">{slack?.connected ? <button className="secondary-danger" onClick={() => void disconnectSlack()} disabled={disconnectingSlack || !canManageSlack}>{disconnectingSlack ? "해제 중" : canManageSlack ? "연결 해제" : "관리자만 변경"}</button> : <button onClick={connectSlack} disabled={!slack?.configured || !canManageSlack}>{!canManageSlack ? "관리자만 설치" : slack?.configured ? "Slack에 설치" : "준비 중"}</button>}<small>{slack?.configured ? "Slash command · bot 메시지 작성" : "서비스 연결 설정을 준비 중입니다."}</small></div></section>
  </div><footer><span><Plug size={15} />연동별 적용 범위와 권한을 확인하세요.</span><button onClick={onClose}>닫기</button></footer></section></div>;
}

function EmptyState({ icon: Icon, title }: { icon: LucideIcon; title: string }) { return <div className="empty-state"><Icon size={22} /><span>{title}</span></div>; }

const statusLabels: Record<ItemStatus, string> = { inbox: "\uC778\uBC15\uC2A4", backlog: "\uBC31\uB85C\uADF8", todo: "\uD560 \uC77C", policy_discussion: "\uC815\uCC45 \uB17C\uC758 \uC911", in_progress: "\uC9C4\uD589 \uC911", developing: "\uAC1C\uBC1C \uC911", development_done: "\uAC1C\uBC1C \uC644\uB8CC", done: "\uC644\uB8CC", blocked: "\uB9C9\uD798", archived: "\uC544\uCE74\uC774\uBE0C" };
const priorityLabels: Record<Priority, string> = { low: "낮음", medium: "보통", high: "높음", urgent: "긴급" };
const groupColors: GroupColor[] = ["gray", "blue", "green", "yellow", "orange", "red", "purple"];

function item(id: string, parentId: string | null, kind: ItemKind, title: string, status: ItemStatus, cadence: Cadence, progress: number, dueDate: string | null = null, source = "web", priority: Priority = "medium"): OkrptrItem { return { id, cycleId: null, parentId, routineId: null, kind, title, description: "", status, priority, cadence, progress, dueDate, source, archivedAt: null, archivedFromStatus: null, archiveRootId: null, assignments: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }; }
function buildDepths(items: OkrptrItem[]) { const byId = new Map(items.map((entry) => [entry.id, entry])); const result: Record<string, number> = {}; for (const entry of items) { let depth = 0; let current = entry; while (current.parentId && depth < 5) { depth += 1; const parent = byId.get(current.parentId); if (!parent) break; current = parent; } result[entry.id] = depth; } return result; }
function filterTreeItemsByCycle(items: OkrptrItem[], cycleId: string | null) { if (!cycleId) return items; const byParent = new Map<string | null, OkrptrItem[]>(); for (const entry of items) { const rows = byParent.get(entry.parentId) ?? []; rows.push(entry); byParent.set(entry.parentId, rows); } const roots = items.filter((entry) => ["objective", "key_result", "initiative"].includes(entry.kind) && entry.cycleId === cycleId); const included = new Set<string>(); const visit = (entry: OkrptrItem) => { if (included.has(entry.id)) return; included.add(entry.id); for (const child of byParent.get(entry.id) ?? []) visit(child); }; roots.forEach(visit); return items.filter((entry) => included.has(entry.id)); }
function kindAbbr(kind: ItemKind) { return { objective: "O", key_result: "KR", initiative: "I", project: "P", task: "T" }[kind]; }
function kindLabel(kind: ItemKind) { return { objective: "Objective", key_result: "Key Result", initiative: "Initiative", project: "Project", task: "Task" }[kind]; }
function statusLabel(status: ItemStatus) { return statusLabels[status]; }
function isCompletedStatus(status: ItemStatus) { return status === "done" || status === "development_done"; }
function cycleStatusLabel(status: OkrCycle["status"]) { return { planned: "\uC608\uC815", active: "\uC9C4\uD589 \uC911", closed: "\uC885\uB8CC" }[status]; }
function sourceLabel(source: string) { return { mcp: "MCP", codex: "Codex", slack: "Slack", discord: "Discord", telegram: "Telegram", web: "Web" }[source] ?? "Bot"; }
function propertyTypeLabel(type: PropertyType) { return { text: "텍스트", number: "숫자", select: "선택", date: "날짜", checkbox: "체크박스" }[type]; }
function teamRoleLabel(role: TeamRole) { return { owner: "Owner", admin: "Admin", member: "Member", viewer: "Viewer" }[role]; }
function groupColorLabel(color: GroupColor) { return { gray: "회색", blue: "파랑", green: "초록", yellow: "노랑", orange: "주황", red: "빨강", purple: "보라" }[color]; }
function dueLabel(value: string | null) { if (!value) return "기한 없음"; const due = new Date(`${value}T00:00:00`); return `${due.getMonth() + 1}월 ${due.getDate()}일`; }
function trashSummary(record: TrashRecord) { return `OKR ${record.cycleCount}개, 작업 ${record.itemCount}개, 루틴 ${record.routineCount}개 보관`; }
function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ko-KR", { dateStyle: "medium", timeStyle: "short" });
}
function localDate() { const now = new Date(); const offset = now.getTimezoneOffset() * 60_000; return new Date(now.getTime() - offset).toISOString().slice(0, 10); }
function isIntroLanguage(value: string | null): value is IntroLanguage { return introLanguages.some((entry) => entry.id === value); }
function preferredIntroLanguage(): IntroLanguage {
  const language = window.navigator.language.toLocaleLowerCase();
  if (language.startsWith("ko")) return "ko";
  if (language.startsWith("ja")) return "ja";
  if (language.startsWith("zh")) return "zh";
  if (language.startsWith("es")) return "es";
  return "en";
}
function pageSubtitle(view: View) { return { home: "자유롭게 이야기하면 OKR과 실행 항목으로 정리", inbox: "Project나 Routine에 연결된 Task까지 함께 확인", work: "Initiative 아래의 Project 속성과 상태 관리", routines: "반복되는 실행을 날짜별로 기록", okr: "Objective부터 Task까지의 실행 구조", scrum: "어제, 오늘, 막힘", recommendations: "현재 데이터에서 계산한 다음 정리 항목", reviews: "주기별 진행과 막힘", trash: "클린업으로 보관한 OKR 실행 데이터" }[view]; }
function routineCadenceLabel(cadence: RoutineCadence) { return { daily: "매일", weekly: "매주", monthly: "매월" }[cadence]; }
function recommendationIcon(kind: Recommendation["kind"]) { if (kind === "blocked") return "!"; if (kind === "overdue") return "D"; if (kind === "unlinked") return "↗"; if (kind === "due_soon") return "3"; return "P"; }
