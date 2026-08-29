"use client";
/* eslint-disable @next/next/no-img-element */

import {
  Activity,
  Archive,
  ArrowLeft,
  ArrowDownUp,
  AtSign,
  Bot,
  BookTemplate,
  Briefcase,
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
  House,
  ImageIcon,
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
  Send,
  Settings2,
  Sparkles,
  Table2,
  Target,
  TextCursorInput,
  Trash2,
  Upload,
  AlertTriangle,
  UserPlus,
  Users,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ComponentType, type CSSProperties, type FormEvent, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { ConfirmationProvider, OverlayDialog, useAppConfirm } from "./overlay-dialog";

type View = "home" | "my_work" | "inbox" | "work" | "routines" | "okr" | "scrum" | "recommendations" | "reviews" | "trash";
const urlViews = new Set<View>(["my_work", "inbox", "work", "routines", "okr", "scrum", "recommendations", "reviews", "trash"]);
type NoticeTone = "success" | "error" | "info";
type AppNotice = { id: number; message: string; tone: NoticeTone };

function navigationFromLocation() {
  if (typeof window === "undefined") return { view: "okr" as View, projectId: null as string | null, taskId: null as string | null };
  const params = new URLSearchParams(window.location.search);
  const requestedView = params.get("view") as View | null;
  const projectId = params.get("project");
  return {
    view: projectId ? "work" : requestedView && urlViews.has(requestedView) ? requestedView : "okr",
    projectId,
    taskId: projectId ? null : params.get("task"),
  };
}
type Cadence = "daily" | "weekly" | "monthly" | "quarterly";
type ItemStatus = "backlog" | "todo" | "policy_discussion" | "in_progress" | "developing" | "development_done" | "done" | "blocked" | "archived";
type ItemKind = "objective" | "key_result" | "initiative" | "project" | "task";
type Priority = "low" | "medium" | "high" | "urgent";
type PropertyType = "text" | "number" | "select" | "date" | "checkbox" | "member" | "members";
type PropertyValue = string | number | boolean | string[] | null;
type RoutineCadence = "daily" | "weekly" | "monthly";
type TeamRole = "owner" | "admin" | "member" | "viewer";
type GroupColor = "gray" | "blue" | "green" | "yellow" | "orange" | "red" | "purple";
type GroupVisibility = "open" | "private";
type GroupRole = "lead" | "member";
type ProjectTab = "list" | "properties" | "templates";
type ItemAssignmentRole = "project_dri" | "project_worker" | "task_assignee";
type ThemeMode = "beige" | "gray" | "dark";
type AuthUser = { id: string; email: string | null; displayName: string; provider: "google" | "openai" | "local" };
type AuthState = { status: "loading" | "authenticated" | "unauthenticated"; user: AuthUser | null; reason: string | null };

const GOOGLE_SIGN_IN_CLIENT_ID = "497784342268-ik1c65ff3co1s6qt0gga34gt1togmart.apps.googleusercontent.com";
const GOOGLE_BROWSER_SIGN_IN_STATE_PREFIX = "browser_signin_";
const GOOGLE_BROWSER_SIGN_IN_STATE_COOKIE_NAME = "__Host-okrptr_google_signin_browser";
const THEME_STORAGE_KEY = "okrptr.theme";

function isThemeMode(value: string | null | undefined): value is ThemeMode {
  return value === "beige" || value === "gray" || value === "dark";
}

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
  sortOrder: number;
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
  defaultValue: PropertyValue;
  systemKey: string | null;
  active: boolean;
  sortOrder: number;
  valueCount: number;
};

type ProjectDocument = { id: string | null; projectId: string; content: string; plainText: string; version: number; updatedAt: string };
type ProjectTemplate = { id: string; name: string; description: string; content: string; plainText: string; createdAt: string; updatedAt: string };
type ProjectBlockEditorChange = { content: string; plainText: string };

type PropertyValueMap = Record<string, Record<string, PropertyValue>>;
type ProjectHiddenPropertyMap = Record<string, string[]>;
type ArchivedProject = OkrptrItem & { archivedTaskCount: number };
type TrashedItem = OkrptrItem & { trashedTaskCount: number };
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
  kind: "blocked" | "overdue" | "due_soon" | "empty_project";
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
  systemKey: string | null;
  assigneeMemberId: string | null;
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

type DraftInitiative = {
  clientId: string;
  title: string;
};

type DraftKeyResult = {
  clientId: string;
  title: string;
  initiatives: DraftInitiative[];
};

type OnboardingPlan = {
  objectiveTitle: string;
  keyResults: DraftKeyResult[];
  targetInitiatives: DraftInitiative[];
  unassignedInitiatives: DraftInitiative[];
  project: string;
  tasks: string;
  taskParent: "" | "project" | "routine";
  routineTitle: string;
  routineTrigger: string;
  routinePlace: string;
  routineSteps: string;
};

type StringPlanField = "project" | "tasks" | "taskParent" | "routineTitle" | "routineTrigger" | "routinePlace" | "routineSteps";

type OkrChatContext = {
  key: string;
  entry: "onboarding" | "coach" | "create";
  cycleId: string;
  cycleName: string;
  initialMessage: string;
  sourceKind?: ItemKind;
  target?: OkrPlanTarget | null;
  targetCandidates?: OkrPlanTarget[];
};

type OkrPlanTarget = {
  id: string;
  kind: "objective" | "key_result" | "initiative";
  title: string;
};

type AssistantWorkspaceContext = {
  cycleId: string | null;
  cycleName: string;
  focusedItemId: string | null;
  blockedTaskCount: number;
  items: Array<{
    id: string;
    parentId: string | null;
    kind: ItemKind;
    title: string;
    status: ItemStatus;
    progress: number;
    dri: string;
  }>;
};

type OrganizedOkr = {
  assistantMessage: string;
  questions: string[];
  plan: OnboardingPlan;
};

type PlanCreationResult = {
  cycleId: string | null;
  items: OkrptrItem[];
  keyResultIds: string[];
  initiativeIds: string[];
  projectIds: string[];
};

type ProjectChatTarget = {
  cycleId: string | null;
  initiativeId: string;
  initiativeTitle: string;
};

type OkrPlanApplyResult = {
  items: OkrptrItem[];
  cycleId: string;
  objectiveId: string | null;
  keyResultIds: string[];
  initiativeIds: string[];
  projectIds: string[];
  keyResultId: string | null;
  initiativeId: string | null;
  projectId: string | null;
};

type ChatMessage = { id: string; role: "user" | "assistant"; content: string };
type ConversationMode = "okr" | "project" | "onboarding" | "coach";

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

type TeamData = { workspace: { id: string; name: string; avatarUrl: string | null; avatarUpdatedAt: string | null }; members: TeamMember[]; currentRole: TeamRole; canManage: boolean };
type BootstrapShellData = {
  user: AuthUser;
  workspaces: WorkspaceSummary[];
  rules: WorkspaceRules;
  cycles: OkrCycle[];
  team: TeamData;
};
type BootstrapWorkspaceData = {
  items: OkrptrItem[];
  properties: PropertyDefinition[];
  propertyValues: PropertyValueMap;
  hiddenByProject: ProjectHiddenPropertyMap;
  archivedProjects: ArchivedProject[];
  routines: Routine[];
};
type BootstrapData = BootstrapShellData & BootstrapWorkspaceData;
type BootstrapFetchResult = { ok: boolean; status: number; data: BootstrapData | null };

declare global {
  interface Window {
    __OKRPTR_BOOTSTRAP_REQUEST__?: {
      path: string;
      request: Promise<BootstrapFetchResult>;
    };
  }
}

async function fetchBootstrapPayload(path: string): Promise<BootstrapFetchResult> {
  const response = await fetch(path, { cache: "no-store", credentials: "same-origin" });
  return {
    ok: response.ok,
    status: response.status,
    data: await response.json().catch(() => null) as BootstrapData | null,
  };
}

const BOOTSTRAP_CACHE_KEY = "okrptr.bootstrap.v1";
const BOOTSTRAP_CACHE_TTL_MS = 30 * 60 * 1000;

function readCachedBootstrap(path: string): BootstrapData | null {
  if (new URLSearchParams(window.location.search).has("auth")) return null;
  try {
    const raw = window.localStorage.getItem(BOOTSTRAP_CACHE_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw) as { path?: string; savedAt?: number; data?: BootstrapData };
    if (cached.path !== path || typeof cached.savedAt !== "number" || Date.now() - cached.savedAt > BOOTSTRAP_CACHE_TTL_MS || !cached.data?.user || !Array.isArray(cached.data.items)) {
      window.localStorage.removeItem(BOOTSTRAP_CACHE_KEY);
      return null;
    }
    return cached.data;
  } catch {
    window.localStorage.removeItem(BOOTSTRAP_CACHE_KEY);
    return null;
  }
}

function writeCachedBootstrap(path: string, data: BootstrapData) {
  try {
    window.localStorage.setItem(BOOTSTRAP_CACHE_KEY, JSON.stringify({ path, savedAt: Date.now(), data }));
  } catch {
    window.localStorage.removeItem(BOOTSTRAP_CACHE_KEY);
  }
}

function clearCachedBootstrap() {
  window.localStorage.removeItem(BOOTSTRAP_CACHE_KEY);
}
type GroupDetailData = { group: WorkspaceGroup; members: GroupMember[]; canManageMembers: boolean };
type WorkspaceSummary = {
  id: string;
  name: string;
  createdAt: string;
  personal: boolean;
  role: TeamRole;
  current: boolean;
  deletionRequestedAt: string | null;
  scheduledDeletionAt: string | null;
  avatarUrl: string | null;
  avatarUpdatedAt: string | null;
};
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
type SlackAutomationTrigger = "task_created" | "task_status_changed";
type SlackAutomation = {
  id: string;
  name: string;
  triggerType: SlackAutomationTrigger;
  triggerStatus: string;
  channelId: string;
  messageTemplate: string;
  active: boolean;
  lastTriggeredAt: string | null;
  lastDeliveryStatus: "never" | "sent" | "failed";
  lastError: string;
  createdAt: string;
  updatedAt: string;
};
type SlackAutomationDelivery = {
  id: string;
  automationId: string;
  itemId: string | null;
  triggerType: string;
  channelId: string;
  message: string;
  status: "pending" | "sent" | "failed";
  error: string;
  createdAt: string;
  sentAt: string | null;
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
    routineNote: "Routine은 Project처럼 Task를 담는 실행 컨테이너지만 OKR 계층과 독립적입니다.",
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
    routineNote: "Routines are Project-like Task containers, but remain independent from the OKR hierarchy.",
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
    routineNote: "RoutineはProjectのようにTaskを持てますが、OKR階層とは独立しています。",
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
    routineNote: "Routine 像 Project 一样可以包含 Task，但独立于 OKR 层级。",
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
    routineNote: "Las rutinas pueden contener Task como un Project, pero son independientes de la jerarquía OKR.",
    points: [
      { title: "Registra desde una conversación", description: "Conecta MCP para crear tareas, proyectos y rutinas directamente desde chats con IA y bots." },
      { title: "Aclara responsables y contexto", description: "Gestiona responsables y propiedades de Project junto con la persona asignada y el contexto de cada Task." },
      { title: "Mantén visible la ejecución diaria", description: "Las rutinas, el scrum diario y las recomendaciones aclaran tus próximas prioridades." },
    ],
    mcpAction: "Ver conexión MCP",
    startAction: "Empezar",
  },
};

const navItems: { id: View; label: string; icon: LucideIcon }[] = [
  { id: "okr", label: "OKR", icon: Target },
  { id: "my_work", label: "내 업무", icon: Briefcase },
  { id: "work", label: "Project", icon: Table2 },
  { id: "inbox", label: "Task", icon: Inbox },
  { id: "routines", label: "루틴", icon: Repeat2 },
  { id: "scrum", label: "데일리", icon: CalendarCheck },
  { id: "recommendations", label: "추천", icon: Lightbulb },
  { id: "reviews", label: "리뷰", icon: Activity },
  { id: "trash", label: "휴지통", icon: Trash2 },
];

const cadenceLabels: Record<Cadence, string> = { daily: "일간", weekly: "주간", monthly: "월간", quarterly: "분기" };
const viewTitles: Record<View, string> = {
  home: "AI 대화",
  inbox: "Task",
  my_work: "내 업무",
  work: "Project",
  routines: "루틴",
  okr: "OKR",
  scrum: "데일리 스크럼",
  recommendations: "추천",
  reviews: "리뷰",
  trash: "휴지통",
};

export default function Home() {
  return <ConfirmationProvider><WorkspaceApp /></ConfirmationProvider>;
}

