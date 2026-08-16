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
  Filter,
  Hash,
  Inbox,
  LayoutDashboard,
  Lightbulb,
  Link2,
  ListChecks,
  Languages,
  LockKeyhole,
  MoreHorizontal,
  Plus,
  Repeat2,
  RotateCcw,
  Search,
  Settings2,
  Table2,
  Target,
  TextCursorInput,
  Trash2,
  UserPlus,
  Users,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";

type View = "home" | "inbox" | "work" | "routines" | "okr" | "scrum" | "recommendations" | "reviews";
type Cadence = "daily" | "weekly" | "monthly" | "quarterly";
type ItemStatus = "inbox" | "todo" | "in_progress" | "done" | "blocked";
type ItemKind = "objective" | "key_result" | "initiative" | "project" | "task";
type Priority = "low" | "medium" | "high" | "urgent";
type PropertyType = "text" | "number" | "select" | "date" | "checkbox";
type PropertyValue = string | number | boolean | null;
type RoutineCadence = "daily" | "weekly" | "monthly";
type TeamRole = "owner" | "admin" | "member" | "viewer";
type GroupColor = "gray" | "blue" | "green" | "yellow" | "orange" | "red" | "purple";
type GroupVisibility = "open" | "private";
type GroupRole = "lead" | "member";

type OkrptrItem = {
  id: string;
  parentId: string | null;
  kind: ItemKind;
  title: string;
  description: string;
  status: ItemStatus;
  priority: Priority;
  cadence: Cadence;
  progress: number;
  dueDate: string | null;
  source: string;
  createdAt: string;
  updatedAt: string;
};

type PropertyDefinition = {
  id: string;
  name: string;
  type: PropertyType;
  options: string[];
  sortOrder: number;
};

type PropertyValueMap = Record<string, Record<string, PropertyValue>>;
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
type GroupDetailData = { group: WorkspaceGroup; members: GroupMember[]; canManageMembers: boolean };
type WorkspaceSummary = { id: string; name: string; personal: boolean; role: TeamRole; current: boolean };

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
      { title: "Task를 데이터베이스처럼", description: "관계, 상태, 기한과 필요한 속성을 추가해 팀의 방식대로 관리합니다." },
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
      { title: "Manage tasks like a database", description: "Add relations, status, due dates, and custom properties that fit the way your team works." },
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
      { title: "タスクをデータベースのように管理", description: "関連、ステータス、期限、カスタムプロパティをチームに合わせて追加できます。" },
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
      { title: "像数据库一样管理任务", description: "通过关系、状态、截止日期和自定义属性适配团队的工作方式。" },
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
      { title: "Gestiona tareas como una base de datos", description: "Añade relaciones, estados, fechas y propiedades adaptadas a la forma de trabajar de tu equipo." },
      { title: "Mantén visible la ejecución diaria", description: "Las rutinas, el scrum diario y las recomendaciones aclaran tus próximas prioridades." },
    ],
    mcpAction: "Ver conexión MCP",
    startAction: "Empezar",
  },
};

const fallbackItems: OkrptrItem[] = [
  item("obj", null, "objective", "셀프 서브 도입으로 팀의 성장 속도를 높인다", "in_progress", "quarterly", 68),
  item("kr", "obj", "key_result", "신규 사용자의 첫 주 활성화율 32% → 48%", "in_progress", "monthly", 61),
  item("ini", "kr", "initiative", "가입 후 10분 안에 첫 가치 경험 만들기", "in_progress", "monthly", 54),
  item("project", "ini", "project", "온보딩 활성화 개선", "in_progress", "monthly", 52),
  item("task-1", "project", "task", "온보딩 체크리스트 실험", "in_progress", "weekly", 50, "2026-08-20", "web", "high"),
  item("task-2", "project", "task", "결제 화면 카피 확정", "in_progress", "weekly", 40, "2026-08-15", "web", "high"),
  item("task-3", "project", "task", "활성화 이벤트 QA", "todo", "weekly", 0, "2026-08-17"),
  item("task-4", "project", "task", "신규 사용자 5명 인터뷰", "todo", "weekly", 0, "2026-08-19"),
  item("capture-1", null, "task", "가격 정책 페이지 개선 아이디어", "inbox", "weekly", 0, null, "mcp"),
  item("capture-2", null, "task", "모바일 가입 이탈 구간 확인", "inbox", "weekly", 0, null, "slack"),
];

const fallbackProperties: PropertyDefinition[] = [
  { id: "owner", name: "담당", type: "text", options: [], sortOrder: 10 },
  { id: "sprint", name: "스프린트", type: "select", options: ["Sprint 18", "Sprint 19", "Backlog"], sortOrder: 20 },
  { id: "estimate", name: "예상 시간", type: "number", options: [], sortOrder: 30 },
];

const fallbackValues: PropertyValueMap = {
  "task-1": { owner: "태홍", sprint: "Sprint 18", estimate: 6 },
  "task-2": { owner: "민지", sprint: "Sprint 18", estimate: 3 },
  "task-3": { owner: "태홍", sprint: "Sprint 18", estimate: 4 },
  "task-4": { owner: "유진", sprint: "Sprint 19", estimate: 5 },
};

const navItems: { id: View; label: string; icon: LucideIcon }[] = [
  { id: "home", label: "홈", icon: LayoutDashboard },
  { id: "inbox", label: "인박스", icon: Inbox },
  { id: "work", label: "작업", icon: Table2 },
  { id: "routines", label: "루틴", icon: Repeat2 },
  { id: "okr", label: "OKR", icon: Target },
  { id: "scrum", label: "데일리", icon: CalendarCheck },
  { id: "recommendations", label: "추천", icon: Lightbulb },
  { id: "reviews", label: "리뷰", icon: Activity },
];

const cadenceLabels: Record<Cadence, string> = { daily: "일간", weekly: "주간", monthly: "월간", quarterly: "분기" };
const viewTitles: Record<View, string> = {
  home: "홈",
  inbox: "인박스",
  work: "작업",
  routines: "루틴",
  okr: "OKR",
  scrum: "데일리 스크럼",
  recommendations: "추천",
  reviews: "리뷰",
};