function WorkspaceApp() {
  const confirmAction = useAppConfirm();
  const [items, setItems] = useState<OkrptrItem[]>([]);
  const [properties, setProperties] = useState<PropertyDefinition[]>([]);
  const [propertyValues, setPropertyValues] = useState<PropertyValueMap>({});
  const [hiddenProperties, setHiddenProperties] = useState<ProjectHiddenPropertyMap>({});
  const [projectTab, setProjectTab] = useState<ProjectTab>("list");
  const [teamData, setTeamData] = useState<TeamData | null>(null);
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [okrCycles, setOkrCycles] = useState<OkrCycle[]>([]);
  const [selectedOkrCycleId, setSelectedOkrCycleId] = useState<string | null>(null);
  const [visibleOkrCycleIds, setVisibleOkrCycleIds] = useState<string[]>([]);
  const [activeView, setActiveView] = useState<View>(() => navigationFromLocation().view);
  const [cadence, setCadence] = useState<Cadence>("weekly");
  const [taskDisplay, setTaskDisplay] = useState<"cards" | "table" | "board">("table");
  const [capture, setCapture] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<AppNotice | null>(null);
  const [integrationOpen, setIntegrationOpen] = useState(false);
  const [appIntegrationsOpen, setAppIntegrationsOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [propertyPanelOpen, setPropertyPanelOpen] = useState(false);
  const [workspaceAvatarOpen, setWorkspaceAvatarOpen] = useState(false);
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
  const [createItemCycleId, setCreateItemCycleId] = useState<string | null>(null);
  const [okrChatContext, setOkrChatContext] = useState<OkrChatContext | null>(null);
  const [deletingOkrCycleIds, setDeletingOkrCycleIds] = useState<Set<string>>(new Set());
  const [slowDeletingOkrCycleId, setSlowDeletingOkrCycleId] = useState<string | null>(null);
  const [okrListOpen, setOkrListOpen] = useState(false);
  const [cleanupOpen, setCleanupOpen] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(() => navigationFromLocation().taskId);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(() => navigationFromLocation().projectId);
  const [selectedOkrItemId, setSelectedOkrItemId] = useState<string | null>(null);
  const [selectedDeleteItemIds, setSelectedDeleteItemIds] = useState<Set<string>>(new Set());
  const [trashingItems, setTrashingItems] = useState(false);
  const [googleStatus, setGoogleStatus] = useState<GoogleConnectionStatus | null>(null);
  const [slackStatus, setSlackStatus] = useState<SlackConnectionStatus | null>(null);
  const [integrationStatusesLoaded, setIntegrationStatusesLoaded] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [introLanguage, setIntroLanguage] = useState<IntroLanguage>("ko");
  const [authState, setAuthState] = useState<AuthState>({ status: "loading", user: null, reason: null });
  const [workspaceDataState, setWorkspaceDataState] = useState<"loading" | "ready" | "error">("loading");
  const [freshWorkspaceDataReady, setFreshWorkspaceDataReady] = useState(false);
  const [workspaceDataAttempt, setWorkspaceDataAttempt] = useState(0);
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    if (typeof document === "undefined") return "beige";
    const preference = document.documentElement.dataset.themePreference;
    return isThemeMode(preference) ? preference : "beige";
  });
  const workspaceNameInputRef = useRef<HTMLInputElement>(null);
  const assistantAutoHandledWorkspaceRef = useRef<string | null>(null);
  const showNotice = useCallback((message: string, tone?: NoticeTone) => {
    const resolvedTone = tone ?? (/못했|실패|오류|찾을 수 없/.test(message) ? "error" : "success");
    const nextNotice = { id: Date.now(), message, tone: resolvedTone };
    setNotice(nextNotice);
    window.setTimeout(() => setNotice((current) => current?.id === nextNotice.id ? null : current), resolvedTone === "error" ? 7000 : 3000);
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const savedLanguage = window.localStorage.getItem("okrptr.intro-language");
      const language = isIntroLanguage(savedLanguage) ? savedLanguage : preferredIntroLanguage();
      setIntroLanguage(language);
    }, 0);
    return () => window.clearTimeout(timeout);
  }, []);

  useEffect(() => {
    window.localStorage.setItem(THEME_STORAGE_KEY, themeMode);
    document.documentElement.dataset.themePreference = themeMode;
    document.documentElement.dataset.theme = themeMode;
    document.documentElement.style.colorScheme = themeMode === "dark" ? "dark" : "light";
  }, [themeMode]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      if (window.matchMedia("(max-width: 700px)").matches) setTaskDisplay("cards");
    }, 0);
    return () => window.clearTimeout(timeout);
  }, []);

  useEffect(() => {
    let active = true;
    const date = encodeURIComponent(localDate());
    const path = `/api/bootstrap?date=${date}`;
    const preload = window.__OKRPTR_BOOTSTRAP_REQUEST__;
    const request = workspaceDataAttempt === 0 && preload?.path === path
      ? preload.request
      : fetchBootstrapPayload(path);

    const applyBootstrapData = (data: BootstrapData, fresh = false) => {
      if (!active) return;
      setWorkspaces(data.workspaces);
      setWorkspaceRules(data.rules);
      setOkrCycles(data.cycles);
      setTeamData(data.team);
      setItems(data.items);
      setProperties(data.properties);
      setPropertyValues(data.propertyValues);
      setHiddenProperties(data.hiddenByProject ?? {});
      setRoutines(data.routines);
      const activeCycle = data.cycles.find((cycle) => cycle.status === "active") ?? data.cycles[0];
      setVisibleOkrCycleIds(activeCycle ? [activeCycle.id] : []);
      const currentMember = data.team.members.find((member) => member.isCurrent && member.status === "active");
      if (currentMember && memberNameNeedsConfirmation(currentMember) && window.localStorage.getItem(profileNameConfirmationKey(currentMember)) !== currentMember.displayName) {
        setProfilePromptMember(currentMember);
      }
      setAuthState({ status: "authenticated", user: data.user, reason: null });
      setWorkspaceDataState("ready");
      if (fresh) setFreshWorkspaceDataReady(true);
    };

    const cachedData = workspaceDataAttempt === 0 ? readCachedBootstrap(path) : null;
    if (cachedData) applyBootstrapData(cachedData);

    void request
      .then((result) => {
        if (!result.ok || !result.data) throw new Error(result.status === 401 || result.status === 403 ? "unauthenticated" : "workspace data unavailable");
        const data = result.data;
        writeCachedBootstrap(path, data);
        applyBootstrapData(data, true);
      })
      .catch((error: unknown) => {
        if (!active) return;
        if (error instanceof Error && error.message === "unauthenticated") {
          clearCachedBootstrap();
          const reason = new URLSearchParams(window.location.search).get("auth");
          setAuthState({ status: "unauthenticated", user: null, reason });
          return;
        }
        if (cachedData) return;
        setWorkspaceDataState("error");
        setAuthState({ status: "unauthenticated", user: null, reason: "load_failed" });
      });
    return () => { active = false; };
  }, [workspaceDataAttempt]);

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
    function syncFromHistory() {
      const next = navigationFromLocation();
      setActiveView(next.view);
      setSelectedProjectId(next.projectId);
      setSelectedTaskId(next.taskId);
    }
    window.addEventListener("popstate", syncFromHistory);
    return () => window.removeEventListener("popstate", syncFromHistory);
  }, []);

  useEffect(() => {
    if (!workspaceMenuOpen) return;
    function closeWorkspaceMenu(event: Event) {
      if (event instanceof KeyboardEvent && event.key !== "Escape") return;
      if (event instanceof MouseEvent && (event.target as Element | null)?.closest(".workspace-control")) return;
      setWorkspaceMenuOpen(false);
      setWorkspaceCreateOpen(false);
      setNewWorkspaceName("");
    }
    window.addEventListener("pointerdown", closeWorkspaceMenu);
    window.addEventListener("keydown", closeWorkspaceMenu);
    return () => {
      window.removeEventListener("pointerdown", closeWorkspaceMenu);
      window.removeEventListener("keydown", closeWorkspaceMenu);
    };
  }, [workspaceMenuOpen]);

  const teamMembers = teamData?.members ?? [];
  const activeItems = items.filter((entry) => !entry.archivedAt && entry.status !== "archived");
  const taskItems = activeItems.filter((entry) => entry.kind === "task");
  const executionItems = activeItems.filter((entry) => entry.kind === "project");
  const structuredItems = activeItems;
  const defaultOkrCycle = okrCycles.find((cycle) => cycle.status === "active") ?? okrCycles[0] ?? null;
  const selectedOkrCycle = okrCycles.find((cycle) => cycle.id === selectedOkrCycleId) ?? defaultOkrCycle;
  const createItemCycle = okrCycles.find((cycle) => cycle.id === createItemCycleId) ?? selectedOkrCycle;
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
    (entry) => cadence === "quarterly" || entry.cadence === cadence || entry.kind === "objective",
  );
  const completed = periodItems.filter((entry) => isCompletedStatus(entry.status)).length;
  const blocked = periodItems.filter((entry) => entry.status === "blocked").length;
  const averageProgress = periodItems.length
    ? Math.round(periodItems.reduce((sum, entry) => sum + entry.progress, 0) / periodItems.length)
    : 0;
  const selectedTask = activeItems.find((entry) => entry.id === selectedTaskId && entry.kind === "task");
  const selectedProject = activeItems.find((entry) => entry.id === selectedProjectId && entry.kind === "project");
  const selectedOkrItem = activeItems.find((entry) => entry.id === selectedOkrItemId && ["objective", "key_result", "initiative"].includes(entry.kind));
  const activeWorkspaces = workspaces.filter((entry) => !entry.scheduledDeletionAt);
  const scheduledWorkspaces = workspaces.filter((entry) => Boolean(entry.scheduledDeletionAt));
  const workspaceNameCounts = workspaces.reduce((counts, workspace) => {
    const key = workspace.name.trim().toLocaleLowerCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
    return counts;
  }, new Map<string, number>());
  const currentWorkspace = activeWorkspaces.find((entry) => entry.current) ?? activeWorkspaces[0];
  const canDeleteItems = Boolean(currentWorkspace && currentWorkspace.role !== "viewer");

  useEffect(() => {
    const timeout = window.setTimeout(() => setSelectedDeleteItemIds(new Set()), 0);
    return () => window.clearTimeout(timeout);
  }, [activeView, currentWorkspace?.id, projectTab, selectedProjectId, selectedTaskId]);
  const currentTeamMember = teamMembers.find((member) => member.isCurrent && member.status === "active");
  const accountDisplayName = currentTeamMember?.displayName || authState.user?.displayName || "내 계정";
  const accountInitial = accountDisplayName.slice(0, 1).toLocaleUpperCase() || "O";
  const hasActiveObjective = activeItems.some((entry) => entry.kind === "objective");
  const canWriteWorkspace = currentWorkspace?.role !== "viewer";
  const assistantWorkspaceContext = useMemo(
    () => buildAssistantWorkspaceContext(activeItems, selectedOkrCycle, selectedProject ?? null),
    [activeItems, selectedOkrCycle, selectedProject],
  );
  const assistantTargeting = useMemo(
    () => deriveAssistantTargeting(assistantWorkspaceContext),
    [assistantWorkspaceContext],
  );

  function writeNavigation(view: View, projectId: string | null, taskId: string | null, mode: "push" | "replace" = "push") {
    const url = new URL(window.location.href);
    if (view === "home") url.searchParams.delete("view");
    else url.searchParams.set("view", view);
    if (projectId) url.searchParams.set("project", projectId); else url.searchParams.delete("project");
    if (taskId && !projectId) url.searchParams.set("task", taskId); else url.searchParams.delete("task");
    const state = { ...window.history.state, __okrptrNavigation: true };
    delete state.__okrptrOverlay;
    window.history[mode === "push" ? "pushState" : "replaceState"](state, "", url);
  }

  function navigateView(view: View, mode: "push" | "replace" = "push") {
    setSelectedProjectId(null);
    setSelectedTaskId(null);
    setActiveView(view);
    writeNavigation(view, null, null, mode);
  }

  function openTaskDetail(id: string) {
    setSelectedProjectId(null);
    setSelectedTaskId(id);
    writeNavigation(activeView === "home" ? "inbox" : activeView, null, id);
  }

  function closeDetail() {
    const hasDetailParam = new URLSearchParams(window.location.search).has("project") || new URLSearchParams(window.location.search).has("task");
    if (hasDetailParam && window.history.state?.__okrptrNavigation) {
      window.history.back();
      return;
    }
    setSelectedProjectId(null);
    setSelectedTaskId(null);
    writeNavigation(activeView === "home" ? "okr" : activeView, null, null, "replace");
  }

  useEffect(() => {
    if (workspaceDataState !== "ready") return;
    const missingProject = selectedProjectId && !items.some((entry) => entry.id === selectedProjectId && entry.kind === "project" && !entry.archivedAt);
    const missingTask = selectedTaskId && !items.some((entry) => entry.id === selectedTaskId && entry.kind === "task" && !entry.archivedAt);
    if (!missingProject && !missingTask) return;
    const timeout = window.setTimeout(() => {
      setSelectedProjectId(null);
      setSelectedTaskId(null);
      writeNavigation(activeView === "home" ? "okr" : activeView, null, null, "replace");
      showNotice("요청한 상세 항목을 찾을 수 없습니다.", "error");
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [activeView, items, selectedProjectId, selectedTaskId, showNotice, workspaceDataState]);

  useEffect(() => {
    if (!freshWorkspaceDataReady || !currentWorkspace || currentWorkspace.role !== "owner" || hasActiveObjective) return;
    const navigationParams = new URLSearchParams(window.location.search);
    if (navigationParams.has("view") || navigationParams.has("project") || navigationParams.has("task")) return;
    if (assistantAutoHandledWorkspaceRef.current === currentWorkspace.id) return;
    assistantAutoHandledWorkspaceRef.current = currentWorkspace.id;
    const cycle = selectedOkrCycle;
    if (!cycle) return;
    const timeout = window.setTimeout(() => {
      setOkrChatContext({
        key: `${currentWorkspace.id}:onboarding`,
        entry: "onboarding",
        cycleId: cycle.id,
        cycleName: cycle.name,
        initialMessage: "",
        target: null,
        targetCandidates: [],
      });
      setSelectedProjectId(null);
      setSelectedTaskId(null);
      setActiveView("home");
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [currentWorkspace, freshWorkspaceDataReady, hasActiveObjective, selectedOkrCycle]);

  function openAssistant() {
    const cycle = selectedOkrCycle;
    if (!cycle || !currentWorkspace) return;
    const entry: OkrChatContext["entry"] = currentWorkspace.role === "owner" && !hasActiveObjective ? "onboarding" : "coach";
    const key = `${currentWorkspace.id}:${entry}`;
    const targeting = selectedProject ? { target: null, candidates: [] } : assistantTargeting;
    setOkrChatContext((current) => current?.key === key ? current : {
      key,
      entry,
      cycleId: cycle.id,
      cycleName: cycle.name,
      initialMessage: "",
      target: targeting.target,
      targetCandidates: targeting.candidates,
    });
    setSelectedProjectId(null);
    setSelectedTaskId(null);
    setMobileMenuOpen(false);
    setActiveView("home");
    writeNavigation("home", null, null);
  }

  function goToMobileHome() {
    setMobileMenuOpen(false);
    navigateView("okr");
  }

  async function switchWorkspace(workspaceId: string) {
    if (workspaces.find((entry) => entry.id === workspaceId)?.scheduledDeletionAt) return;
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
    if (response.ok) { clearCachedBootstrap(); window.location.reload(); }
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
      body: JSON.stringify({ name, confirmed: true }),
    });
    if (response.ok) { clearCachedBootstrap(); window.location.reload(); }
    else {
      setWorkspaceSaving(false);
      showNotice("워크스페이스를 만들지 못했습니다.");
    }
  }

  async function deleteWorkspace(workspace: WorkspaceSummary) {
    if (workspace.personal || workspace.role !== "owner" || workspaceSaving) return;
    if (!await confirmAction({ title: "워크스페이스 삭제 예약", message: `'${workspace.name}' 워크스페이스는 바로 접근할 수 없게 되며 30일 동안 복구할 수 있습니다. 30일 후 모든 데이터가 영구 삭제됩니다.`, confirmLabel: "삭제 예약", danger: true })) return;
    setWorkspaceSaving(true);
    const response = await fetch(`/api/workspaces?workspaceId=${encodeURIComponent(workspace.id)}`, { method: "DELETE" });
    if (response.ok) { clearCachedBootstrap(); window.location.reload(); }
    else {
      const data = await response.json().catch(() => ({})) as { error?: string };
      setWorkspaceSaving(false);
      showNotice(data.error ?? "워크스페이스를 삭제하지 못했습니다.");
    }
  }

  async function restoreWorkspace(workspace: WorkspaceSummary) {
    if (!workspace.scheduledDeletionAt || workspace.role !== "owner" || workspaceSaving) return;
    setWorkspaceSaving(true);
    const response = await fetch("/api/workspaces", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "restore", workspaceId: workspace.id }),
    });
    if (response.ok) { clearCachedBootstrap(); window.location.reload(); }
    else {
      const data = await response.json().catch(() => ({})) as { error?: string };
      setWorkspaceSaving(false);
      showNotice(data.error ?? "워크스페이스를 복구하지 못했습니다.");
    }
  }

  async function permanentlyDeleteWorkspace(workspace: WorkspaceSummary) {
    if (!workspace.scheduledDeletionAt || workspace.role !== "owner" || workspaceSaving) return;
    if (!await confirmAction({ title: "워크스페이스 영구 삭제", message: `'${workspace.name}' 워크스페이스와 그 안의 모든 데이터를 즉시 영구 삭제합니다. 이 작업은 되돌릴 수 없습니다.`, confirmationText: workspace.name, confirmLabel: "영구 삭제", danger: true })) return;
    const confirmationName = workspace.name;
    setWorkspaceSaving(true);
    const response = await fetch(`/api/workspaces?workspaceId=${encodeURIComponent(workspace.id)}&permanent=true`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmationName }),
    });
    if (response.ok) { clearCachedBootstrap(); window.location.reload(); }
    else {
      const data = await response.json().catch(() => ({})) as { error?: string };
      setWorkspaceSaving(false);
      showNotice(data.error ?? "워크스페이스를 영구삭제하지 못했습니다.");
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
        body: JSON.stringify({ title, kind: "task", source: "web", assigneeMemberId: currentTeamMember?.id }),
      });
      if (!response.ok) throw new Error("save failed");
      const data = (await response.json()) as { item: OkrptrItem };
      setItems((current) => [...current, data.item]);
      setCapture("");
      showNotice("미분류 Task에 추가했습니다.", "success");
    } catch {
      showNotice("Task를 저장하지 못했습니다. 입력 내용은 그대로 유지했습니다.", "error");
    } finally {
      setSaving(false);
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
      return true;
    } catch {
      setItems(previous);
      showNotice("변경사항을 저장하지 못했습니다.");
      return false;
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

  function toggleDeleteSelection(itemId: string) {
    setSelectedDeleteItemIds((current) => {
      const next = new Set(current);
      if (next.has(itemId)) next.delete(itemId); else next.add(itemId);
      return next;
    });
  }

  function addDeleteItems(itemIds: string[]) {
    setSelectedDeleteItemIds((current) => new Set([...current, ...itemIds]));
  }

  async function moveSelectedItemsToTrash() {
    if (!selectedDeleteItemIds.size || trashingItems) return;
    const selected = activeItems.filter((item) => selectedDeleteItemIds.has(item.id) && (item.kind === "project" || item.kind === "task"));
    const projectIds = new Set(selected.filter((item) => item.kind === "project").map((item) => item.id));
    const selectedStandaloneTaskIds = new Set(selected.filter((item) => item.kind === "task" && (!item.parentId || !projectIds.has(item.parentId))).map((item) => item.id));
    const childTaskIds = new Set(activeItems.filter((item) => item.kind === "task" && item.parentId && projectIds.has(item.parentId)).map((item) => item.id));
    const taskIds = new Set([
      ...selectedStandaloneTaskIds,
      ...childTaskIds,
    ]);
    if (!selected.length) { setSelectedDeleteItemIds(new Set()); return; }
    const message = `선택한 Project ${projectIds.size}개, 독립 Task ${selectedStandaloneTaskIds.size}개를 휴지통으로 이동할까요?\nProject와 함께 이동하는 하위 Task는 ${childTaskIds.size}개이며, 중복을 제외한 전체 Task는 ${taskIds.size}개입니다.\n휴지통에서 다시 복구할 수 있습니다.`;
    if (!await confirmAction({ title: "선택 항목을 휴지통으로 이동", message, confirmLabel: "휴지통으로 이동", danger: true })) return;
    setTrashingItems(true);
    try {
      const response = await fetch("/api/item-trash", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemIds: selected.map((item) => item.id) }),
      });
      const data = await response.json().catch(() => ({})) as { projectCount?: number; taskCount?: number; error?: string };
      if (!response.ok) throw new Error(data.error ?? "선택 항목을 휴지통으로 이동하지 못했습니다.");
      const refreshed = await fetch("/api/items", { cache: "no-store" });
      if (refreshed.ok) {
        const itemData = await refreshed.json() as { items: OkrptrItem[] };
        setItems(itemData.items);
      } else {
        setItems((current) => current.filter((item) => !projectIds.has(item.id) && !taskIds.has(item.id)));
      }
      clearCachedBootstrap();
      setSelectedDeleteItemIds(new Set());
      setSelectedProjectId(null);
      setSelectedTaskId(null);
      writeNavigation(activeView === "home" ? "okr" : activeView, null, null, "replace");
      showNotice(`Project ${data.projectCount ?? projectIds.size}개와 Task ${data.taskCount ?? taskIds.size}개를 휴지통으로 이동했습니다.`);
    } catch (error) {
      showNotice(error instanceof Error ? error.message : "선택 항목을 휴지통으로 이동하지 못했습니다.");
    } finally {
      setTrashingItems(false);
    }
  }

  async function archiveProjectItem(project: OkrptrItem) {
    const taskCount = activeItems.filter((item) => item.kind === "task" && item.parentId === project.id).length;
    if (!await confirmAction({ title: "Project를 휴지통으로 이동", message: `'${project.title}' Project와 하위 Task ${taskCount}개를 휴지통으로 이동합니다.\n휴지통에서 다시 복구할 수 있습니다.`, confirmLabel: "휴지통으로 이동", danger: true })) return;
    const response = await fetch("/api/project-archives", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: project.id }),
    });
    if (!response.ok) {
      showNotice("Project를 휴지통으로 이동하지 못했습니다.");
      return;
    }
    const data = await response.json() as { project: OkrptrItem; archivedTaskCount: number };
    setItems((current) => current.filter((entry) => entry.id !== project.id && entry.parentId !== project.id));
    closeDetail();
    clearCachedBootstrap();
    showNotice(`Project와 하위 Task ${data.archivedTaskCount}개를 휴지통으로 이동했습니다.`);
  }

  function openCreateItem(kind: ItemKind, cycleId: string | null = selectedOkrCycle?.id ?? null) {
    setCreateItemKind(kind);
    setCreateItemCycleId(cycleId);
    setCreateItemOpen(true);
  }

  function openOkrCreationChat(cycle: OkrCycle, sourceKind: ItemKind, initialMessage = "") {
    setCreateItemOpen(false);
    setSelectedOkrCycleId(cycle.id);
    setVisibleOkrCycleIds((current) => current.includes(cycle.id) ? current : [cycle.id, ...current]);
    setOkrChatContext({
      key: `${currentWorkspace?.id ?? "workspace"}:create:${cycle.id}:${sourceKind}:${Date.now()}`,
      entry: "create",
      cycleId: cycle.id,
      cycleName: cycle.name,
      initialMessage: initialMessage.trim(),
      sourceKind,
      target: null,
      targetCandidates: [],
    });
    setSelectedProjectId(null);
    setSelectedTaskId(null);
    setActiveView("home");
    writeNavigation("home", null, null);
  }

  function openProjectPage(id: string) {
    setSelectedTaskId(null);
    setSelectedProjectId(id);
    setActiveView("work");
    setProjectTab("list");
    writeNavigation("work", id, null);
  }

  function addCreatedItem(created: OkrptrItem, initialValues: Record<string, PropertyValue> = {}, warning?: string) {
    setItems((current) => [...current, created]);
    if (Object.keys(initialValues).length) {
      setPropertyValues((current) => ({ ...current, [created.id]: { ...current[created.id], ...initialValues } }));
    }
    setCreateItemOpen(false);
    showNotice(warning ?? `${kindLabel(created.kind)}를 만들었습니다.`, warning ? "error" : "success");
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
      navigateView("okr");
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
    if (!await confirmAction({ title: "OKR 파일 삭제", message: `'${cycle.name}' 파일 연결만 해제합니다. 작업 항목 자체는 삭제하지 않습니다.`, confirmLabel: "파일 삭제", danger: true })) return;
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

  async function createOnboardingPlan(plan: OnboardingPlan, targetCycleId: string | null = selectedOkrCycle?.id ?? null) {
    const objectiveTitle = plan.objectiveTitle.trim();
    const routineTitle = plan.routineTitle.trim();
    if (!objectiveTitle && !routineTitle) {
      showNotice("Objective나 루틴 이름을 먼저 적어 주세요.");
      return null;
    }
    if (objectiveTitle && (!plan.keyResults.length || plan.keyResults.some((entry) => !entry.title.trim()))) {
      showNotice("Objective에는 하나 이상의 Key Result가 필요합니다.");
      return null;
    }
    if (objectiveTitle && !targetCycleId) {
      showNotice("OKR 주기를 먼저 선택해 주세요.");
      return null;
    }
    if (plan.keyResults.some((entry) => entry.initiatives.some((initiative) => !initiative.title.trim()))) {
      showNotice("비어 있는 Initiative 이름을 입력하거나 제거해 주세요.");
      return null;
    }
    if (plan.unassignedInitiatives.length) {
      showNotice("KR 미지정 Initiative의 연결 대상을 먼저 선택해 주세요.");
      return null;
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
      if (!routineTitle) return null;
      const response = await fetch("/api/routines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: routineTitle,
          triggerPoint: plan.routineTrigger,
          actionPlace: plan.routinePlace,
          actionSteps: plan.routineSteps,
          cadence: "daily",
          assigneeMemberId: currentTeamMember?.id ?? null,
        }),
      });
      if (!response.ok) throw new Error("routine");
      const data = await response.json() as { routine: Routine };
      setRoutines((current) => [...current, data.routine]);
      return data.routine;
    }
    try {
      const okrResult = objectiveTitle && targetCycleId
        ? await applyAssistantOkrPlan(plan, targetCycleId, null, null)
        : null;
      if (objectiveTitle && !okrResult) return null;
      const routineItem = await createPlannedRoutine();
      const taskTitles = plan.tasks.split("\n").map((entry) => entry.trim()).filter(Boolean);
      for (const taskTitle of taskTitles) {
        await createPlannedItem({
          title: taskTitle,
          kind: "task",
          cycleId: null,
          routineId: routineItem?.id,
          status: "todo",
          assigneeMemberId: currentTeamMember?.id,
        });
      }
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
      if (routineTitle) showNotice("루틴을 만들었습니다.");
      return {
        cycleId: targetCycleId,
        items: [...(okrResult?.items ?? []), ...createdItems],
        keyResultIds: okrResult?.keyResultIds ?? [],
        initiativeIds: okrResult?.initiativeIds ?? [],
        projectIds: okrResult?.projectIds ?? [],
      } satisfies PlanCreationResult;
    } catch {
      showNotice("OKR 구성을 만들지 못했습니다.");
      return null;
    }
  }

  async function applyAssistantOkrPlan(plan: OnboardingPlan, cycleId: string, target: OkrPlanTarget | null, driMemberId: string | null) {
    try {
      const response = await fetch("/api/okr-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cycleId,
          targetId: target?.id ?? null,
          targetKind: target?.kind ?? null,
          tree: {
            objectiveTitle: plan.objectiveTitle,
            keyResults: plan.keyResults.map((keyResult) => ({
              title: keyResult.title,
              initiatives: keyResult.initiatives.map((initiative) => ({ title: initiative.title })),
            })),
            targetInitiatives: plan.targetInitiatives.map((initiative) => ({ title: initiative.title })),
          },
          project: plan.project,
          driMemberId: driMemberId ?? currentTeamMember?.id ?? null,
        }),
      });
      const data = await response.json() as OkrPlanApplyResult & { error?: string };
      if (!response.ok) throw new Error(data.error || "apply failed");
      setItems((current) => {
        const createdIds = new Set(data.items.map((entry) => entry.id));
        return [...current.filter((entry) => !createdIds.has(entry.id)), ...data.items];
      });
      setWorkspaceRules((current) => current ? { ...current, configured: true } : current);
      setSelectedOkrCycleId(data.cycleId);
      setVisibleOkrCycleIds((current) => current.includes(data.cycleId) ? current : [data.cycleId, ...current]);
      const krCount = data.keyResultIds?.length ?? 0;
      const initiativeCount = data.initiativeIds?.length ?? 0;
      showNotice(data.projectId ? "첫 Project를 만들었습니다." : `KR ${krCount}개 · Initiative ${initiativeCount}개를 만들었습니다.`);
      return data;
    } catch {
      showNotice("OKR 구성을 만들지 못했습니다.");
      return null;
    }
  }

  async function createProjectFromConversation(plan: OnboardingPlan, target: ProjectChatTarget) {
    const projectTitle = plan.project.trim();
    const routineTitle = plan.routineTitle.trim();
    if (!projectTitle && !routineTitle) {
      showNotice("Project 또는 Routine 이름을 먼저 정리해 주세요.");
      return false;
    }
    const createdItems: OkrptrItem[] = [];
    try {
      let projectItem: OkrptrItem | null = null;
      if (projectTitle) {
        const projectResponse = await fetch("/api/items", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: projectTitle,
            kind: "project",
            cycleId: target.cycleId,
            parentId: target.initiativeId,
            status: "in_progress",
            driMemberId: currentTeamMember?.id,
          }),
        });
        if (!projectResponse.ok) throw new Error("project");
        const projectData = await projectResponse.json() as { item: OkrptrItem };
        projectItem = projectData.item;
        createdItems.push(projectItem);
      }
      let routineItem: Routine | null = null;
      if (routineTitle) {
        const response = await fetch("/api/routines", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: routineTitle,
            triggerPoint: plan.routineTrigger,
            actionPlace: plan.routinePlace,
            actionSteps: plan.routineSteps,
            cadence: "daily",
            assigneeMemberId: currentTeamMember?.id ?? null,
          }),
        });
        if (!response.ok) throw new Error("routine");
        const data = await response.json() as { routine: Routine };
        routineItem = data.routine;
        setRoutines((current) => [...current, data.routine]);
      }
      const taskUsesRoutine = Boolean(routineItem) && (plan.taskParent === "routine" || !projectItem);
      for (const title of plan.tasks.split("\n").map((entry) => entry.trim()).filter(Boolean)) {
        const response = await fetch("/api/items", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title,
            kind: "task",
            cycleId: taskUsesRoutine ? null : target.cycleId,
            parentId: taskUsesRoutine ? undefined : projectItem?.id,
            routineId: taskUsesRoutine ? routineItem?.id : undefined,
            status: "todo",
            assigneeMemberId: currentTeamMember?.id,
          }),
        });
        if (!response.ok) throw new Error("task");
        const data = await response.json() as { item: OkrptrItem };
        createdItems.push(data.item);
      }
      setItems((current) => [...current, ...createdItems]);
      setOkrChatContext(null);
      setSelectedProjectId(null);
      setSelectedTaskId(null);
      if (projectItem) {
        setProjectTab("list");
        navigateView("work");
      } else {
        navigateView("routines");
      }
      showNotice(projectItem ? "첫 Project를 만들었습니다." : "첫 Routine을 만들었습니다.");
      return true;
    } catch {
      showNotice("실행 구성을 만들지 못했습니다.");
      return false;
    }
  }

  if (authState.status === "loading") return <AppLoadingScreen />;
  if (authState.status === "unauthenticated") return <AuthScreen reason={authState.reason} />;

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
            aria-haspopup="menu"
          >
            <WorkspaceAvatar workspace={currentWorkspace} className="brand-mark" />
            <span><strong>{currentWorkspace?.name || "개인 워크스페이스"}</strong><small>{currentWorkspace?.personal ? "개인 워크스페이스" : "팀 워크스페이스"}</small></span>
            <ChevronDown size={14} />
          </button>
          {workspaceMenuOpen && (
            <div className="workspace-menu" role="menu" aria-label="워크스페이스 선택">
              <header><b>워크스페이스</b><span>{activeWorkspaces.length}</span></header>
              <div className="workspace-list">
                {activeWorkspaces.map((workspace) => (
                  <div className="workspace-row" key={workspace.id}>
                    <button onClick={() => void switchWorkspace(workspace.id)} disabled={workspaceSaving}>
                      <WorkspaceAvatar workspace={workspace} />
                      <span><b>{workspace.name}</b><small>{workspace.personal ? "개인" : `${teamRoleLabel(workspace.role)}${(workspaceNameCounts.get(workspace.name.trim().toLocaleLowerCase()) ?? 0) > 1 ? ` · 생성 ${formatDateTime(workspace.createdAt)}` : ""}`}</small></span>
                      {workspace.current && <Check size={14} />}
                    </button>
                    {!workspace.personal && workspace.role === "owner" && (
                      <button className="workspace-delete" onClick={() => void deleteWorkspace(workspace)} disabled={workspaceSaving} aria-label={`${workspace.name} 워크스페이스 삭제 예약`} title="삭제 예약">
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                ))}
                {scheduledWorkspaces.length > 0 && (
                  <section className="workspace-scheduled">
                    <header><b>삭제 예정</b><span>{scheduledWorkspaces.length}</span></header>
                    {scheduledWorkspaces.map((workspace) => (
                      <div className="workspace-row workspace-row-scheduled" key={workspace.id}>
                        <div className="workspace-scheduled-main">
                          <WorkspaceAvatar workspace={workspace} />
                          <span><b>{workspace.name}</b><small>{workspaceDeletionLabel(workspace.scheduledDeletionAt)}{(workspaceNameCounts.get(workspace.name.trim().toLocaleLowerCase()) ?? 0) > 1 ? ` · 생성 ${formatDateTime(workspace.createdAt)}` : ""}</small></span>
                        </div>
                        <button className="workspace-restore" onClick={() => void restoreWorkspace(workspace)} disabled={workspaceSaving} aria-label={`${workspace.name} 워크스페이스 복구`} title="워크스페이스 복구">
                          <RotateCcw size={13} />
                        </button>
                        <button className="workspace-delete workspace-delete-permanent" onClick={() => void permanentlyDeleteWorkspace(workspace)} disabled={workspaceSaving} aria-label={`${workspace.name} 워크스페이스 즉시 영구삭제`} title="즉시 영구삭제">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))}
                  </section>
                )}
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
              <button className={`nav-item ${activeView === entry.id && !selectedProject ? "active" : ""}`} aria-current={activeView === entry.id && !selectedProject && !selectedTask ? "page" : undefined} key={entry.id} onClick={() => navigateView(entry.id)}>
                <Icon size={16} /><span>{entry.label}</span>
              </button>
            );
          })}
        </nav>
        <nav className="mobile-navigation" aria-label="주요 메뉴">
          {navItems.slice(0, 4).map((entry) => {
            const Icon = entry.icon;
            return (
              <button className={`nav-item ${activeView === entry.id && !selectedProject ? "active" : ""}`} aria-current={activeView === entry.id && !selectedProject && !selectedTask ? "page" : undefined} key={entry.id} onClick={() => navigateView(entry.id)}>
                <Icon size={16} /><span>{entry.label}</span>
              </button>
            );
          })}
          <button className={`nav-item assistant-mobile-tab ${activeView === "home" ? "active" : ""}`} onClick={openAssistant}><Bot size={16} /><span>도우미</span></button>
          <button className={`nav-item ${mobileMenuOpen ? "active" : ""}`} onClick={() => setMobileMenuOpen(true)}><Menu size={16} /><span>더보기</span></button>
        </nav>
        <div className="sidebar-bottom">
          <button className={`nav-item assistant-sidebar-tab ${activeView === "home" ? "active" : ""}`} onClick={openAssistant}><Bot size={16} /><span>OKR 도우미</span></button>
          <button className="nav-item" onClick={() => setIntegrationOpen(true)}><Link2 size={16} /><span>ChatGPT 연동</span></button>
          <button className="nav-item" onClick={() => setAppIntegrationsOpen(true)}><Plug size={16} /><span>앱 연동</span></button>
          <button className="nav-item" onClick={() => { setTeamPanelTab("members"); setTeamPanelOpen(true); }}><Users size={16} /><span>팀 멤버</span></button>
          <button className="nav-item" onClick={() => { setTeamPanelTab("groups"); setTeamPanelOpen(true); }}><AtSign size={16} /><span>그룹 관리</span></button>
          <button className="nav-item" onClick={() => setPropertyPanelOpen(true)}><Settings2 size={16} /><span>내 설정</span></button>
          <button className="profile-row" onClick={() => setPropertyPanelOpen(true)}><span className="avatar">{accountInitial}</span><span>{accountDisplayName}</span><MoreHorizontal size={15} /></button>
        </div>
      </aside>

      {mobileMenuOpen && (
        <OverlayDialog title="더보기 메뉴" variant="sheet" className="mobile-menu-backdrop" onRequestClose={() => setMobileMenuOpen(false)}>
          {(requestClose) => <aside className="mobile-menu-sheet">
            <header><div><b>{currentWorkspace?.name || "개인 워크스페이스"}</b><small>{currentWorkspace?.personal ? "개인 워크스페이스" : "팀 워크스페이스"}</small></div><button className="icon-button" onClick={() => requestClose("close-button")} aria-label="닫기"><X size={17} /></button></header>
            <div className="mobile-menu-list">
              {navItems.slice(4).map((entry) => { const Icon = entry.icon; return <button key={entry.id} onClick={() => { navigateView(entry.id); setMobileMenuOpen(false); }}><Icon size={16} /><span>{entry.label}</span><ChevronRight size={14} /></button>; })}
              <button onClick={() => { setMobileMenuOpen(false); setIntegrationOpen(true); }}><Link2 size={16} /><span>ChatGPT 연동</span><ChevronRight size={14} /></button>
              <button onClick={() => { setMobileMenuOpen(false); setAppIntegrationsOpen(true); }}><Plug size={16} /><span>앱 연동</span><ChevronRight size={14} /></button>
              <button onClick={() => { setMobileMenuOpen(false); setTeamPanelTab("members"); setTeamPanelOpen(true); }}><Users size={16} /><span>팀 멤버</span><ChevronRight size={14} /></button>
              <button onClick={() => { setMobileMenuOpen(false); setTeamPanelTab("groups"); setTeamPanelOpen(true); }}><AtSign size={16} /><span>그룹 관리</span><ChevronRight size={14} /></button>
              <button onClick={() => { setMobileMenuOpen(false); setPropertyPanelOpen(true); }}><Settings2 size={16} /><span>내 설정</span><ChevronRight size={14} /></button>
            </div>
          </aside>}
        </OverlayDialog>
      )}

      <section className="workspace">
        <header className="workspace-topbar">
          <span className="workspace-brand">OKRPTR</span>
          <button
            type="button"
            className="workspace-mobile-home"
            onClick={goToMobileHome}
            aria-label="홈으로 이동"
            aria-current={activeView === "okr" && !selectedProject && !selectedTask ? "page" : undefined}
          >
            <House size={15} /><span>홈</span>
          </button>
          <ChevronRight size={13} /><b>{selectedProject ? "Project" : viewTitles[activeView]}</b>
          <div><button className="mobile-assistant-trigger" aria-label="AI 대화 열기" title="AI 대화 열기" onClick={openAssistant}><span aria-hidden="true">🤖</span></button><button aria-label="팀 멤버" title="팀 멤버" onClick={() => { setTeamPanelTab("members"); setTeamPanelOpen(true); }}><Users size={15} /></button><button aria-label="서비스 안내" title="서비스 안내" onClick={() => setOnboardingOpen(true)}><CircleHelp size={15} /></button></div>
        </header>
        <div className="page-body">
          {activeView !== "home" && !selectedProject && <header className="page-header">
            <div><h1>{viewTitles[activeView]}</h1><p>{pageSubtitle(activeView)}</p></div>
            {activeView === "okr" ? (
              <button className="primary-action" onClick={() => setOkrListOpen(true)}><Archive size={14} />목록보기</button>
            ) : activeView === "work" && projectTab === "list" ? (
              <button className="primary-action" onClick={() => openCreateItem("project")}><Plus size={14} />Project 추가</button>
            ) : activeView === "reviews" ? (
              <CadenceSwitch value={cadence} onChange={setCadence} />
            ) : null}
          </header>}

          {workspaceDataState === "error" ? (
            <AsyncState
              icon={AlertTriangle}
              title="워크스페이스 데이터를 불러오지 못했습니다"
              detail="연결을 확인한 뒤 다시 시도해 주세요. 입력한 내용은 변경되지 않았습니다."
              actionLabel="다시 시도"
              onAction={() => { setWorkspaceDataState("loading"); setWorkspaceDataAttempt((attempt) => attempt + 1); }}
            />
          ) : workspaceDataState === "loading" ? (
            <AsyncState icon={LoaderCircle} title={`${viewTitles[activeView]} 데이터를 불러오는 중입니다`} loading />
          ) : <>
          {activeView === "inbox" && (
            <form className="quick-capture" onSubmit={submitCapture}>
              <Plus size={15} />
              <input value={capture} onChange={(event) => setCapture(event.target.value)} placeholder="할 일을 입력하면 미분류 Task에 저장됩니다" aria-label="미분류 Task에 할 일 추가" />
              <button disabled={!capture.trim() || saving}>{saving ? "저장 중" : "추가"}</button>
            </form>
          )}

          <div className="assistant-view-shell" hidden={activeView !== "home" || Boolean(selectedProject)}>
            <HomeView
              key={okrChatContext?.key ?? `${currentWorkspace?.id ?? "workspace"}:default`}
              onCreatePlan={createOnboardingPlan}
              onCreateProject={createProjectFromConversation}
              onApplyOkrPlan={applyAssistantOkrPlan}
              onFinish={() => navigateView("okr")}
              context={okrChatContext}
              workspaceContext={assistantWorkspaceContext}
              canWrite={canWriteWorkspace}
              members={teamMembers.filter((member) => member.status === "active")}
              defaultDriMemberId={currentTeamMember?.id ?? null}
              defaultCycleId={selectedOkrCycle?.id ?? null}
            />
          </div>

          {selectedProject ? (
            <ProjectPageView
              project={selectedProject}
              allItems={items}
              properties={properties}
              propertyValues={propertyValues}
              hiddenPropertyIds={hiddenProperties[selectedProject.id] ?? []}
              teamMembers={teamMembers}
              onClose={closeDetail}
              onPatch={patchItem}
              onPropertyChange={setPropertyValue}
              onPropertyVisibility={(propertyId, hidden) => void setProjectPropertyVisibility(selectedProject.id, propertyId, hidden)}
              onAssignmentsChange={updateItemAssignments}
              onTaskCreated={(created) => setItems((current) => [...current, created])}
              onOpenTask={openTaskDetail}
              readOnly={currentWorkspace?.role === "viewer"}
              onNotice={showNotice}
              onArchive={() => void archiveProjectItem(selectedProject)}
              selectedItemIds={selectedDeleteItemIds}
              onToggleSelect={toggleDeleteSelection}
            />
          ) : (
            <>
          {activeView === "my_work" && <MyWorkView items={activeItems} routines={routines} currentMember={currentTeamMember ?? null} onOpenProject={openProjectPage} onOpenTask={openTaskDetail} onRoutinesChange={setRoutines} onNotice={showNotice} />}
          {activeView === "inbox" && <TaskListView items={taskItems} allItems={items} routines={routines} onOpenTask={openTaskDetail} onPatch={patchItem} canDelete={canDeleteItems} selectedItemIds={selectedDeleteItemIds} onToggleSelect={toggleDeleteSelection} onSelectItems={addDeleteItems} />}
          {activeView === "work" && (
            <section className="project-workspace">
              <div className="project-tabs" role="tablist" aria-label="Project 보기">
                <button role="tab" aria-selected={projectTab === "list"} className={projectTab === "list" ? "active" : ""} onClick={() => setProjectTab("list")}><Table2 size={14} />목록</button>
                <button role="tab" aria-selected={projectTab === "properties"} className={projectTab === "properties" ? "active" : ""} onClick={() => setProjectTab("properties")}><Settings2 size={14} />속성 관리</button>
                <button role="tab" aria-selected={projectTab === "templates"} className={projectTab === "templates" ? "active" : ""} onClick={() => setProjectTab("templates")}><BookTemplate size={14} />템플릿 관리</button>
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
                onOpenTask={openTaskDetail}
                onOpenProject={openProjectPage}
                canDelete={canDeleteItems}
                selectedItemIds={selectedDeleteItemIds}
                onToggleSelect={toggleDeleteSelection}
                onSelectItems={addDeleteItems}
              />}
              {projectTab === "properties" && <ProjectPropertyManager
                properties={properties}
                teamMembers={teamMembers}
                readOnly={currentWorkspace?.role === "viewer"}
                onChanged={(next) => setProperties([...next].sort((left, right) => left.sortOrder - right.sortOrder))}
                onNotice={showNotice}
              />}
              {projectTab === "templates" && <ProjectTemplateManager readOnly={currentWorkspace?.role === "viewer"} onNotice={showNotice} />}
            </section>
          )}
          {activeView === "routines" && <RoutineView teamMembers={teamMembers} onNotice={showNotice} onRoutinesChange={setRoutines} />}
          {activeView === "okr" && (
            <section className="okr-workbench">
              <section className="okr-document">
                {displayedOkrCycles.length ? displayedOkrCycles.map((cycle) => {
                  const view = okrViews[cycle.id] ?? { items: [], depths: {} };
                  const firstItemKind: ItemKind = view.objective ? "key_result" : "objective";
                  return (
                    <article className="okr-document-card" key={cycle.id}>
                      <OkrCurrentFile key={`${cycle.id}-${cycle.name}-${cycle.department}`} cycle={cycle} addItemKind={firstItemKind} onRename={(id, name) => void renameOkrFile(id, name)} onDepartmentChange={(id, department) => void setOkrFileDepartment(id, department)} onAddItem={() => openCreateItem(firstItemKind, cycle.id)} />
                      <TreeView objective={view.objective} items={view.items} depths={view.depths} canEdit={canWriteWorkspace} onEditOkrItem={setSelectedOkrItemId} onComplete={(id) => void patchItem(id, { status: "done", progress: 100 })} onOpenProject={openProjectPage} onOpenTask={openTaskDetail} onCreateObjective={() => openCreateItem("objective", cycle.id)} onCreateWithChat={() => openOkrCreationChat(cycle, "objective")} />
                    </article>
                  );
                }) : <EmptyState icon={Archive} title="OKR 파일이 없습니다" />}
              </section>
            </section>
          )}
          {activeView === "scrum" && <DailyScrumView onOpenTask={openTaskDetail} onNotice={showNotice} />}
          {activeView === "recommendations" && <RecommendationsView items={activeItems} onOpenTask={openTaskDetail} onOpenProject={openProjectPage} onNavigate={navigateView} />}
          {activeView === "reviews" && <ReviewView items={periodItems} cadence={cadence} completed={completed} blocked={blocked} averageProgress={averageProgress} onOpenTask={openTaskDetail} onOpenProject={openProjectPage} />}
          {activeView === "trash" && <TrashView onNotice={showNotice} canDelete={canDeleteItems} />}
            </>
          )}
          </>}
        </div>
      </section>

      {canDeleteItems && selectedDeleteItemIds.size > 0 && (
        <div className="bulk-delete-bar" role="region" aria-label="선택 항목 작업">
          <b>{selectedDeleteItemIds.size}개 선택</b>
          <button onClick={() => setSelectedDeleteItemIds(new Set())}>선택 해제</button>
          <button className="danger" disabled={trashingItems} onClick={() => void moveSelectedItemsToTrash()}><Trash2 size={14} />{trashingItems ? "이동 중" : "휴지통으로 이동"}</button>
        </div>
      )}
      {notice && <div className={`toast toast-${notice.tone}`} role={notice.tone === "error" ? "alert" : "status"} aria-live={notice.tone === "error" ? "assertive" : "polite"}><span>{notice.message}</span><button type="button" onClick={() => setNotice(null)} aria-label="알림 닫기"><X size={13} /></button></div>}
      {okrListOpen && (
        <OverlayDialog title="OKR 파일 목록" variant="drawer" onRequestClose={() => setOkrListOpen(false)}>
          {(requestClose) =>
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
            onClose={() => requestClose("close-button")}
          />
          }
        </OverlayDialog>
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
          workspaceCount={activeWorkspaces.length}
          themeMode={themeMode}
          onThemeModeChange={setThemeMode}
          onClose={() => setPropertyPanelOpen(false)}
          onCleanup={() => { setPropertyPanelOpen(false); setCleanupOpen(true); }}
          onOpenWorkspaceMenu={() => { setPropertyPanelOpen(false); setWorkspaceMenuOpen(true); }}
          onOpenTeamMembers={() => { setPropertyPanelOpen(false); setTeamPanelTab("members"); setTeamPanelOpen(true); }}
          onOpenGroups={() => { setPropertyPanelOpen(false); setTeamPanelTab("groups"); setTeamPanelOpen(true); }}
          onOpenWorkspaceAvatar={() => { setPropertyPanelOpen(false); setWorkspaceAvatarOpen(true); }}
          onSignOut={() => { clearCachedBootstrap(); window.location.href = "/api/auth/logout"; }}
        />
      )}
      {workspaceAvatarOpen && currentWorkspace && (
        <WorkspaceAvatarDialog
          workspace={currentWorkspace}
          onClose={() => setWorkspaceAvatarOpen(false)}
          onChanged={(avatarUrl, avatarUpdatedAt) => {
            setWorkspaces((current) => current.map((workspace) => workspace.id === currentWorkspace.id ? { ...workspace, avatarUrl, avatarUpdatedAt } : workspace));
            setTeamData((current) => current ? { ...current, workspace: { ...current.workspace, avatarUrl, avatarUpdatedAt } } : current);
            clearCachedBootstrap();
          }}
          onNotice={showNotice}
        />
      )}
      {teamPanelOpen && <TeamPanel initialTeam={teamData} initialTab={teamPanelTab} initialGroupHandle={requestedGroupHandle} onMembersChange={(members) => setTeamData((current) => current ? { ...current, members } : current)} onClose={() => setTeamPanelOpen(false)} onNotice={showNotice} />}
      {selectedOkrItem && <OkrItemEditPanel item={selectedOkrItem} items={activeItems} onClose={() => setSelectedOkrItemId(null)} onSave={(patch) => patchItem(selectedOkrItem.id, patch)} />}
      {createItemOpen && <CreateItemPanel initialKind={createItemKind} cycleId={createItemCycle?.id ?? null} items={items} routines={routines} properties={properties} teamMembers={teamMembers} onClose={() => setCreateItemOpen(false)} onCreated={addCreatedItem} onCreateWithChat={activeView === "okr" && createItemCycle ? ({ kind, title }) => openOkrCreationChat(createItemCycle, kind, title) : undefined} />}
      {cleanupOpen && <CleanupModal onClose={() => setCleanupOpen(false)} onCleaned={(cycle) => { setItems([]); setPropertyValues({}); setOkrCycles([cycle]); setVisibleOkrCycleIds([cycle.id]); setSelectedTaskId(null); navigateView("trash"); setCleanupOpen(false); showNotice("OKR 데이터를 휴지통에 보관하고 정리했습니다."); }} onNotice={showNotice} />}
      {selectedTask && (
        <TaskDetailPanel
          task={selectedTask}
          allItems={activeItems}
          routines={routines}
          teamMembers={teamMembers}
          onClose={closeDetail}
          onPatch={(patch) => patchItem(selectedTask.id, patch)}
          onProgress={(progress) => setItems((current) => current.map((entry) => entry.id === selectedTask.id ? { ...entry, progress } : entry))}
          onAssignmentsChange={(assignments) => updateItemAssignments(selectedTask.id, assignments)}
          onNotice={showNotice}
          canDelete={canDeleteItems}
          selected={selectedDeleteItemIds.has(selectedTask.id)}
          onToggleSelect={() => toggleDeleteSelection(selectedTask.id)}
        />
      )}
    </main>
  );
}

function AppLoadingScreen() {
  return (
    <main className="app-loading-shell" aria-busy="true" aria-label="OKRPTR 불러오는 중">
      <aside className="app-loading-sidebar" aria-hidden="true">
        <div className="app-loading-brand"><span className="brand-mark">O</span><span><b>OKRPTR</b><small>Workspace</small></span></div>
        <div className="app-loading-nav">
          <i /><i /><i /><i /><i />
        </div>
        <div className="app-loading-profile"><i /><span /></div>
      </aside>
      <section className="app-loading-workspace">
        <header className="app-loading-topbar"><span /><div><i /><i /></div></header>
        <div className="app-loading-body">
          <div className="app-loading-copy">
            <h1>목표와 실행을 준비하고 있습니다</h1>
            <p>워크스페이스와 오늘의 할 일을 불러오는 중입니다.</p>
          </div>
          <div className="app-loading-command" aria-hidden="true"><i /><span /><b /></div>
          <div className="app-loading-surface" aria-hidden="true">
            <header><span /><div><i /><i /><i /></div></header>
            <div className="app-loading-table-head"><span /><span /><span /><span /></div>
            <div className="app-loading-table-row"><b /><span /><span /><span /></div>
            <div className="app-loading-table-row"><b /><span /><span /><span /></div>
            <div className="app-loading-table-row"><b /><span /><span /><span /></div>
          </div>
        </div>
      </section>
      <span className="sr-only" aria-live="polite">OKRPTR 워크스페이스를 불러오고 있습니다.</span>
    </main>
  );
}

function AuthScreen({ reason }: { reason: string | null }) {
  const [signingIn, setSigningIn] = useState(false);
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
          <button disabled={signingIn || unavailable} aria-busy={signingIn} onClick={() => { setSigningIn(true); startGoogleSignIn(); }}>
            {signingIn ? <LoaderCircle className="spin" size={17} /> : <LogIn size={17} />}
            {signingIn ? "Google로 이동 중" : "Google 계정으로 계속"}
          </button>
        </div>
      </section>
    </main>
  );
}

function startGoogleSignIn() {
  if (window.location.hostname !== "okrptr.com") {
    window.location.assign("/api/auth/google?returnTo=%2F");
    return;
  }
  const state = `${GOOGLE_BROWSER_SIGN_IN_STATE_PREFIX}${window.crypto.randomUUID()}`;
  document.cookie = `${GOOGLE_BROWSER_SIGN_IN_STATE_COOKIE_NAME}=${state}; Path=/; Secure; SameSite=Lax; Max-Age=600`;
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", GOOGLE_SIGN_IN_CLIENT_ID);
  url.searchParams.set("redirect_uri", `${window.location.origin}/api/google/callback`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("prompt", "select_account");
  url.searchParams.set("state", state);
  window.location.assign(url.toString());
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
    <OverlayDialog title={copy.title} className="welcome-backdrop" onRequestClose={() => onClose()}>
      {(requestClose) => <section className="welcome-modal">
        <header className="welcome-toolbar">
          <div className="welcome-brand"><span className="brand-mark">O</span><strong>OKRPTR</strong></div>
          <div className="language-select">
            <Languages size={14} />
            <label className="sr-only" htmlFor="intro-language">{copy.languageLabel}</label>
            <select id="intro-language" value={language} onChange={(event) => onLanguageChange(event.target.value as IntroLanguage)}>
              {introLanguages.map((entry) => <option value={entry.id} key={entry.id}>{entry.label}</option>)}
            </select>
          </div>
          <button className="icon-button" onClick={() => requestClose("close-button")} aria-label="Close"><X size={17} /></button>
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
          <button className="welcome-primary" onClick={() => requestClose("close-button")}>{copy.startAction}<ChevronRight size={14} /></button>
        </footer>
      </section>}
    </OverlayDialog>
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
    <OverlayDialog title="실명 확인" className="profile-name-backdrop" dirty={name !== suggestedName} initialFocus="input" onRequestClose={() => onClose()}>
      {(requestClose) => <section className="profile-name-modal">
        <header>
          <div>
            <h2 id="profile-name-title">실명 확인</h2>
            <p>팀에서 사용할 이름</p>
          </div>
          <button className="icon-button" onClick={() => requestClose("close-button")} aria-label="나중에"><X size={17} /></button>
        </header>
        <form onSubmit={save}>
          <label>
            <span>내 실명</span>
            <input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} placeholder="홍길동" />
          </label>
          {error && <p>{error}</p>}
          <footer>
            <button type="button" onClick={() => requestClose("close-button")}>나중에</button>
            <button disabled={!name.trim() || saving}><Check size={14} />저장</button>
          </footer>
        </form>
      </section>}
    </OverlayDialog>
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
    <OverlayDialog title="OKR 데이터 클린업" dismissPolicy="critical" initialFocus="input" onRequestClose={() => onClose()}>
      {(requestClose) => <section className="cleanup-modal">
        <header>
          <div>
            <AlertTriangle size={18} />
            <h2 id="cleanup-title">OKR 데이터 클린업</h2>
          </div>
          <button className="icon-button" onClick={() => requestClose("close-button")} aria-label="닫기"><X size={17} /></button>
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
          <button onClick={() => requestClose("close-button")}>취소</button>
          <button className="danger" disabled={confirm !== confirmationText || cleaning} onClick={() => void clean()}>
            {cleaning ? "정리 중" : "휴지통으로 이동"}
          </button>
        </footer>
      </section>}
    </OverlayDialog>
  );
}

function CadenceSwitch({ value, onChange }: { value: Cadence; onChange: (value: Cadence) => void }) {
  return <div className="cadence-switch">{(Object.keys(cadenceLabels) as Cadence[]).map((entry) => <button className={value === entry ? "selected" : ""} key={entry} onClick={() => onChange(entry)}>{cadenceLabels[entry]}</button>)}</div>;
}