export default function Home() {
  const [items, setItems] = useState<OkrptrItem[]>(fallbackItems);
  const [properties, setProperties] = useState<PropertyDefinition[]>(fallbackProperties);
  const [propertyValues, setPropertyValues] = useState<PropertyValueMap>(fallbackValues);
  const [activeView, setActiveView] = useState<View>("work");
  const [cadence, setCadence] = useState<Cadence>("weekly");
  const [taskDisplay, setTaskDisplay] = useState<"table" | "board">("table");
  const [capture, setCapture] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [integrationOpen, setIntegrationOpen] = useState(false);
  const [propertyPanelOpen, setPropertyPanelOpen] = useState(false);
  const [teamPanelOpen, setTeamPanelOpen] = useState(false);
  const [teamPanelTab, setTeamPanelTab] = useState<"members" | "groups">("members");
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [workspaceRules, setWorkspaceRules] = useState<WorkspaceRules | null>(null);
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);
  const [workspaceCreateOpen, setWorkspaceCreateOpen] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState("");
  const [workspaceSaving, setWorkspaceSaving] = useState(false);
  const [createItemOpen, setCreateItemOpen] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [setupChatOpen, setSetupChatOpen] = useState(false);
  const [introLanguage, setIntroLanguage] = useState<IntroLanguage>("ko");
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
    Promise.all([fetch("/api/items"), fetch("/api/properties"), fetch("/api/workspaces"), fetch("/api/workspace-rules")])
      .then(async ([itemsResponse, propertiesResponse, workspacesResponse, rulesResponse]) => {
        if (!itemsResponse.ok || !propertiesResponse.ok || !workspacesResponse.ok || !rulesResponse.ok) throw new Error("offline");
        const itemData = (await itemsResponse.json()) as { items: OkrptrItem[] };
        const propertyData = (await propertiesResponse.json()) as { properties: PropertyDefinition[]; values: PropertyValueMap };
        const workspaceData = (await workspacesResponse.json()) as { workspaces: WorkspaceSummary[] };
        const rulesData = (await rulesResponse.json()) as { rules: WorkspaceRules };
        if (!active) return;
        setItems(itemData.items);
        setProperties(propertyData.properties);
        setPropertyValues(propertyData.values);
        setWorkspaces(workspaceData.workspaces);
        setWorkspaceRules(rulesData.rules);
        if (!rulesData.rules.configured) {
          setActiveView("home");
          setSetupChatOpen(true);
        }
        setConnected(true);
      })
      .catch(() => setConnected(false));
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (workspaceMenuOpen && workspaceCreateOpen) workspaceNameInputRef.current?.focus();
  }, [workspaceMenuOpen, workspaceCreateOpen]);

  const inboxItems = items.filter((entry) => entry.status === "inbox");
  const taskItems = items.filter((entry) => entry.kind === "task");
  const structuredItems = items.filter((entry) => entry.status !== "inbox");
  const periodItems = items.filter(
    (entry) => entry.status !== "inbox" && (cadence === "quarterly" || entry.cadence === cadence || entry.kind === "objective"),
  );
  const objective = items.find((entry) => entry.kind === "objective");
  const completed = periodItems.filter((entry) => entry.status === "done").length;
  const blocked = periodItems.filter((entry) => entry.status === "blocked").length;
  const averageProgress = periodItems.length
    ? Math.round(periodItems.reduce((sum, entry) => sum + entry.progress, 0) / periodItems.length)
    : 0;
  const depths = useMemo(() => buildDepths(structuredItems), [structuredItems]);
  const selectedTask = items.find((entry) => entry.id === selectedTaskId && entry.kind === "task");
  const currentWorkspace = workspaces.find((entry) => entry.current) ?? workspaces[0];

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
      setConnected(true);
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

  function showNotice(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 2200);
  }

  function connectInbox(entry: OkrptrItem) {
    const project = items.find((itemEntry) => itemEntry.kind === "project");
    if (!project) {
      setCreateItemOpen(true);
      showNotice("먼저 Project를 만들어 주세요.");
      return;
    }
    void patchItem(entry.id, { parentId: project.id, status: "todo" });
    showNotice(`‘${project.title}’에 연결했습니다.`);
  }

  function addCreatedItem(created: OkrptrItem) {
    setItems((current) => [...current, created]);
    setCreateItemOpen(false);
    showNotice(`${kindLabel(created.kind)}를 만들었습니다.`);
  }

  async function saveWorkspaceRules(nextRules: WorkspaceRules) {
    const response = await fetch("/api/workspace-rules", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...nextRules, configured: true }),
    });
    if (!response.ok) {
      showNotice("규칙을 저장하지 못했습니다.");
      return false;
    }
    const data = await response.json() as { rules: WorkspaceRules };
    setWorkspaceRules(data.rules);
    showNotice("워크스페이스 규칙을 저장했습니다.");
    return true;
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
                  <button key={workspace.id} onClick={() => void switchWorkspace(workspace.id)} disabled={workspaceSaving}>
                    <span className="workspace-avatar">{workspace.name.slice(0, 1).toLocaleUpperCase()}</span>
                    <span><b>{workspace.name}</b><small>{workspace.personal ? "개인" : teamRoleLabel(workspace.role)}</small></span>
                    {workspace.current && <Check size={14} />}
                  </button>
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
        <nav>
          {navItems.map((entry) => {
            const Icon = entry.icon;
            return (
              <button className={`nav-item ${activeView === entry.id ? "active" : ""}`} key={entry.id} onClick={() => setActiveView(entry.id)}>
                <Icon size={16} /><span>{entry.label}</span>
                {entry.id === "inbox" && inboxItems.length > 0 && <b>{inboxItems.length}</b>}
              </button>
            );
          })}
        </nav>
        <div className="sidebar-section">
          <span>주기</span>
          {(Object.keys(cadenceLabels) as Cadence[]).map((entry) => (
            <button className="nav-item" key={entry} onClick={() => { setCadence(entry); setActiveView("reviews"); }}>
              <CalendarDays size={15} /><span>{cadenceLabels[entry]}</span>
            </button>
          ))}
        </div>
        <div className="sidebar-bottom">
          <button className="nav-item" onClick={() => setIntegrationOpen(true)}><Bot size={16} /><span>MCP 연결</span><i className={connected ? "connection-live" : "connection-local"} /></button>
          <button className="nav-item" onClick={() => { setTeamPanelTab("members"); setTeamPanelOpen(true); }}><Users size={16} /><span>팀 멤버</span></button>
          <button className="nav-item" onClick={() => { setTeamPanelTab("groups"); setTeamPanelOpen(true); }}><AtSign size={16} /><span>그룹 관리</span></button>
          <button className="nav-item" onClick={() => setPropertyPanelOpen(true)}><Settings2 size={16} /><span>속성 관리</span></button>
          <button className="profile-row"><span className="avatar">T</span><span>태홍</span><MoreHorizontal size={15} /></button>
        </div>
      </aside>

      <section className="workspace">
        <header className="workspace-topbar">
          <span>OKRPTR</span><ChevronRight size={13} /><b>{viewTitles[activeView]}</b>
          <div><button aria-label="팀 멤버" title="팀 멤버" onClick={() => { setTeamPanelTab("members"); setTeamPanelOpen(true); }}><Users size={15} /></button><button aria-label="알림" title="알림"><Bell size={15} /></button><button aria-label="서비스 안내" title="서비스 안내" onClick={() => setOnboardingOpen(true)}><CircleHelp size={15} /></button></div>
        </header>
        <div className="page-body">
          <header className="page-header">
            <div><h1>{viewTitles[activeView]}</h1><p>{pageSubtitle(activeView)}</p></div>
            {activeView === "okr" ? (
              <button className="primary-action" onClick={() => setCreateItemOpen(true)}><Plus size={14} />새 항목</button>
            ) : !["scrum", "recommendations", "inbox", "routines"].includes(activeView) ? (
              <CadenceSwitch value={cadence} onChange={setCadence} />
            ) : null}
          </header>

          {(activeView === "home" || activeView === "inbox" || activeView === "work") && (
            <form className="quick-capture" onSubmit={submitCapture}>
              <Plus size={15} />
              <input value={capture} onChange={(event) => setCapture(event.target.value)} placeholder="할 일을 입력하면 인박스에 저장됩니다" aria-label="인박스에 할 일 추가" />
              <button disabled={!capture.trim() || saving}>{saving ? "저장 중" : "추가"}</button>
            </form>
          )}

          {activeView === "home" && <HomeView objective={objective} items={taskItems} rules={workspaceRules} onSaveRules={saveWorkspaceRules} onOpenSetup={() => setSetupChatOpen(true)} onGoToWork={() => setActiveView("work")} onOpenTask={setSelectedTaskId} />}
          {activeView === "inbox" && <InboxView items={inboxItems} onConnect={connectInbox} />}
          {activeView === "work" && (
            <TaskDatabase
              items={taskItems}
              allItems={items}
              properties={properties}
              values={propertyValues}
              display={taskDisplay}
              onDisplayChange={setTaskDisplay}
              onPatch={patchItem}
              onPropertyChange={setPropertyValue}
              onOpenProperties={() => setPropertyPanelOpen(true)}
              onOpenTask={setSelectedTaskId}
            />
          )}
          {activeView === "routines" && <RoutineView onNotice={showNotice} />}
          {activeView === "okr" && <TreeView objective={objective} items={structuredItems} depths={depths} onComplete={(id) => void patchItem(id, { status: "done", progress: 100 })} />}
          {activeView === "scrum" && <DailyScrumView onOpenTask={setSelectedTaskId} onNotice={showNotice} />}
          {activeView === "recommendations" && <RecommendationsView onNavigate={setActiveView} />}
          {activeView === "reviews" && <ReviewView items={periodItems} cadence={cadence} completed={completed} blocked={blocked} averageProgress={averageProgress} />}
        </div>
      </section>

      {notice && <div className="toast">{notice}</div>}
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
      {integrationOpen && <IntegrationModal onClose={() => setIntegrationOpen(false)} />}
      {setupChatOpen && workspaceRules && (
        <SetupChatModal
          rules={workspaceRules}
          onSave={async (rules) => {
            const saved = await saveWorkspaceRules(rules);
            if (saved) setSetupChatOpen(false);
          }}
          onClose={() => setSetupChatOpen(false)}
        />
      )}
      {propertyPanelOpen && (
        <PropertyPanel
          properties={properties}
          onClose={() => setPropertyPanelOpen(false)}
          onCreated={(property) => setProperties((current) => [...current, property])}
          onDeleted={(id) => setProperties((current) => current.filter((entry) => entry.id !== id))}
          onNotice={showNotice}
        />
      )}
      {teamPanelOpen && <TeamPanel initialTab={teamPanelTab} onClose={() => setTeamPanelOpen(false)} onNotice={showNotice} />}
      {createItemOpen && <CreateItemPanel items={items} onClose={() => setCreateItemOpen(false)} onCreated={addCreatedItem} />}
      {selectedTask && (
        <TaskDetailPanel
          task={selectedTask}
          project={items.find((entry) => entry.id === selectedTask.parentId)}
          onClose={() => setSelectedTaskId(null)}
          onProgress={(progress) => setItems((current) => current.map((entry) => entry.id === selectedTask.id ? { ...entry, progress } : entry))}
        />
      )}
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