function TaskDatabase({ items, allItems, properties, values, hiddenProperties, display, onDisplayChange, onPatch, onPropertyChange, onOpenProperties, onOpenTask, onOpenProject, canDelete, selectedItemIds, onToggleSelect, onSelectItems }: {
  items: OkrptrItem[];
  allItems: OkrptrItem[];
  properties: PropertyDefinition[];
  values: PropertyValueMap;
  hiddenProperties: ProjectHiddenPropertyMap;
  display: "cards" | "table" | "board";
  onDisplayChange: (display: "cards" | "table" | "board") => void;
  onPatch: (id: string, patch: Partial<OkrptrItem>) => Promise<unknown>;
  onPropertyChange: (itemId: string, propertyId: string, value: PropertyValue) => Promise<void>;
  onOpenProperties: () => void;
  onOpenTask: (id: string) => void;
  onOpenProject: (id: string) => void;
  canDelete: boolean;
  selectedItemIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onSelectItems: (ids: string[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<ItemStatus | "all">("all");
  const [priorityFilter, setPriorityFilter] = useState<Priority | "all">("all");
  const [driFilter, setDriFilter] = useState("all");
  const [dueFilter, setDueFilter] = useState<"all" | "overdue" | "week" | "none">("all");
  const [sort, setSort] = useState<"default" | "recent" | "due" | "priority" | "name">("default");
  const [filterOpen, setFilterOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const actionsRef = useRef<HTMLDivElement>(null);
  const customProperties = properties.filter((property) => !property.systemKey && property.active);
  const byId = new Map(allItems.map((entry) => [entry.id, entry]));
  const emptyLabel = items.every((entry) => entry.kind === "project") ? "Project" : "Task";
  const activeFilterCount = [statusFilter !== "all", priorityFilter !== "all", driFilter !== "all", dueFilter !== "all"].filter(Boolean).length;
  const driOptions = Array.from(new Map(items.flatMap((entry) => entry.assignments.filter((assignment) => assignment.role === "project_dri")).map((assignment) => [assignment.memberId, assignment])).values());
  const today = localDate();
  const weekDate = new Date();
  weekDate.setDate(weekDate.getDate() + 7);
  const weekEnd = `${weekDate.getFullYear()}-${String(weekDate.getMonth() + 1).padStart(2, "0")}-${String(weekDate.getDate()).padStart(2, "0")}`;
  const priorityRank: Record<Priority, number> = { low: 1, medium: 2, high: 3, urgent: 4 };
  const visible = items
    .filter((entry) => entry.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
    .filter((entry) => statusFilter === "all" || entry.status === statusFilter)
    .filter((entry) => priorityFilter === "all" || entry.priority === priorityFilter)
    .filter((entry) => driFilter === "all" || entry.assignments.some((assignment) => assignment.role === "project_dri" && assignment.memberId === driFilter))
    .filter((entry) => dueFilter === "all" || dueFilter === "none" ? dueFilter === "all" || !entry.dueDate : dueFilter === "overdue" ? Boolean(entry.dueDate && entry.dueDate < today) : Boolean(entry.dueDate && entry.dueDate >= today && entry.dueDate <= weekEnd))
    .sort((left, right) => sort === "recent" ? right.updatedAt.localeCompare(left.updatedAt)
      : sort === "due" ? (left.dueDate ?? "9999-12-31").localeCompare(right.dueDate ?? "9999-12-31")
      : sort === "priority" ? priorityRank[right.priority] - priorityRank[left.priority]
      : sort === "name" ? left.title.localeCompare(right.title, "ko")
      : items.indexOf(left) - items.indexOf(right));

  useEffect(() => {
    if (!filterOpen && !sortOpen) return;
    function closePopovers(event: Event) {
      if (event instanceof KeyboardEvent && event.key !== "Escape") return;
      if (event instanceof PointerEvent && actionsRef.current?.contains(event.target as Node)) return;
      setFilterOpen(false);
      setSortOpen(false);
    }
    window.addEventListener("pointerdown", closePopovers);
    window.addEventListener("keydown", closePopovers);
    return () => {
      window.removeEventListener("pointerdown", closePopovers);
      window.removeEventListener("keydown", closePopovers);
    };
  }, [filterOpen, sortOpen]);

  function resetFilters() {
    setStatusFilter("all");
    setPriorityFilter("all");
    setDriFilter("all");
    setDueFilter("all");
  }

  function propertyPreview(entry: OkrptrItem) {
    return customProperties
      .filter((property) => !(hiddenProperties[entry.id] ?? []).includes(property.id))
      .map((property) => ({ property, value: values[entry.id]?.[property.id] ?? null }))
      .filter(({ value }) => value !== null && value !== "" && (!Array.isArray(value) || value.length))
      .slice(0, 2);
  }

  return (
    <section className="database-section">
      <div className="database-toolbar">
        <div className="view-tabs" role="tablist" aria-label="Project 표시 방식">
          <button role="tab" aria-selected={display === "cards"} className={display === "cards" ? "active" : ""} onClick={() => onDisplayChange("cards")}><Briefcase size={13} />카드</button>
          <button role="tab" aria-selected={display === "table"} className={display === "table" ? "active" : ""} onClick={() => onDisplayChange("table")}><Table2 size={13} />테이블</button>
          <button role="tab" aria-selected={display === "board"} className={display === "board" ? "active" : ""} onClick={() => onDisplayChange("board")}><Columns3 size={13} />보드</button>
        </div>
        <div className="database-actions" ref={actionsRef}>
          {canDelete && visible.length > 0 && <button onClick={() => onSelectItems(visible.map((item) => item.id))}><ListChecks size={13} /><span>현재 목록 선택</span></button>}
          <label className="table-search"><Search size={13} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Project 검색" aria-label="Project 검색" /></label>
          <div className="toolbar-popover-wrap">
            <button aria-label="Project 필터" title="Project 필터" aria-haspopup="dialog" aria-expanded={filterOpen} onClick={() => { setFilterOpen((open) => !open); setSortOpen(false); }}><Filter size={13} /><span>필터</span>{activeFilterCount > 0 && <b>{activeFilterCount}</b>}</button>
            {filterOpen && <section className="toolbar-popover" role="dialog" aria-label="Project 필터">
              <header><b>필터</b>{activeFilterCount > 0 && <button onClick={resetFilters}>전체 해제</button>}</header>
              <label><span>상태</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as ItemStatus | "all")}><option value="all">전체</option>{Object.entries(statusLabels).filter(([value]) => value !== "archived").map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
              <label><span>우선순위</span><select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value as Priority | "all")}><option value="all">전체</option>{Object.entries(priorityLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
              <label><span>DRI</span><select value={driFilter} onChange={(event) => setDriFilter(event.target.value)}><option value="all">전체</option>{driOptions.map((assignment) => <option value={assignment.memberId} key={assignment.memberId}>{assignment.displayName}</option>)}</select></label>
              <label><span>마감</span><select value={dueFilter} onChange={(event) => setDueFilter(event.target.value as "all" | "overdue" | "week" | "none")}><option value="all">전체</option><option value="overdue">기한 초과</option><option value="week">7일 이내</option><option value="none">기한 없음</option></select></label>
              <footer><button onClick={() => setFilterOpen(false)}>적용</button></footer>
            </section>}
          </div>
          <div className="toolbar-popover-wrap">
            <button aria-label="Project 정렬" title="Project 정렬" aria-haspopup="listbox" aria-expanded={sortOpen} onClick={() => { setSortOpen((open) => !open); setFilterOpen(false); }}><ArrowDownUp size={13} /><span>정렬</span>{sort !== "default" && <i />}</button>
            {sortOpen && <div className="toolbar-popover sort-popover" role="listbox" aria-label="Project 정렬">{([
              ["default", "기본순"], ["recent", "최근 수정순"], ["due", "마감 임박순"], ["priority", "우선순위 높은순"], ["name", "이름순"],
            ] as const).map(([value, label]) => <button role="option" aria-selected={sort === value} className={sort === value ? "active" : ""} key={value} onClick={() => { setSort(value); setSortOpen(false); }}>{label}{sort === value && <Check size={13} />}</button>)}</div>}
          </div>
          <button onClick={onOpenProperties} aria-label="Project 속성 관리" title="Project 속성 관리"><Plus size={13} /><span>속성</span></button>
        </div>
      </div>
      {display === "cards" ? <div className="project-card-list" role="list" aria-label="Project 카드 목록">{visible.map((entry) => {
        const previews = propertyPreview(entry);
        return <article className="project-card" role="listitem" key={entry.id}>
          {canDelete && <DeleteSelectCheckbox item={entry} selected={selectedItemIds.has(entry.id)} onToggle={onToggleSelect} />}
          <button className="project-card-open" onClick={() => onOpenProject(entry.id)}>
            <header><span className="type-icon type-project">P</span><b>{entry.title}</b><ChevronRight size={15} /></header>
            <div className="project-card-meta"><span className={`status-tag status-${entry.status}`}>{statusLabel(entry.status)}</span><span className={`priority-${entry.priority}`}>{priorityLabels[entry.priority]}</span><span><CalendarDays size={12} />{dueLabel(entry.dueDate)}</span><span><Users size={12} />{assignmentLabel(entry, "project_dri")}</span></div>
            <div className="project-card-relation"><Link2 size={12} /><span>{entry.parentId ? byId.get(entry.parentId)?.title ?? "연결 없음" : "연결 없음"}</span></div>
            {previews.length > 0 && <div className="project-card-properties">{previews.map(({ property, value }) => <span key={property.id}><small>{property.name}</small><b>{Array.isArray(value) ? `${value.length}명` : typeof value === "boolean" ? value ? "예" : "아니오" : String(value)}</b></span>)}</div>}
            <div className="project-card-progress"><span><i style={{ width: `${entry.progress}%` }} /></span><b>{entry.progress}%</b></div>
          </button>
        </article>;
      })}{!visible.length && <div className="table-empty">{activeFilterCount || query ? <><span>조건에 맞는 Project가 없습니다.</span><button onClick={() => { resetFilters(); setQuery(""); }}>검색·필터 초기화</button></> : "표시할 Project가 없습니다."}</div>}</div>
      : display === "board" ? <BoardView items={visible} onOpenItem={(entry) => entry.kind === "project" ? onOpenProject(entry.id) : onOpenTask(entry.id)} canDelete={canDelete} selectedItemIds={selectedItemIds} onToggleSelect={onToggleSelect} /> : (
        <div className="database-scroll">
          <div className="task-table" role="table" aria-label="Project 표" style={{ "--custom-columns": customProperties.length } as CSSProperties}>
            <div className="task-table-row task-table-head" role="row">
              <span role="columnheader"><ListChecks size={12} />이름</span><span role="columnheader"><Activity size={12} />상태</span><span role="columnheader"><Zap size={12} />우선순위</span><span role="columnheader"><CalendarDays size={12} />기한</span><span role="columnheader"><Link2 size={12} />상위 Initiative</span><span role="columnheader"><Users size={12} />DRI</span>
              {customProperties.map((property) => <span role="columnheader" key={property.id}>{property.type === "number" ? <Hash size={12} /> : <TextCursorInput size={12} />}{property.name}</span>)}
              <button aria-label="속성 추가" title="속성 추가" onClick={onOpenProperties}><Plus size={13} /></button>
            </div>
            {visible.map((entry) => (
              <div className="task-table-row" role="row" key={entry.id}>
                <div className="name-cell">{canDelete && <DeleteSelectCheckbox item={entry} selected={selectedItemIds.has(entry.id)} onToggle={onToggleSelect} />}<span className={`type-icon type-${entry.kind}`}>{kindAbbr(entry.kind)}</span><button className={`task-check ${isCompletedStatus(entry.status) ? "checked" : ""}`} onClick={() => void onPatch(entry.id, { status: isCompletedStatus(entry.status) ? "todo" : "done", progress: isCompletedStatus(entry.status) ? entry.progress : 100 })}><Check size={12} /></button>{entry.kind === "project" ? <button className="name-open-button" onClick={() => onOpenProject(entry.id)}>{entry.title}</button> : <input defaultValue={entry.title} onBlur={(event) => event.target.value.trim() !== entry.title && void onPatch(entry.id, { title: event.target.value })} />}</div>
                <select aria-label={`${entry.title} 상태`} className={`status-select status-${entry.status}`} value={entry.status} onChange={(event) => void onPatch(entry.id, { status: event.target.value as ItemStatus })}>{Object.entries(statusLabels).filter(([value]) => value !== "archived").map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select>
                <select aria-label={`${entry.title} 우선순위`} className={`priority-${entry.priority}`} value={entry.priority} onChange={(event) => void onPatch(entry.id, { priority: event.target.value as Priority })}>{Object.entries(priorityLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select>
                <input aria-label={`${entry.title} 기한`} className="date-cell" type="date" value={entry.dueDate ?? ""} onChange={(event) => void onPatch(entry.id, { dueDate: event.target.value || null })} />
                <span className="relation-cell">{entry.parentId ? byId.get(entry.parentId)?.title ?? "연결 없음" : "연결 없음"}</span>
                <span className="relation-cell assignment-cell">{assignmentLabel(entry, "project_dri")}</span>
                {customProperties.map((property) => (hiddenProperties[entry.id] ?? []).includes(property.id)
                  ? <span className="hidden-property-cell" key={property.id} title="이 Project에서 숨긴 속성">—</span>
                  : <PropertyCell key={property.id} itemId={entry.id} property={property} value={values[entry.id]?.[property.id] ?? null} onChange={onPropertyChange} />)}
                {entry.kind === "task" ? <button className="row-menu" aria-label="Task detail" title="Task detail" onClick={() => onOpenTask(entry.id)}><MoreHorizontal size={15} /></button> : entry.kind === "project" ? <button className="row-menu" aria-label="Project 속성" title="Project 속성" onClick={() => onOpenProject(entry.id)}><MoreHorizontal size={15} /></button> : <span className="row-menu" />}
              </div>
            ))}
            {!visible.length && <div className="table-empty">{activeFilterCount || query ? <><span>조건에 맞는 {emptyLabel}가 없습니다.</span><button onClick={() => { resetFilters(); setQuery(""); }}>검색·필터 초기화</button></> : `표시할 ${emptyLabel}가 없습니다.`}</div>}
          </div>
        </div>
      )}
    </section>
  );
}

function PropertyCell({ itemId, property, value, onChange }: { itemId: string; property: PropertyDefinition; value: PropertyValue; onChange: (itemId: string, propertyId: string, value: PropertyValue) => Promise<void> }) {
  if (property.type === "checkbox") return <label className="property-checkbox"><input type="checkbox" checked={Boolean(value)} onChange={(event) => void onChange(itemId, property.id, event.target.checked)} /><span><Check size={11} /></span></label>;
  if (property.type === "select") return <select className="property-input" value={typeof value === "string" ? value : ""} onChange={(event) => void onChange(itemId, property.id, event.target.value || null)}><option value="">-</option>{property.options.map((option) => <option key={option}>{option}</option>)}</select>;
  if (property.type === "member" || property.type === "members") return <span className="relation-cell assignment-cell">{Array.isArray(value) ? `${value.length}명` : value ? "1명" : "미지정"}</span>;
  return <input className="property-input" type={property.type === "number" ? "number" : property.type === "date" ? "date" : "text"} value={value === null ? "" : String(value)} onChange={(event) => { const raw = event.target.value; void onChange(itemId, property.id, property.type === "number" ? (raw ? Number(raw) : null) : raw || null); }} />;
}

function ProjectPageView({ project, allItems, properties, propertyValues, hiddenPropertyIds, teamMembers, onClose, onPatch, onPropertyChange, onPropertyVisibility, onAssignmentsChange, onTaskCreated, onOpenTask, readOnly, onNotice, onArchive, selectedItemIds, onToggleSelect }: {
  project: OkrptrItem;
  allItems: OkrptrItem[];
  properties: PropertyDefinition[];
  propertyValues: PropertyValueMap;
  hiddenPropertyIds: string[];
  teamMembers: TeamMember[];
  onClose: () => void;
  onPatch: (id: string, patch: Partial<OkrptrItem>) => Promise<unknown>;
  onPropertyChange: (itemId: string, propertyId: string, value: PropertyValue) => Promise<void>;
  onPropertyVisibility: (propertyId: string, hidden: boolean) => void;
  onAssignmentsChange: (itemId: string, assignments: ItemAssignment[]) => void;
  onTaskCreated: (task: OkrptrItem) => void;
  onOpenTask: (id: string) => void;
  readOnly: boolean;
  onNotice: (message: string) => void;
  onArchive: () => void;
  selectedItemIds: Set<string>;
  onToggleSelect: (id: string) => void;
}) {
  const [quickTaskTitle, setQuickTaskTitle] = useState("");
  const [creatingTask, setCreatingTask] = useState(false);
  const byId = new Map(allItems.map((entry) => [entry.id, entry]));
  const initiative = project.parentId ? byId.get(project.parentId) : undefined;
  const keyResult = initiative?.parentId ? byId.get(initiative.parentId) : undefined;
  const objective = keyResult?.parentId ? byId.get(keyResult.parentId) : undefined;
  const initiatives = allItems.filter((entry) => entry.kind === "initiative");
  const activeProperties = properties.filter((property) => property.active);
  const customProperties = activeProperties.filter((property) => !property.systemKey);
  const visibleProperties = customProperties.filter((property) => !hiddenPropertyIds.includes(property.id));
  const hiddenPropertyDefinitions = activeProperties.filter((property) => hiddenPropertyIds.includes(property.id));
  const systemProperties = new Map(properties.filter((property) => property.systemKey).map((property) => [property.systemKey!, property]));
  const linkedTasks = allItems.filter((entry) => entry.kind === "task" && entry.parentId === project.id && !entry.archivedAt);
  const driIds = project.assignments.filter((entry) => entry.role === "project_dri").map((entry) => entry.memberId);
  const workerIds = project.assignments.filter((entry) => entry.role === "project_worker").map((entry) => entry.memberId);

  function systemProperty(key: string) {
    return systemProperties.get(key);
  }

  function systemPropertyVisible(key: string) {
    const property = systemProperty(key);
    return property ? property.active && !hiddenPropertyIds.includes(property.id) : true;
  }

  async function saveAssignments(role: "project_dri" | "project_worker", memberIds: string[]) {
    const response = await fetch("/api/item-assignments", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId: project.id, role, memberIds }),
    });
    if (!response.ok) { onNotice("담당자를 저장하지 못했습니다."); return; }
    const data = await response.json() as { assignments: ItemAssignment[] };
    onAssignmentsChange(project.id, data.assignments);
  }

  async function saveTaskAssignee(task: OkrptrItem, memberId: string) {
    const response = await fetch("/api/item-assignments", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId: task.id, role: "task_assignee", memberIds: memberId ? [memberId] : [] }),
    });
    if (!response.ok) { onNotice("담당자를 저장하지 못했습니다."); return; }
    const data = await response.json() as { assignments: ItemAssignment[] };
    onAssignmentsChange(task.id, data.assignments);
  }

  async function createLinkedTask(event: FormEvent) {
    event.preventDefault();
    const title = quickTaskTitle.trim();
    if (!title || creatingTask || readOnly) return;
    setCreatingTask(true);
    const response = await fetch("/api/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, kind: "task", parentId: project.id, cycleId: project.cycleId, source: "web" }),
    });
    setCreatingTask(false);
    if (!response.ok) { onNotice("Task를 만들지 못했습니다."); return; }
    const data = await response.json() as { item: OkrptrItem };
    onTaskCreated(data.item);
    setQuickTaskTitle("");
    onNotice("Project에 Task를 추가했습니다.");
  }
  return (
    <OverlayDialog title={`${project.title} Project 상세`} variant="drawer" dirty={Boolean(quickTaskTitle.trim())} history={false} onRequestClose={() => onClose()}>
      {(requestClose) => <aside className={`property-panel project-detail-panel ${project.status === "archived" ? "archived" : ""}`}>
        <header className="project-page-head">
          <div>
            <p>Project page</p>
            <textarea
              className="project-title-input"
              defaultValue={project.title}
              readOnly={readOnly}
              onBlur={(event) => !readOnly && event.target.value.trim() !== project.title && void onPatch(project.id, { title: event.target.value })}
              aria-label="Project 이름"
              rows={1}
            />
          </div>
          <div className="project-page-actions">
            {!readOnly && <DeleteSelectCheckbox item={project} selected={selectedItemIds.has(project.id)} onToggle={onToggleSelect} />}
            {!readOnly && <button type="button" className="danger" onClick={onArchive}><Trash2 size={13} />휴지통으로 이동</button>}
            <button className="icon-button" onClick={() => requestClose("close-button")} aria-label="닫기"><X size={17} /></button>
          </div>
        </header>
        <form className="property-form project-detail-form">
          {systemPropertyVisible("parent_id") && <ProjectSystemPropertySlot property={systemProperty("parent_id")} readOnly={readOnly} onHide={onPropertyVisibility}><label><span>{systemProperty("parent_id")?.name ?? "상위 Initiative"}</span><select disabled={readOnly} value={project.parentId ?? ""} onChange={(event) => void onPatch(project.id, { parentId: event.target.value || null })}><option value="">선택</option>{initiatives.map((entry) => <option value={entry.id} key={entry.id}>{entry.title}</option>)}</select></label></ProjectSystemPropertySlot>}
          <div className="project-field-grid">
            {systemPropertyVisible("priority") && <ProjectSystemPropertySlot property={systemProperty("priority")} readOnly={readOnly} onHide={onPropertyVisibility}><label><span>{systemProperty("priority")?.name ?? "우선순위"}</span><select disabled={readOnly} className={`priority-${project.priority}`} value={project.priority} onChange={(event) => void onPatch(project.id, { priority: event.target.value as Priority })}>{Object.entries(priorityLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label></ProjectSystemPropertySlot>}
            {systemPropertyVisible("status") && <ProjectSystemPropertySlot property={systemProperty("status")} readOnly={readOnly} onHide={onPropertyVisibility}><label><span>{systemProperty("status")?.name ?? "상태"}</span><select disabled={readOnly} value={project.status} onChange={(event) => void onPatch(project.id, { status: event.target.value as ItemStatus })}>{Object.entries(statusLabels).filter(([value]) => value !== "archived").map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label></ProjectSystemPropertySlot>}
            {systemPropertyVisible("cadence") && <ProjectSystemPropertySlot property={systemProperty("cadence")} readOnly={readOnly} onHide={onPropertyVisibility}><label><span>{systemProperty("cadence")?.name ?? "주기"}</span><select disabled={readOnly} value={project.cadence} onChange={(event) => void onPatch(project.id, { cadence: event.target.value as Cadence })}>{Object.entries(cadenceLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label></ProjectSystemPropertySlot>}
            {systemPropertyVisible("due_date") && <ProjectSystemPropertySlot property={systemProperty("due_date")} readOnly={readOnly} onHide={onPropertyVisibility}><label><span>{systemProperty("due_date")?.name ?? "기한"}</span><input disabled={readOnly} type="date" value={project.dueDate ?? ""} onChange={(event) => void onPatch(project.id, { dueDate: event.target.value || null })} /></label></ProjectSystemPropertySlot>}
          </div>
          {teamMembers.length > 0 && systemPropertyVisible("project_dri") && <ProjectSystemPropertySlot property={systemProperty("project_dri")} readOnly={readOnly} onHide={onPropertyVisibility}><MemberMentionPicker label={systemProperty("project_dri")?.name ?? "DRI"} members={teamMembers} selectedIds={driIds} onChange={(ids) => !readOnly && void saveAssignments("project_dri", ids)} placeholder="@실명으로 찾기" maxSelected={1} /></ProjectSystemPropertySlot>}
          {teamMembers.length > 0 && systemPropertyVisible("project_workers") && <ProjectSystemPropertySlot property={systemProperty("project_workers")} readOnly={readOnly} onHide={onPropertyVisibility}><MemberMentionPicker label={systemProperty("project_workers")?.name ?? "하위 업무자"} members={teamMembers} selectedIds={workerIds} onChange={(ids) => !readOnly && void saveAssignments("project_worker", ids)} placeholder="@실명으로 여러 명 태그" /></ProjectSystemPropertySlot>}
        </form>
        <section className="project-custom-properties">
          <header><b>Project 속성</b><span>변경 즉시 저장</span></header>
          {visibleProperties.length ? visibleProperties.map((property) => <ProjectPropertyField key={property.id} projectId={project.id} property={property} value={propertyValues[project.id]?.[property.id] ?? null} members={teamMembers} readOnly={readOnly} onChange={onPropertyChange} onHide={() => onPropertyVisibility(property.id, true)} />) : <EmptyState icon={Settings2} title="표시 중인 커스텀 속성이 없습니다" />}
          {hiddenPropertyDefinitions.length > 0 && <div className="hidden-property-list"><span>숨긴 속성 {hiddenPropertyDefinitions.length}</span>{hiddenPropertyDefinitions.map((property) => <button key={property.id} onClick={() => onPropertyVisibility(property.id, false)}><Eye size={13} />{property.name}</button>)}</div>}
        </section>
        <section className="task-lineage project-lineage-compact">
          <header><b>상위 OKR</b><span>Objective → KR → Initiative</span></header>
          <LineageRow label="Objective" value={objective?.title ?? "미연결"} />
          <LineageRow label="Key Result" value={keyResult?.title ?? "미연결"} />
          <LineageRow label="Initiative" value={initiative?.title ?? "미연결"} />
        </section>
        <section className="project-linked-tasks">
          <header><div><b>연결된 Task</b><span>{linkedTasks.length}개</span></div>{!readOnly && linkedTasks.length > 0 && <button onClick={() => linkedTasks.forEach((task) => { if (!selectedItemIds.has(task.id)) onToggleSelect(task.id); })}><ListChecks size={13} />전체 선택</button>}</header>
          <form className="project-task-quick-add" onSubmit={createLinkedTask}>
            <input value={quickTaskTitle} onChange={(event) => setQuickTaskTitle(event.target.value)} placeholder="새 Task 빠른 추가" disabled={readOnly || creatingTask} />
            <button disabled={readOnly || creatingTask || !quickTaskTitle.trim()} aria-label="Task 추가" title="Task 추가"><Plus size={15} /></button>
          </form>
          <div className="project-task-table">
            <div className="project-task-row project-task-head"><span>Task</span><span>상태</span><span>담당자</span><span>마감일</span><span>진행률</span></div>
            {linkedTasks.map((task) => {
              const assignee = task.assignments.find((assignment) => assignment.role === "task_assignee")?.memberId ?? "";
              return <div className="project-task-row" key={task.id}>
                <div className="project-task-title-cell">{!readOnly && <DeleteSelectCheckbox item={task} selected={selectedItemIds.has(task.id)} onToggle={onToggleSelect} />}<button className="project-task-title" onClick={() => onOpenTask(task.id)}>{task.title}</button></div>
                <select disabled={readOnly} className={`status-${task.status}`} value={task.status} onChange={(event) => void onPatch(task.id, { status: event.target.value as ItemStatus })}>{Object.entries(statusLabels).filter(([value]) => value !== "archived").map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select>
                <select disabled={readOnly} value={assignee} onChange={(event) => void saveTaskAssignee(task, event.target.value)}><option value="">미지정</option>{teamMembers.filter((member) => member.status === "active").map((member) => <option value={member.id} key={member.id}>{member.displayName}</option>)}</select>
                <input disabled={readOnly} type="date" value={task.dueDate ?? ""} onChange={(event) => void onPatch(task.id, { dueDate: event.target.value || null })} />
                <label className="project-task-progress"><input disabled={readOnly} type="range" min="0" max="100" step="5" value={task.progress} onChange={(event) => void onPatch(task.id, { progress: Number(event.target.value) })} /><span>{task.progress}%</span></label>
              </div>;
            })}
            {!linkedTasks.length && <div className="project-task-empty">연결된 Task가 없습니다.</div>}
          </div>
        </section>
        <ProjectDocumentSection key={project.id} projectId={project.id} readOnly={readOnly} onNotice={onNotice} />
      </aside>}
    </OverlayDialog>
  );
}

function ProjectSystemPropertySlot({ property, readOnly, onHide, children }: { property?: PropertyDefinition; readOnly: boolean; onHide: (propertyId: string, hidden: boolean) => void; children: ReactNode }) {
  return <div className="project-system-property">{children}{property && !readOnly && <button type="button" className="icon-button" onClick={() => onHide(property.id, true)} aria-label={`${property.name} 숨기기`} title="이 Project에서 숨기기"><EyeOff size={13} /></button>}</div>;
}

type ProjectBlockEditorProps = { initialContent: string; editable?: boolean; onChange?: (change: ProjectBlockEditorChange) => void };

function ClientProjectBlockEditor(props: ProjectBlockEditorProps) {
  const [Editor, setEditor] = useState<ComponentType<ProjectBlockEditorProps> | null>(null);
  useEffect(() => {
    let active = true;
    void import("@/app/project-block-editor").then((module) => { if (active) setEditor(() => module.default); });
    return () => { active = false; };
  }, []);
  return Editor ? <Editor {...props} /> : <div className="project-editor-loading"><LoaderCircle size={16} />편집기를 불러오는 중</div>;
}

function ProjectDocumentSection({ projectId, readOnly, onNotice }: { projectId: string; readOnly: boolean; onNotice: (message: string) => void }) {
  const [document, setDocument] = useState<ProjectDocument | null>(null);
  const [templates, setTemplates] = useState<ProjectTemplate[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [templateName, setTemplateName] = useState("");
  const [creatingTemplate, setCreatingTemplate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [savingState, setSavingState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const versionRef = useRef(0);
  const savingRef = useRef(false);
  const pendingChangeRef = useRef<ProjectBlockEditorChange | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([
      fetch(`/api/project-documents?projectId=${encodeURIComponent(projectId)}`, { signal: controller.signal }).then(async (response) => response.ok ? response.json() as Promise<{ document: ProjectDocument }> : Promise.reject()),
      fetch("/api/project-templates", { signal: controller.signal }).then(async (response) => response.ok ? response.json() as Promise<{ templates: ProjectTemplate[] }> : Promise.reject()),
    ]).then(([documentData, templateData]) => {
      versionRef.current = documentData.document.version;
      setDocument(documentData.document);
      setTemplates(templateData.templates);
    }).catch((error: unknown) => {
      if (!(error instanceof DOMException && error.name === "AbortError")) setSavingState("error");
    }).finally(() => setLoading(false));
    return () => controller.abort();
  }, [projectId]);

  async function flushDocumentSave() {
    if (savingRef.current || !pendingChangeRef.current) return;
    savingRef.current = true;
    const change = pendingChangeRef.current;
    pendingChangeRef.current = null;
    setSavingState("saving");
    const response = await fetch("/api/project-documents", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, ...change, expectedVersion: versionRef.current }),
    });
    const data = await response.json() as { document?: ProjectDocument; error?: string };
    savingRef.current = false;
    if (!response.ok || !data.document) {
      setSavingState("error");
      if (response.status === 409) onNotice("다른 변경이 먼저 저장되었습니다. 문서를 다시 불러와 주세요.");
      return;
    }
    versionRef.current = data.document.version;
    setDocument((current) => current ? { ...data.document!, content: change.content, plainText: change.plainText } : data.document!);
    setSavingState("saved");
    window.setTimeout(() => setSavingState((current) => current === "saved" ? "idle" : current), 1600);
    if (pendingChangeRef.current) void flushDocumentSave();
  }

  function queueDocumentSave(change: ProjectBlockEditorChange) {
    pendingChangeRef.current = change;
    void flushDocumentSave();
  }

  async function applyTemplate() {
    if (!templateId || readOnly) return;
    const selected = templates.find((template) => template.id === templateId);
    const response = await fetch("/api/project-documents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, templateId }),
    });
    const data = await response.json() as { document?: ProjectDocument };
    if (!response.ok || !data.document) { onNotice("템플릿을 불러오지 못했습니다."); return; }
    versionRef.current = data.document.version;
    setDocument(data.document);
    setTemplateId("");
    onNotice(`'${selected?.name ?? "템플릿"}'을 기존 내용 위에 추가했습니다.`);
  }

  async function createTemplateFromDocument(event: FormEvent) {
    event.preventDefault();
    if (!document || readOnly) return;
    const name = templateName.trim();
    if (!name) return;
    const response = await fetch("/api/project-templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, content: document.content, plainText: document.plainText }),
    });
    const data = await response.json() as { template?: ProjectTemplate; error?: string };
    if (!response.ok || !data.template) { onNotice(data.error ?? "템플릿을 만들지 못했습니다."); return; }
    setTemplates((current) => [data.template!, ...current]);
    setTemplateName("");
    setCreatingTemplate(false);
    onNotice("현재 문서를 템플릿으로 저장했습니다.");
  }

  return <section className="project-document-section">
    <header><div><b>프로젝트 문서</b><span>{savingState === "saving" ? "저장 중" : savingState === "saved" ? "저장됨" : savingState === "error" ? "저장 실패" : "자동 저장"}</span></div>{!readOnly && <div className="project-document-actions"><select value={templateId} onChange={(event) => setTemplateId(event.target.value)} aria-label="본문 템플릿 선택"><option value="">템플릿 불러오기</option>{templates.map((template) => <option value={template.id} key={template.id}>{template.name}</option>)}</select><button disabled={!templateId} onClick={() => void applyTemplate()}><BookTemplate size={13} />불러오기</button><button onClick={() => setCreatingTemplate(true)}><Copy size={13} />템플릿으로 저장</button></div>}</header>
    {creatingTemplate && <form className="project-document-template-create" onSubmit={(event) => void createTemplateFromDocument(event)}><input aria-label="새 템플릿 이름" value={templateName} onChange={(event) => setTemplateName(event.target.value)} placeholder="템플릿 이름" /><button disabled={!templateName.trim()}><Check size={13} />저장</button><button type="button" className="icon-button" aria-label="템플릿 만들기 취소" onClick={() => { setCreatingTemplate(false); setTemplateName(""); }}><X size={13} /></button></form>}
    {loading ? <div className="project-editor-loading"><LoaderCircle size={16} />문서를 불러오는 중</div> : document ? <ClientProjectBlockEditor key={`${document.projectId}:${document.version}`} initialContent={document.content} editable={!readOnly} onChange={readOnly ? undefined : queueDocumentSave} /> : <div className="project-editor-error">문서를 불러오지 못했습니다.</div>}
  </section>;
}

function ProjectPropertyField({ projectId, property, value, members, readOnly, onChange, onHide }: { projectId: string; property: PropertyDefinition; value: PropertyValue; members: TeamMember[]; readOnly: boolean; onChange: (itemId: string, propertyId: string, value: PropertyValue) => Promise<void>; onHide: () => void }) {
  const memberIds = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
  return (
    <div className="project-property-field-row">
      <label className="project-property-field">
        <span>{property.name}</span>
        {property.type === "checkbox" ? (
          <input disabled={readOnly} type="checkbox" checked={Boolean(value)} onChange={(event) => void onChange(projectId, property.id, event.target.checked)} />
        ) : property.type === "member" ? (
          <select disabled={readOnly} value={memberIds[0] ?? ""} onChange={(event) => void onChange(projectId, property.id, event.target.value || null)}><option value="">선택 안 함</option>{members.filter((member) => member.status === "active").map((member) => <option value={member.id} key={member.id}>{member.displayName}</option>)}</select>
        ) : property.type === "members" ? (
          <select disabled={readOnly} multiple value={memberIds} onChange={(event) => void onChange(projectId, property.id, Array.from(event.target.selectedOptions, (option) => option.value))}>{members.filter((member) => member.status === "active").map((member) => <option value={member.id} key={member.id}>{member.displayName}</option>)}</select>
        ) : property.type === "select" ? (
          <select disabled={readOnly} value={typeof value === "string" ? value : ""} onChange={(event) => void onChange(projectId, property.id, event.target.value || null)}><option value="">선택 안 함</option>{property.options.map((option) => <option key={option}>{option}</option>)}</select>
        ) : (
          <input disabled={readOnly} type={property.type === "number" ? "number" : property.type === "date" ? "date" : "text"} value={value === null ? "" : String(value)} onChange={(event) => { const raw = event.target.value; void onChange(projectId, property.id, property.type === "number" ? (raw ? Number(raw) : null) : raw || null); }} />
        )}
      </label>
      {!readOnly && <button className="icon-button" onClick={onHide} aria-label={`${property.name} 숨기기`} title="이 Project에서 숨기기"><EyeOff size={14} /></button>}
    </div>
  );
}

function TaskDetailPanel({ task, allItems, routines, teamMembers, onClose, onPatch, onProgress, onAssignmentsChange, onNotice, canDelete, selected, onToggleSelect }: {
  task: OkrptrItem;
  allItems: OkrptrItem[];
  routines: Routine[];
  teamMembers: TeamMember[];
  onClose: () => void;
  onPatch: (patch: Partial<OkrptrItem>) => Promise<unknown>;
  onProgress: (progress: number) => void;
  onAssignmentsChange: (assignments: ItemAssignment[]) => void;
  onNotice: (message: string) => void;
  canDelete: boolean;
  selected: boolean;
  onToggleSelect: () => void;
}) {
  const confirmAction = useAppConfirm();
  const [rows, setRows] = useState<ChecklistItem[]>([]);
  const [title, setTitle] = useState("");
  const [syncingCalendar, setSyncingCalendar] = useState(false);
  const [savingChecklist, setSavingChecklist] = useState(false);
  const [checklistLoadError, setChecklistLoadError] = useState(false);
  const byId = new Map(allItems.map((entry) => [entry.id, entry]));
  const project = task.parentId ? byId.get(task.parentId) : undefined;
  const initiative = project?.parentId ? byId.get(project.parentId) : undefined;
  const keyResult = initiative?.parentId ? byId.get(initiative.parentId) : undefined;
  const objective = keyResult?.parentId ? byId.get(keyResult.parentId) : undefined;
  const routineMatch = task.routineId ? routines.find((entry) => entry.id === task.routineId) : undefined;
  const routine = routineMatch?.systemKey === "general" ? undefined : routineMatch;
  const projectDri = project ? assignmentLabel(project, "project_dri") : "미지정";
  const assigneeIds = task.assignments.filter((entry) => entry.role === "task_assignee").map((entry) => entry.memberId);
  const lineageTitle = routine ? `Routine · ${routine.title}` : project ? `Project · ${project.title}` : "미분류 Task";
  useEffect(() => {
    fetch(`/api/checklists?taskId=${encodeURIComponent(task.id)}`)
      .then(async (response) => response.ok ? response.json() as Promise<{ items: ChecklistItem[] }> : Promise.reject())
      .then((data) => { setRows(data.items); setChecklistLoadError(false); })
      .catch(() => { setRows([]); setChecklistLoadError(true); onNotice("체크리스트를 불러오지 못했습니다."); });
  }, [onNotice, task.id]);

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
    const nextTitle = title.trim();
    if (!nextTitle || savingChecklist) return;
    setSavingChecklist(true);
    const response = await fetch("/api/checklists", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ taskId: task.id, title: nextTitle }) });
    setSavingChecklist(false);
    if (!response.ok) { onNotice("체크리스트를 추가하지 못했습니다."); return; }
    const data = await response.json() as { item: ChecklistItem };
    setRows((current) => {
      const next = [...current, data.item];
      updateProgress(next);
      return next;
    });
    setTitle("");
  }

  async function toggleRow(row: ChecklistItem) {
    const completed = !row.completed;
    const previous = rows;
    const next = rows.map((entry) => entry.id === row.id ? { ...entry, completed } : entry);
    setRows(next); updateProgress(next);
    const response = await fetch("/api/checklists", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: row.id, completed }) });
    if (!response.ok) { setRows(previous); updateProgress(previous); onNotice("체크리스트 변경을 저장하지 못했습니다."); }
  }

  async function deleteRow(id: string) {
    const row = rows.find((entry) => entry.id === id);
    if (!row || !await confirmAction({ title: "체크리스트 삭제", message: `'${row.title}' 항목을 삭제합니다.`, confirmLabel: "삭제", danger: true })) return;
    const previous = rows;
    const next = rows.filter((entry) => entry.id !== id);
    setRows(next); updateProgress(next);
    const response = await fetch(`/api/checklists?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!response.ok) { setRows(previous); updateProgress(previous); onNotice("체크리스트를 삭제하지 못했습니다."); }
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
    <OverlayDialog title={`${task.title} Task 상세`} variant="drawer" dirty={Boolean(title.trim())} history={false} onRequestClose={() => onClose()}>
      {(requestClose) => <aside className="property-panel task-detail-panel">
        <header><div><p>{lineageTitle}</p><textarea className="task-title-input" defaultValue={task.title} rows={1} aria-label="Task 이름" onBlur={(event) => { const nextTitle = event.currentTarget.value.trim(); if (nextTitle && nextTitle !== task.title) void onPatch({ title: nextTitle }); }} /></div><div className="task-detail-actions">{canDelete && <DeleteSelectCheckbox item={task} selected={selected} onToggle={onToggleSelect} />}<button className="icon-button" onClick={() => requestClose("close-button")} aria-label="닫기"><X size={17} /></button></div></header>
        <section className="task-detail-fields" aria-label="Task 정보">
          <label><span>상태</span><select className={`status-${task.status}`} value={task.status} onChange={(event) => void onPatch({ status: event.target.value as ItemStatus })}>{Object.entries(statusLabels).filter(([value]) => value !== "archived").map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
          <label><span>우선순위</span><select className={`priority-${task.priority}`} value={task.priority} onChange={(event) => void onPatch({ priority: event.target.value as Priority })}>{Object.entries(priorityLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
          <label><span>기한</span><input type="date" value={task.dueDate ?? ""} onChange={(event) => void onPatch({ dueDate: event.target.value || null })} /></label>
          <label className="task-progress-field"><span>진행률</span><div><input type="range" min="0" max="100" step="5" value={task.progress} onChange={(event) => void onPatch({ progress: Number(event.target.value) })} /><b>{task.progress}%</b></div></label>
        </section>
        {teamMembers.length > 0 && <section className="task-assignee-editor"><MemberMentionPicker label="담당자" members={teamMembers} selectedIds={assigneeIds} onChange={(ids) => void saveAssignee(ids)} placeholder="@실명으로 찾기" maxSelected={1} /></section>}
        <section className="task-lineage">
          <header><b>상위 맵핑</b><span>{routine ? "Routine 기반 Task" : project ? "OKR 실행 구조" : "아직 연결 전"}</span></header>
          <LineageRow label="등록 경로" value={sourceLabel(task.source)} />
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
        <section className="checklist-section"><header><b>체크리스트</b><span>{rows.filter((entry) => entry.completed).length}/{rows.length}</span></header>{checklistLoadError && <p className="inline-error" role="alert">체크리스트를 불러오지 못했습니다. 상세 화면을 다시 열어 재시도해 주세요.</p>}<div>{rows.map((row) => <div className="checklist-row" key={row.id}><button className={`task-check ${row.completed ? "checked" : ""}`} onClick={() => void toggleRow(row)} aria-label={`${row.title} ${row.completed ? "완료 취소" : "완료"}`}><Check size={12} /></button><span className={row.completed ? "completed" : ""}>{row.title}</span><button className="icon-button" onClick={() => void deleteRow(row.id)} aria-label={`${row.title} 삭제`}><Trash2 size={13} /></button></div>)}</div><form className="checklist-form" onSubmit={addRow}><Plus size={14} /><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="항목 추가" aria-label="체크리스트 항목" disabled={savingChecklist} /><button disabled={!title.trim() || savingChecklist}>{savingChecklist ? "추가 중" : "추가"}</button></form></section>
      </aside>}
    </OverlayDialog>
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
  const fieldRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const pickerId = useId().replace(/:/g, "");
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
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      return;
    }
    if (event.key === "Enter" && candidates[0] && !atLimit) {
      event.preventDefault();
      add(candidates[0].id);
      return;
    }
    if (event.key === "Backspace" && !query && selectedIds.length) {
      onChange(selectedIds.slice(0, -1));
    }
  }

  useEffect(() => {
    if (!open) return;
    function closeOnOutside(event: PointerEvent) {
      if (!fieldRef.current?.contains(event.target as Node)) setOpen(false);
    }
    window.addEventListener("pointerdown", closeOnOutside);
    return () => window.removeEventListener("pointerdown", closeOnOutside);
  }, [open]);

  return (
    <div className="member-mention-field" ref={fieldRef}>
      <span id={`${pickerId}-label`}>{label}</span>
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
              ref={inputRef}
              value={query}
              onChange={(event) => { setQuery(event.target.value); setOpen(true); }}
              onFocus={() => setOpen(true)}
              onKeyDown={handleKeyDown}
              placeholder={selectedMembers.length ? "" : placeholder}
              disabled={disabled}
              role="combobox"
              aria-labelledby={`${pickerId}-label`}
              aria-controls={`${pickerId}-listbox`}
              aria-expanded={open && !atLimit}
              aria-autocomplete="list"
            />
          </div>
        )}
      </div>
      {open && !disabled && !atLimit && (
        <div className="member-mention-menu" id={`${pickerId}-listbox`} role="listbox" aria-label={`${label} 후보`}>
          {candidates.length ? candidates.map((member) => (
            <button type="button" role="option" aria-selected="false" key={member.id} onClick={() => add(member.id)}>
              <span className="team-avatar">{memberInitial(member)}</span>
              <b>{member.displayName}</b>
              <small>{member.email || teamRoleLabel(member.role)}</small>
            </button>
          )) : <p>일치하는 멤버가 없습니다</p>}
        </div>
      )}
    </div>
  );
}

function OkrItemEditPanel({ item, items, onClose, onSave }: {
  item: OkrptrItem;
  items: OkrptrItem[];
  onClose: () => void;
  onSave: (patch: Partial<OkrptrItem>) => Promise<boolean>;
}) {
  const [title, setTitle] = useState(item.title);
  const [parentId, setParentId] = useState(item.parentId ?? "");
  const [status, setStatus] = useState(item.status);
  const [progress, setProgress] = useState(item.progress);
  const [saving, setSaving] = useState(false);
  const parentKind = item.kind === "key_result" ? "objective" : item.kind === "initiative" ? "key_result" : null;
  const parentOptions = parentKind
    ? items.filter((entry) => entry.kind === parentKind && entry.cycleId === item.cycleId && !entry.archivedAt)
    : [];
  const dirty = title.trim() !== item.title || parentId !== (item.parentId ?? "") || status !== item.status || progress !== item.progress;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!title.trim() || saving || (parentKind && !parentId)) return;
    setSaving(true);
    const saved = await onSave({
      title: title.trim(),
      parentId: parentKind ? parentId : null,
      status,
      progress,
    });
    setSaving(false);
    if (saved) onClose();
  }

  return (
    <OverlayDialog title={`${kindLabel(item.kind)} 수정`} variant="drawer" dirty={dirty} initialFocus="input" onRequestClose={() => onClose()}>
      {(requestClose) => <aside className="property-panel okr-item-edit-panel">
        <header><div><h2>{kindLabel(item.kind)} 수정</h2><p>문구와 상위 연결을 저장 후에도 변경할 수 있습니다.</p></div><button className="icon-button" onClick={() => requestClose("close-button")} aria-label="OKR 항목 수정 닫기"><X size={17} /></button></header>
        <form className="property-form" onSubmit={(event) => void submit(event)}>
          <label><span>유형</span><input value={kindLabel(item.kind)} disabled /></label>
          <label><span>이름</span><textarea rows={4} value={title} onChange={(event) => setTitle(event.target.value)} aria-label={`${kindLabel(item.kind)} 이름`} /></label>
          {parentKind && <label><span>상위 {kindLabel(parentKind)}</span><select value={parentId} onChange={(event) => setParentId(event.target.value)} aria-label={`상위 ${kindLabel(parentKind)}`}><option value="">선택</option>{parentOptions.map((entry) => <option value={entry.id} key={entry.id}>{entry.title}</option>)}</select></label>}
          <label><span>상태</span><select value={status} onChange={(event) => setStatus(event.target.value as ItemStatus)}>{Object.entries(statusLabels).filter(([value]) => value !== "archived").map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
          <label className="okr-item-progress-field"><span>진행률</span><div><input type="range" min="0" max="100" step="5" value={progress} onChange={(event) => setProgress(Number(event.target.value))} /><b>{progress}%</b></div></label>
          <button disabled={!dirty || !title.trim() || saving || Boolean(parentKind && !parentId)}>{saving ? "저장 중" : "변경 저장"}</button>
        </form>
      </aside>}
    </OverlayDialog>
  );
}

function CreateItemPanel({ initialKind, cycleId, items, routines, properties, teamMembers, onClose, onCreated, onCreateWithChat }: {
  initialKind: ItemKind;
  cycleId: string | null;
  items: OkrptrItem[];
  routines: Routine[];
  properties: PropertyDefinition[];
  teamMembers: TeamMember[];
  onClose: () => void;
  onCreated: (item: OkrptrItem, initialValues?: Record<string, PropertyValue>, warning?: string) => void;
  onCreateWithChat?: (draft: { kind: ItemKind; title: string }) => void;
}) {
  const [kind, setKind] = useState<ItemKind>(initialKind);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [parentId, setParentId] = useState("");
  const [taskContainer, setTaskContainer] = useState("");
  const [status, setStatus] = useState<ItemStatus>(() => propertySystemDefault(properties, "status", "todo") as ItemStatus);
  const [priority, setPriority] = useState<Priority>(() => propertySystemDefault(properties, "priority", "medium") as Priority);
  const [cadence, setCadence] = useState<Cadence>(() => propertySystemDefault(properties, "cadence", "weekly") as Cadence);
  const [dueDate, setDueDate] = useState(() => propertySystemDefault(properties, "due_date", ""));
  const [customValues, setCustomValues] = useState<Record<string, PropertyValue>>({});
  const [availableTemplates, setAvailableTemplates] = useState<ProjectTemplate[]>([]);
  const [templateId, setTemplateId] = useState("");
  const currentMemberId = teamMembers.find((member) => member.isCurrent && member.status === "active")?.id;
  const [projectDriIds, setProjectDriIds] = useState<string[]>(() => { const value = properties.find((property) => property.systemKey === "project_dri")?.defaultValue; return typeof value === "string" ? [value] : currentMemberId ? [currentMemberId] : []; });
  const [projectWorkerIds, setProjectWorkerIds] = useState<string[]>(() => { const value = properties.find((property) => property.systemKey === "project_workers")?.defaultValue; return Array.isArray(value) ? value : []; });
  const [taskAssigneeIds, setTaskAssigneeIds] = useState<string[]>(currentMemberId ? [currentMemberId] : []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const requiredParent: Record<ItemKind, ItemKind | null> = { objective: null, key_result: "objective", initiative: "key_result", project: "initiative", task: "project" };
  const parentKind = requiredParent[kind];
  const parentOptions = parentKind ? items.filter((entry) => entry.kind === parentKind && (!cycleId || entry.cycleId === cycleId)) : [];
  const projectProperties = kind === "project" ? properties.filter((property) => property.active && !property.systemKey) : [];
  const dirty = Boolean(title.trim() || description.trim() || parentId || taskContainer || templateId || Object.keys(customValues).length);

  useEffect(() => {
    if (kind !== "project") return;
    let active = true;
    void fetch("/api/project-templates").then(async (response) => response.ok ? response.json() as Promise<{ templates: ProjectTemplate[] }> : Promise.reject()).then((data) => { if (active) setAvailableTemplates(data.templates); }).catch(() => undefined);
    return () => { active = false; };
  }, [kind]);

  function updateCustomValue(property: PropertyDefinition, value: PropertyValue) {
    setCustomValues((current) => ({
      ...current,
      [property.id]: property.type === "number"
        ? (value === "" || value === null ? null : Number(value))
        : value === "" ? null : value,
    }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!title.trim() || saving || (kind !== "objective" && kind !== "task" && !parentId)) return;
    setSaving(true);
    setError("");
    const routineId = kind === "task" && taskContainer.startsWith("routine:") ? taskContainer.slice(8) : null;
    const taskParentId = kind === "task" && taskContainer.startsWith("project:") ? taskContainer.slice(8) : null;
    const nextParentId = kind === "task" ? taskParentId : parentId || null;
    const nextDescription = kind === "project" ? description.trim() : "";
    try {
      const response = await fetch("/api/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          kind,
          cycleId: kind === "task" && (!nextParentId || routineId) ? null : cycleId,
          description: nextDescription,
          parentId: nextParentId,
          routineId,
          status,
          priority,
          cadence,
          dueDate: dueDate || null,
          driMemberId: kind === "project" ? projectDriIds[0] ?? "" : undefined,
          workerMemberIds: kind === "project" ? projectWorkerIds : undefined,
          assigneeMemberId: kind === "task" ? taskAssigneeIds[0] ?? "" : undefined,
          templateId: kind === "project" ? templateId || undefined : undefined,
        }),
      });
      const responseData = await response.json().catch(() => ({})) as { item?: OkrptrItem; error?: string };
      if (!response.ok || !responseData.item) throw new Error(responseData.error ?? "항목을 만들지 못했습니다.");
      const filledValues = Object.fromEntries(Object.entries(customValues).filter(([, value]) => value !== null && value !== ""));
      const propertyResults = await Promise.all((kind === "project" ? Object.entries(filledValues) : []).map(async ([propertyId, value]) => fetch("/api/property-values", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: responseData.item!.id, propertyId, value }),
      })));
      const propertySaveFailed = propertyResults.some((result) => !result.ok);
      onCreated(responseData.item, propertySaveFailed ? {} : filledValues, propertySaveFailed ? "항목은 만들었지만 일부 속성을 저장하지 못했습니다." : undefined);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "항목을 만들지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }
  return (
    <OverlayDialog title="새 항목" variant="drawer" dirty={dirty} initialFocus="input" onRequestClose={() => onClose()}>
      {(requestClose) => <aside className="property-panel">
        <header><div><h2>새 항목</h2><p>{kind === "project" ? "Project 속성을 지정해서 추가" : "OKR 실행 구조에 추가"}</p></div><button className="icon-button" onClick={() => requestClose("close-button")} aria-label="새 항목 닫기" title="새 항목 닫기"><X size={17} /></button></header>
        <form className="property-form create-item-form" onSubmit={submit}>
          <label><span>유형</span><select value={kind} onChange={(event) => { setKind(event.target.value as ItemKind); setParentId(""); setTaskContainer(""); }} disabled={initialKind === "project"}>{(["objective", "key_result", "initiative", "project", "task"] as ItemKind[]).map((entry) => <option value={entry} key={entry}>{kindLabel(entry)}</option>)}</select></label>
          <label><span>이름</span><input value={title} onChange={(event) => setTitle(event.target.value)} /></label>
          {onCreateWithChat && <div className="create-chat-nudge"><div><Bot size={15} /><span><b>직접 작성이 어렵나요?</b><small>말로 설명하면 OKR 초안을 함께 정리해드려요.</small></span></div><button type="button" onClick={() => onCreateWithChat({ kind, title })}>AI 대화로 같이 만들기<ChevronRight size={13} /></button></div>}
          {kind === "task" ? (
            <label><span>상위 연결</span><select value={taskContainer} onChange={(event) => setTaskContainer(event.target.value)}><option value="">미분류 Task에 저장</option><optgroup label="Project">{items.filter((entry) => entry.kind === "project").map((entry) => <option value={`project:${entry.id}`} key={entry.id}>{entry.title}</option>)}</optgroup><optgroup label="Routine">{routines.filter((entry) => entry.systemKey !== "general").map((entry) => <option value={`routine:${entry.id}`} key={entry.id}>{entry.title}</option>)}</optgroup></select></label>
          ) : parentKind && (
            <label><span>상위 {kindLabel(parentKind)}</span><select value={parentId} onChange={(event) => setParentId(event.target.value)}><option value="">선택</option>{parentOptions.map((entry) => <option value={entry.id} key={entry.id}>{entry.title}</option>)}</select></label>
          )}
          {kind === "project" && (
            <section className="create-project-fields">
              <header><b>Project 속성</b><span>생성할 때 바로 지정</span></header>
              {availableTemplates.length > 0 && <label><span>본문 템플릿</span><select value={templateId} onChange={(event) => setTemplateId(event.target.value)}><option value="">나중에 불러오기</option>{availableTemplates.map((template) => <option value={template.id} key={template.id}>{template.name}</option>)}</select></label>}
              <label><span>본문</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={6} placeholder={"# 배경\n\n## 범위\n\n## 다음 액션"} /></label>
              <div className="project-field-grid">
                <label><span>우선순위</span><select className={`priority-${priority}`} value={priority} onChange={(event) => setPriority(event.target.value as Priority)}>{Object.entries(priorityLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
                <label><span>상태</span><select value={status} onChange={(event) => setStatus(event.target.value as ItemStatus)}>{Object.entries(statusLabels).filter(([value]) => value !== "archived").map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
                <label><span>주기</span><select value={cadence} onChange={(event) => setCadence(event.target.value as Cadence)}>{Object.entries(cadenceLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
                <label><span>기한</span><input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></label>
              </div>
              {teamMembers.length > 0 && (
                <MemberMentionPicker label="DRI" members={teamMembers} selectedIds={projectDriIds} onChange={setProjectDriIds} placeholder="@실명으로 찾기" maxSelected={1} />
              )}
              {teamMembers.length > 0 && (
                <MemberMentionPicker label="하위 업무자" members={teamMembers} selectedIds={projectWorkerIds} onChange={setProjectWorkerIds} placeholder="@실명으로 여러 명 태그" />
              )}
              {projectProperties.length > 0 && <div className="project-field-grid custom-project-fields">{projectProperties.map((property) => <CreatePropertyField key={property.id} property={property} value={customValues[property.id] ?? property.defaultValue} members={teamMembers} onChange={updateCustomValue} />)}</div>}
            </section>
          )}
          {kind === "task" && teamMembers.length > 0 && (
            <MemberMentionPicker label="담당자" members={teamMembers} selectedIds={taskAssigneeIds} onChange={setTaskAssigneeIds} placeholder="@실명으로 찾기" maxSelected={1} />
          )}
          {error && <p className="inline-error" role="alert">{error}</p>}
          <button disabled={!title.trim() || saving}>{saving ? "저장 중" : "만들기"}</button>
        </form>
      </aside>}
    </OverlayDialog>
  );
}

function CreatePropertyField({ property, value, members, onChange }: { property: PropertyDefinition; value: PropertyValue; members: TeamMember[]; onChange: (property: PropertyDefinition, value: PropertyValue) => void }) {
  if (property.type === "checkbox") {
    return <label><span>{property.name}</span><input type="checkbox" checked={Boolean(value)} onChange={(event) => onChange(property, event.target.checked)} /></label>;
  }
  if (property.type === "select") {
    return <label><span>{property.name}</span><select value={typeof value === "string" ? value : ""} onChange={(event) => onChange(property, event.target.value)}><option value="">선택 안 함</option>{property.options.map((option) => <option key={option}>{option}</option>)}</select></label>;
  }
  if (property.type === "member") return <label><span>{property.name}</span><select value={typeof value === "string" ? value : ""} onChange={(event) => onChange(property, event.target.value || null)}><option value="">선택 안 함</option>{members.filter((member) => member.status === "active").map((member) => <option value={member.id} key={member.id}>{member.displayName}</option>)}</select></label>;
  if (property.type === "members") return <label><span>{property.name}</span><select multiple value={Array.isArray(value) ? value : []} onChange={(event) => onChange(property, Array.from(event.target.selectedOptions, (option) => option.value))}>{members.filter((member) => member.status === "active").map((member) => <option value={member.id} key={member.id}>{member.displayName}</option>)}</select></label>;
  return <label><span>{property.name}</span><input type={property.type === "number" ? "number" : property.type === "date" ? "date" : "text"} value={value === null ? "" : String(value)} onChange={(event) => onChange(property, event.target.value)} /></label>;
}

function RoutineView({ teamMembers, onNotice, onRoutinesChange }: { teamMembers: TeamMember[]; onNotice: (message: string) => void; onRoutinesChange: (routines: Routine[]) => void }) {
  const confirmAction = useAppConfirm();
  const [date, setDate] = useState(localDate());
  const [rows, setRows] = useState<Routine[] | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [triggerPoint, setTriggerPoint] = useState("");
  const [actionPlace, setActionPlace] = useState("");
  const [actionSteps, setActionSteps] = useState("");
  const [cadence, setCadence] = useState<RoutineCadence>("daily");
  const [assigneeMemberId, setAssigneeMemberId] = useState("");
  const [drafts, setDrafts] = useState<Record<string, Pick<Routine, "description" | "triggerPoint" | "actionPlace" | "actionSteps">>>({});
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    fetch(`/api/routines?date=${date}`)
      .then(async (response) => response.ok ? response.json() as Promise<{ routines: Routine[] }> : Promise.reject())
      .then((data) => { if (active) { setRows(data.routines.filter((routine) => routine.systemKey !== "general")); onRoutinesChange(data.routines); } })
      .catch(() => { if (active) setLoadError(true); });
    return () => { active = false; };
  }, [date, loadAttempt, onRoutinesChange]);

  async function create(event: FormEvent) {
    event.preventDefault();
    if (!title.trim() || saving) return;
    setSaving(true);
    try {
      const response = await fetch("/api/routines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description, triggerPoint, actionPlace, actionSteps, cadence, date, assigneeMemberId: assigneeMemberId || null }),
      });
      if (!response.ok) throw new Error("루틴을 추가하지 못했습니다.");
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
      setAssigneeMemberId("");
      onNotice("루틴을 추가했습니다.");
    } catch (createError) {
      onNotice(createError instanceof Error ? createError.message : "루틴을 추가하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleCompletion(routine: Routine) {
    if (routine.systemKey === "general") return;
    const completed = !routine.completed;
    const previous = rows;
    setRows((current) => current?.map((entry) => entry.id === routine.id ? { ...entry, completed } : entry) ?? null);
    try {
      const response = await fetch("/api/routine-completions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ routineId: routine.id, date, completed }),
      });
      if (!response.ok) throw new Error("루틴 완료 상태를 저장하지 못했습니다.");
      const data = await response.json() as { routine: Routine };
      setRows((current) => {
        const next = current?.map((entry) => entry.id === routine.id ? data.routine : entry) ?? [];
        onRoutinesChange(next);
        return next;
      });
    } catch (toggleError) {
      setRows(previous);
      onNotice(toggleError instanceof Error ? toggleError.message : "루틴 완료 상태를 저장하지 못했습니다.");
    }
  }

  async function toggleActive(routine: Routine) {
    if (routine.systemKey === "general") return;
    const active = !routine.active;
    const previous = rows;
    setRows((current) => current?.map((entry) => entry.id === routine.id ? { ...entry, active } : entry) ?? null);
    try {
      const response = await fetch("/api/routines", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: routine.id, active, date }),
      });
      if (!response.ok) throw new Error("루틴 활성 상태를 저장하지 못했습니다.");
      const data = await response.json() as { routine: Routine };
      setRows((current) => {
        const next = current?.map((entry) => entry.id === routine.id ? data.routine : entry) ?? [];
        onRoutinesChange(next);
        return next;
      });
    } catch (toggleError) {
      setRows(previous);
      onNotice(toggleError instanceof Error ? toggleError.message : "루틴 활성 상태를 저장하지 못했습니다.");
    }
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
    if (routine.systemKey === "general") return;
    const draft = routineDraft(routine);
    setSaving(true);
    const response = await fetch("/api/routines", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: routine.id, date, ...draft }),
    });
    setSaving(false);
    if (!response.ok) { onNotice("루틴 실행 방법을 저장하지 못했습니다."); return; }
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
    const routine = rows?.find((entry) => entry.id === id);
    if (!routine || routine.systemKey === "general") return;
    if (!await confirmAction({ title: "루틴 삭제", message: `'${routine.title}' 루틴을 삭제합니다.`, confirmLabel: "루틴 삭제", danger: true })) return;
    const response = await fetch(`/api/routines?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (response.ok) {
      setRows((current) => {
        const next = current?.filter((entry) => entry.id !== id) ?? [];
        onRoutinesChange(next);
        return next;
      });
      onNotice("루틴을 삭제했습니다.");
    } else onNotice("루틴을 삭제하지 못했습니다.");
  }

  async function updateAssignee(routine: Routine, memberId: string) {
    if (routine.systemKey === "general") return;
    const response = await fetch("/api/routines", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: routine.id, date, assigneeMemberId: memberId || null }),
    });
    if (!response.ok) {
      onNotice("루틴 담당자를 저장하지 못했습니다.");
      return;
    }
    const data = await response.json() as { routine: Routine };
    setRows((current) => {
      const next = current?.map((entry) => entry.id === routine.id ? data.routine : entry) ?? [];
      onRoutinesChange(next);
      return next;
    });
  }

  return (
    <section className="routine-section">
      <div className="routine-toolbar">
        <label><CalendarDays size={14} /><input type="date" value={date} onChange={(event) => { setRows(null); setLoadError(false); setDate(event.target.value); }} /></label>
        <form className="routine-create" onSubmit={create}>
          <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="루틴 이름" aria-label="루틴 이름" />
          <select value={cadence} onChange={(event) => setCadence(event.target.value as RoutineCadence)} aria-label="반복 주기"><option value="daily">매일</option><option value="weekly">매주</option><option value="monthly">매월</option></select>
          <input value={triggerPoint} onChange={(event) => setTriggerPoint(event.target.value)} placeholder="트리거 포인트" aria-label="트리거 포인트" />
          <input value={actionPlace} onChange={(event) => setActionPlace(event.target.value)} placeholder="어디서" aria-label="어디서 실행" />
          <input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="목적/메모" aria-label="루틴 목적" />
          <select value={assigneeMemberId} onChange={(event) => setAssigneeMemberId(event.target.value)} aria-label="루틴 담당자"><option value="">담당자 없음</option>{teamMembers.filter((member) => member.status === "active").map((member) => <option value={member.id} key={member.id}>{member.displayName}</option>)}</select>
          <textarea value={actionSteps} onChange={(event) => setActionSteps(event.target.value)} placeholder="무엇을 어떻게 할지" aria-label="실행 방법" rows={2} />
          <button disabled={!title.trim() || saving} aria-label="루틴 추가" title="루틴 추가"><Plus size={14} /></button>
        </form>
      </div>
      <div className="routine-cards">
        {loadError ? <AsyncState icon={AlertTriangle} title="루틴을 불러오지 못했습니다" detail="잠시 후 다시 시도해 주세요." actionLabel="다시 시도" onAction={() => { setRows(null); setLoadError(false); setLoadAttempt((attempt) => attempt + 1); }} /> : rows === null ? <AsyncState icon={LoaderCircle} title="루틴을 불러오는 중입니다" loading /> : rows.length ? rows.map((routine) => {
          const draft = routineDraft(routine);
          return (
            <article className={`routine-card ${routine.active ? "" : "inactive"} ${routine.systemKey === "general" ? "general-routine" : ""}`} key={routine.id}>
              <header>
                {routine.systemKey === "general" ? <span className="general-routine-icon"><Inbox size={13} /></span> : <button className={`task-check ${routine.completed ? "checked" : ""}`} disabled={!routine.active} onClick={() => void toggleCompletion(routine)} aria-label={routine.completed ? "완료 취소" : "완료 처리"}><Check size={12} /></button>}
                <div><b>{routine.title}{routine.systemKey === "general" && <em className="system-badge">기본</em>}</b><small>{routine.systemKey === "general" ? "부모가 없는 Task가 모이는 기본 바구니" : `${routineCadenceLabel(routine.cadence)} · ${routine.completed ? "오늘 완료" : "오늘 미완료"}`}</small></div>
                {routine.systemKey !== "general" && <label className="routine-switch"><input type="checkbox" checked={routine.active} onChange={() => void toggleActive(routine)} /><span /><em className="sr-only">루틴 활성 상태</em></label>}
                {routine.systemKey !== "general" && <button className="icon-button" onClick={() => void remove(routine.id)} aria-label="루틴 삭제" title="루틴 삭제"><Trash2 size={13} /></button>}
              </header>
              {routine.systemKey !== "general" && <div className="routine-guide-grid">
                <label><span>트리거 포인트</span><input value={draft.triggerPoint} onChange={(event) => updateDraft(routine, "triggerPoint", event.target.value)} placeholder="예: 오전 9시, Slack 알림 확인 후" /></label>
                <label><span>어디서</span><input value={draft.actionPlace} onChange={(event) => updateDraft(routine, "actionPlace", event.target.value)} placeholder="예: OKRPTR 작업 탭, 캘린더, 책상" /></label>
                <label><span>목적/메모</span><input value={draft.description} onChange={(event) => updateDraft(routine, "description", event.target.value)} placeholder="왜 반복하는지" /></label>
                <label className="routine-steps"><span>무엇을 어떻게</span><textarea value={draft.actionSteps} onChange={(event) => updateDraft(routine, "actionSteps", event.target.value)} placeholder="1. 확인할 것&#10;2. 실행할 것&#10;3. 끝났다고 판단하는 기준" rows={3} /></label>
              </div>}
              {routine.systemKey !== "general" && <footer>
                <label className="routine-assignee"><span>담당자</span><select value={routine.assigneeMemberId ?? ""} onChange={(event) => void updateAssignee(routine, event.target.value)}><option value="">담당자 없음</option>{teamMembers.filter((member) => member.status === "active").map((member) => <option value={member.id} key={member.id}>{member.displayName}</option>)}</select></label>
                <button className="primary-action" disabled={!hasDraftChange(routine) || saving} onClick={() => void saveRoutineGuide(routine)}><Check size={14} />저장</button>
              </footer>}
            </article>
          );
        }) : <EmptyState icon={Repeat2} title="등록된 루틴이 없습니다" />}
      </div>
    </section>
  );
}

function MyWorkView({ items, routines, currentMember, onOpenProject, onOpenTask, onRoutinesChange, onNotice }: {
  items: OkrptrItem[];
  routines: Routine[];
  currentMember: TeamMember | null;
  onOpenProject: (id: string) => void;
  onOpenTask: (id: string) => void;
  onRoutinesChange: (routines: Routine[]) => void;
  onNotice: (message: string) => void;
}) {
  const [includeCompleted, setIncludeCompleted] = useState(false);
  const [savingRoutineId, setSavingRoutineId] = useState<string | null>(null);
  if (!currentMember) return <EmptyState icon={Briefcase} title="현재 멤버 정보를 확인할 수 없습니다" />;

  const visible = (status: ItemStatus) => includeCompleted || !isCompletedStatus(status);
  const projects = items.filter((entry) => entry.kind === "project" && visible(entry.status) && entry.assignments.some((assignment) => assignment.memberId === currentMember.id && (assignment.role === "project_dri" || assignment.role === "project_worker")));
  const tasks = items.filter((entry) => entry.kind === "task" && visible(entry.status) && entry.assignments.some((assignment) => assignment.memberId === currentMember.id && assignment.role === "task_assignee"));
  const assignedRoutines = routines.filter((entry) => entry.systemKey !== "general" && entry.assigneeMemberId === currentMember.id && (includeCompleted || !entry.completed));
  const byId = new Map(items.map((entry) => [entry.id, entry]));

  async function toggleRoutine(routine: Routine) {
    setSavingRoutineId(routine.id);
    const response = await fetch("/api/routine-completions", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ routineId: routine.id, date: localDate(), completed: !routine.completed }),
    });
    setSavingRoutineId(null);
    if (!response.ok) {
      onNotice("루틴 완료 상태를 저장하지 못했습니다.");
      return;
    }
    const data = await response.json() as { routine: Routine };
    onRoutinesChange(routines.map((entry) => entry.id === routine.id ? data.routine : entry));
  }

  return (
    <section className="my-work-view">
      <header className="my-work-toolbar">
        <div><b>{currentMember.displayName}의 업무</b><span>명시적으로 담당된 항목만 표시합니다.</span></div>
        <label><input type="checkbox" checked={includeCompleted} onChange={(event) => setIncludeCompleted(event.target.checked)} />완료 포함</label>
      </header>
      <MyWorkSection title="Task" count={tasks.length}>
        {tasks.map((task) => {
          const project = task.parentId ? byId.get(task.parentId) : null;
          const routine = task.routineId ? routines.find((entry) => entry.id === task.routineId) : null;
          return <button className="my-work-item" key={task.id} onClick={() => onOpenTask(task.id)}><span className="type-icon type-task">T</span><span><b>{task.title}</b><small>{statusLabel(task.status)} · {routine?.systemKey === "general" ? "미분류 Task" : routine ? routine.title : project?.title ?? "미분류 Task"} · {dueLabel(task.dueDate)}</small></span><ChevronRight size={15} /></button>;
        })}
      </MyWorkSection>
      <MyWorkSection title="Project" count={projects.length}>
        {projects.map((project) => {
          const roles = project.assignments.filter((assignment) => assignment.memberId === currentMember.id).map((assignment) => assignment.role === "project_dri" ? "주 담당" : "보조 담당");
          return <button className="my-work-item" key={project.id} onClick={() => onOpenProject(project.id)}><span className="type-icon type-project">P</span><span><b>{project.title}</b><small>{roles.join(" · ")} · {statusLabel(project.status)} · {dueLabel(project.dueDate)}</small></span><ChevronRight size={15} /></button>;
        })}
      </MyWorkSection>
      <MyWorkSection title="Routine" count={assignedRoutines.length}>
        {assignedRoutines.map((routine) => <article className="my-work-routine" key={routine.id}><div><span className="type-icon"><Repeat2 size={13} /></span><span><b>{routine.title}</b><small>{routineCadenceLabel(routine.cadence)} · {routine.completed ? "오늘 완료" : "오늘 미완료"}</small></span></div>{(routine.triggerPoint || routine.actionPlace || routine.actionSteps || routine.description) && <p>{[routine.triggerPoint, routine.actionPlace, routine.actionSteps || routine.description].filter(Boolean).join(" · ")}</p>}<button className={routine.completed ? "is-complete" : ""} disabled={savingRoutineId === routine.id || !routine.active} onClick={() => void toggleRoutine(routine)}><Check size={14} />{savingRoutineId === routine.id ? "저장 중" : routine.completed ? "완료 취소" : "오늘 완료"}</button></article>)}
      </MyWorkSection>
    </section>
  );
}

function MyWorkSection({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  return <section className="my-work-section"><header><b>{title}</b><span>{count}</span></header><div>{count ? children : <p className="my-work-empty">담당된 {title}가 없습니다.</p>}</div></section>;
}

function DailyScrumView({ onOpenTask, onNotice }: { onOpenTask: (id: string) => void; onNotice: (message: string) => void }) {
  const [date, setDate] = useState(localDate());
  const [scrum, setScrum] = useState<Scrum | null>(null);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [savedNotes, setSavedNotes] = useState("");
  useEffect(() => {
    let active = true;
    fetch(`/api/daily-scrum?date=${date}`)
      .then(async (response) => response.ok ? response.json() as Promise<{ scrum: Scrum }> : Promise.reject())
      .then((data) => { if (active) { setScrum(data.scrum); setSavedNotes(JSON.stringify([data.scrum.yesterdayNote, data.scrum.todayNote, data.scrum.blockersNote])); } })
      .catch(() => { if (active) setLoadError(true); });
    return () => { active = false; };
  }, [date, loadAttempt]);
  const notesDirty = Boolean(scrum) && savedNotes !== JSON.stringify([scrum?.yesterdayNote, scrum?.todayNote, scrum?.blockersNote]);
  useEffect(() => {
    if (!notesDirty) return;
    function warnBeforeUnload(event: BeforeUnloadEvent) { event.preventDefault(); event.returnValue = ""; }
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [notesDirty]);
  if (loadError) return <AsyncState icon={AlertTriangle} title="데일리 스크럼을 불러오지 못했습니다" detail="날짜를 유지한 채 다시 불러옵니다." actionLabel="다시 시도" onAction={() => { setScrum(null); setLoadError(false); setLoadAttempt((attempt) => attempt + 1); }} />;
  if (!scrum) return <AsyncState icon={LoaderCircle} title="데일리 스크럼을 불러오는 중입니다" loading />;
  const currentScrum = scrum;
  async function save() {
    setSaving(true);
    try {
      const response = await fetch("/api/daily-scrum", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(currentScrum) });
      if (!response.ok) throw new Error("데일리 스크럼을 저장하지 못했습니다.");
      setSavedNotes(JSON.stringify([currentScrum.yesterdayNote, currentScrum.todayNote, currentScrum.blockersNote]));
      onNotice("데일리 스크럼을 저장했습니다.");
    } catch (saveError) {
      onNotice(saveError instanceof Error ? saveError.message : "데일리 스크럼을 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }
  const sections: { key: "yesterdayNote" | "todayNote" | "blockersNote"; title: string; tasks: OkrptrItem[]; icon: LucideIcon }[] = [
    { key: "yesterdayNote", title: "어제 완료", tasks: scrum.yesterdayTasks, icon: CheckCircle2 },
    { key: "todayNote", title: "오늘 집중", tasks: scrum.todayTasks, icon: Target },
    { key: "blockersNote", title: "막힘", tasks: scrum.blockers, icon: CircleHelp },
  ];
  return <section className="scrum-section"><div className="scrum-toolbar"><label><CalendarDays size={14} /><input aria-label="데일리 스크럼 날짜" type="date" value={date} onChange={(event) => { setScrum(null); setLoadError(false); setDate(event.target.value); }} /></label><button className="primary-action" onClick={() => void save()} disabled={saving || !notesDirty}><Check size={14} />{saving ? "저장 중" : notesDirty ? "저장" : "저장됨"}</button></div><div className="scrum-grid">{sections.map((section) => { const Icon = section.icon; return <section className="scrum-column" key={section.key}><header><Icon size={15} /><b>{section.title}</b><span>{section.tasks.length}</span></header><div className="scrum-task-list">{section.tasks.map((task) => <button key={task.id} onClick={() => onOpenTask(task.id)}><span className={`status-dot status-${task.status}`} /><b>{task.title}</b><small>{dueLabel(task.dueDate)}</small></button>)}{!section.tasks.length && <span className="empty-column">자동으로 모인 Task가 없습니다</span>}</div><textarea value={scrum[section.key]} onChange={(event) => setScrum({ ...scrum, [section.key]: event.target.value })} placeholder={`${section.title} 메모`} aria-label={`${section.title} 메모`} /></section>; })}</div></section>;
}

function RecommendationsView({ items, onOpenTask, onOpenProject, onNavigate }: { items: OkrptrItem[]; onOpenTask: (id: string) => void; onOpenProject: (id: string) => void; onNavigate: (view: View) => void }) {
  const [rows, setRows] = useState<Recommendation[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    fetch(`/api/recommendations?date=${localDate()}`)
      .then(async (response) => response.ok ? response.json() as Promise<{ recommendations: Recommendation[] }> : Promise.reject())
      .then((data) => { if (active) setRows(data.recommendations); })
      .catch(() => { if (active) setLoadError(true); });
    return () => { active = false; };
  }, [loadAttempt]);
  if (loadError) return <AsyncState icon={AlertTriangle} title="추천을 계산하지 못했습니다" detail="워크스페이스 데이터를 다시 확인해 주세요." actionLabel="다시 시도" onAction={() => { setRows(null); setLoadError(false); setLoadAttempt((attempt) => attempt + 1); }} />;
  if (!rows) return <AsyncState icon={LoaderCircle} title="추천을 계산하는 중입니다" loading />;
  if (!rows.length) return <EmptyState icon={CheckCircle2} title="지금 바로 정리할 항목이 없습니다" />;
  function openRecommendation(row: Recommendation) {
    const target = row.itemIds.map((id) => items.find((item) => item.id === id)).find(Boolean);
    if (target?.kind === "task") onOpenTask(target.id);
    else if (target?.kind === "project") onOpenProject(target.id);
    else onNavigate(row.kind === "empty_project" ? "okr" : "work");
  }
  return <section className="recommendation-list">{rows.map((row) => <article className="recommendation-row" key={row.id}><span className={`recommendation-icon recommendation-${row.kind}`}>{recommendationIcon(row.kind)}</span><div><h3>{row.title}</h3><p>{row.detail}</p><small>{row.itemIds.length}개 항목 · 우선순위 {row.score}</small></div><button aria-label={`${row.title} 관련 항목 열기`} title="관련 항목 열기" onClick={() => openRecommendation(row)}><ChevronRight size={15} /></button></article>)}</section>;
}

function HomeView({ onCreatePlan, onCreateProject, onApplyOkrPlan, onFinish, context, workspaceContext, canWrite, members, defaultDriMemberId, defaultCycleId }: {
  onCreatePlan: (plan: OnboardingPlan, cycleId: string | null) => Promise<PlanCreationResult | null>;
  onCreateProject: (plan: OnboardingPlan, target: ProjectChatTarget) => Promise<boolean>;
  onApplyOkrPlan: (plan: OnboardingPlan, cycleId: string, target: OkrPlanTarget | null, driMemberId: string | null) => Promise<OkrPlanApplyResult | null>;
  onFinish: () => void;
  context: OkrChatContext | null;
  workspaceContext: AssistantWorkspaceContext;
  canWrite: boolean;
  members: TeamMember[];
  defaultDriMemberId: string | null;
  defaultCycleId: string | null;
}) {
  return (
    <div className="home-layout">
      <HomeOkrChat onCreate={onCreatePlan} onCreateProject={onCreateProject} onApplyOkrPlan={onApplyOkrPlan} onFinish={onFinish} context={context} workspaceContext={workspaceContext} canWrite={canWrite} members={members} defaultDriMemberId={defaultDriMemberId} defaultCycleId={defaultCycleId} />
    </div>
  );
}

function HomeOkrChat({ onCreate, onCreateProject, onApplyOkrPlan, onFinish, context, workspaceContext, canWrite, members, defaultDriMemberId, defaultCycleId }: {
  onCreate: (plan: OnboardingPlan, cycleId: string | null) => Promise<PlanCreationResult | null>;
  onCreateProject: (plan: OnboardingPlan, target: ProjectChatTarget) => Promise<boolean>;
  onApplyOkrPlan: (plan: OnboardingPlan, cycleId: string, target: OkrPlanTarget | null, driMemberId: string | null) => Promise<OkrPlanApplyResult | null>;
  onFinish: () => void;
  context: OkrChatContext | null;
  workspaceContext: AssistantWorkspaceContext;
  canWrite: boolean;
  members: TeamMember[];
  defaultDriMemberId: string | null;
  defaultCycleId: string | null;
}) {
  const emptyPlan: OnboardingPlan = {
    objectiveTitle: "",
    keyResults: [],
    targetInitiatives: [],
    unassignedInitiatives: [],
    project: "",
    tasks: "",
    taskParent: "",
    routineTitle: "",
    routineTrigger: "",
    routinePlace: "",
    routineSteps: "",
  };
  const [message, setMessage] = useState(context?.initialMessage ?? "");
  const [plan, setPlan] = useState<OnboardingPlan>({
    ...emptyPlan,
  });
  const [guideQuestions, setGuideQuestions] = useState<string[]>(() => assistantOpeningGuides(context));
  const [conversationHistory, setConversationHistory] = useState<ChatMessage[]>(() => [{ id: "initial", role: "assistant", content: assistantOpeningMessage(context, workspaceContext) }]);
  const [visibleFields, setVisibleFields] = useState<Set<StringPlanField>>(new Set());
  const [mode, setMode] = useState<ConversationMode>(context?.entry === "onboarding" ? "onboarding" : context?.entry === "coach" ? "coach" : "okr");
  const [okrTarget, setOkrTarget] = useState<OkrPlanTarget | null>(context?.target ?? null);
  const [targetCandidates, setTargetCandidates] = useState<OkrPlanTarget[]>(context?.targetCandidates ?? []);
  const [projectTarget, setProjectTarget] = useState<ProjectChatTarget | null>(null);
  const [projectDriMemberId, setProjectDriMemberId] = useState(defaultDriMemberId ?? members[0]?.id ?? "");
  const [saving, setSaving] = useState(false);
  const assistantFlow = mode === "onboarding" || mode === "coach";
  const draftCounts = countOkrDraft(plan);
  const treeReady = Boolean(plan.objectiveTitle.trim() && plan.keyResults.length && plan.keyResults.every((entry) => entry.title.trim() && entry.initiatives.every((initiative) => initiative.title.trim())) && !plan.unassignedInitiatives.length);
  const saveLabel = assistantFlow
    ? !okrTarget ? `Objective 1개 · KR ${draftCounts.keyResults}개 · Initiative ${draftCounts.initiatives}개 만들기`
      : okrTarget.kind === "objective" ? `KR ${draftCounts.keyResults}개 · Initiative ${draftCounts.initiatives}개 만들기`
        : okrTarget.kind === "key_result" ? `Initiative ${plan.targetInitiatives.length}개 만들기` : "첫 Project 만들기"
    : mode === "project" ? plan.project.trim() ? "Project 만들기" : plan.routineTitle.trim() ? "Routine 만들기" : "실행 항목 만들기" : !plan.objectiveTitle.trim() && plan.routineTitle.trim() ? "Routine 만들기" : `Objective 1개 · KR ${draftCounts.keyResults}개 · Initiative ${draftCounts.initiatives}개 만들기`;
  const hasDraft = hasPlanContent(plan);
  const canApplyDraft = assistantFlow
    ? !okrTarget ? treeReady
      : okrTarget.kind === "objective" ? Boolean(plan.keyResults.length && plan.keyResults.every((entry) => entry.title.trim() && entry.initiatives.every((initiative) => initiative.title.trim())) && !plan.unassignedInitiatives.length)
        : okrTarget.kind === "key_result" ? Boolean(plan.targetInitiatives.length && plan.targetInitiatives.every((entry) => entry.title.trim()))
          : Boolean(plan.project.trim())
    : mode === "project" ? Boolean(plan.project.trim() || plan.routineTitle.trim()) : Boolean(treeReady || plan.routineTitle.trim());
  function setAssistantResponse(value: string) {
    setConversationHistory((current) => [...current, { id: `assistant-${Date.now()}-${current.length}`, role: "assistant", content: value }]);
  }
  function patch(field: StringPlanField, value: string) {
    setVisibleFields((current) => new Set(current).add(field));
    setPlan((current) => ({ ...current, [field]: value }));
  }
  function hasPlanContent(value: OnboardingPlan) {
    return Boolean(value.objectiveTitle.trim() || value.keyResults.length || value.targetInitiatives.length || value.unassignedInitiatives.length || planStringFieldsWithValues(value).length);
  }
  function patchObjective(value: string) {
    setPlan((current) => ({ ...current, objectiveTitle: value }));
  }
  function addKeyResult() {
    setPlan((current) => ({ ...current, keyResults: [...current.keyResults, { clientId: createDraftClientId("kr"), title: "", initiatives: [] }] }));
  }
  function patchKeyResult(clientId: string, title: string) {
    setPlan((current) => ({ ...current, keyResults: current.keyResults.map((entry) => entry.clientId === clientId ? { ...entry, title } : entry) }));
  }
  function removeKeyResult(clientId: string) {
    setPlan((current) => {
      const removed = current.keyResults.find((entry) => entry.clientId === clientId);
      return {
        ...current,
        keyResults: current.keyResults.filter((entry) => entry.clientId !== clientId),
        unassignedInitiatives: [...current.unassignedInitiatives, ...(removed?.initiatives ?? [])],
      };
    });
  }
  function addInitiative(keyResultId?: string) {
    const initiative = { clientId: createDraftClientId("initiative"), title: "" };
    setPlan((current) => keyResultId
      ? { ...current, keyResults: current.keyResults.map((entry) => entry.clientId === keyResultId ? { ...entry, initiatives: [...entry.initiatives, initiative] } : entry) }
      : { ...current, targetInitiatives: [...current.targetInitiatives, initiative] });
  }
  function patchInitiative(clientId: string, title: string) {
    setPlan((current) => ({
      ...current,
      keyResults: current.keyResults.map((entry) => ({ ...entry, initiatives: entry.initiatives.map((initiative) => initiative.clientId === clientId ? { ...initiative, title } : initiative) })),
      targetInitiatives: current.targetInitiatives.map((entry) => entry.clientId === clientId ? { ...entry, title } : entry),
      unassignedInitiatives: current.unassignedInitiatives.map((entry) => entry.clientId === clientId ? { ...entry, title } : entry),
    }));
  }
  function removeInitiative(clientId: string) {
    setPlan((current) => ({
      ...current,
      keyResults: current.keyResults.map((entry) => ({ ...entry, initiatives: entry.initiatives.filter((initiative) => initiative.clientId !== clientId) })),
      targetInitiatives: current.targetInitiatives.filter((entry) => entry.clientId !== clientId),
      unassignedInitiatives: current.unassignedInitiatives.filter((entry) => entry.clientId !== clientId),
    }));
  }
  function moveInitiative(clientId: string, targetKeyResultId: string) {
    setPlan((current) => {
      const allInitiatives = [
        ...current.keyResults.flatMap((entry) => entry.initiatives),
        ...current.unassignedInitiatives,
      ];
      const moving = allInitiatives.find((entry) => entry.clientId === clientId);
      if (!moving) return current;
      return {
        ...current,
        keyResults: current.keyResults.map((entry) => ({
          ...entry,
          initiatives: entry.clientId === targetKeyResultId
            ? [...entry.initiatives.filter((initiative) => initiative.clientId !== clientId), moving]
            : entry.initiatives.filter((initiative) => initiative.clientId !== clientId),
        })),
        unassignedInitiatives: current.unassignedInitiatives.filter((entry) => entry.clientId !== clientId),
      };
    });
  }
  async function organizeMessage() {
    const text = message.trim();
    if (!text) return;
    setConversationHistory((current) => [...current, { id: `user-${Date.now()}`, role: "user", content: text }]);
    setMessage("");
    setSaving(true);
    try {
      const response = await fetch("/api/okr-organize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          plan,
          mode,
          history: conversationHistory.slice(-10).map(({ role, content }) => ({ role, content })),
          workspaceContext,
          parentContext: { initiativeTitle: projectTarget?.initiativeTitle, target: okrTarget },
        }),
      });
      const data = await response.json() as ({ organized: OrganizedOkr } & OrganizeError);
      if (!response.ok) {
        if (data.code?.startsWith("ai_")) {
          setAssistantResponse(aiLimitMessage(data));
          setGuideQuestions(data.options?.length ? data.options : ["유료 플랜으로 서버 AI 정리 계속 사용", "개인 OpenAI API 키 연결", "ChatGPT에서 OKRPTR MCP로 연결해 직접 정리"]);
          return;
        }
        throw new Error("organize failed");
      }
      setPlan(data.organized.plan);
      setVisibleFields((current) => new Set([...current, ...planStringFieldsWithValues(data.organized.plan)]));
      setAssistantResponse(data.organized.assistantMessage);
      setGuideQuestions(data.organized.questions);
    } catch {
      setAssistantResponse("지금은 답변을 불러오지 못했습니다. 작성 중인 초안은 그대로 두었습니다. 잠시 후 다시 보내 주세요.");
      setGuideQuestions([]);
    } finally {
      setSaving(false);
    }
  }
  function chooseTarget(target: OkrPlanTarget) {
    setOkrTarget(target);
    setTargetCandidates([]);
    setPlan({ ...emptyPlan });
    setVisibleFields(new Set());
    setMode("coach");
    setAssistantResponse(targetPrompt(target));
    setGuideQuestions([]);
  }
  function chooseQuickReply(question: string) {
    if (question.includes("나중에")) {
      skipOptionalStep();
      return;
    }
    const starter = question === "업무 목표를 말해볼게요" ? "이번 분기에 업무에서 이루고 싶은 목표는 "
      : question === "개인 성장 목표를 말해볼게요" ? "이번 분기에 개인적으로 이루고 싶은 목표는 "
        : question;
    setMessage(starter);
  }
  function chooseGuide(kind: "team" | "personal" | "routine" | "free") {
    setPlan({ ...emptyPlan });
    setVisibleFields(new Set());
    setMode("okr");
    setProjectTarget(null);
    setMessage("");
    if (kind === "team") {
      setAssistantResponse("팀 OKR로 시작하겠습니다. 팀이 이번 주기 끝에 달라져야 하는 상태부터 잡고, 공동 지표와 실행 책임을 나눕니다.");
      setGuideQuestions(["팀이 달성해야 하는 결과는 무엇인가요?", "성공 여부를 숫자나 상태로 어떻게 확인할까요?", "어떤 프로젝트와 담당자가 먼저 움직여야 하나요?"]);
      return;
    }
    if (kind === "personal") {
      setAssistantResponse("개인 OKR로 시작하겠습니다. 역할 안에서 만들고 싶은 변화, 측정 기준, 바로 실행할 일을 분리합니다.");
      setGuideQuestions(["이번 주기 동안 본인이 만들고 싶은 변화는 무엇인가요?", "완료가 아니라 성과를 보여주는 기준은 무엇인가요?", "이번 주에 바로 시작할 일은 무엇인가요?"]);
      return;
    }
    if (kind === "routine") {
      setAssistantResponse("루틴부터 정리하겠습니다. 반복할 시점, 장소나 도구, 실제 행동 순서를 먼저 잡고 필요하면 OKR에 연결합니다.");
      setGuideQuestions(["언제 이 루틴이 시작돼야 하나요?", "어디서 또는 어떤 도구에서 실행하나요?", "무엇을 어떤 순서로 하면 되나요?"]);
      return;
    }
    setAssistantResponse("좋습니다. 정해진 양식 없이 질문하거나 지금 생각나는 대로 적어 주세요. 실행 계획이 보이면 OKR 구조도 함께 제안합니다.");
    setGuideQuestions([]);
  }
  async function save() {
    if (assistantFlow) {
      if (!canWrite || !canApplyDraft) return;
      const cycleId = context?.cycleId ?? defaultCycleId;
      if (!cycleId) return;
      setSaving(true);
      const result = await onApplyOkrPlan(plan, cycleId, okrTarget, plan.project.trim() ? projectDriMemberId || null : null);
      setSaving(false);
      if (!result) return;
      setPlan({ ...emptyPlan });
      setVisibleFields(new Set());
      setGuideQuestions([]);
      setTargetCandidates([]);
      if (result.projectIds.length) {
        setAssistantResponse("좋아요. 첫 Project까지 연결했습니다. 이제 OKR 화면에서 전체 구조를 확인할 수 있어요.");
        onFinish();
        return;
      }
      const createdInitiatives = result.items.filter((entry) => result.initiativeIds.includes(entry.id));
      if (createdInitiatives.length === 1) {
        const initiative = createdInitiatives[0];
        setOkrTarget({ id: initiative.id, kind: "initiative", title: initiative.title });
        setMode("coach");
        setAssistantResponse("Initiative를 만들었습니다. 이 방향을 실제로 움직일 첫 Project도 정해볼까요? 아직 생각나지 않았다면 지금은 건너뛰어도 됩니다.");
        setGuideQuestions(["첫 Project를 정리할게요", "나중에 할게요"]);
        return;
      }
      if (createdInitiatives.length > 1) {
        setOkrTarget(null);
        setTargetCandidates(createdInitiatives.map((entry) => ({ id: entry.id, kind: "initiative", title: entry.title })));
        setMode("coach");
        setAssistantResponse("OKR 트리를 만들었습니다. 첫 Project를 이어서 정리할 Initiative를 선택해 주세요.");
        return;
      }
      const createdKeyResults = result.items.filter((entry) => result.keyResultIds.includes(entry.id));
      if (createdKeyResults.length === 1) {
        const keyResult = createdKeyResults[0];
        setOkrTarget({ id: keyResult.id, kind: "key_result", title: keyResult.title });
        setMode("coach");
        setAssistantResponse("OKR을 만들었습니다. 이제 이 Key Result를 움직일 Initiative도 정해볼까요? 아직 생각나지 않았다면 건너뛸 수 있습니다.");
        setGuideQuestions(["Initiative를 정리할게요", "나중에 할게요"]);
        return;
      }
      if (createdKeyResults.length > 1) {
        setOkrTarget(null);
        setTargetCandidates(createdKeyResults.map((entry) => ({ id: entry.id, kind: "key_result", title: entry.title })));
        setMode("coach");
        setAssistantResponse("OKR을 만들었습니다. Initiative를 이어서 정리할 Key Result를 선택해 주세요.");
        return;
      }
      onFinish();
      return;
    }
    if (mode === "project") {
      if (!projectTarget || !plan.project.trim() && !plan.routineTitle.trim()) {
        await organizeMessage();
        return;
      }
      setSaving(true);
      const created = await onCreateProject(plan, projectTarget);
      setSaving(false);
      if (created) {
        setPlan({ ...emptyPlan });
        setVisibleFields(new Set());
        setProjectTarget(null);
      }
      return;
    }
    if (!plan.objectiveTitle.trim() && !plan.routineTitle.trim()) {
      await organizeMessage();
      return;
    }
    setSaving(true);
    const created = await onCreate(plan, context?.cycleId ?? defaultCycleId);
    setSaving(false);
    if (created) {
      setMessage("");
      setPlan({ ...emptyPlan });
      setGuideQuestions([]);
      setVisibleFields(new Set());
      setTargetCandidates([]);
      const createdInitiatives = created.items.filter((entry) => created.initiativeIds.includes(entry.id));
      if (createdInitiatives.length === 1 && !created.projectIds.length) {
        const initiative = createdInitiatives[0];
        setProjectTarget({ cycleId: created.cycleId, initiativeId: initiative.id, initiativeTitle: initiative.title });
        setAssistantResponse("OKR 구조를 만들었습니다. 이 대화에서 첫 실행 Project도 이어서 정리할 수 있습니다.");
      } else if (createdInitiatives.length > 1) {
        setProjectTarget(null);
        setTargetCandidates(createdInitiatives.map((entry) => ({ id: entry.id, kind: "initiative", title: entry.title })));
        setAssistantResponse("OKR 트리를 만들었습니다. 첫 Project를 이어서 정리할 Initiative를 선택해 주세요.");
      } else {
        setProjectTarget(null);
        setAssistantResponse("OKR 구조를 만들었습니다. 다음 목표도 이어서 이야기할 수 있습니다.");
      }
    }
  }
  function skipOptionalStep() {
    setAssistantResponse("좋아요. 지금은 여기까지 저장했습니다. Initiative나 Project가 떠오르면 언제든 OKR 도우미를 다시 불러 주세요.");
    setPlan({ ...emptyPlan });
    setVisibleFields(new Set());
    setGuideQuestions([]);
    onFinish();
  }
  function startProjectConversation() {
    if (!projectTarget) return;
    setMode("project");
    setPlan({ ...emptyPlan });
    setVisibleFields(new Set());
    setMessage("");
    setAssistantResponse(`‘${projectTarget.initiativeTitle}’ 아래 첫 Project를 같이 정리해볼게요. 만들려는 결과와 범위를 편하게 말해 주세요.`);
    setGuideQuestions(["이 Project가 끝났을 때 무엇이 달라져야 하나요?", "첫 Task로 바로 시작할 일은 무엇인가요?"]);
  }
  return (
    <section className="home-okr-chat" aria-labelledby="home-okr-chat-title">
      <header>
        <div><Bot size={16} /><div><h2 id="home-okr-chat-title">OKR 도우미</h2><p>현재 OKR과 실행 상황을 읽고, 필요한 다음 질문부터 이어갑니다.</p></div></div>
        {assistantFlow && okrTarget && <span className="assistant-stage">{kindLabel(okrTarget.kind)} 다음 단계</span>}
      </header>
      <div className="home-chat-surface">
        <div className="chat-thread">
          {context && <div className="chat-okr-context"><Target size={14} /><span><b>{context.cycleName}</b>{context.entry === "onboarding" ? " 첫 OKR 온보딩" : " 상황 기반 대화"}</span></div>}
          {mode === "project" && projectTarget && <div className="chat-okr-context"><Briefcase size={14} /><span><b>{projectTarget.initiativeTitle}</b> 아래 Project 작성</span></div>}
          {context?.entry === "onboarding" && <div className="assistant-example"><b>간단한 예시</b><span>Objective · 신규 사용자가 제품 가치를 더 빨리 경험하게 한다</span><span>Key Result · 가입 후 7일 내 핵심 기능 사용률을 35%에서 55%로 높인다</span></div>}
          {conversationHistory.map((entry) => <p className={entry.role === "user" ? "user-message" : "assistant-message"} key={entry.id}>{entry.content}</p>)}
          {targetCandidates.length > 1 && <div className="assistant-target-options" aria-label="대화 대상 선택">{targetCandidates.map((target) => <button key={target.id} onClick={() => chooseTarget(target)}><span>{kindLabel(target.kind)}</span>{target.title}</button>)}</div>}
          {guideQuestions.length > 0 && <div className="assistant-followups">{guideQuestions.map((question) => <button className="followup-message" onClick={() => chooseQuickReply(question)} key={question}>{question}</button>)}</div>}
          {!canWrite && <div className="assistant-readonly"><Eye size={14} /><span>Viewer는 대화와 분석을 이용할 수 있지만 항목을 생성할 수 없습니다.</span></div>}
          <div className="chat-input"><label htmlFor="assistant-message">메시지</label><div className="chat-composer"><textarea id="assistant-message" value={message} onChange={(event) => setMessage(event.target.value)} onKeyDown={(event) => { if ((event.ctrlKey || event.metaKey) && event.key === "Enter") void organizeMessage(); }} rows={4} placeholder="지금 이루고 싶은 목표나 막힌 일을 편하게 적어 주세요" /><button type="button" className="chat-send-button" onClick={() => void organizeMessage()} disabled={saving || !message.trim()} aria-label={saving ? "답변 생성 중" : "메시지 보내기"}>{saving ? <LoaderCircle className="spin" size={15} /> : <Send size={15} />}<span>{saving ? "답변 중" : "보내기"}</span></button></div></div>
          {mode === "okr" && context?.entry !== "onboarding" && <div className="chat-presets">
            <button onClick={() => chooseGuide("team")}>팀 OKR</button>
            <button onClick={() => chooseGuide("personal")}>개인 OKR</button>
            <button onClick={() => chooseGuide("routine")}>루틴부터</button>
            <button onClick={() => chooseGuide("free")}>그냥 말하기</button>
          </div>}
          <div className="chat-actions">
            {hasDraft && canWrite && <button className="welcome-primary" onClick={() => void save()} disabled={saving || !canApplyDraft}>{saving ? "생성 중" : saveLabel}<ChevronRight size={14} /></button>}
          </div>
          {assistantFlow && okrTarget && (okrTarget.kind === "key_result" || okrTarget.kind === "initiative") && <button className="assistant-skip" onClick={skipOptionalStep}>지금은 건너뛰기</button>}
          {mode === "okr" && projectTarget && <button className="project-nudge-button" onClick={startProjectConversation}><Briefcase size={14} />첫 Project를 만들어볼까요?<ChevronRight size={14} /></button>}
        </div>
        {hasOkrDraft(plan) && <OkrDraftTree
          plan={plan}
          target={okrTarget}
          onPatchObjective={patchObjective}
          onAddKeyResult={addKeyResult}
          onPatchKeyResult={patchKeyResult}
          onRemoveKeyResult={removeKeyResult}
          onAddInitiative={addInitiative}
          onPatchInitiative={patchInitiative}
          onRemoveInitiative={removeInitiative}
          onMoveInitiative={moveInitiative}
        />}
        {visibleFields.size > 0 && <div className="okr-setup-fields home-draft-fields">
          {visibleFields.has("project") && <label><span>Project</span><input value={plan.project} onChange={(event) => patch("project", event.target.value)} placeholder="결과와 범위가 분명한 첫 Project" /></label>}
          {assistantFlow && visibleFields.has("project") && members.length > 0 && <label><span>Project DRI</span><select value={projectDriMemberId} onChange={(event) => setProjectDriMemberId(event.target.value)}>{members.map((member) => <option value={member.id} key={member.id}>{member.displayName}</option>)}</select></label>}
          {visibleFields.has("tasks") && <label className="wide"><span>{plan.taskParent === "routine" || !plan.project.trim() && plan.routineTitle.trim() ? "첫 Task · Routine 아래" : plan.project.trim() ? "첫 Task · Project 아래" : "첫 Task · 미분류"}</span><textarea value={plan.tasks} onChange={(event) => patch("tasks", event.target.value)} rows={4} placeholder="한 줄에 하나씩 입력" /></label>}
          {visibleFields.has("tasks") && plan.project.trim() && plan.routineTitle.trim() && <label><span>Task 상위</span><select value={plan.taskParent || "project"} onChange={(event) => patch("taskParent", event.target.value)}><option value="project">Project</option><option value="routine">Routine</option></select></label>}
          {visibleFields.has("routineTitle") && <label><span>루틴 이름</span><input value={plan.routineTitle} onChange={(event) => patch("routineTitle", event.target.value)} placeholder="반복해서 할 일의 이름" /></label>}
          {visibleFields.has("routineTrigger") && <label><span>루틴 트리거</span><input value={plan.routineTrigger} onChange={(event) => patch("routineTrigger", event.target.value)} placeholder="루틴이 시작되는 시점" /></label>}
          {visibleFields.has("routinePlace") && <label><span>어디서</span><input value={plan.routinePlace} onChange={(event) => patch("routinePlace", event.target.value)} placeholder="실행할 장소나 도구" /></label>}
          {visibleFields.has("routineSteps") && <label className="wide"><span>무엇을 어떻게</span><textarea value={plan.routineSteps} onChange={(event) => patch("routineSteps", event.target.value)} rows={3} placeholder="루틴 실행 방법" /></label>}
        </div>}
      </div>
    </section>
  );
}