function CadenceSwitch({ value, onChange }: { value: Cadence; onChange: (value: Cadence) => void }) {
  return <div className="cadence-switch">{(Object.keys(cadenceLabels) as Cadence[]).map((entry) => <button className={value === entry ? "selected" : ""} key={entry} onClick={() => onChange(entry)}>{cadenceLabels[entry]}</button>)}</div>;
}

function TaskDatabase({ items, allItems, properties, values, display, onDisplayChange, onPatch, onPropertyChange, onOpenProperties, onOpenTask }: {
  items: OkrptrItem[];
  allItems: OkrptrItem[];
  properties: PropertyDefinition[];
  values: PropertyValueMap;
  display: "table" | "board";
  onDisplayChange: (display: "table" | "board") => void;
  onPatch: (id: string, patch: Partial<OkrptrItem>) => Promise<void>;
  onPropertyChange: (itemId: string, propertyId: string, value: PropertyValue) => Promise<void>;
  onOpenProperties: () => void;
  onOpenTask: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const visible = items.filter((entry) => entry.title.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  const byId = new Map(allItems.map((entry) => [entry.id, entry]));
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
      {display === "board" ? <BoardView items={visible} onOpenTask={onOpenTask} /> : (
        <div className="database-scroll">
          <div className="task-table" style={{ "--custom-columns": properties.length } as CSSProperties}>
            <div className="task-table-row task-table-head">
              <span><ListChecks size={12} />이름</span><span><Activity size={12} />상태</span><span><Zap size={12} />우선순위</span><span><CalendarDays size={12} />기한</span><span><Link2 size={12} />Project</span>
              {properties.map((property) => <span key={property.id}>{property.type === "number" ? <Hash size={12} /> : <TextCursorInput size={12} />}{property.name}</span>)}
              <button aria-label="속성 추가" title="속성 추가" onClick={onOpenProperties}><Plus size={13} /></button>
            </div>
            {visible.map((entry) => (
              <div className="task-table-row" key={entry.id}>
                <div className="name-cell"><button className={`task-check ${entry.status === "done" ? "checked" : ""}`} onClick={() => void onPatch(entry.id, { status: entry.status === "done" ? "todo" : "done", progress: entry.status === "done" ? entry.progress : 100 })}><Check size={12} /></button><input defaultValue={entry.title} onBlur={(event) => event.target.value.trim() !== entry.title && void onPatch(entry.id, { title: event.target.value })} /></div>
                <select className={`status-select status-${entry.status}`} value={entry.status} onChange={(event) => void onPatch(entry.id, { status: event.target.value as ItemStatus })}>{Object.entries(statusLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select>
                <select className={`priority-${entry.priority}`} value={entry.priority} onChange={(event) => void onPatch(entry.id, { priority: event.target.value as Priority })}>{Object.entries(priorityLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select>
                <input className="date-cell" type="date" value={entry.dueDate ?? ""} onChange={(event) => void onPatch(entry.id, { dueDate: event.target.value || null })} />
                <span className="relation-cell">{entry.parentId ? byId.get(entry.parentId)?.title ?? "연결 없음" : "인박스"}</span>
                {properties.map((property) => <PropertyCell key={property.id} itemId={entry.id} property={property} value={values[entry.id]?.[property.id] ?? null} onChange={onPropertyChange} />)}
                <button className="row-menu" aria-label="Task 상세" title="Task 상세" onClick={() => onOpenTask(entry.id)}><MoreHorizontal size={15} /></button>
              </div>
            ))}
            {!visible.length && <div className="table-empty">표시할 Task가 없습니다.</div>}
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

function TaskDetailPanel({ task, project, onClose, onProgress }: { task: OkrptrItem; project?: OkrptrItem; onClose: () => void; onProgress: (progress: number) => void }) {
  const [rows, setRows] = useState<ChecklistItem[]>([]);
  const [title, setTitle] = useState("");
  useEffect(() => {
    fetch(`/api/checklists?taskId=${encodeURIComponent(task.id)}`)
      .then(async (response) => response.ok ? response.json() as Promise<{ items: ChecklistItem[] }> : Promise.reject())
      .then((data) => setRows(data.items))
      .catch(() => setRows([]));
  }, [task.id]);

  function updateProgress(nextRows: ChecklistItem[]) {
    onProgress(nextRows.length ? Math.round((nextRows.filter((entry) => entry.completed).length / nextRows.length) * 100) : 0);
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

  return <div className="modal-backdrop align-right"><aside className="property-panel task-detail-panel"><header><div><p>{project?.title ?? "인박스"}</p><h2>{task.title}</h2></div><button className="icon-button" onClick={onClose} aria-label="닫기"><X size={17} /></button></header><div className="task-meta"><span className={`status-tag status-${task.status}`}>{statusLabel(task.status)}</span><span><CalendarDays size={13} />{dueLabel(task.dueDate)}</span><b>{task.progress}%</b></div><section className="checklist-section"><header><b>체크리스트</b><span>{rows.filter((entry) => entry.completed).length}/{rows.length}</span></header><div>{rows.map((row) => <div className="checklist-row" key={row.id}><button className={`task-check ${row.completed ? "checked" : ""}`} onClick={() => void toggleRow(row)}><Check size={12} /></button><span className={row.completed ? "completed" : ""}>{row.title}</span><button className="icon-button" onClick={() => void deleteRow(row.id)} aria-label="삭제"><Trash2 size={13} /></button></div>)}</div><form className="checklist-form" onSubmit={addRow}><Plus size={14} /><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="항목 추가" /><button disabled={!title.trim()}>추가</button></form></section></aside></div>;
}

function CreateItemPanel({ items, onClose, onCreated }: { items: OkrptrItem[]; onClose: () => void; onCreated: (item: OkrptrItem) => void }) {
  const [kind, setKind] = useState<ItemKind>("task");
  const [title, setTitle] = useState("");
  const [parentId, setParentId] = useState("");
  const [saving, setSaving] = useState(false);
  const requiredParent: Record<ItemKind, ItemKind | null> = { objective: null, key_result: "objective", initiative: "key_result", project: "initiative", task: "project" };
  const parentKind = requiredParent[kind];
  const parentOptions = parentKind ? items.filter((entry) => entry.kind === parentKind) : [];
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!title.trim() || saving || (kind !== "objective" && kind !== "task" && !parentId)) return;
    setSaving(true);
    const response = await fetch("/api/items", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, kind, parentId: parentId || null, status: kind === "task" && !parentId ? "inbox" : "todo" }) });
    setSaving(false);
    if (!response.ok) return;
    const data = await response.json() as { item: OkrptrItem };
    onCreated(data.item);
  }
  return <div className="modal-backdrop align-right"><aside className="property-panel"><header><div><h2>새 항목</h2><p>OKR 실행 구조에 추가</p></div><button className="icon-button" onClick={onClose}><X size={17} /></button></header><form className="property-form create-item-form" onSubmit={submit}><label><span>유형</span><select value={kind} onChange={(event) => { setKind(event.target.value as ItemKind); setParentId(""); }}>{(["objective", "key_result", "initiative", "project", "task"] as ItemKind[]).map((entry) => <option value={entry} key={entry}>{kindLabel(entry)}</option>)}</select></label><label><span>이름</span><input value={title} onChange={(event) => setTitle(event.target.value)} /></label>{parentKind && <label><span>상위 {kindLabel(parentKind)}</span><select value={parentId} onChange={(event) => setParentId(event.target.value)}><option value="">{kind === "task" ? "인박스에 저장" : "선택"}</option>{parentOptions.map((entry) => <option value={entry.id} key={entry.id}>{entry.title}</option>)}</select></label>}<button disabled={!title.trim() || saving}>{saving ? "저장 중" : "만들기"}</button></form></aside></div>;
}

function RoutineView({ onNotice }: { onNotice: (message: string) => void }) {
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
      .then((data) => setRows(data.routines))
      .catch(() => setRows([]));
  }, [date]);

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
    setRows((current) => [...(current ?? []), data.routine]);
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
      setRows((current) => current?.map((entry) => entry.id === routine.id ? data.routine : entry) ?? null);
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
    setRows((current) => current?.map((entry) => entry.id === routine.id ? data.routine : entry) ?? null);
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
      setRows((current) => current?.filter((entry) => entry.id !== id) ?? null);
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

function HomeView({ objective, items, rules, onSaveRules, onOpenSetup, onGoToWork, onOpenTask }: {
  objective?: OkrptrItem;
  items: OkrptrItem[];
  rules: WorkspaceRules | null;
  onSaveRules: (rules: WorkspaceRules) => Promise<boolean>;
  onOpenSetup: () => void;
  onGoToWork: () => void;
  onOpenTask: (id: string) => void;
}) {
  const activeTasks = items.filter((entry) => entry.status === "in_progress");
  return (
    <div className="home-layout">
      <div className="home-main">
        <section className="home-focus">
          <header>현재 Objective<button onClick={onGoToWork}>작업 보기<ChevronRight size={13} /></button></header>
          {objective ? <div className="home-objective"><Target size={20} /><div><h2>{objective.title}</h2><span><i style={{ width: `${objective.progress}%` }} /></span><small>{objective.progress}% 진행</small></div></div> : <EmptyState icon={Target} title="Objective가 없습니다" />}
        </section>
        {rules && <WorkspaceRulesPanel key={rules.updatedAt} rules={rules} onSave={onSaveRules} onOpenSetup={onOpenSetup} />}
      </div>
      <section className="home-tasks">
        <header>진행 중 Task<b>{activeTasks.length}</b></header>
        {activeTasks.slice(0, 6).map((entry) => <button key={entry.id} onClick={() => onOpenTask(entry.id)}><span className={`status-dot status-${entry.status}`} /><b>{entry.title}</b><small>{dueLabel(entry.dueDate)}</small></button>)}
      </section>
    </div>
  );
}

function WorkspaceRulesPanel({ rules, onSave, onOpenSetup }: { rules: WorkspaceRules; onSave: (rules: WorkspaceRules) => Promise<boolean>; onOpenSetup: () => void }) {
  const [draft, setDraft] = useState(rules);
  const [saving, setSaving] = useState(false);
  const changed = JSON.stringify(draft) !== JSON.stringify(rules);
  async function save() {
    setSaving(true);
    await onSave(draft);
    setSaving(false);
  }
  return (
    <section className="workspace-rules-card">
      <header>
        <div><b>OKRPTR 규칙</b><span>웹 · API · MCP 공통 적용</span></div>
        <button onClick={onOpenSetup}><Bot size={13} />대화로 설정</button>
      </header>
      <RuleFields rules={draft} onChange={setDraft} compact />
      <footer>
        <span>{draft.reviewBeforeCreate ? "불확실하면 확인 후 생성" : "명확하면 바로 생성"}</span>
        <button className="primary-action" onClick={() => void save()} disabled={!changed || saving}><Check size={13} />저장</button>
      </footer>
    </section>
  );
}

function SetupChatModal({ rules, onSave, onClose }: { rules: WorkspaceRules; onSave: (rules: WorkspaceRules) => Promise<void>; onClose: () => void }) {
  const [draft, setDraft] = useState(rules);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  function applyMessage() {
    const text = message.trim();
    if (!text) return;
    setDraft((current) => ({
      ...current,
      captureInstruction: `${current.captureInstruction}\n${text}`.trim(),
      configured: true,
    }));
    setMessage("");
  }
  async function save() {
    setSaving(true);
    await onSave({ ...draft, configured: true });
    setSaving(false);
  }
  return (
    <div className="modal-backdrop setup-backdrop">
      <section className="setup-chat" role="dialog" aria-modal="true" aria-labelledby="setup-title">
        <header>
          <div><span className="brand-mark">O</span><div><h2 id="setup-title">OKRPTR 설정</h2><p>대화, 웹, MCP 입력이 따를 규칙을 정합니다.</p></div></div>
          <button className="icon-button" onClick={onClose} aria-label="닫기"><X size={17} /></button>
        </header>
        <div className="setup-chat-body">
          <div className="chat-thread">
            <p className="assistant-message">처음 들어오는 일은 어떻게 정리할까요? 아래 규칙은 서비스 안의 빠른 입력과 외부 MCP 호출에 같이 적용됩니다.</p>
            <div className="chat-presets">
              <button onClick={() => setDraft((current) => ({ ...current, captureInstruction: "모든 새 요청은 먼저 인박스에 저장하고, 하루 리뷰 때 Project에 연결합니다.", reviewBeforeCreate: true }))}>인박스 우선</button>
              <button onClick={() => setDraft((current) => ({ ...current, structureInstruction: "Project가 명확하면 바로 Task로 만들고, Objective/Key Result가 언급되면 계층까지 함께 생성합니다.", reviewBeforeCreate: false }))}>명확하면 구조화</button>
              <button onClick={() => setDraft((current) => ({ ...current, routineInstruction: "루틴은 반드시 트리거 포인트, 어디서, 무엇을 어떻게 하는지까지 물어보고 저장합니다." }))}>루틴 상세화</button>
            </div>
            <label className="chat-input"><span>자연어 규칙 추가</span><textarea value={message} onChange={(event) => setMessage(event.target.value)} rows={3} placeholder="예: 고객 관련 요청은 우선순위를 높게 보고, 매주 리뷰 대상으로 넣어줘" /></label>
            <button className="chat-apply" onClick={applyMessage} disabled={!message.trim()}><Plus size={13} />규칙에 반영</button>
          </div>
          <RuleFields rules={draft} onChange={setDraft} />
        </div>
        <footer>
          <button className="welcome-secondary" onClick={onClose}>나중에</button>
          <button className="welcome-primary" onClick={() => void save()} disabled={saving}>{saving ? "저장 중" : "설정 저장"}<ChevronRight size={14} /></button>
        </footer>
      </section>
    </div>
  );
}

function RuleFields({ rules, onChange, compact = false }: { rules: WorkspaceRules; onChange: (rules: WorkspaceRules) => void; compact?: boolean }) {
  return (
    <div className={compact ? "rule-fields compact" : "rule-fields"}>
      <label><span>캡처 규칙</span><textarea value={rules.captureInstruction} onChange={(event) => onChange({ ...rules, captureInstruction: event.target.value })} rows={compact ? 2 : 3} /></label>
      <label><span>구조화 규칙</span><textarea value={rules.structureInstruction} onChange={(event) => onChange({ ...rules, structureInstruction: event.target.value })} rows={compact ? 2 : 3} /></label>
      <label><span>루틴 규칙</span><textarea value={rules.routineInstruction} onChange={(event) => onChange({ ...rules, routineInstruction: event.target.value })} rows={compact ? 2 : 3} /></label>
      <div className="rule-controls">
        <label><span>기본 우선순위</span><select value={rules.defaultPriority} onChange={(event) => onChange({ ...rules, defaultPriority: event.target.value as Priority })}>{Object.entries(priorityLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
        <label><span>기본 주기</span><select value={rules.defaultCadence} onChange={(event) => onChange({ ...rules, defaultCadence: event.target.value as Cadence })}>{Object.entries(cadenceLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
        <label className="rule-toggle"><input type="checkbox" checked={rules.reviewBeforeCreate} onChange={(event) => onChange({ ...rules, reviewBeforeCreate: event.target.checked })} /><span />불확실하면 확인</label>
      </div>
    </div>
  );
}

function TreeView({ objective, items, depths, onComplete }: { objective?: OkrptrItem; items: OkrptrItem[]; depths: Record<string, number>; onComplete: (id: string) => void }) {
  if (!objective) return <EmptyState icon={Target} title="Objective가 없습니다" />;
  return <section className="outline-section"><div className="objective-row"><Target size={18} /><div><span>Objective</span><h2>{objective.title}</h2></div><b>{objective.progress}%</b></div><div className="hierarchy">{items.filter((entry) => entry.id !== objective.id).map((entry) => <div className="hierarchy-row" key={entry.id} style={{ "--depth": Math.min(depths[entry.id] ?? 1, 4) } as CSSProperties}><span className={`type-icon type-${entry.kind}`}>{kindAbbr(entry.kind)}</span><span className="hierarchy-copy"><small>{kindLabel(entry.kind)}</small><b>{entry.title}</b></span><span className={`status-tag status-${entry.status}`}>{statusLabel(entry.status)}</span><em>{entry.progress}%</em>{entry.status !== "done" && ["project", "task"].includes(entry.kind) ? <button className="row-action" aria-label="완료 처리" title="완료 처리" onClick={() => onComplete(entry.id)}><Check size={13} /></button> : <ChevronRight className="row-chevron" size={15} />}</div>)}</div></section>;
}

function BoardView({ items, onOpenTask }: { items: OkrptrItem[]; onOpenTask: (id: string) => void }) {
  const columns: { status: ItemStatus; label: string }[] = [{ status: "todo", label: "할 일" }, { status: "in_progress", label: "진행 중" }, { status: "done", label: "완료" }];
  return <div className="board">{columns.map((column) => { const rows = items.filter((entry) => entry.status === column.status); return <section className="board-column" key={column.status}><header><span className={`status-dot status-${column.status}`} /><b>{column.label}</b><em>{rows.length}</em></header><div>{rows.map((entry) => <button className="board-item" key={entry.id} onClick={() => onOpenTask(entry.id)}><b>{entry.title}</b><span><CalendarDays size={13} />{dueLabel(entry.dueDate)}</span></button>)}{!rows.length && <span className="empty-column">작업 없음</span>}</div></section>; })}</div>;
}

function InboxView({ items, onConnect }: { items: OkrptrItem[]; onConnect: (item: OkrptrItem) => void }) {
  if (!items.length) return <EmptyState icon={Inbox} title="인박스가 비어 있습니다" />;
  return <section className="inbox-list"><div className="list-head"><span>이름</span><span>등록 경로</span><span /></div>{items.map((entry) => <article className="inbox-item" key={entry.id}><div><span className="page-icon"><ListChecks size={15} /></span><h3>{entry.title}</h3></div><span className={`source-badge source-${entry.source}`}>{sourceLabel(entry.source)}</span><button onClick={() => onConnect(entry)}><Link2 size={14} />연결</button></article>)}</section>;
}

function ReviewView({ items, cadence, completed, blocked, averageProgress }: { items: OkrptrItem[]; cadence: Cadence; completed: number; blocked: number; averageProgress: number }) {
  return <section className="review-content"><div className="metrics-row"><div><span>완료</span><strong>{completed}<small> / {items.length}</small></strong></div><div><span>평균 진행</span><strong>{averageProgress}<small>%</small></strong></div><div><span>막힘</span><strong>{blocked}</strong></div></div><div className="review-progress"><div><b>{cadenceLabels[cadence]} 진행률</b><span>{averageProgress}%</span></div><span><i style={{ width: `${averageProgress}%` }} /></span></div><div className="review-list"><span>검토할 항목</span>{items.slice(0, 7).map((entry) => <div key={entry.id}><span className={`status-dot status-${entry.status}`} /><b>{entry.title}</b><em>{entry.progress}%</em></div>)}</div></section>;
}

function PropertyPanel({ properties, onClose, onCreated, onDeleted, onNotice }: { properties: PropertyDefinition[]; onClose: () => void; onCreated: (property: PropertyDefinition) => void; onDeleted: (id: string) => void; onNotice: (message: string) => void }) {
  const [name, setName] = useState(""); const [type, setType] = useState<PropertyType>("text"); const [options, setOptions] = useState("");
  async function create(event: FormEvent) { event.preventDefault(); if (!name.trim()) return; const response = await fetch("/api/properties", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, type, options: options.split(",").map((entry) => entry.trim()).filter(Boolean) }) }); if (!response.ok) return; const data = await response.json() as { property: PropertyDefinition }; onCreated(data.property); setName(""); setOptions(""); onNotice("속성을 추가했습니다."); }
  async function remove(id: string) { const response = await fetch(`/api/properties?id=${encodeURIComponent(id)}`, { method: "DELETE" }); if (response.ok) { onDeleted(id); onNotice("속성을 삭제했습니다."); } }
  return <div className="modal-backdrop align-right"><aside className="property-panel"><header><div><h2>Task 속성</h2><p>{properties.length}개 열</p></div><button className="icon-button" onClick={onClose}><X size={17} /></button></header><div className="property-list">{properties.map((property) => <div className="property-row" key={property.id}><span className="property-type-icon">{property.type === "number" ? <Hash size={14} /> : <TextCursorInput size={14} />}</span><div><b>{property.name}</b><small>{propertyTypeLabel(property.type)}</small></div><button onClick={() => void remove(property.id)} aria-label="속성 삭제"><Trash2 size={13} /></button></div>)}</div><form className="property-form" onSubmit={create}><h3>속성 추가</h3><label><span>이름</span><input value={name} onChange={(event) => setName(event.target.value)} /></label><label><span>유형</span><select value={type} onChange={(event) => setType(event.target.value as PropertyType)}>{(["text", "number", "select", "date", "checkbox"] as PropertyType[]).map((entry) => <option value={entry} key={entry}>{propertyTypeLabel(entry)}</option>)}</select></label>{type === "select" && <label><span>옵션</span><input value={options} onChange={(event) => setOptions(event.target.value)} placeholder="쉼표로 구분" /></label>}<button><Plus size={14} />추가</button></form></aside></div>;
}

function TeamPanel({ initialTab, onClose, onNotice }: { initialTab: "members" | "groups"; onClose: () => void; onNotice: (message: string) => void }) {
  const [team, setTeam] = useState<TeamData | null>(null);
  const [groups, setGroups] = useState<WorkspaceGroup[] | null>(null);
  const [tab, setTab] = useState<"members" | "groups">(initialTab);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [groupDetail, setGroupDetail] = useState<GroupDetailData | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Exclude<TeamRole, "owner">>("member");
  const [groupName, setGroupName] = useState("");
  const [groupColor, setGroupColor] = useState<GroupColor>("blue");
  const [groupVisibility, setGroupVisibility] = useState<GroupVisibility>("open");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      fetch("/api/team").then(async (response) => response.ok ? response.json() as Promise<TeamData> : Promise.reject()),
      fetch("/api/groups?includeArchived=true").then(async (response) => response.ok ? response.json() as Promise<{ groups: WorkspaceGroup[] }> : Promise.reject()),
    ])
      .then(([teamData, groupData]) => { setTeam(teamData); setGroups(groupData.groups); })
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

  function openGroup(id: string) {
    setGroupDetail(null);
    setSelectedGroupId(id);
  }

  async function invite(event: FormEvent) {
    event.preventDefault();
    if (!email.trim() || saving) return;
    setSaving(true);
    setError("");
    const response = await fetch("/api/team", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, role }) });
    const data = await response.json() as { member?: TeamMember; error?: string };
    setSaving(false);
    if (!response.ok || !data.member) {
      setError(data.error ?? "초대를 등록하지 못했습니다.");
      return;
    }
    setTeam((current) => current ? { ...current, members: [...current.members, data.member!] } : current);
    setEmail("");
    onNotice("팀 초대를 등록했습니다.");
  }

  async function changeRole(member: TeamMember, nextRole: Exclude<TeamRole, "owner">) {
    const response = await fetch("/api/team", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: member.id, role: nextRole }) });
    if (!response.ok) return;
    const data = await response.json() as { member: TeamMember };
    setTeam((current) => current ? { ...current, members: current.members.map((entry) => entry.id === member.id ? data.member : entry) } : current);
    onNotice("멤버 역할을 변경했습니다.");
  }

  async function remove(member: TeamMember) {
    const response = await fetch(`/api/team?id=${encodeURIComponent(member.id)}`, { method: "DELETE" });
    if (!response.ok) return;
    setTeam((current) => current ? { ...current, members: current.members.filter((entry) => entry.id !== member.id) } : current);
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
  }

  const visibleGroups = (groups ?? []).filter((group) => showArchived || !group.archived);
  const activeGroupCount = (groups ?? []).filter((group) => !group.archived).length;

  return <div className="modal-backdrop align-right"><aside className="property-panel team-panel"><header><div><h2>팀</h2><p>{team ? `${team.workspace.name} · ${team.members.length}명 · ${activeGroupCount}개 그룹` : "불러오는 중"}</p></div><button className="icon-button" onClick={onClose} aria-label="닫기"><X size={17} /></button></header><nav className="team-tabs" aria-label="팀 관리"><button className={tab === "members" ? "active" : ""} onClick={() => { setTab("members"); setSelectedGroupId(null); }}><Users size={14} />멤버</button><button className={tab === "groups" ? "active" : ""} onClick={() => setTab("groups")}><AtSign size={14} />그룹</button></nav>{tab === "members" ? <>{team?.canManage && <form className="team-invite" onSubmit={invite}><label><span>이메일로 초대</span><div><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@company.com" aria-label="초대 이메일" /><select value={role} onChange={(event) => setRole(event.target.value as Exclude<TeamRole, "owner">)} aria-label="초대 역할"><option value="admin">Admin</option><option value="member">Member</option><option value="viewer">Viewer</option></select><button disabled={!email.trim() || saving} aria-label="멤버 초대" title="멤버 초대"><UserPlus size={14} /></button></div></label>{error && <p>{error}</p>}</form>}<div className="team-list">{team ? team.members.map((member) => <div className="team-member" key={member.id}><span className="team-avatar">{member.displayName.slice(0, 1).toLocaleUpperCase()}</span><div><b>{member.displayName}{member.isCurrent && <em>나</em>}</b><small>{member.email || (member.role === "owner" ? "Workspace owner" : "이메일 없음")}</small></div><span className={`member-status member-${member.status}`}>{member.status === "active" ? "활성" : "초대 대기"}</span>{team.canManage && member.role !== "owner" ? <select value={member.role} onChange={(event) => void changeRole(member, event.target.value as Exclude<TeamRole, "owner">)} aria-label={`${member.displayName} 역할`}><option value="admin">Admin</option><option value="member">Member</option><option value="viewer">Viewer</option></select> : <span className="member-role">{teamRoleLabel(member.role)}</span>}<div className="team-member-actions">{member.status === "invited" && <button className="icon-button" onClick={() => { void navigator.clipboard.writeText(window.location.origin); onNotice("워크스페이스 주소를 복사했습니다."); }} aria-label="초대 주소 복사" title="초대 주소 복사"><Copy size={13} /></button>}{team.canManage && member.role !== "owner" && !member.isCurrent && <button className="icon-button danger" onClick={() => void remove(member)} aria-label={member.status === "invited" ? "초대 취소" : "팀에서 제거"} title={member.status === "invited" ? "초대 취소" : "팀에서 제거"}><Trash2 size={13} /></button>}</div></div>) : !error ? <EmptyState icon={Users} title="팀 정보를 불러오는 중입니다" /> : <EmptyState icon={Users} title={error} />}</div></> : selectedGroupId ? groupDetail && team ? <GroupDetail detail={groupDetail} team={team} onBack={() => setSelectedGroupId(null)} onChange={setGroupDetail} onGroupChange={applyGroup} onDeleted={removeGroupFromState} onNotice={onNotice} /> : <EmptyState icon={Users} title="그룹 정보를 불러오는 중입니다" /> : <><div className="group-toolbar"><label className="archive-toggle"><input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} /><span /><Archive size={13} />보관됨</label></div>{team?.canManage && <form className="group-create" onSubmit={createWorkspaceGroup}><div className="group-create-main"><input value={groupName} onChange={(event) => setGroupName(event.target.value)} placeholder="새 그룹 이름" aria-label="새 그룹 이름" /><button disabled={!groupName.trim() || saving} aria-label="그룹 만들기" title="그룹 만들기"><Plus size={14} /></button></div><div className="group-create-options"><div className="color-swatches" aria-label="그룹 색상">{groupColors.map((color) => <button type="button" className={groupColor === color ? "active" : ""} key={color} onClick={() => setGroupColor(color)} title={groupColorLabel(color)} aria-label={groupColorLabel(color)}><i className={`group-swatch group-${color}`} /></button>)}</div><div className="visibility-control"><button type="button" className={groupVisibility === "open" ? "active" : ""} onClick={() => setGroupVisibility("open")}><Users size={12} />공개</button><button type="button" className={groupVisibility === "private" ? "active" : ""} onClick={() => setGroupVisibility("private")}><LockKeyhole size={12} />비공개</button></div></div>{error && <p>{error}</p>}</form>}<div className="group-list">{groups === null ? <EmptyState icon={Users} title="그룹을 불러오는 중입니다" /> : visibleGroups.length ? visibleGroups.map((group) => <button className={`group-row ${group.archived ? "archived" : ""}`} key={group.id} onClick={() => openGroup(group.id)}><i className={`group-swatch group-${group.color}`} /><span><b>{group.name}</b><small>@{group.handle}</small></span><em>{group.visibility === "private" ? <LockKeyhole size={11} /> : <Users size={11} />}{group.memberCount}</em>{group.archived && <span className="group-archived">보관됨</span>}<ChevronRight size={14} /></button>) : <EmptyState icon={Users} title={showArchived ? "그룹이 없습니다" : "활성 그룹이 없습니다"} />}</div></>}</aside></div>;
}

function GroupDetail({ detail, team, onBack, onChange, onGroupChange, onDeleted, onNotice }: { detail: GroupDetailData; team: TeamData; onBack: () => void; onChange: (next: GroupDetailData) => void; onGroupChange: (group: WorkspaceGroup) => void; onDeleted: (id: string) => void; onNotice: (message: string) => void }) {
  const [name, setName] = useState(detail.group.name);
  const [handle, setHandle] = useState(detail.group.handle);
  const [description, setDescription] = useState(detail.group.description);
  const [color, setColor] = useState<GroupColor>(detail.group.color);
  const [visibility, setVisibility] = useState<GroupVisibility>(detail.group.visibility);
  const [memberId, setMemberId] = useState("");
  const [memberRole, setMemberRole] = useState<GroupRole>("member");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const availableMembers = team.members.filter((member) => !detail.members.some((entry) => entry.memberId === member.id));
  const selectedWorkspaceMember = team.members.find((member) => member.id === memberId);

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
    if (!window.confirm(`'${detail.group.name}' 그룹을 영구 삭제할까요?`)) return;
    const response = await fetch(`/api/groups?id=${encodeURIComponent(detail.group.id)}`, { method: "DELETE" });
    if (!response.ok) { const data = await response.json() as { error?: string }; setError(data.error ?? "그룹을 삭제하지 못했습니다."); return; }
    onDeleted(detail.group.id); onNotice("그룹을 영구 삭제했습니다.");
  }

  async function addMember(event: FormEvent) {
    event.preventDefault();
    if (!memberId) return;
    const response = await fetch("/api/group-members", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ groupId: detail.group.id, memberId, role: memberRole }) });
    const data = await response.json() as { member?: GroupMember; error?: string };
    if (!response.ok || !data.member) { setError(data.error ?? "그룹 멤버를 추가하지 못했습니다."); return; }
    const next = { ...detail, group: { ...detail.group, memberCount: detail.group.memberCount + 1 }, members: [...detail.members, data.member] };
    onChange(next); onGroupChange(next.group); setMemberId(""); onNotice("그룹에 멤버를 추가했습니다.");
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

  return <div className="group-detail"><header className="group-detail-head"><button className="icon-button" onClick={onBack} aria-label="그룹 목록" title="그룹 목록"><ArrowLeft size={16} /></button><i className={`group-swatch group-${detail.group.color}`} /><div><b>{detail.group.name}</b><small>@{detail.group.handle}</small></div>{detail.group.archived && <span className="group-archived">보관됨</span>}</header>{detail.group.canEdit ? <form className="group-detail-form" onSubmit={save}><label><span>이름</span><input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} /></label><label><span>핸들</span><div className="handle-input"><AtSign size={13} /><input value={handle} onChange={(event) => setHandle(event.target.value)} maxLength={32} /></div></label><label><span>설명</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={500} rows={3} /></label><div className="group-setting-row"><span>색상</span><div className="color-swatches">{groupColors.map((entry) => <button type="button" className={color === entry ? "active" : ""} key={entry} onClick={() => setColor(entry)} title={groupColorLabel(entry)} aria-label={groupColorLabel(entry)}><i className={`group-swatch group-${entry}`} /></button>)}</div></div><div className="group-setting-row"><span>공개 범위</span><div className="visibility-control"><button type="button" className={visibility === "open" ? "active" : ""} onClick={() => setVisibility("open")}><Users size={12} />공개</button><button type="button" className={visibility === "private" ? "active" : ""} onClick={() => setVisibility("private")}><LockKeyhole size={12} />비공개</button></div></div>{error && <p className="form-error">{error}</p>}<div className="group-form-actions"><button className="save-group" disabled={!name.trim() || !handle.trim() || saving}><Check size={13} />저장</button>{detail.group.canArchive && (detail.group.archived ? <><button type="button" onClick={() => void setArchived(false)}><RotateCcw size={13} />복구</button><button type="button" className="danger" onClick={() => void permanentlyDelete()}><Trash2 size={13} />영구 삭제</button></> : <button type="button" onClick={() => void setArchived(true)}><Archive size={13} />보관</button>)}</div></form> : <div className="group-summary"><p>{detail.group.description || "설명 없음"}</p><span>{detail.group.visibility === "private" ? <LockKeyhole size={12} /> : <Users size={12} />}{detail.group.visibility === "private" ? "비공개" : "공개"}</span></div>}<section className="group-members"><header><b>멤버</b><span>{detail.members.length}</span></header>{detail.canManageMembers && <form className="group-member-add" onSubmit={addMember}><select value={memberId} onChange={(event) => { const nextMember = team.members.find((member) => member.id === event.target.value); setMemberId(event.target.value); if (nextMember?.role === "viewer") setMemberRole("member"); }} aria-label="추가할 멤버"><option value="">멤버 선택</option>{availableMembers.map((member) => <option value={member.id} key={member.id}>{member.displayName}{member.status === "invited" ? " (초대 대기)" : ""}</option>)}</select><select value={memberRole} onChange={(event) => setMemberRole(event.target.value as GroupRole)} aria-label="그룹 역할"><option value="member">Member</option><option value="lead" disabled={selectedWorkspaceMember?.role === "viewer"}>Lead</option></select><button disabled={!memberId} aria-label="그룹에 추가" title="그룹에 추가"><UserPlus size={13} /></button></form>}<div className="group-member-list">{detail.members.map((member) => <div className="group-member-row" key={member.memberId}><span className="team-avatar">{member.displayName.slice(0, 1).toLocaleUpperCase()}</span><div><b>{member.displayName}{member.isCurrent && <em>나</em>}</b><small>{member.status === "invited" ? `${member.email} · 초대 대기` : member.email || teamRoleLabel(member.workspaceRole)}</small></div>{detail.canManageMembers ? <select value={member.groupRole} onChange={(event) => void changeGroupRole(member, event.target.value as GroupRole)} aria-label={`${member.displayName} 그룹 역할`}><option value="lead" disabled={member.workspaceRole === "viewer"}>Lead</option><option value="member">Member</option></select> : <span className="member-role">{member.groupRole === "lead" ? "Lead" : "Member"}</span>}{detail.canManageMembers && <button className="icon-button danger" onClick={() => void removeMember(member)} aria-label="그룹에서 제거" title="그룹에서 제거"><X size={13} /></button>}</div>)}{!detail.members.length && <EmptyState icon={Users} title="그룹 멤버가 없습니다" />}</div></section></div>;
}