function OkrDraftTree({ plan, target, onPatchObjective, onAddKeyResult, onPatchKeyResult, onRemoveKeyResult, onAddInitiative, onPatchInitiative, onRemoveInitiative, onMoveInitiative }: {
  plan: OnboardingPlan;
  target: OkrPlanTarget | null;
  onPatchObjective: (value: string) => void;
  onAddKeyResult: () => void;
  onPatchKeyResult: (clientId: string, value: string) => void;
  onRemoveKeyResult: (clientId: string) => void;
  onAddInitiative: (keyResultId?: string) => void;
  onPatchInitiative: (clientId: string, value: string) => void;
  onRemoveInitiative: (clientId: string) => void;
  onMoveInitiative: (clientId: string, targetKeyResultId: string) => void;
}) {
  const counts = countOkrDraft(plan);
  const editingTargetKeyResult = target?.kind === "key_result";
  return (
    <section className="okr-draft-tree" aria-label="OKR 트리 초안">
      <header>
        <div><Target size={15} /><b>OKR 트리 초안</b></div>
        <span>{target ? "기존 항목 아래 추가" : "Objective 1개"} · KR {counts.keyResults}개 · Initiative {counts.initiatives}개</span>
      </header>
      {editingTargetKeyResult ? (
        <>
          <div className="okr-draft-root readonly"><span>Key Result</span><b>{target.title}</b></div>
          <div className="okr-draft-target-initiatives">
            {plan.targetInitiatives.map((initiative, index) => (
              <div className="okr-draft-initiative-row" key={initiative.clientId}>
                <Zap size={13} />
                <label><span>Initiative {index + 1}</span><textarea rows={2} value={initiative.title} onChange={(event) => onPatchInitiative(initiative.clientId, event.target.value)} placeholder="이 KR을 움직일 실행 방향" /></label>
                <button type="button" className="icon-button" onClick={() => onRemoveInitiative(initiative.clientId)} aria-label="Initiative 제거" title="Initiative 제거"><Trash2 size={13} /></button>
              </div>
            ))}
            <button type="button" className="okr-draft-add" onClick={() => onAddInitiative()}><Plus size={13} />Initiative 추가</button>
          </div>
        </>
      ) : (
        <>
          {target?.kind === "objective"
            ? <div className="okr-draft-root readonly"><span>Objective</span><b>{target.title}</b></div>
            : <label className="okr-draft-root"><span>Objective</span><textarea rows={2} value={plan.objectiveTitle} onChange={(event) => onPatchObjective(event.target.value)} placeholder="이번 주기에 이루고 싶은 변화" /></label>}
          <div className="okr-draft-key-results">
            {plan.keyResults.map((keyResult, keyResultIndex) => (
              <section className="okr-draft-key-result" key={keyResult.clientId}>
                <div className="okr-draft-key-result-row">
                  <Hash size={13} />
                  <label><span>Key Result {keyResultIndex + 1}</span><textarea rows={2} value={keyResult.title} onChange={(event) => onPatchKeyResult(keyResult.clientId, event.target.value)} placeholder="달성 여부를 확인할 측정 가능한 결과" /></label>
                  <div>
                    <button type="button" className="icon-button" onClick={() => onAddInitiative(keyResult.clientId)} aria-label={`${keyResultIndex + 1}번 KR에 Initiative 추가`} title="Initiative 추가"><Plus size={13} /></button>
                    <button type="button" className="icon-button" onClick={() => onRemoveKeyResult(keyResult.clientId)} aria-label={`${keyResultIndex + 1}번 KR 제거`} title="Key Result 제거"><Trash2 size={13} /></button>
                  </div>
                </div>
                <div className="okr-draft-initiatives">
                  {keyResult.initiatives.map((initiative, initiativeIndex) => (
                    <div className="okr-draft-initiative-row" key={initiative.clientId}>
                      <Zap size={13} />
                      <label><span>Initiative {initiativeIndex + 1}</span><textarea rows={2} value={initiative.title} onChange={(event) => onPatchInitiative(initiative.clientId, event.target.value)} placeholder="이 KR을 움직일 실행 방향" /></label>
                      {plan.keyResults.length > 1 && <select value={keyResult.clientId} onChange={(event) => onMoveInitiative(initiative.clientId, event.target.value)} aria-label={`${initiative.title || "Initiative"}의 Key Result`}>
                        {plan.keyResults.map((candidate, index) => <option value={candidate.clientId} key={candidate.clientId}>KR {index + 1}</option>)}
                      </select>}
                      <button type="button" className="icon-button" onClick={() => onRemoveInitiative(initiative.clientId)} aria-label="Initiative 제거" title="Initiative 제거"><Trash2 size={13} /></button>
                    </div>
                  ))}
                </div>
              </section>
            ))}
            <button type="button" className="okr-draft-add" onClick={onAddKeyResult}><Plus size={13} />Key Result 추가</button>
          </div>
          {plan.unassignedInitiatives.length > 0 && <section className="okr-draft-unassigned">
            <header><AlertTriangle size={13} /><div><b>KR 미지정 Initiative</b><span>저장하려면 연결할 KR을 선택해 주세요.</span></div></header>
            {plan.unassignedInitiatives.map((initiative) => (
              <div className="okr-draft-initiative-row" key={initiative.clientId}>
                <Zap size={13} />
                <label><span>Initiative</span><textarea rows={2} value={initiative.title} onChange={(event) => onPatchInitiative(initiative.clientId, event.target.value)} /></label>
                <select value="" onChange={(event) => event.target.value && onMoveInitiative(initiative.clientId, event.target.value)} aria-label={`${initiative.title || "Initiative"}를 연결할 Key Result`}>
                  <option value="">KR 선택</option>
                  {plan.keyResults.map((candidate, index) => <option value={candidate.clientId} key={candidate.clientId}>KR {index + 1}</option>)}
                </select>
                <button type="button" className="icon-button" onClick={() => onRemoveInitiative(initiative.clientId)} aria-label="미지정 Initiative 제거" title="Initiative 제거"><Trash2 size={13} /></button>
              </div>
            ))}
          </section>}
        </>
      )}
    </section>
  );
}

function hasOkrDraft(plan: OnboardingPlan) {
  return Boolean(plan.objectiveTitle.trim() || plan.keyResults.length || plan.targetInitiatives.length || plan.unassignedInitiatives.length);
}

function countOkrDraft(plan: OnboardingPlan) {
  return {
    keyResults: plan.keyResults.length,
    initiatives: plan.keyResults.reduce((total, entry) => total + entry.initiatives.length, 0) + plan.targetInitiatives.length + plan.unassignedInitiatives.length,
  };
}

function createDraftClientId(kind: "kr" | "initiative") {
  return `draft-${kind}-${crypto.randomUUID()}`;
}

function planStringFieldsWithValues(plan: OnboardingPlan) {
  const fields: StringPlanField[] = ["project", "tasks", "taskParent", "routineTitle", "routineTrigger", "routinePlace", "routineSteps"];
  return fields.filter((field) => plan[field].trim());
}

function buildAssistantWorkspaceContext(activeItems: OkrptrItem[], cycle: OkrCycle | null, focusedProject: OkrptrItem | null): AssistantWorkspaceContext {
  const cycleItems = cycle ? activeItems.filter((entry) => entry.cycleId === cycle.id) : [];
  const includedIds = new Set(cycleItems.map((entry) => entry.id));
  const linkedTasks = activeItems.filter((entry) => entry.kind === "task" && entry.parentId && includedIds.has(entry.parentId));
  const contextualItems = [...cycleItems, ...linkedTasks.filter((entry) => !includedIds.has(entry.id))];
  return {
    cycleId: cycle?.id ?? null,
    cycleName: cycle?.name ?? "",
    focusedItemId: focusedProject?.id ?? null,
    blockedTaskCount: contextualItems.filter((entry) => entry.kind === "task" && entry.status === "blocked").length,
    items: contextualItems.slice(0, 80).map((entry) => ({
      id: entry.id,
      parentId: entry.parentId,
      kind: entry.kind,
      title: entry.title,
      status: entry.status,
      progress: entry.progress,
      dri: entry.assignments.find((assignment) => assignment.role === "project_dri")?.displayName ?? "",
    })),
  };
}

function deriveAssistantTargeting(context: AssistantWorkspaceContext) {
  const childrenByParent = new Map<string, AssistantWorkspaceContext["items"]>();
  for (const item of context.items) {
    if (!item.parentId) continue;
    childrenByParent.set(item.parentId, [...(childrenByParent.get(item.parentId) ?? []), item]);
  }
  const objectivesMissingKr = context.items.filter((item) => item.kind === "objective" && !(childrenByParent.get(item.id) ?? []).some((child) => child.kind === "key_result"));
  const keyResultsMissingInitiative = context.items.filter((item) => item.kind === "key_result" && !(childrenByParent.get(item.id) ?? []).some((child) => child.kind === "initiative"));
  const initiativesMissingProject = context.items.filter((item) => item.kind === "initiative" && !(childrenByParent.get(item.id) ?? []).some((child) => child.kind === "project"));
  const source = objectivesMissingKr.length ? objectivesMissingKr : keyResultsMissingInitiative.length ? keyResultsMissingInitiative : initiativesMissingProject;
  const candidates = source.map((item) => ({ id: item.id, kind: item.kind as OkrPlanTarget["kind"], title: item.title }));
  return { target: candidates.length === 1 ? candidates[0] : null, candidates };
}

function assistantOpeningMessage(context: OkrChatContext | null, workspace: AssistantWorkspaceContext) {
  if (context?.entry === "onboarding") {
    return "OKR은 이루고 싶은 변화인 Objective와, 그 변화가 일어났는지 확인하는 측정 가능한 Key Result를 연결하는 방식이에요. 이번 주기에 달성하고 싶은 목표가 있나요? 편하게 말해 주세요.";
  }
  if (context?.entry === "create") {
    return `‘${context.cycleName}’에 ${kindLabel(context.sourceKind ?? "objective")}부터 같이 만들어볼게요. 이번 주기 끝에 어떤 상태가 달라져야 하는지 편하게 적어 주세요.`;
  }
  if (context?.target) return targetPrompt(context.target);
  if ((context?.targetCandidates?.length ?? 0) > 1) return "이어갈 수 있는 OKR이 여러 개 있습니다. 먼저 어느 항목을 다듬을지 선택해 주세요.";
  const focused = workspace.items.find((item) => item.id === workspace.focusedItemId);
  if (focused?.kind === "project") {
    return `‘${focused.title}’ Project는 현재 ${statusLabel(focused.status)} 상태입니다. 지금 막힌 점이나 다음으로 정리할 일을 말씀해 주세요.`;
  }
  if (!workspace.items.some((item) => item.kind === "objective")) return "현재 워크스페이스에는 활성 Objective가 없습니다. 새 목표를 함께 정리할까요?";
  if (workspace.blockedTaskCount > 0) return `현재 막힌 Task가 ${workspace.blockedTaskCount}개 있습니다. 가장 먼저 풀어야 할 병목부터 같이 보겠습니다.`;
  return "현재 OKR 구조를 확인했습니다. 진행 상황, 막힌 점, 다음 우선순위 중 무엇부터 이야기할까요?";
}

function assistantOpeningGuides(context: OkrChatContext | null) {
  if (context?.entry === "onboarding") return ["업무 목표를 말해볼게요", "개인 성장 목표를 말해볼게요", "아직 목표가 잘 떠오르지 않아요"];
  if (context?.entry === "create") return ["달성하고 싶은 변화는 무엇인가요?", "성공 여부는 어떤 숫자나 상태로 확인할까요?"];
  return [];
}

function targetPrompt(target: OkrPlanTarget) {
  if (target.kind === "objective") return `‘${target.title}’ Objective의 달성 여부를 확인할 수 있는 측정 가능한 Key Result는 무엇인가요?`;
  if (target.kind === "key_result") return `‘${target.title}’ Key Result를 움직일 실행 방향인 Initiative는 무엇인가요? 아직 생각나지 않았다면 건너뛸 수 있습니다.`;
  return `‘${target.title}’ Initiative를 실제로 움직일 첫 Project는 무엇인가요? 결과, 범위, 시기 또는 DRI를 편하게 말해 주세요.`;
}

function aiLimitMessage(error: OrganizeError) {
  if (error.code === "ai_rate_limited") {
    return "AI 정리 요청이 너무 빠르게 반복되고 있습니다. 작성 중인 초안은 그대로 두었습니다. 잠시 후 다시 시도해 주세요.";
  }
  const spent = typeof error.usage?.spentWon === "number" ? `${error.usage.spentWon.toLocaleString()}원` : "무료 사용량";
  const budget = typeof error.usage?.budgetWon === "number" ? `${error.usage.budgetWon.toLocaleString()}원` : "무료 한도";
  return `무료 AI 정리 예산을 다 썼습니다. 작성 중인 초안은 그대로 두었습니다. 현재 사용량은 ${spent} / ${budget} 기준입니다.`;
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

function OkrCurrentFile({ cycle, addItemKind, onRename, onDepartmentChange, onAddItem }: { cycle: OkrCycle; addItemKind: ItemKind; onRename: (id: string, name: string) => void; onDepartmentChange: (id: string, department: string) => void; onAddItem: () => void }) {
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
      <button type="button" onClick={onAddItem}><Plus size={13} />{addItemKind === "objective" ? "Objective 추가" : "항목 추가"}</button>
    </header>
  );
}

function TreeView({ objective, items, depths, canEdit, onEditOkrItem, onComplete, onOpenProject, onOpenTask, onCreateObjective, onCreateWithChat }: { objective?: OkrptrItem; items: OkrptrItem[]; depths: Record<string, number>; canEdit: boolean; onEditOkrItem: (id: string) => void; onComplete: (id: string) => void; onOpenProject: (id: string) => void; onOpenTask: (id: string) => void; onCreateObjective: () => void; onCreateWithChat: () => void }) {
  if (!objective) return <OkrEmptyState onCreateObjective={onCreateObjective} onCreateWithChat={onCreateWithChat} />;
  const byId = new Map(items.map((entry) => [entry.id, entry]));
  return <section className="outline-section"><div className="objective-row"><Target size={18} /><div><span>Objective</span><h2>{objective.title}</h2></div><b>{objective.progress}%</b>{canEdit ? <button className="icon-button okr-node-edit" onClick={() => onEditOkrItem(objective.id)} aria-label={`${objective.title} 수정`} title="Objective 수정"><Pencil size={13} /></button> : <span aria-hidden="true" />}</div><div className="hierarchy">{items.filter((entry) => entry.id !== objective.id).map((entry) => {
    const canOpen = entry.kind === "project" || entry.kind === "task";
    const canEditNode = canEdit && (entry.kind === "key_result" || entry.kind === "initiative");
    const parent = entry.parentId ? byId.get(entry.parentId) : undefined;
    const open = () => entry.kind === "project" ? onOpenProject(entry.id) : entry.kind === "task" ? onOpenTask(entry.id) : undefined;
    return <div className={`hierarchy-row ${canOpen ? "interactive" : ""}`} role={canOpen ? "button" : undefined} tabIndex={canOpen ? 0 : undefined} aria-label={canOpen ? `${entry.title} 상세 열기` : undefined} onClick={canOpen ? open : undefined} onKeyDown={canOpen ? (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); open(); } } : undefined} key={entry.id} style={{ "--depth": Math.min(depths[entry.id] ?? 1, 4) } as CSSProperties}><span className={`type-icon type-${entry.kind}`}>{kindAbbr(entry.kind)}</span><span className="hierarchy-copy"><small title={parent?.title}>{kindLabel(entry.kind)}{entry.kind === "initiative" && parent ? ` · 상위 KR: ${parent.title}` : ""}</small><b>{entry.title}</b></span><span className={`status-tag status-${entry.status}`}>{statusLabel(entry.status)}</span><em>{entry.progress}%</em>{canEditNode ? <button className="row-action okr-node-edit" aria-label={`${entry.title} 수정`} title={`${kindLabel(entry.kind)} 수정`} onClick={(event) => { event.stopPropagation(); onEditOkrItem(entry.id); }}><Pencil size={12} /></button> : canOpen && !isCompletedStatus(entry.status) ? <button className="row-action" aria-label={`${entry.title} 완료 처리`} title="완료 처리" onClick={(event) => { event.stopPropagation(); onComplete(entry.id); }}><Check size={13} /></button> : canOpen ? <ChevronRight className="row-chevron" size={15} /> : <span aria-hidden="true" />}</div>;
  })}</div></section>;
}

function OkrEmptyState({ onCreateObjective, onCreateWithChat }: { onCreateObjective: () => void; onCreateWithChat: () => void }) {
  return <div className="okr-empty-state"><span className="okr-empty-icon"><Target size={22} /></span><div><h2>첫 Objective를 만들어보세요</h2><p>직접 한 문장으로 시작하거나, 생각을 말하면서 초안을 만들 수 있습니다.</p></div><div className="okr-empty-actions"><button className="primary" onClick={onCreateObjective}><Plus size={14} />Objective 직접 만들기</button><button onClick={onCreateWithChat}><Bot size={14} />AI 대화로 같이 만들기</button></div></div>;
}

function DeleteSelectCheckbox({ item, selected, onToggle }: { item: Pick<OkrptrItem, "id" | "kind" | "title">; selected: boolean; onToggle: (id: string) => void }) {
  return (
    <label className="delete-select" title={`${item.title} 삭제 선택`}>
      <input type="checkbox" checked={selected} onChange={() => onToggle(item.id)} aria-label={`${item.kind === "project" ? "Project" : "Task"} ${item.title} 삭제 선택`} />
      <span><Check size={11} /></span>
    </label>
  );
}

function BoardView({ items, onOpenItem, canDelete, selectedItemIds, onToggleSelect }: { items: OkrptrItem[]; onOpenItem: (item: OkrptrItem) => void; canDelete: boolean; selectedItemIds: Set<string>; onToggleSelect: (id: string) => void }) {
  const columns: { status: ItemStatus; label: string }[] = [
    { status: "backlog", label: "백로그" },
    { status: "todo", label: "할 일" },
    { status: "policy_discussion", label: "정책 논의" },
    { status: "in_progress", label: "진행 중" },
    { status: "developing", label: "개발 중" },
    { status: "development_done", label: "개발 완료" },
    { status: "blocked", label: "막힘" },
  ];
  return <div className="board">{columns.map((column) => { const rows = items.filter((entry) => entry.status === column.status); return <section className="board-column" key={column.status}><header><span className={`status-dot status-${column.status}`} /><b>{column.label}</b><em>{rows.length}</em></header><div>{rows.map((entry) => <article className="board-selectable-item" key={entry.id}>{canDelete && <DeleteSelectCheckbox item={entry} selected={selectedItemIds.has(entry.id)} onToggle={onToggleSelect} />}<button className="board-item" onClick={() => onOpenItem(entry)}><b>{entry.title}</b><span><CalendarDays size={13} />{dueLabel(entry.dueDate)}</span></button></article>)}{!rows.length && <span className="empty-column">작업 없음</span>}</div></section>; })}</div>;
}

function TaskListView({ items, allItems, routines, onOpenTask, onPatch, canDelete, selectedItemIds, onToggleSelect, onSelectItems }: { items: OkrptrItem[]; allItems: OkrptrItem[]; routines: Routine[]; onOpenTask: (id: string) => void; onPatch: (id: string, patch: Partial<OkrptrItem>) => Promise<unknown>; canDelete: boolean; selectedItemIds: Set<string>; onToggleSelect: (id: string) => void; onSelectItems: (ids: string[]) => void }) {
  const [visibleCount, setVisibleCount] = useState(20);
  const byId = new Map(allItems.map((entry) => [entry.id, entry]));
  if (!items.length) return <EmptyState icon={Inbox} title="Task가 없습니다" />;
  return (
    <section className="task-list" aria-label="Task 목록">
      {canDelete && <div className="list-selection-toolbar"><button onClick={() => onSelectItems(items.slice(0, visibleCount).map((item) => item.id))}><ListChecks size={13} />현재 목록 선택</button></div>}
      {items.slice(0, visibleCount).map((entry) => {
        const project = entry.parentId ? byId.get(entry.parentId) : undefined;
        const routine = entry.routineId ? routines.find((row) => row.id === entry.routineId) : undefined;
        const relation = routine?.systemKey === "general" ? "미분류 Task" : routine ? `Routine · ${routine.title}` : project ? `Project · ${project.title}` : "미분류 Task";
        const assignee = assignmentLabel(entry, "task_assignee");
        return (
          <article className={`task-list-row ${canDelete ? "deletion-selectable" : ""} ${isCompletedStatus(entry.status) ? "completed" : ""}`} key={entry.id}>
            {canDelete && <DeleteSelectCheckbox item={entry} selected={selectedItemIds.has(entry.id)} onToggle={onToggleSelect} />}
            <button className={`task-list-check ${isCompletedStatus(entry.status) ? "checked" : ""}`} onClick={() => void onPatch(entry.id, { status: isCompletedStatus(entry.status) ? "todo" : "done", progress: isCompletedStatus(entry.status) ? entry.progress : 100 })} aria-label={`${entry.title} ${isCompletedStatus(entry.status) ? "완료 취소" : "완료"}`}><Check size={13} /></button>
            <button className="task-list-open" onClick={() => onOpenTask(entry.id)}>
              <b>{entry.title}</b>
              <span className="task-list-inline-meta"><i className={`status-dot status-${entry.status}`} />{statusLabel(entry.status)}<em>·</em>{assignee}<em>·</em>{relation}{entry.dueDate && <><em>·</em>{dueLabel(entry.dueDate)}</>}</span>
            </button>
            <button className="task-list-chevron" onClick={() => onOpenTask(entry.id)} aria-label={`${entry.title} 상세 열기`}><ChevronRight size={15} /></button>
          </article>
        );
      })}
      {items.length > visibleCount && <button className="task-list-more" onClick={() => setVisibleCount((count) => count + 20)}>더 보기 <span>{Math.min(visibleCount, items.length)} / {items.length}</span></button>}
    </section>
  );
}

function AsyncState({ icon: Icon, title, detail, actionLabel, onAction, loading = false }: { icon: LucideIcon; title: string; detail?: string; actionLabel?: string; onAction?: () => void; loading?: boolean }) {
  return (
    <section className="async-state" role={loading ? "status" : "alert"} aria-live="polite">
      <span className={loading ? "spinning" : ""}><Icon size={18} /></span>
      <div><b>{title}</b>{detail && <p>{detail}</p>}</div>
      {actionLabel && onAction && <button type="button" onClick={onAction}><RotateCcw size={14} />{actionLabel}</button>}
    </section>
  );
}

function TrashView({ onNotice, canDelete }: { onNotice: (message: string) => void; canDelete: boolean }) {
  const confirmAction = useAppConfirm();
  const [records, setRecords] = useState<TrashRecord[] | null>(null);
  const [trashedItems, setTrashedItems] = useState<TrashedItem[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    Promise.all([fetch("/api/item-trash"), fetch("/api/trash")])
      .then(async ([itemResponse, recordResponse]) => {
        if (!itemResponse.ok || !recordResponse.ok) throw new Error("trash-load-failed");
        const itemData = await itemResponse.json() as { items: TrashedItem[] };
        const recordData = await recordResponse.json() as { trash: TrashRecord[] };
        return { items: itemData.items, records: recordData.trash };
      })
      .then((data) => {
        if (!active) return;
        setTrashedItems(data.items);
        setRecords(data.records);
      })
      .catch(() => { if (active) setLoadError(true); });
    return () => { active = false; };
  }, [loadAttempt]);

  async function permanentlyDeleteRecord(record: TrashRecord) {
    if (!await confirmAction({ title: "휴지통 기록 영구 삭제", message: `'${record.title}' 기록은 복구할 수 없게 됩니다.`, confirmationText: "영구 삭제", confirmLabel: "영구 삭제", danger: true })) return;
    const response = await fetch(`/api/trash?id=${encodeURIComponent(record.id)}`, { method: "DELETE" });
    if (!response.ok) {
      onNotice("휴지통 기록을 삭제하지 못했습니다.");
      return;
    }
    setRecords((current) => current?.filter((entry) => entry.id !== record.id) ?? []);
    onNotice("휴지통 기록을 영구 삭제했습니다.");
  }

  async function restoreRecord(record: TrashRecord) {
    const response = await fetch("/api/trash", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: record.id, action: "restore" }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({})) as { error?: string };
      onNotice(data.error ?? "휴지통 기록을 복구하지 못했습니다.");
      return;
    }
    window.location.reload();
  }

  async function restoreItem(entry: TrashedItem) {
    const response = await fetch("/api/item-trash", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemIds: [entry.id], action: "restore" }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({})) as { error?: string };
      onNotice(data.error ?? "항목을 복구하지 못했습니다.");
      return;
    }
    clearCachedBootstrap();
    window.location.reload();
  }

  async function permanentlyDeleteItem(entry: TrashedItem) {
    const taskCopy = entry.kind === "project" ? `와 하위 Task ${entry.trashedTaskCount}개` : "";
    if (!await confirmAction({ title: "항목 영구 삭제", message: `'${entry.title}'${taskCopy}를 영구 삭제합니다.\n체크리스트, 담당자, 속성값, 문서와 활동 기록도 삭제되며 복구할 수 없습니다.`, confirmationText: "영구 삭제", confirmLabel: "영구 삭제", danger: true })) return;
    const confirmationText = "영구 삭제";
    const response = await fetch("/api/item-trash", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemIds: [entry.id], confirmationText }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({})) as { error?: string };
      onNotice(data.error ?? "항목을 영구 삭제하지 못했습니다.");
      return;
    }
    setTrashedItems((current) => current?.filter((item) => item.id !== entry.id) ?? []);
    onNotice(`${entry.kind === "project" ? "Project 묶음" : "Task"}을 영구 삭제했습니다.`);
  }

  if (loadError) return <AsyncState icon={AlertTriangle} title="휴지통을 불러오지 못했습니다" detail="삭제 항목과 클린업 기록은 그대로 보존되어 있습니다." actionLabel="다시 시도" onAction={() => { setRecords(null); setTrashedItems(null); setLoadError(false); setLoadAttempt((attempt) => attempt + 1); }} />;
  if (records === null || trashedItems === null) return <AsyncState icon={LoaderCircle} title="휴지통을 불러오는 중입니다" loading />;
  if (!records.length && !trashedItems.length) return <EmptyState icon={Trash2} title="휴지통이 비어 있습니다" />;

  return (
    <div className="trash-sections">
      {trashedItems.length > 0 && <section className="trash-list" aria-label="삭제한 Project와 Task">
        <header className="trash-section-title"><div><b>Project·Task</b><span>{trashedItems.length}</span></div><p>Project는 함께 삭제한 하위 Task까지 한 묶음으로 복구하거나 영구 삭제합니다.</p></header>
        {trashedItems.map((entry) => (
          <article className="trash-record" key={entry.id}>
            <span className="trash-icon"><Trash2 size={15} /></span>
            <div>
              <h3>{entry.title}</h3>
              <p>{entry.kind === "project" ? `Project · 하위 Task ${entry.trashedTaskCount}개` : "독립 삭제한 Task"}</p>
              <small>{entry.archivedAt ? formatDateTime(entry.archivedAt) : "삭제됨"}</small>
            </div>
            {canDelete && <div className="trash-actions"><button onClick={() => void restoreItem(entry)}><RotateCcw size={13} />복구</button><button className="danger" onClick={() => void permanentlyDeleteItem(entry)}><Trash2 size={13} />영구 삭제</button></div>}
          </article>
        ))}
      </section>}
      {records.length > 0 && <section className="trash-list" aria-label="전체 OKR 클린업 기록">
        <header className="trash-section-title"><div><b>전체 OKR 클린업 기록</b><span>{records.length}</span></div><p>이전에 전체 정리로 보관한 백업입니다.</p></header>
        {records.map((record) => (
          <article className="trash-record" key={record.id}>
            <span className="trash-icon"><Archive size={15} /></span>
            <div>
              <h3>{record.title}</h3>
              <p>{trashSummary(record)}</p>
              <small>{formatDateTime(record.archivedAt)}</small>
            </div>
            {canDelete && <div className="trash-actions"><button onClick={() => void restoreRecord(record)}><RotateCcw size={13} />복구</button><button className="danger" onClick={() => void permanentlyDeleteRecord(record)}><Trash2 size={13} />영구 삭제</button></div>}
          </article>
        ))}
      </section>}
    </div>
  );
}

function ReviewView({ items, cadence, completed, blocked, averageProgress, onOpenTask, onOpenProject }: { items: OkrptrItem[]; cadence: Cadence; completed: number; blocked: number; averageProgress: number; onOpenTask: (id: string) => void; onOpenProject: (id: string) => void }) {
  return <section className="review-content"><div className="metrics-row"><div><span>완료</span><strong>{completed}<small> / {items.length}</small></strong></div><div><span>평균 진행</span><strong>{averageProgress}<small>%</small></strong></div><div><span>막힘</span><strong>{blocked}</strong></div></div><div className="review-progress"><div><b>{cadenceLabels[cadence]} 진행률</b><span>{averageProgress}%</span></div><span><i style={{ width: `${averageProgress}%` }} /></span></div><div className="review-list"><span>검토할 항목</span>{items.slice(0, 7).map((entry) => entry.kind === "task" || entry.kind === "project" ? <button key={entry.id} onClick={() => entry.kind === "task" ? onOpenTask(entry.id) : onOpenProject(entry.id)}><span className={`status-dot status-${entry.status}`} /><b>{entry.title}</b><em>{entry.progress}%</em><ChevronRight size={14} /></button> : <div key={entry.id}><span className={`status-dot status-${entry.status}`} /><b>{entry.title}</b><em>{entry.progress}%</em></div>)}{!items.length && <p className="my-work-empty">이 기간에 검토할 항목이 없습니다.</p>}</div></section>;
}

function ProjectPropertyManager({ properties, teamMembers, readOnly, onChanged, onNotice }: { properties: PropertyDefinition[]; teamMembers: TeamMember[]; readOnly: boolean; onChanged: (properties: PropertyDefinition[]) => void; onNotice: (message: string) => void }) {
  const confirmAction = useAppConfirm();
  const [catalog, setCatalog] = useState<PropertyDefinition[]>(properties);
  const [selectedId, setSelectedId] = useState<string | null>(properties[0]?.id ?? null);
  const [creatingNew, setCreatingNew] = useState(properties.length === 0);
  const [name, setName] = useState("");
  const [type, setType] = useState<PropertyType>("text");
  const [options, setOptions] = useState("");
  const [defaultValue, setDefaultValue] = useState<PropertyValue>(null);
  const [saving, setSaving] = useState(false);
  const onChangedRef = useRef(onChanged);
  const onNoticeRef = useRef(onNotice);
  const selected = catalog.find((property) => property.id === selectedId) ?? null;

  useEffect(() => {
    onChangedRef.current = onChanged;
    onNoticeRef.current = onNotice;
  }, [onChanged, onNotice]);

  useEffect(() => {
    let active = true;
    void fetch("/api/properties?includeInactive=true")
      .then(async (response) => response.ok ? response.json() as Promise<{ properties: PropertyDefinition[] }> : Promise.reject())
      .then((data) => {
        if (!active) return;
        setCatalog(data.properties);
        onChangedRef.current(data.properties);
        setSelectedId((current) => current ?? data.properties[0]?.id ?? null);
      })
      .catch(() => onNoticeRef.current("속성 목록을 새로 불러오지 못했습니다."));
    return () => { active = false; };
  }, []);

  function applyCatalog(next: PropertyDefinition[]) {
    const sorted = [...next].sort((left, right) => left.sortOrder - right.sortOrder);
    setCatalog(sorted);
    onChanged(sorted);
  }

  async function create(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || saving) return;
    setSaving(true);
    const response = await fetch("/api/properties", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, type, options: options.split(",").map((entry) => entry.trim()).filter(Boolean), defaultValue }),
    });
    setSaving(false);
    if (!response.ok) { onNotice("속성을 추가하지 못했습니다."); return; }
    const data = await response.json() as { property: PropertyDefinition };
    const created = { ...data.property, valueCount: data.property.valueCount ?? 0 };
    applyCatalog([...catalog, created]);
    setSelectedId(created.id);
    setCreatingNew(false);
    setName("");
    setOptions("");
    setDefaultValue(null);
    onNotice("모든 Project에 새 속성을 추가했습니다.");
  }

  async function deactivate(property: PropertyDefinition) {
    const detail = property.valueCount > 0 ? `\n${property.valueCount}개 Project의 값은 보존되며 화면에서만 숨겨집니다.` : "";
    if (!await confirmAction({ title: "Project 속성 제거", message: `'${property.name}' 속성을 화면에서 제거합니다.${detail}`, confirmLabel: "속성 제거", danger: true })) return;
    const response = await fetch(`/api/properties?id=${encodeURIComponent(property.id)}`, { method: "DELETE" });
    if (!response.ok) { onNotice("속성을 삭제하지 못했습니다."); return; }
    applyCatalog(catalog.map((entry) => entry.id === property.id ? { ...entry, active: false } : entry));
    onNotice("속성을 제거했습니다. 기존 값은 보존됩니다.");
  }

  async function saveProperty(property: PropertyDefinition, draft: PropertyDefinition) {
    setSaving(true);
    if (draft.type !== property.type || draft.options.join("\u0000") !== property.options.join("\u0000")) {
      const previewResponse = await fetch("/api/properties", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: property.id, type: draft.type, options: draft.options, preview: true }) });
      const preview = await previewResponse.json() as { analysis?: { convertibleCount: number; incompatibleCount: number } };
      if (!previewResponse.ok || !preview.analysis) { setSaving(false); onNotice("속성 유형 변경을 확인하지 못했습니다."); return; }
      if (!await confirmAction({ title: "속성 유형 변경", message: `변환 가능 ${preview.analysis.convertibleCount}개 · 보존할 기존 값 ${preview.analysis.incompatibleCount}개`, confirmLabel: "유형 변경" })) { setSaving(false); return; }
    }
    const response = await fetch("/api/properties", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: property.id, name: draft.name, type: draft.type, options: draft.options, defaultValue: draft.defaultValue, sortOrder: draft.sortOrder, active: draft.active }) });
    setSaving(false);
    const data = await response.json() as { property?: PropertyDefinition; error?: string };
    if (!response.ok || !data.property) { onNotice(data.error ?? "속성을 저장하지 못했습니다."); return; }
    applyCatalog(catalog.map((entry) => entry.id === property.id ? { ...data.property!, valueCount: property.valueCount } : entry));
    onNotice("속성 설정을 저장했습니다.");
  }

  async function restore(property: PropertyDefinition) {
    const response = await fetch("/api/properties", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: property.id, active: true }) });
    const data = await response.json() as { property?: PropertyDefinition };
    if (!response.ok || !data.property) { onNotice("속성을 복원하지 못했습니다."); return; }
    applyCatalog(catalog.map((entry) => entry.id === property.id ? { ...data.property!, valueCount: property.valueCount } : entry));
    onNotice("속성과 기존 값을 복원했습니다.");
  }

  async function move(property: PropertyDefinition, direction: -1 | 1) {
    const ordered = [...catalog].sort((left, right) => left.sortOrder - right.sortOrder);
    const index = ordered.findIndex((entry) => entry.id === property.id);
    const target = ordered[index + direction];
    if (!target) return;
    const [firstResponse, secondResponse] = await Promise.all([
      fetch("/api/properties", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: property.id, sortOrder: target.sortOrder }) }),
      fetch("/api/properties", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: target.id, sortOrder: property.sortOrder }) }),
    ]);
    if (!firstResponse.ok || !secondResponse.ok) { onNotice("속성 순서를 바꾸지 못했습니다."); return; }
    applyCatalog(catalog.map((entry) => entry.id === property.id ? { ...entry, sortOrder: target.sortOrder } : entry.id === target.id ? { ...entry, sortOrder: property.sortOrder } : entry));
  }

  return <section className="project-property-manager"><header><div><h2>Project 속성</h2><p>기본 속성과 커스텀 속성의 이름, 유형, 기본값과 순서를 관리합니다.</p></div><button disabled={readOnly} onClick={() => { setCreatingNew(true); setSelectedId(null); }}><Plus size={13} />새 속성</button></header><div className="project-property-layout"><div className="project-property-catalog">{catalog.map((property) => <article className={`project-property-item ${selectedId === property.id ? "selected" : ""} ${property.active ? "" : "inactive"}`} key={property.id}><button type="button" className="project-property-select" onClick={() => { setSelectedId(property.id); setCreatingNew(false); }}><span className="property-type-icon">{property.type === "number" ? <Hash size={14} /> : property.type === "member" || property.type === "members" ? <Users size={14} /> : <TextCursorInput size={14} />}</span><div><b>{property.name}{property.systemKey && <em>기본</em>}</b><small>{propertyTypeLabel(property.type)} · 값 {property.valueCount}개{!property.active && " · 제거됨"}</small></div></button><div className="property-order-actions"><button className="icon-button rotate-up" onClick={() => void move(property, -1)} aria-label={`${property.name} 위로`} title="위로"><ChevronDown size={13} /></button><button className="icon-button" onClick={() => void move(property, 1)} aria-label={`${property.name} 아래로`} title="아래로"><ChevronDown size={13} /></button></div></article>)}</div><div className="project-property-editor">{creatingNew ? <form className="project-property-create" onSubmit={create}><h3>새 속성</h3><label><span>이름</span><input disabled={readOnly} value={name} onChange={(event) => setName(event.target.value)} placeholder="예: 리스크, 예산, 출시일" /></label><label><span>유형</span><select disabled={readOnly} value={type} onChange={(event) => { setType(event.target.value as PropertyType); setDefaultValue(null); }}>{(["text", "number", "select", "date", "checkbox", "member", "members"] as PropertyType[]).map((entry) => <option value={entry} key={entry}>{propertyTypeLabel(entry)}</option>)}</select></label>{type === "select" && <label><span>선택 옵션</span><input value={options} onChange={(event) => setOptions(event.target.value)} placeholder="쉼표로 구분" /></label>}<PropertyDefaultInput type={type} options={options.split(",").map((entry) => entry.trim()).filter(Boolean)} value={defaultValue} members={teamMembers} disabled={readOnly} onChange={setDefaultValue} /><button className="primary-action" disabled={readOnly || !name.trim() || saving}><Plus size={14} />{saving ? "추가 중" : "속성 추가"}</button></form> : selected ? <PropertyDefinitionEditor key={`${selected.id}:${selected.name}:${selected.type}:${selected.active}:${String(selected.defaultValue)}`} property={selected} members={teamMembers} readOnly={readOnly} saving={saving} onSave={(draft) => void saveProperty(selected, draft)} onDeactivate={() => void deactivate(selected)} onRestore={() => void restore(selected)} /> : <EmptyState icon={Settings2} title="편집할 속성을 선택하세요" />}</div></div></section>;
}

function PropertyDefinitionEditor({ property, members, readOnly, saving, onSave, onDeactivate, onRestore }: { property: PropertyDefinition; members: TeamMember[]; readOnly: boolean; saving: boolean; onSave: (property: PropertyDefinition) => void; onDeactivate: () => void; onRestore: () => void }) {
  const [draft, setDraft] = useState(property);
  return <form className="project-property-create" onSubmit={(event) => { event.preventDefault(); onSave(draft); }}><h3>{property.systemKey ? "기본 속성 편집" : "속성 편집"}</h3><label><span>이름</span><input disabled={readOnly} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label><label><span>유형</span><select disabled={readOnly} value={draft.type} onChange={(event) => setDraft({ ...draft, type: event.target.value as PropertyType, defaultValue: null })}>{(["text", "number", "select", "date", "checkbox", "member", "members"] as PropertyType[]).map((entry) => <option value={entry} key={entry}>{propertyTypeLabel(entry)}</option>)}</select></label>{draft.type === "select" && <label><span>선택 옵션</span><input disabled={readOnly} value={draft.options.join(", ")} onChange={(event) => setDraft({ ...draft, options: event.target.value.split(",").map((entry) => entry.trim()).filter(Boolean) })} /></label>}<PropertyDefaultInput type={draft.type} options={draft.options} value={draft.defaultValue} members={members} disabled={readOnly} onChange={(value) => setDraft({ ...draft, defaultValue: value })} /><div className="property-editor-actions"><button className="primary-action" disabled={readOnly || saving}>{saving ? "저장 중" : "변경 저장"}</button>{property.active ? <button type="button" className="danger" disabled={readOnly} onClick={onDeactivate}><Trash2 size={13} />제거</button> : <button type="button" disabled={readOnly} onClick={onRestore}><RotateCcw size={13} />복원</button>}</div></form>;
}

function PropertyDefaultInput({ type, options, value, members, disabled = false, onChange }: { type: PropertyType; options: string[]; value: PropertyValue; members: TeamMember[]; disabled?: boolean; onChange: (value: PropertyValue) => void }) {
  if (type === "checkbox") return <label><span>생성 시 기본값</span><input disabled={disabled} type="checkbox" checked={Boolean(value)} onChange={(event) => onChange(event.target.checked)} /></label>;
  if (type === "select") return <label><span>생성 시 기본값</span><select disabled={disabled} value={typeof value === "string" ? value : ""} onChange={(event) => onChange(event.target.value || null)}><option value="">없음</option>{options.map((option) => <option key={option}>{option}</option>)}</select></label>;
  if (type === "member") return <label><span>생성 시 기본값</span><select disabled={disabled} value={typeof value === "string" ? value : ""} onChange={(event) => onChange(event.target.value || null)}><option value="">없음</option>{members.filter((member) => member.status === "active").map((member) => <option value={member.id} key={member.id}>{member.displayName}</option>)}</select></label>;
  if (type === "members") return <label><span>생성 시 기본값</span><select disabled={disabled} multiple value={Array.isArray(value) ? value : []} onChange={(event) => onChange(Array.from(event.target.selectedOptions, (option) => option.value))}>{members.filter((member) => member.status === "active").map((member) => <option value={member.id} key={member.id}>{member.displayName}</option>)}</select></label>;
  return <label><span>생성 시 기본값</span><input disabled={disabled} type={type === "number" ? "number" : type === "date" ? "date" : "text"} value={value === null || Array.isArray(value) ? "" : String(value)} onChange={(event) => onChange(type === "number" ? (event.target.value ? Number(event.target.value) : null) : event.target.value || null)} /></label>;
}

function ProjectTemplateManager({ readOnly, onNotice }: { readOnly: boolean; onNotice: (message: string) => void }) {
  const confirmAction = useAppConfirm();
  const [templates, setTemplates] = useState<ProjectTemplate[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [templateName, setTemplateName] = useState("");
  const [creatingTemplate, setCreatingTemplate] = useState(false);
  const [saving, setSaving] = useState(false);
  const selected = templates?.find((template) => template.id === selectedId) ?? null;

  useEffect(() => {
    let active = true;
    void fetch("/api/project-templates").then(async (response) => response.ok ? response.json() as Promise<{ templates: ProjectTemplate[] }> : Promise.reject()).then((data) => {
      if (!active) return;
      setTemplates(data.templates);
      setSelectedId(data.templates[0]?.id ?? null);
    }).catch(() => setTemplates([]));
    return () => { active = false; };
  }, []);

  async function createTemplate(event: FormEvent) {
    event.preventDefault();
    if (readOnly) return;
    const name = templateName.trim();
    if (!name) return;
    const content = JSON.stringify([{ type: "heading", props: { level: 2 }, content: "목적" }, { type: "paragraph", content: "" }, { type: "heading", props: { level: 2 }, content: "배경" }, { type: "paragraph", content: "" }, { type: "heading", props: { level: 2 }, content: "범위" }, { type: "paragraph", content: "" }, { type: "heading", props: { level: 2 }, content: "성공 기준" }, { type: "checkListItem", props: { checked: false }, content: "" }]);
    const response = await fetch("/api/project-templates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, content, plainText: "목적\n\n배경\n\n범위\n\n성공 기준" }) });
    const data = await response.json() as { template?: ProjectTemplate; error?: string };
    if (!response.ok || !data.template) { onNotice(data.error ?? "템플릿을 만들지 못했습니다."); return; }
    setTemplates((current) => [data.template!, ...(current ?? [])]);
    setSelectedId(data.template.id);
    setTemplateName("");
    setCreatingTemplate(false);
    onNotice("새 본문 템플릿을 만들었습니다.");
  }

  async function patchTemplate(id: string, patch: Partial<ProjectTemplate>, quiet = false) {
    setSaving(true);
    const response = await fetch("/api/project-templates", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...patch }) });
    const data = await response.json() as { template?: ProjectTemplate; error?: string };
    setSaving(false);
    if (!response.ok || !data.template) { onNotice(data.error ?? "템플릿을 저장하지 못했습니다."); return; }
    setTemplates((current) => current?.map((template) => template.id === id ? data.template! : template) ?? []);
    if (!quiet) onNotice("템플릿을 저장했습니다.");
  }

  async function duplicateTemplate(template: ProjectTemplate) {
    let name = `${template.name} 복사본`;
    let suffix = 2;
    while (templates?.some((entry) => entry.name === name)) name = `${template.name} 복사본 ${suffix++}`;
    const response = await fetch("/api/project-templates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, description: template.description, content: template.content, plainText: template.plainText }) });
    const data = await response.json() as { template?: ProjectTemplate };
    if (!response.ok || !data.template) { onNotice("템플릿을 복제하지 못했습니다."); return; }
    setTemplates((current) => [data.template!, ...(current ?? [])]);
    setSelectedId(data.template.id);
  }

  async function removeTemplate(template: ProjectTemplate) {
    if (!await confirmAction({ title: "본문 템플릿 삭제", message: `'${template.name}' 템플릿을 삭제합니다.\n이미 적용된 Project 문서는 바뀌지 않습니다.`, confirmLabel: "템플릿 삭제", danger: true })) return;
    const response = await fetch(`/api/project-templates?id=${encodeURIComponent(template.id)}`, { method: "DELETE" });
    if (!response.ok) { onNotice("템플릿을 삭제하지 못했습니다."); return; }
    setTemplates((current) => current?.filter((entry) => entry.id !== template.id) ?? []);
    setSelectedId((templates ?? []).find((entry) => entry.id !== template.id)?.id ?? null);
  }

  return <section className="project-template-manager"><header><div><h2>본문 템플릿</h2><p>속성과 Task를 포함하지 않는 Project 문서 양식을 관리합니다.</p></div><button disabled={readOnly} onClick={() => setCreatingTemplate(true)}><Plus size={13} />새 템플릿</button></header>{templates === null ? <div className="project-editor-loading"><LoaderCircle size={16} />템플릿을 불러오는 중</div> : <div className="project-template-layout"><aside className="project-template-list">{creatingTemplate && <form className="project-template-create" onSubmit={(event) => void createTemplate(event)}><input aria-label="새 템플릿 이름" value={templateName} onChange={(event) => setTemplateName(event.target.value)} placeholder="템플릿 이름" /><button disabled={!templateName.trim()} aria-label="템플릿 만들기"><Check size={13} /></button><button type="button" aria-label="템플릿 만들기 취소" onClick={() => { setCreatingTemplate(false); setTemplateName(""); }}><X size={13} /></button></form>}{templates.map((template) => <button className={selectedId === template.id ? "selected" : ""} onClick={() => setSelectedId(template.id)} key={template.id}><BookTemplate size={14} /><span><b>{template.name}</b><small>{formatDateTime(template.updatedAt)}</small></span></button>)}{!templates.length && !creatingTemplate && <EmptyState icon={BookTemplate} title="저장된 템플릿이 없습니다" />}</aside><div className="project-template-editor">{selected ? <><div className="project-template-meta"><input disabled={readOnly} defaultValue={selected.name} onBlur={(event) => event.target.value.trim() !== selected.name && void patchTemplate(selected.id, { name: event.target.value })} aria-label="템플릿 이름" /><textarea disabled={readOnly} defaultValue={selected.description} onBlur={(event) => event.target.value !== selected.description && void patchTemplate(selected.id, { description: event.target.value })} placeholder="템플릿 설명" rows={2} /><div><span>{saving ? "저장 중" : "자동 저장"}</span>{!readOnly && <><button onClick={() => void duplicateTemplate(selected)}><Copy size={13} />복제</button><button className="danger" onClick={() => void removeTemplate(selected)}><Trash2 size={13} />삭제</button></>}</div></div><ClientProjectBlockEditor key={selected.id} initialContent={selected.content} editable={!readOnly} onChange={readOnly ? undefined : (change) => void patchTemplate(selected.id, change, true)} /></> : <EmptyState icon={BookTemplate} title="편집할 템플릿을 선택하세요" />}</div></div>}</section>;
}

function WorkspaceAvatar({ workspace, className = "" }: { workspace?: Pick<WorkspaceSummary, "name" | "avatarUrl">; className?: string }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  return (
    <span className={`workspace-avatar ${className}`.trim()} aria-hidden="true">
      {workspace?.avatarUrl && failedUrl !== workspace.avatarUrl
        ? <img src={workspace.avatarUrl} alt="" onError={() => setFailedUrl(workspace.avatarUrl)} />
        : workspace?.name.slice(0, 1).toLocaleUpperCase() || "O"}
    </span>
  );
}