function IntegrationModal({ onClose }: { onClose: () => void }) {
  const endpoint = typeof window === "undefined" ? "/mcp" : `${window.location.origin}/mcp`;
  const tools = ["get_workspace_rules", "update_workspace_rules", "capture_item", "create_item", "update_item", "list_items", "link_item", "review_period", "list_properties", "create_property", "set_property_value", "delete_property", "list_checklist_items", "add_checklist_item", "update_checklist_item", "get_daily_scrum", "save_daily_scrum", "get_recommendations", "list_routines", "create_routine", "update_routine", "complete_routine", "delete_routine", "list_team_members", "invite_team_member", "update_team_member", "remove_team_member", "list_groups", "create_group", "update_group", "archive_group", "delete_group", "list_group_members", "add_group_member", "update_group_member", "remove_group_member"];
  return <div className="modal-backdrop"><section className="integration-modal"><header><h2>MCP 연결</h2><button className="icon-button" onClick={onClose}><X size={17} /></button></header><div className="endpoint-row"><Bot size={18} /><div><b>Streamable HTTP</b><code>{endpoint}</code></div><button className="icon-button" onClick={() => void navigator.clipboard.writeText(endpoint)} title="주소 복사"><Copy size={14} /></button></div><div className="tool-list">{tools.map((tool) => <code key={tool}>{tool}</code>)}</div><footer><span><CheckCircle2 size={15} />Objective → Key Result → Initiative → Project → Task</span><button onClick={onClose}>닫기</button></footer></section></div>;
}