function WorkspaceAvatarDialog({ workspace, onClose, onChanged, onNotice }: {
  workspace: WorkspaceSummary;
  onClose: () => void;
  onChanged: (avatarUrl: string | null, avatarUpdatedAt: string | null) => void;
  onNotice: (message: string, tone?: NoticeTone) => void;
}) {
  const confirmAction = useAppConfirm();
  const inputRef = useRef<HTMLInputElement>(null);
  const [prompt, setPrompt] = useState("");
  const [preview, setPreview] = useState<{ blob: Blob; url: string } | null>(null);
  const [busy, setBusy] = useState<"upload" | "generate" | "remove" | null>(null);
  const [error, setError] = useState("");

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview.url); }, [preview]);

  async function chooseImage(file: File | undefined) {
    if (!file) return;
    setError("");
    try {
      const blob = await prepareWorkspaceAvatar(file);
      setPreview((current) => {
        if (current) URL.revokeObjectURL(current.url);
        return { blob, url: URL.createObjectURL(blob) };
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "이미지를 읽지 못했습니다.");
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function applyUpload() {
    if (!preview || busy) return;
    setBusy("upload");
    setError("");
    const form = new FormData();
    form.append("image", new File([preview.blob], "workspace-avatar.webp", { type: "image/webp" }));
    try {
      const response = await fetch("/api/workspaces/avatar", { method: "PUT", body: form });
      const data = await response.json().catch(() => ({})) as { avatarUrl?: string | null; avatarUpdatedAt?: string | null; error?: string };
      if (!response.ok) throw new Error(data.error ?? "이미지를 저장하지 못했습니다.");
      onChanged(data.avatarUrl ?? null, data.avatarUpdatedAt ?? null);
      setPreview(null);
      onNotice("워크스페이스 이미지를 적용했습니다.", "success");
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "이미지를 저장하지 못했습니다.");
    } finally {
      setBusy(null);
    }
  }

  async function generateImage() {
    if (busy) return;
    setBusy("generate");
    setError("");
    try {
      const response = await fetch("/api/workspaces/avatar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const data = await response.json().catch(() => ({})) as { avatarUrl?: string | null; avatarUpdatedAt?: string | null; error?: string };
      if (!response.ok) throw new Error(data.error ?? "AI 이미지를 만들지 못했습니다.");
      onChanged(data.avatarUrl ?? null, data.avatarUpdatedAt ?? null);
      setPreview(null);
      onNotice("AI 이미지를 만들어 바로 적용했습니다.", "success");
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : "AI 이미지를 만들지 못했습니다.");
    } finally {
      setBusy(null);
    }
  }

  async function removeImage() {
    if (busy || !workspace.avatarUrl) return;
    if (!await confirmAction({ title: "워크스페이스 이미지 초기화", message: "현재 이미지를 지우고 워크스페이스 이름의 첫 글자로 되돌립니다.", confirmLabel: "이미지 지우기", danger: true })) return;
    setBusy("remove");
    setError("");
    try {
      const response = await fetch("/api/workspaces/avatar", { method: "DELETE" });
      const data = await response.json().catch(() => ({})) as { avatarUpdatedAt?: string | null; error?: string };
      if (!response.ok) throw new Error(data.error ?? "이미지를 지우지 못했습니다.");
      onChanged(null, data.avatarUpdatedAt ?? null);
      setPreview(null);
      onNotice("워크스페이스 이미지를 초기화했습니다.", "success");
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : "이미지를 지우지 못했습니다.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <OverlayDialog title="워크스페이스 이미지" initialFocus="textarea" onRequestClose={() => onClose()}>
      {(requestClose) => <section className="workspace-avatar-dialog">
        <header><div><h2>워크스페이스 이미지</h2><p>{workspace.name}을 알아보기 쉽게 꾸며보세요.</p></div><button className="icon-button" onClick={() => requestClose("close-button")} aria-label="워크스페이스 이미지 닫기"><X size={17} /></button></header>
        <div className="workspace-avatar-stage">
          {preview ? <img src={preview.url} alt="업로드할 워크스페이스 이미지 미리보기" /> : <WorkspaceAvatar workspace={workspace} className="workspace-avatar-preview" />}
          <div><b>{preview ? "이 이미지로 바꿀까요?" : workspace.avatarUrl ? "현재 이미지" : "기본 이미지"}</b><p>정사각형으로 잘라 작은 화면에서도 선명하게 표시합니다.</p></div>
        </div>
        <section className="workspace-avatar-option">
          <div><Upload size={16} /><span><b>내 이미지 업로드</b><small>PNG, JPEG, WebP · 최대 5MB</small></span></div>
          <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => void chooseImage(event.target.files?.[0])} hidden />
          <div className="workspace-avatar-option-actions">
            <button type="button" onClick={() => inputRef.current?.click()} disabled={Boolean(busy)}>{preview ? "다른 이미지" : "이미지 선택"}</button>
            {preview && <button type="button" className="primary" onClick={() => void applyUpload()} disabled={Boolean(busy)}>{busy === "upload" ? <><LoaderCircle className="spin" size={14} />적용 중</> : "이 이미지 사용"}</button>}
          </div>
        </section>
        <section className="workspace-avatar-option workspace-avatar-ai">
          <div><Sparkles size={16} /><span><b>AI로 만들기</b><small>설명을 바꾸고 다시 생성할 수 있습니다.</small></span></div>
          <textarea rows={3} maxLength={240} value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="예: 따뜻한 주황색의 연결된 원, 단순하고 활기찬 느낌" aria-label="AI 이미지 설명" />
          <button type="button" className="primary" onClick={() => void generateImage()} disabled={Boolean(busy)}>{busy === "generate" ? <><LoaderCircle className="spin" size={14} />AI가 만드는 중</> : <><Sparkles size={14} />생성하고 바로 적용</>}</button>
          {busy === "generate" && <p className="workspace-avatar-wait">이미지 생성은 최대 1~2분 걸릴 수 있습니다. 창을 닫지 마세요.</p>}
        </section>
        {error && <p className="workspace-avatar-error" role="alert">{error}</p>}
        <footer><button type="button" className="danger-text" onClick={() => void removeImage()} disabled={Boolean(busy) || !workspace.avatarUrl}><Trash2 size={14} />기본 이미지로 되돌리기</button><button type="button" onClick={() => requestClose("close-button")}>닫기</button></footer>
      </section>}
    </OverlayDialog>
  );
}

async function prepareWorkspaceAvatar(file: File) {
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) throw new Error("PNG, JPEG, WebP 이미지만 선택할 수 있습니다.");
  if (file.size > 10 * 1024 * 1024) throw new Error("원본 이미지는 10MB 이하여야 합니다.");
  const image = await createImageBitmap(file);
  try {
    const size = Math.min(image.width, image.height);
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("이미지를 처리하지 못했습니다.");
    context.drawImage(image, (image.width - size) / 2, (image.height - size) / 2, size, size, 0, 0, 512, 512);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((result) => result ? resolve(result) : reject(new Error("이미지를 처리하지 못했습니다.")), "image/webp", 0.88));
    if (blob.size > 5 * 1024 * 1024) throw new Error("처리한 이미지가 5MB를 초과했습니다.");
    return blob;
  } finally {
    image.close();
  }
}

function PropertyPanel({ currentWorkspace, workspaceCount, themeMode, onThemeModeChange, onClose, onCleanup, onOpenWorkspaceMenu, onOpenTeamMembers, onOpenGroups, onOpenWorkspaceAvatar, onSignOut }: { currentWorkspace?: WorkspaceSummary; workspaceCount: number; themeMode: ThemeMode; onThemeModeChange: (mode: ThemeMode) => void; onClose: () => void; onCleanup: () => void; onOpenWorkspaceMenu: () => void; onOpenTeamMembers: () => void; onOpenGroups: () => void; onOpenWorkspaceAvatar: () => void; onSignOut: () => void }) {
  const themes: { mode: ThemeMode; label: string }[] = [
    { mode: "beige", label: "베이지" },
    { mode: "gray", label: "그레이" },
    { mode: "dark", label: "다크" },
  ];
  const canChangeAvatar = Boolean(currentWorkspace && !currentWorkspace.personal && (currentWorkspace.role === "owner" || currentWorkspace.role === "admin"));
  return <OverlayDialog title="내 설정" variant="drawer" onRequestClose={() => onClose()}>{(requestClose) => <aside className="property-panel"><header><div><h2>내 설정</h2><p>화면, 워크스페이스와 팀 설정</p></div><button className="icon-button" onClick={() => requestClose("close-button")} aria-label="내 설정 닫기" title="내 설정 닫기"><X size={17} /></button></header><section className="settings-section appearance-settings"><h3>테마</h3><div className="theme-picker" role="group" aria-label="색상 테마">{themes.map(({ mode, label }) => <button className={themeMode === mode ? "active" : ""} aria-pressed={themeMode === mode} onClick={() => onThemeModeChange(mode)} key={mode}><i className={`theme-swatch theme-swatch-${mode}`} aria-hidden="true" /><span>{label}</span></button>)}</div><p>선택한 테마는 이 브라우저에 저장됩니다.</p></section><section className="settings-section"><h3>워크스페이스</h3><div className="settings-workspace-card"><WorkspaceAvatar workspace={currentWorkspace} /><div><b>{currentWorkspace?.name || "개인 워크스페이스"}</b><small>{currentWorkspace?.personal ? "개인 워크스페이스" : `${teamRoleLabel(currentWorkspace?.role ?? "member")} · 전체 ${workspaceCount}개`}</small></div></div><div className="settings-action-grid">{canChangeAvatar && <button onClick={onOpenWorkspaceAvatar}><ImageIcon size={13} />워크스페이스 이미지</button>}<button onClick={onOpenWorkspaceMenu}><Columns3 size={13} />워크스페이스 관리</button><button onClick={onOpenTeamMembers}><Users size={13} />멤버 관리</button><button onClick={onOpenGroups}><AtSign size={13} />그룹 관리</button></div></section><section className="settings-hint"><Settings2 size={15} /><div><b>Project 속성</b><p>Project 화면의 속성 관리 탭에서 추가하거나 삭제할 수 있습니다.</p></div></section><section className="settings-account-actions"><button onClick={onSignOut}><LogOut size={13} />Google 계정 로그아웃</button></section><section className="settings-danger-zone"><div><b>OKR 데이터 정리</b><p>워크스페이스와 그룹은 남기고 OKR 실행 데이터를 휴지통으로 보냅니다.</p></div><button onClick={onCleanup}><Trash2 size={13} />클린업 열기</button></section></aside>}</OverlayDialog>;
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
  const panelDirty = Boolean(email.trim() || inviteDisplayName.trim() || groupName.trim() || editingMemberId);

  return (
    <OverlayDialog title="팀 관리" variant="drawer" dirty={panelDirty} onRequestClose={() => onClose()}>
      {(requestClose) => <aside className="property-panel team-panel">
        <header>
          <div className="team-panel-heading">{team && <WorkspaceAvatar workspace={team.workspace} />}<span><h2>팀</h2><p>{team ? `${team.workspace.name} · ${team.members.length}명 · ${activeGroupCount}개 그룹` : "불러오는 중"}</p></span></div>
          <button className="icon-button" onClick={() => requestClose("close-button")} aria-label="닫기"><X size={17} /></button>
        </header>
        <div className="team-tabs" role="tablist" aria-label="팀 관리">
          <button role="tab" aria-selected={tab === "members"} className={tab === "members" ? "active" : ""} onClick={() => { setTab("members"); setSelectedGroupId(null); clearGroupUrl(); }}><Users size={14} />멤버</button>
          <button role="tab" aria-selected={tab === "groups"} className={tab === "groups" ? "active" : ""} onClick={() => setTab("groups")}><AtSign size={14} />그룹</button>
        </div>
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
      </aside>}
    </OverlayDialog>
  );
}

function GroupDetail({ detail, team, onBack, onChange, onGroupChange, onDeleted, onNotice }: { detail: GroupDetailData; team: TeamData; onBack: () => void; onChange: (next: GroupDetailData) => void; onGroupChange: (group: WorkspaceGroup) => void; onDeleted: (id: string) => void; onNotice: (message: string) => void }) {
  const confirmAction = useAppConfirm();
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
    if (!await confirmAction({ title: "그룹 삭제", message: `'${detail.group.name}' 그룹의 멤버와 설정이 함께 삭제됩니다.`, confirmLabel: "그룹 삭제", danger: true })) return;
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
  return <OverlayDialog title="ChatGPT 연동" onRequestClose={() => onClose()}>{(requestClose) => <section className="integration-modal"><header><h2>ChatGPT 연동</h2><button className="icon-button" onClick={() => requestClose("close-button")} aria-label="닫기"><X size={17} /></button></header><div className="integration-sections">
    <section className="integration-card chatgpt-simple">
      <header><Bot size={18} /><div><b>ChatGPT에 OKRPTR MCP 연결</b><p>문구를 복사해 브라우저 제어가 가능한 ChatGPT 대화에 붙여넣으면 설정 화면에서 연결을 진행합니다.</p></div><div className={`connection-state ${hasConnectedConversation ? "active" : connections.length > 0 ? "pending" : "inactive"}`}><i />{connectionStatus}</div></header>
      <div className="chatgpt-simple-actions"><button className="copy-primary" onClick={() => void copyChatGptConnectionPrompt()} disabled={creatingConnection}>{creatingConnection ? <LoaderCircle className="spin" size={13} /> : <Copy size={13} />}{creatingConnection ? "복사 준비 중" : "ChatGPT 연결 문구 복사"}</button></div>
      <details className="connection-management"><summary><span>연결 관리</span><ChevronDown size={13} /></summary><div><span>발급된 연결 키 {connections.length}개</span>{connections.length > 0 && <button onClick={() => void revokeChatGptConnections()} disabled={revokingConnections}>{revokingConnections ? "해제 중" : "연결 해제"}</button>}</div></details>
    </section>
  </div><footer><span><CheckCircle2 size={15} />OKR · Objective → Key Result → Initiative → Project → Task / Routine → Task</span><button onClick={() => requestClose("close-button")}>닫기</button></footer></section>}</OverlayDialog>;
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
    onNotice("Slack 연결을 해제했습니다. 자동화 규칙은 보관됩니다.");
  }

  function connectGoogle() {
    if (!google?.configured) return;
    window.location.href = `/api/google/auth?returnTo=${encodeURIComponent("/")}`;
  }

  function connectSlack() {
    if (!slack?.configured || !canManageSlack) return;
    window.location.href = `/api/slack/auth?returnTo=${encodeURIComponent("/")}`;
  }

  return <OverlayDialog title="앱 연동" onRequestClose={() => onClose()}>{(requestClose) => <section className="integration-modal app-integrations-modal">
    <header><div><h2>앱 연동</h2><p>업무가 움직일 때 팀이 있는 곳으로 바로 전달합니다.</p></div><button className="icon-button" onClick={() => requestClose("close-button")} aria-label="닫기"><X size={17} /></button></header>
    <div className="integration-sections">
      <section className="integration-card compact-integration-card">
        <header><CalendarDays size={18} /><div><b>Google Calendar</b><p>{google?.connected ? `${google.email} 계정으로 연결됨` : "내 Task 일정을 개인 캘린더와 연결"}</p></div><span className={google?.connected ? "connection-live" : "connection-local"} /></header>
        <div className="integration-scope"><b>개인 연결</b><span>현재 사용자에게만 적용</span></div>
        <div className="integration-actions">{google?.connected ? <button className="secondary-danger" onClick={() => void disconnectGoogle()} disabled={disconnectingGoogle}>{disconnectingGoogle ? "해제 중" : "연결 해제"}</button> : <button onClick={connectGoogle} disabled={!google?.configured}>{google?.configured ? "Google로 연결" : "준비 중"}</button>}<small>{google?.configured ? "일정 생성 및 수정" : "서버 연결 설정이 필요합니다."}</small></div>
      </section>
      <section className="integration-card slack-integration-card">
        <header><Hash size={18} /><div><b>Slack</b><p>{slack?.connected ? `${slack.teamName}에 OKRPTR 봇 연결됨` : "업무 이벤트를 원하는 채널로 자동 전송"}</p></div><span className={slack?.connected ? "connection-live" : "connection-local"} /></header>
        <div className="integration-scope"><b>워크스페이스 연결</b><span>{workspaceName} 전체에 적용</span></div>
        <div className="integration-actions">{slack?.connected ? <button className="secondary-danger" onClick={() => void disconnectSlack()} disabled={disconnectingSlack || !canManageSlack}>{disconnectingSlack ? "해제 중" : canManageSlack ? "연결 해제" : "관리자만 변경"}</button> : <button onClick={connectSlack} disabled={!slack?.configured || !canManageSlack}>{!canManageSlack ? "관리자만 연결" : slack?.configured ? "Slack에 연결" : "준비 중"}</button>}<small>{slack?.connected ? "/okrptr 수집 · 자동 알림" : "연결 후 자동화 봇을 만들 수 있습니다."}</small></div>
        <SlackAutomationManager connected={Boolean(slack?.connected)} canManage={canManageSlack} workspaceName={workspaceName} onNotice={onNotice} />
      </section>
    </div>
    <footer><span><Plug size={15} />자동화는 연결된 OKRPTR Slack 봇으로 전송됩니다.</span><button onClick={() => requestClose("close-button")}>닫기</button></footer>
  </section>}</OverlayDialog>;
}

type SlackAutomationDraft = {
  name: string;
  triggerType: SlackAutomationTrigger;
  triggerStatus: string;
  channelId: string;
  messageTemplate: string;
  active: boolean;
};

const slackAutomationDefaults: Record<SlackAutomationTrigger, string> = {
  task_created: "새 업무가 등록되었습니다.\n*{{title}}*\n상태: {{status}} · 우선순위: {{priority}} · {{workspace}}",
  task_status_changed: "*{{title}}* 상태가 `{{from_status}}` → `{{status}}`로 바뀌었습니다.\n우선순위: {{priority}} · {{workspace}}",
};

function emptySlackAutomationDraft(triggerType: SlackAutomationTrigger = "task_created"): SlackAutomationDraft {
  return { name: "", triggerType, triggerStatus: "", channelId: "", messageTemplate: slackAutomationDefaults[triggerType], active: true };
}

async function fetchSlackAutomationData() {
  const response = await fetch("/api/slack/automations");
  const data = await response.json() as { automations?: SlackAutomation[]; deliveries?: SlackAutomationDelivery[]; error?: string };
  if (!response.ok) throw new Error(data.error || "자동화를 불러오지 못했습니다.");
  return { automations: data.automations ?? [], deliveries: data.deliveries ?? [] };
}

function SlackAutomationManager({ connected, canManage, workspaceName, onNotice }: { connected: boolean; canManage: boolean; workspaceName: string; onNotice: (message: string) => void }) {
  const confirmAction = useAppConfirm();
  const [automations, setAutomations] = useState<SlackAutomation[]>([]);
  const [deliveries, setDeliveries] = useState<SlackAutomationDelivery[]>([]);
  const [loading, setLoading] = useState(connected);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<SlackAutomationDraft>(emptySlackAutomationDraft());
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!connected) return;
    let active = true;
    void fetchSlackAutomationData()
      .then((data) => {
        if (!active) return;
        setAutomations(data.automations);
        setDeliveries(data.deliveries);
      })
      .catch((error: unknown) => { if (active) onNotice(error instanceof Error ? error.message : "자동화를 불러오지 못했습니다."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [connected, onNotice]);

  async function loadAutomations(showLoading = true) {
    if (showLoading) setLoading(true);
    try {
      const data = await fetchSlackAutomationData();
      setAutomations(data.automations);
      setDeliveries(data.deliveries);
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "자동화를 불러오지 못했습니다.");
    } finally {
      if (showLoading) setLoading(false);
    }
  }

  function startCreate() {
    setEditingId(null);
    setDraft(emptySlackAutomationDraft());
    setFormOpen(true);
  }

  function startEdit(automation: SlackAutomation) {
    setEditingId(automation.id);
    setDraft({ name: automation.name, triggerType: automation.triggerType, triggerStatus: automation.triggerStatus, channelId: automation.channelId, messageTemplate: automation.messageTemplate, active: automation.active });
    setFormOpen(true);
  }

  async function saveAutomation(event: FormEvent) {
    event.preventDefault();
    if (!draft.name.trim() || !draft.channelId.trim() || !draft.messageTemplate.trim()) { onNotice("이름, 채널 ID, 메시지를 모두 입력해 주세요."); return; }
    setSaving(true);
    try {
      const response = await fetch("/api/slack/automations", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...(editingId ? { id: editingId } : {}), ...draft }),
      });
      const data = await response.json() as { automation?: SlackAutomation; error?: string };
      if (!response.ok || !data.automation) throw new Error(data.error || "자동화를 저장하지 못했습니다.");
      setAutomations((current) => editingId ? current.map((entry) => entry.id === editingId ? data.automation! : entry) : [data.automation!, ...current]);
      setFormOpen(false);
      setEditingId(null);
      onNotice(editingId ? "Slack 자동화를 수정했습니다." : "Slack 자동화를 만들었습니다. 테스트 전송으로 확인해 보세요.");
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "자동화를 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleAutomation(automation: SlackAutomation) {
    setBusyId(automation.id);
    try {
      const response = await fetch("/api/slack/automations", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: automation.id, active: !automation.active }) });
      const data = await response.json() as { automation?: SlackAutomation; error?: string };
      if (!response.ok || !data.automation) throw new Error(data.error || "상태를 바꾸지 못했습니다.");
      setAutomations((current) => current.map((entry) => entry.id === automation.id ? data.automation! : entry));
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "상태를 바꾸지 못했습니다.");
    } finally {
      setBusyId(null);
    }
  }

  async function testSend(automation: SlackAutomation) {
    setBusyId(automation.id);
    try {
      const response = await fetch("/api/slack/automations/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: automation.id }) });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "테스트 전송에 실패했습니다.");
      onNotice(`#${automation.channelId} 채널로 테스트 메시지를 보냈습니다.`);
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "테스트 전송에 실패했습니다.");
    } finally {
      await loadAutomations(false);
      setBusyId(null);
    }
  }

  async function removeAutomation(automation: SlackAutomation) {
    if (!await confirmAction({ title: "Slack 자동화 삭제", message: `'${automation.name}' 자동화와 전송 기록을 삭제합니다.`, confirmLabel: "자동화 삭제", danger: true })) return;
    setBusyId(automation.id);
    try {
      const response = await fetch(`/api/slack/automations?id=${encodeURIComponent(automation.id)}`, { method: "DELETE" });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "자동화를 삭제하지 못했습니다.");
      setAutomations((current) => current.filter((entry) => entry.id !== automation.id));
      setDeliveries((current) => current.filter((entry) => entry.automationId !== automation.id));
      onNotice("Slack 자동화를 삭제했습니다.");
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "자동화를 삭제하지 못했습니다.");
    } finally {
      setBusyId(null);
    }
  }

  if (!connected) return <div className="slack-automation-locked"><Zap size={16} /><div><b>Slack 자동화</b><p>Slack을 연결하면 업무 생성과 상태 변경을 채널로 자동 전송할 수 있습니다.</p></div></div>;

  return <div className="slack-automation-manager">
    <div className="slack-automation-heading"><div><span>SLACK AUTOMATION</span><h3>자동화 봇</h3><p>{workspaceName}의 업무 트리거마다 채널과 메시지를 정합니다.</p></div>{canManage && <button type="button" onClick={startCreate}><Plus size={14} />새 자동화</button>}</div>
    <div className="slack-bot-note"><Bot size={15} /><p>각 자동화는 독립된 규칙으로 작동하며, 메시지는 연결된 <b>OKRPTR 봇</b> 이름으로 전송됩니다.</p></div>
    {formOpen && <form className="slack-automation-form" onSubmit={(event) => void saveAutomation(event)}>
      <div className="slack-form-title"><b>{editingId ? "자동화 수정" : "새 자동화"}</b><button type="button" className="icon-button" onClick={() => setFormOpen(false)} aria-label="작성 취소"><X size={14} /></button></div>
      <div className="slack-form-grid">
        <label><span>자동화 이름</span><input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="예: 새 업무 알림" maxLength={80} /></label>
        <label><span>Slack 채널 ID</span><input value={draft.channelId} onChange={(event) => setDraft({ ...draft, channelId: event.target.value.toUpperCase() })} placeholder="C0123456789" maxLength={32} /></label>
        <label><span>트리거</span><select value={draft.triggerType} onChange={(event) => { const triggerType = event.target.value as SlackAutomationTrigger; setDraft({ ...draft, triggerType, triggerStatus: "", messageTemplate: slackAutomationDefaults[triggerType] }); }}><option value="task_created">업무가 생성될 때</option><option value="task_status_changed">업무 상태가 바뀔 때</option></select></label>
        {draft.triggerType === "task_status_changed" && <label><span>바뀐 상태</span><select value={draft.triggerStatus} onChange={(event) => setDraft({ ...draft, triggerStatus: event.target.value })}><option value="">모든 상태</option>{(["backlog", "todo", "policy_discussion", "in_progress", "developing", "development_done", "done", "blocked"] as ItemStatus[]).map((status) => <option value={status} key={status}>{statusLabel(status)}</option>)}</select></label>}
      </div>
      <label className="slack-message-field"><span>보낼 메시지</span><textarea value={draft.messageTemplate} onChange={(event) => setDraft({ ...draft, messageTemplate: event.target.value })} maxLength={3000} rows={4} /></label>
      <div className="slack-variable-row"><span>변수</span>{["{{title}}", "{{status}}", "{{from_status}}", "{{priority}}", "{{workspace}}"].map((variable) => <button type="button" key={variable} onClick={() => setDraft({ ...draft, messageTemplate: `${draft.messageTemplate}${draft.messageTemplate.endsWith(" ") || draft.messageTemplate.endsWith("\n") ? "" : " "}${variable}` })}>{variable}</button>)}</div>
      <p className="slack-channel-help">채널 상세정보에서 채널 ID를 복사하세요. 비공개 채널은 OKRPTR 봇을 먼저 초대해야 합니다.</p>
      <div className="slack-form-actions"><label><input type="checkbox" checked={draft.active} onChange={(event) => setDraft({ ...draft, active: event.target.checked })} /><span>저장 즉시 활성화</span></label><div><button type="button" onClick={() => setFormOpen(false)}>취소</button><button type="submit" disabled={saving}>{saving ? <LoaderCircle className="spin" size={13} /> : <Check size={13} />}{saving ? "저장 중" : "저장"}</button></div></div>
    </form>}
    {loading ? <div className="slack-automation-loading"><LoaderCircle className="spin" size={16} />자동화를 불러오는 중</div> : automations.length === 0 ? <div className="slack-automation-empty"><Zap size={18} /><b>아직 자동화가 없습니다.</b><p>{canManage ? "새 자동화를 만들어 첫 Slack 알림을 보내보세요." : "워크스페이스 관리자가 자동화를 만들 수 있습니다."}</p></div> : <div className="slack-automation-list">{automations.map((automation) => <article key={automation.id} className={automation.active ? "" : "inactive"}>
      <div className="slack-automation-main"><span className={`slack-delivery-dot ${automation.lastDeliveryStatus}`} /><div><b>{automation.name}</b><p>{slackTriggerLabel(automation)} · #{automation.channelId}</p></div><span className={`slack-automation-state ${automation.active ? "active" : ""}`}>{automation.active ? "활성" : "중지"}</span></div>
      <div className="slack-automation-meta">{automation.lastDeliveryStatus === "never" ? "아직 전송 이력 없음" : automation.lastDeliveryStatus === "sent" ? `${formatSlackAutomationTime(automation.lastTriggeredAt)} 전송 성공` : automation.lastError || "최근 전송 실패"}</div>
      {canManage && <div className="slack-automation-actions"><button type="button" onClick={() => void testSend(automation)} disabled={busyId === automation.id}>{busyId === automation.id ? <LoaderCircle className="spin" size={12} /> : <Send size={12} />}테스트</button><button type="button" onClick={() => void toggleAutomation(automation)} disabled={busyId === automation.id}>{automation.active ? "중지" : "활성화"}</button><button type="button" onClick={() => startEdit(automation)}><Pencil size={12} />수정</button><button type="button" className="danger" onClick={() => void removeAutomation(automation)} disabled={busyId === automation.id} aria-label={`${automation.name} 삭제`}><Trash2 size={12} /></button></div>}
    </article>)}</div>}
    {deliveries.length > 0 && <details className="slack-delivery-history"><summary>최근 전송 기록 <span>{deliveries.length}</span><ChevronDown size={13} /></summary><div>{deliveries.slice(0, 8).map((delivery) => <div key={delivery.id}><span className={`slack-delivery-dot ${delivery.status}`} /><p><b>{delivery.status === "sent" ? "전송 성공" : delivery.status === "failed" ? "전송 실패" : "전송 중"}</b><small>#{delivery.channelId} · {formatSlackAutomationTime(delivery.sentAt || delivery.createdAt)}</small>{delivery.error && <em>{delivery.error}</em>}</p></div>)}</div></details>}
  </div>;
}

function slackTriggerLabel(automation: SlackAutomation) {
  if (automation.triggerType === "task_created") return "업무 생성";
  return automation.triggerStatus ? `상태 변경 → ${statusLabel(automation.triggerStatus as ItemStatus)}` : "모든 상태 변경";
}

function formatSlackAutomationTime(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function EmptyState({ icon: Icon, title }: { icon: LucideIcon; title: string }) { return <div className="empty-state"><Icon size={22} /><span>{title}</span></div>; }

const statusLabels: Record<ItemStatus, string> = { backlog: "\uBC31\uB85C\uADF8", todo: "\uD560 \uC77C", policy_discussion: "\uC815\uCC45 \uB17C\uC758 \uC911", in_progress: "\uC9C4\uD589 \uC911", developing: "\uAC1C\uBC1C \uC911", development_done: "\uAC1C\uBC1C \uC644\uB8CC", done: "\uC644\uB8CC", blocked: "\uB9C9\uD798", archived: "\uD734\uC9C0\uD1B5" };
const priorityLabels: Record<Priority, string> = { low: "낮음", medium: "보통", high: "높음", urgent: "긴급" };
const groupColors: GroupColor[] = ["gray", "blue", "green", "yellow", "orange", "red", "purple"];

function buildDepths(items: OkrptrItem[]) { const byId = new Map(items.map((entry) => [entry.id, entry])); const result: Record<string, number> = {}; for (const entry of items) { let depth = 0; let current = entry; while (current.parentId && depth < 5) { depth += 1; const parent = byId.get(current.parentId); if (!parent) break; current = parent; } result[entry.id] = depth; } return result; }
function filterTreeItemsByCycle(items: OkrptrItem[], cycleId: string | null) {
  if (!cycleId) return items;
  const sourceOrder = new Map(items.map((entry, index) => [entry.id, index]));
  const byParent = new Map<string | null, OkrptrItem[]>();
  for (const entry of items) byParent.set(entry.parentId, [...(byParent.get(entry.parentId) ?? []), entry]);
  const sortSiblings = (left: OkrptrItem, right: OkrptrItem) => {
    const leftOrder = Number.isFinite(left.sortOrder) ? left.sortOrder : sourceOrder.get(left.id) ?? 0;
    const rightOrder = Number.isFinite(right.sortOrder) ? right.sortOrder : sourceOrder.get(right.id) ?? 0;
    return leftOrder - rightOrder || left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id);
  };
  for (const children of byParent.values()) children.sort(sortSiblings);

  const included = new Set<string>();
  const ordered: OkrptrItem[] = [];
  const visit = (entry: OkrptrItem) => {
    if (included.has(entry.id)) return;
    included.add(entry.id);
    ordered.push(entry);
    for (const child of byParent.get(entry.id) ?? []) visit(child);
  };
  const cycleNodes = items.filter((entry) => ["objective", "key_result", "initiative"].includes(entry.kind) && entry.cycleId === cycleId).sort(sortSiblings);
  cycleNodes.filter((entry) => entry.kind === "objective").forEach(visit);
  cycleNodes.forEach(visit);
  return ordered;
}
function kindAbbr(kind: ItemKind) { return { objective: "O", key_result: "KR", initiative: "I", project: "P", task: "T" }[kind]; }
function kindLabel(kind: ItemKind) { return { objective: "Objective", key_result: "Key Result", initiative: "Initiative", project: "Project", task: "Task" }[kind]; }
function statusLabel(status: ItemStatus) { return statusLabels[status]; }
function isCompletedStatus(status: ItemStatus) { return status === "done" || status === "development_done"; }
function cycleStatusLabel(status: OkrCycle["status"]) { return { planned: "\uC608\uC815", active: "\uC9C4\uD589 \uC911", closed: "\uC885\uB8CC" }[status]; }
function sourceLabel(source: string) { return { mcp: "MCP", codex: "Codex", slack: "Slack", discord: "Discord", telegram: "Telegram", web: "Web" }[source] ?? "Bot"; }
function propertyTypeLabel(type: PropertyType) { return { text: "텍스트", number: "숫자", select: "선택", date: "날짜", checkbox: "체크박스", member: "멤버 1명", members: "멤버 여러 명" }[type]; }
function propertySystemDefault(properties: PropertyDefinition[], systemKey: string, fallback: string) { const value = properties.find((property) => property.systemKey === systemKey && property.active)?.defaultValue; return typeof value === "string" ? value : fallback; }
function teamRoleLabel(role: TeamRole) { return { owner: "Owner", admin: "Admin", member: "Member", viewer: "Viewer" }[role]; }
function workspaceDeletionLabel(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "30일 후 영구 삭제";
  const days = Math.max(0, Math.ceil((date.getTime() - Date.now()) / 86_400_000));
  const deletionDate = date.toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" });
  return `${days}일 남음 · ${deletionDate} 영구 삭제`;
}
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
function pageSubtitle(view: View) { return { home: "자유롭게 이야기하면 OKR과 실행 항목으로 정리", my_work: "내가 담당하는 Project, Task, Routine", inbox: "워크스페이스 전체 Task 목록", work: "Initiative 아래의 Project 속성과 상태 관리", routines: "OKR과 독립된 반복 실행과 하위 Task 관리", okr: "Objective부터 Project·Task까지의 OKR 실행 구조", scrum: "어제, 오늘, 막힘", recommendations: "현재 데이터에서 계산한 다음 정리 항목", reviews: "주기별 진행과 막힘", trash: "삭제한 Project·Task와 전체 데이터 정리 기록" }[view]; }
function routineCadenceLabel(cadence: RoutineCadence) { return { daily: "매일", weekly: "매주", monthly: "매월" }[cadence]; }
function recommendationIcon(kind: Recommendation["kind"]) { if (kind === "blocked") return "!"; if (kind === "overdue") return "D"; if (kind === "due_soon") return "3"; return "P"; }