function EmptyState({ icon: Icon, title }: { icon: LucideIcon; title: string }) { return <div className="empty-state"><Icon size={22} /><span>{title}</span></div>; }

const statusLabels: Record<ItemStatus, string> = { inbox: "인박스", todo: "할 일", in_progress: "진행 중", done: "완료", blocked: "막힘" };
const priorityLabels: Record<Priority, string> = { low: "낮음", medium: "보통", high: "높음", urgent: "긴급" };
const groupColors: GroupColor[] = ["gray", "blue", "green", "yellow", "orange", "red", "purple"];

function item(id: string, parentId: string | null, kind: ItemKind, title: string, status: ItemStatus, cadence: Cadence, progress: number, dueDate: string | null = null, source = "web", priority: Priority = "medium"): OkrptrItem { return { id, parentId, kind, title, description: "", status, priority, cadence, progress, dueDate, source, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }; }
function buildDepths(items: OkrptrItem[]) { const byId = new Map(items.map((entry) => [entry.id, entry])); const result: Record<string, number> = {}; for (const entry of items) { let depth = 0; let current = entry; while (current.parentId && depth < 5) { depth += 1; const parent = byId.get(current.parentId); if (!parent) break; current = parent; } result[entry.id] = depth; } return result; }
function kindAbbr(kind: ItemKind) { return { objective: "O", key_result: "KR", initiative: "I", project: "P", task: "T" }[kind]; }
function kindLabel(kind: ItemKind) { return { objective: "Objective", key_result: "Key Result", initiative: "Initiative", project: "Project", task: "Task" }[kind]; }
function statusLabel(status: ItemStatus) { return statusLabels[status]; }
function sourceLabel(source: string) { return { mcp: "MCP", slack: "Slack", discord: "Discord", telegram: "Telegram", web: "Web" }[source] ?? "Bot"; }
function propertyTypeLabel(type: PropertyType) { return { text: "텍스트", number: "숫자", select: "선택", date: "날짜", checkbox: "체크박스" }[type]; }
function teamRoleLabel(role: TeamRole) { return { owner: "Owner", admin: "Admin", member: "Member", viewer: "Viewer" }[role]; }
function groupColorLabel(color: GroupColor) { return { gray: "회색", blue: "파랑", green: "초록", yellow: "노랑", orange: "주황", red: "빨강", purple: "보라" }[color]; }
function dueLabel(value: string | null) { if (!value) return "기한 없음"; const due = new Date(`${value}T00:00:00`); return `${due.getMonth() + 1}월 ${due.getDate()}일`; }
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
function pageSubtitle(view: View) { return { home: "지금 집중할 목표와 작업", inbox: "아직 Project에 연결하지 않은 Task", work: "Project에 연결된 Task 데이터베이스", routines: "반복되는 실행을 날짜별로 기록", okr: "Objective부터 Task까지의 실행 구조", scrum: "어제, 오늘, 막힘", recommendations: "현재 데이터에서 계산한 다음 정리 항목", reviews: "주기별 진행과 막힘" }[view]; }
function routineCadenceLabel(cadence: RoutineCadence) { return { daily: "매일", weekly: "매주", monthly: "매월" }[cadence]; }
function recommendationIcon(kind: Recommendation["kind"]) { if (kind === "blocked") return "!"; if (kind === "overdue") return "D"; if (kind === "unlinked") return "↗"; if (kind === "due_soon") return "3"; return "P"; }
