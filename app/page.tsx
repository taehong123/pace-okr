"use client";
/* eslint-disable @next/next/no-img-element */
import { PropertyValueInput } from "@/app/property-value-input";

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
  CreditCard,
  Database,
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
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  Settings,
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
import { startTransition, useCallback, useEffect, useId, useMemo, useRef, useState, type ComponentType, type CSSProperties, type FormEvent, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { ConfirmationProvider, OverlayDialog, useAppConfirm } from "./overlay-dialog";
import AIConnectionsDialog from "./ai-connections";
import WorkspaceBackups from "./workspace-backups";
import { MarketingConsentPrompt, MarketingConsentSettings } from "./marketing-consent";
import { OkrFileSurface, type OkrFileCycleSummary } from "./okr-file-surface";
import BillingView, { ProjectQuotaBadge } from "./billing-view";
import { ChatAiUsage } from "./ai-usage-meter";
import { aiUsageLimitMessage } from "@/lib/ai-usage";
import { invalidateAiUsage, type AiUsageScope } from "@/lib/ai-usage-client";
import { readMyWorkSort, saveMyWorkSort, sortMyWorkItems, type MyWorkSort } from "@/lib/my-work-sort";
import { DEFAULT_THEME, THEME_STORAGE_KEY, isThemeMode, themeColorScheme, type ThemeMode } from "@/lib/themes";
import { ThemePicker } from "./theme-picker";

type View = "home" | "my_work" | "inbox" | "work" | "routines" | "okr" | "data" | "scrum" | "recommendations" | "reviews" | "trash" | "integrations" | "billing";
const urlViews = new Set<View>(["my_work", "inbox", "work", "routines", "okr", "data", "scrum", "recommendations", "reviews", "trash", "integrations", "billing"]);
type NoticeTone = "success" | "error" | "info";
type AppNotice = { id: number; message: string; tone: NoticeTone };

function navigationFromLocation() {
  if (typeof window === "undefined") return { view: "okr" as View, projectId: null as string | null, taskId: null as string | null };
  const params = new URLSearchParams(window.location.search);
  const rawView = params.get("view");
  const requestedView = (rawView === "kr_data" ? "data" : rawView) as View | null;
  const projectId = params.get("project");
  return {
    view: projectId ? "work" : requestedView && urlViews.has(requestedView) ? requestedView : "okr",
    projectId,
    taskId: projectId ? null : params.get("task"),
  };
}

function workspaceSettingsFromLocation() {
  if (typeof window === "undefined") return { open: false, tab: "general" as WorkspaceSettingsTab };
  const params = new URLSearchParams(window.location.search);
  const rawTab = params.get("tab") as WorkspaceSettingsTab | "management" | null;
  const normalizedTab = rawTab === "management" ? "summary" : rawTab;
  const supported = new Set<WorkspaceSettingsTab>(["general", "members", "groups", "projects", "summary", "integrations", "backups", "danger", "scheduled"]);
  return {
    open: params.get("settings") === "workspace",
    tab: normalizedTab && supported.has(normalizedTab) ? normalizedTab : "general",
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
type WorkspaceSettingsTab = "general" | "members" | "groups" | "projects" | "summary" | "integrations" | "backups" | "danger" | "scheduled";
type ItemAssignmentRole = "project_dri" | "project_worker" | "task_assignee";
type AuthUser = { id: string; email: string | null; displayName: string; provider: "google" | "local" };
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
  createdByUserId: string | null;
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

type DataViewProps = {
  cacheKey: string;
  items: Pick<OkrptrItem, "id" | "kind" | "cycleId" | "parentId" | "title" | "progress">[];
  cycles: Pick<OkrCycle, "id" | "name">[];
  readOnly: boolean;
  onProgressChange: (id: string, progress: number) => void;
  onNotice: (message: string) => void;
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
type ProjectDataConnection = {
  id: string;
  itemId: string;
  targetKind: "project";
  name: string;
  valuePath: string;
  baselineValue: number;
  targetValue: number;
  unit: string;
  cadence: "hourly" | "daily" | "weekly" | "manual";
  active: boolean;
  lastValue: number | null;
  lastSyncStatus: "never" | "success" | "error";
  lastError: string;
  lastSyncedAt: string | null;
};

type PropertyValueMap = Record<string, Record<string, PropertyValue>>;
type ProjectHiddenPropertyMap = Record<string, string[]>;
type ArchivedProject = OkrptrItem & { archivedTaskCount: number };
type TrashedItem = OkrptrItem & { trashedTaskCount: number; canDelete: boolean; restoreParentRequired: boolean };
type TrashInitiativeOption = { id: string; title: string; cycleId: string };
type ChecklistItem = { id: string; taskId: string; title: string; completed: boolean; sortOrder: number };
type DailySkipReason = "workload" | "vacation" | "personal" | "other";
type DailyTaskCandidate = { id: string; title: string; status: ItemStatus; dueDate: string | null; parentKind: "project" | "routine" | "general"; parentId: string | null; parentTitle: string };
type DailySubmission = { id: string; memberId: string | null; memberName: string; memberEmail: string; date: string; version: number; yesterdayNote: string; todayNote: string; blockersNote: string; noPlannedTasks: boolean; skipReason: DailySkipReason | null; skipNote: string; source: string; submittedAt: string; tasks: Array<{ id: string; taskId: string | null; taskTitle: string; parentKind: string; parentId: string | null; parentTitle: string; status: string; isNew: boolean; sortOrder: number }> };
type DailyDashboard = {
  date: string;
  member: { id: string; displayName: string; email: string; role: TeamRole };
  draft: { id: string | null; date: string; yesterdayNote: string; todayNote: string; blockersNote: string; noPlannedTasks: boolean; skipReason: DailySkipReason | null; skipNote: string; selectedTaskIds: string[]; source: string; updatedAt: string | null };
  latestSubmission: DailySubmission | null;
  candidates: { tasks: DailyTaskCandidate[]; groups: Array<{ key: string; kind: string; id: string | null; title: string; tasks: DailyTaskCandidate[] }> };
  createTargets: { projects: Array<{ id: string; title: string; needsTask: boolean }>; routines: Array<{ id: string; title: string }>; allowGeneral: boolean };
  team: Array<{ memberId: string; displayName: string; email: string; role: TeamRole; status: "submitted" | "skipped" | "writing" | "missing"; slackConnected: boolean; submission: DailySubmission | null }>;
  legacyWorkspaceNote: { yesterdayNote: string; todayNote: string; blockersNote: string; updatedAt: string } | null;
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
  routineCadence: RoutineCadence;
};

type StringPlanField = "project" | "tasks" | "taskParent" | "routineTitle" | "routineTrigger" | "routinePlace" | "routineSteps";

type OkrChatContext = {
  key: string;
  entry: "onboarding" | "coach" | "create" | "project" | "routine" | "task";
  cycleId: string;
  cycleName: string;
  initialMessage: string;
  sourceKind?: ItemKind;
  target?: OkrPlanTarget | null;
  targetCandidates?: OkrPlanTarget[];
};

type OkrPlanTarget = {
  id: string;
  kind: "objective" | "key_result" | "initiative" | "project";
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
  cycleName: string;
  initiativeId: string;
  initiativeTitle: string;
};

type TaskContainerOption = {
  id: string;
  kind: "project" | "routine";
  title: string;
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
type ConversationMode = "okr" | "project" | "routine" | "task" | "onboarding" | "coach";

type AssistantConversationDraft = {
  version: 1;
  message: string;
  plan: OnboardingPlan;
  guideQuestions: string[];
  conversationHistory: ChatMessage[];
  visibleFields: StringPlanField[];
  mode: ConversationMode;
  okrTarget: OkrPlanTarget | null;
  targetCandidates: OkrPlanTarget[];
  projectTarget: ProjectChatTarget | null;
  projectDriMemberId: string;
  routineAssigneeMemberId: string;
  taskContainer: string;
  taskAssigneeMemberId: string;
};

type OrganizeError = {
  code?: string;
  error?: string;
  spentWon?: number;
  limitWon?: number;
  usage?: { spentWon?: number; budgetWon?: number; remainingWon?: number; requestsToday?: number };
  options?: string[];
};

type TeamMember = {
  id: string;
  email: string;
  displayName: string;
  role: TeamRole;
  status: "active";
  isCurrent: boolean;
  createdAt: string;
};

type TeamInvitation = {
  id: string;
  email: string;
  displayName: string;
  role: Exclude<TeamRole, "owner">;
  status: "pending" | "expired";
  deliveryStatus: "not_sent" | "sent" | "failed" | "unavailable";
  expiresAt: string;
  lastSentAt: string | null;
  createdAt: string;
};

type InvitationPreview = {
  workspace: { id: string; name: string };
  role: Exclude<TeamRole, "owner">;
  inviterName: string;
  emailHint: string;
  status: "pending" | "expired" | "accepted" | "revoked";
  expiresAt: string;
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

type TeamData = { workspace: { id: string; name: string; kind: "personal" | "team"; avatarUrl: string | null; avatarUpdatedAt: string | null }; members: TeamMember[]; invitations: TeamInvitation[]; invitationEmailConfigured: boolean; currentRole: TeamRole; canManage: boolean };
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
    PaypleCpayAuthCheck?: (options: Record<string, unknown>, environment?: string) => void;
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
  kind: "personal" | "team";
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
  connected: boolean;
  state: "service_unavailable" | "workspace_disconnected" | "setup_required" | "connected" | "reauthorization_required" | "error";
  statusMessage: string;
  missingScopes: string[];
  connectionScope: "workspace";
  distributionMode: "direct_oauth";
  connectedTeam: { id: string; name: string } | null;
  teamName: string | null;
  teamId: string | null;
  botUserId: string | null;
  scope: string;
  connectedAt: string | null;
  updatedAt: string | null;
  redirectUrl: string;
  commandUrl: string;
  interactionUrl?: string | null;
  eventsUrl?: string | null;
};
type IntegrationStatusCache = {
  workspaceId: string;
  savedAt: number;
  google: GoogleConnectionStatus | null;
  slack: SlackConnectionStatus | null;
};
const INTEGRATION_STATUS_CACHE_KEY = "okrptr.integration-status.v1";
const INTEGRATION_STATUS_CACHE_TTL_MS = 10 * 60 * 1000;

function readCachedIntegrationStatuses(workspaceId: string): IntegrationStatusCache | null {
  if (!workspaceId) return null;
  try {
    const raw = window.sessionStorage.getItem(INTEGRATION_STATUS_CACHE_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw) as IntegrationStatusCache;
    if (cached.workspaceId !== workspaceId || Date.now() - cached.savedAt > INTEGRATION_STATUS_CACHE_TTL_MS) {
      window.sessionStorage.removeItem(INTEGRATION_STATUS_CACHE_KEY);
      return null;
    }
    return cached;
  } catch {
    window.sessionStorage.removeItem(INTEGRATION_STATUS_CACHE_KEY);
    return null;
  }
}

function writeCachedIntegrationStatuses(workspaceId: string, google: GoogleConnectionStatus | null, slack: SlackConnectionStatus | null) {
  if (!workspaceId || (!google && !slack)) return;
  try {
    window.sessionStorage.setItem(INTEGRATION_STATUS_CACHE_KEY, JSON.stringify({ workspaceId, savedAt: Date.now(), google, slack } satisfies IntegrationStatusCache));
  } catch {
    window.sessionStorage.removeItem(INTEGRATION_STATUS_CACHE_KEY);
  }
}
type ManagementBotSignal = "missing_due_date" | "missing_owner" | "overdue" | "completed_yesterday" | "due_today";
type ManagementBotItem = { id: string; kind: "project" | "task"; title: string; status: string; dueDate: string | null };
type ManagementBotSettings = { enabled: boolean; weekdays: number[]; reportTime: string; timezone: string; channelId: string; channelName: string; signals: ManagementBotSignal[]; lastSentDate: string | null; lastSentAt: string | null; lastError: string; updatedAt: string | null };
type ManagementBotSnapshot = { date: string; groups: Array<{ signal: ManagementBotSignal; count: number; items: ManagementBotItem[] }>; totalCount: number };
type ManagementBotData = {
  settings: ManagementBotSettings;
  snapshot?: ManagementBotSnapshot;
  slackConnected: boolean;
  channels: Array<{ id: string; name: string; isPrivate: boolean; isMember: boolean }>;
};
type SlackOAuthIssue = "workspace_admin_required" | "slack_admin_approval_required" | "workspace_already_connected" | "authorization_cancelled" | "missing_scope" | "oauth_exchange_failed" | "service_unavailable";
const slackOAuthIssueCopy: Record<SlackOAuthIssue, { title: string; detail: string; tone: "warning" | "error" }> = {
  workspace_admin_required: { title: "OKRPTR 관리자 권한이 필요합니다", detail: "이 워크스페이스의 Owner 또는 Admin에게 Slack 연결을 요청해 주세요.", tone: "warning" },
  slack_admin_approval_required: { title: "Slack 관리자 승인이 필요합니다", detail: "선택한 Slack 워크스페이스의 앱 설치 정책에 따라 관리자 승인을 받은 뒤 다시 연결해 주세요.", tone: "warning" },
  workspace_already_connected: { title: "이미 다른 OKRPTR 워크스페이스에 연결된 Slack입니다", detail: "기존 OKRPTR 워크스페이스에서 연결을 해제한 뒤 다시 시도해 주세요.", tone: "warning" },
  authorization_cancelled: { title: "Slack 승인이 취소되었습니다", detail: "연결할 워크스페이스를 다시 선택하려면 아래 연결 버튼을 눌러 주세요.", tone: "warning" },
  missing_scope: { title: "Slack 권한 업데이트가 필요합니다", detail: "데일리 DM과 채널 공유에 필요한 권한을 Slack에서 한 번 더 승인해 주세요.", tone: "warning" },
  oauth_exchange_failed: { title: "Slack 연결을 완료하지 못했습니다", detail: "승인 정보가 만료되었거나 Slack 응답을 확인하지 못했습니다. 다시 연결해 주세요.", tone: "error" },
  service_unavailable: { title: "Slack 연결을 잠시 사용할 수 없습니다", detail: "별도로 입력할 설정은 없습니다. 서비스가 준비되면 이 화면에서 바로 연결할 수 있습니다.", tone: "error" },
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

type TrashRecord = {
  id: string;
  category: string;
  title: string;
  itemCount: number;
  routineCount: number;
  cycleCount: number;
  archivedAt: string;
};

const dailyScrumMemoryCache = new Map<string, DailyDashboard>();
const recommendationMemoryCache = new Map<string, Recommendation[]>();
const routineMemoryCache = new Map<string, Routine[]>();
const projectTemplateMemoryCache = new Map<string, ProjectTemplate[]>();
const propertyCatalogMemoryCache = new Map<string, PropertyDefinition[]>();
const trashMemoryCache = new Map<string, { records: TrashRecord[]; items: TrashedItem[]; initiativeOptions: TrashInitiativeOption[] }>();
const viewCacheTimestamps = new Map<string, number>();
const VIEW_CACHE_FRESH_MS = 30_000;

function viewCacheIsFresh(key: string) {
  const storedAt = viewCacheTimestamps.get(key);
  return typeof storedAt === "number" && Date.now() - storedAt < VIEW_CACHE_FRESH_MS;
}

function markViewCacheFresh(key: string) {
  viewCacheTimestamps.set(key, Date.now());
}

function scrumNotesSnapshot(scrum: DailyDashboard) {
  return JSON.stringify(scrum.draft);
}

function dailySkipLabel(reason: DailySkipReason) {
  return { workload: "본업 과중", vacation: "휴가", personal: "개인 일정", other: "기타" }[reason];
}

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
    description: "OKRPTR은 목표, 프로젝트, 할 일과 Routine을 한곳에 연결하고 대화와 봇에서도 바로 기록할 수 있는 실행 관리 서비스입니다.",
    hierarchyLabel: "목표에서 실행까지",
    routineNote: "Routine은 Project처럼 Task를 담는 실행 컨테이너지만 OKR 계층과 독립적입니다.",
    points: [
      { title: "대화에서 바로 등록", description: "MCP를 연결하면 AI 대화와 봇에서 Task, 프로젝트, Routine을 바로 만들 수 있습니다." },
      { title: "책임과 맥락을 선명하게", description: "Project의 DRI와 속성, Task의 담당자와 소속을 한눈에 관리합니다." },
      { title: "매일 실행을 놓치지 않게", description: "Routine, 데일리 스크럼과 추천이 지금 집중할 일을 정리해 줍니다." },
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
  { id: "home", label: "AI 대화", icon: Bot },
  { id: "my_work", label: "내 업무", icon: Briefcase },
  { id: "okr", label: "OKR", icon: Target },
  { id: "work", label: "Project", icon: Table2 },
  { id: "inbox", label: "Task", icon: Inbox },
  { id: "routines", label: "Routine", icon: Repeat2 },
  { id: "data", label: "데이터", icon: Database },
  { id: "scrum", label: "데일리", icon: CalendarCheck },
  { id: "recommendations", label: "추천", icon: Lightbulb },
  { id: "reviews", label: "리뷰", icon: Activity },
  { id: "trash", label: "휴지통", icon: Trash2 },
];

const mobileNavItems = (["home", "okr", "my_work", "work", "inbox"] satisfies View[])
  .map((id) => navItems.find((entry) => entry.id === id)!);

const cadenceLabels: Record<Cadence, string> = { daily: "일간", weekly: "주간", monthly: "월간", quarterly: "분기" };
const viewTitles: Record<View, string> = {
  home: "AI 대화",
  inbox: "Task",
  my_work: "내 업무",
  work: "Project",
  routines: "Routine",
  okr: "OKR",
  data: "데이터",
  scrum: "데일리 스크럼",
  recommendations: "추천",
  reviews: "리뷰",
  trash: "휴지통",
  integrations: "개인 앱 연동",
  billing: "요금제 및 결제",
};

export default function Home() {
  return <ConfirmationProvider><WorkspaceApp /></ConfirmationProvider>;
}

function ClientDataView(props: DataViewProps) {
  const [ViewComponent, setViewComponent] = useState<ComponentType<DataViewProps> | null>(null);
  useEffect(() => {
    let active = true;
    void import("@/app/kr-data-view").then((module) => { if (active) setViewComponent(() => module.default); });
    return () => { active = false; };
  }, []);
  return ViewComponent ? <ViewComponent {...props} /> : <AsyncState icon={LoaderCircle} title="데이터 화면을 준비하는 중입니다" loading />;
}

function WorkspaceApp() {
  const confirmAction = useAppConfirm();
  const [items, setItems] = useState<OkrptrItem[]>([]);
  const [properties, setProperties] = useState<PropertyDefinition[]>([]);
  const [propertyValues, setPropertyValues] = useState<PropertyValueMap>({});
  const [hiddenProperties, setHiddenProperties] = useState<ProjectHiddenPropertyMap>({});
  const [teamData, setTeamData] = useState<TeamData | null>(null);
  const [inviteToken, setInviteToken] = useState<string | null>(() => invitationTokenFromLocation());
  const [invitePreview, setInvitePreview] = useState<InvitationPreview | null>(null);
  const [inviteLoadError, setInviteLoadError] = useState("");
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [okrCycles, setOkrCycles] = useState<OkrCycle[]>([]);
  const [selectedOkrCycleId, setSelectedOkrCycleId] = useState<string | null>(null);
  const [, setVisibleOkrCycleIds] = useState<string[]>([]);
  const [activeView, setActiveView] = useState<View>(() => navigationFromLocation().view);
  const [cadence, setCadence] = useState<Cadence>("weekly");
  const [taskDisplay, setTaskDisplay] = useState<"cards" | "table" | "board">("table");
  const [notice, setNotice] = useState<AppNotice | null>(null);
  const [integrationOpen, setIntegrationOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [propertyPanelOpen, setPropertyPanelOpen] = useState(false);
  const [workspaceAvatarOpen, setWorkspaceAvatarOpen] = useState(false);
  const [profilePromptMember, setProfilePromptMember] = useState<TeamMember | null>(null);
  const [requestedGroupHandle, setRequestedGroupHandle] = useState<string | null>(null);
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [workspaceRules, setWorkspaceRules] = useState<WorkspaceRules | null>(null);
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);
  const [workspaceSettingsOpen, setWorkspaceSettingsOpen] = useState(() => workspaceSettingsFromLocation().open);
  const [workspaceSettingsTab, setWorkspaceSettingsTab] = useState<WorkspaceSettingsTab>(() => workspaceSettingsFromLocation().tab);
  const [workspaceCreateOpen, setWorkspaceCreateOpen] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState("");
  const [workspaceSaving, setWorkspaceSaving] = useState(false);
  const [createItemOpen, setCreateItemOpen] = useState(false);
  const [routineCreateOpen, setRoutineCreateOpen] = useState(false);
  const [createItemKind, setCreateItemKind] = useState<ItemKind>("task");
  const [createItemCycleId, setCreateItemCycleId] = useState<string | null>(null);
  const [okrCreating, setOkrCreating] = useState(false);
  const [okrEditorDirty, setOkrEditorDirty] = useState(false);
  const [okrChatContext, setOkrChatContext] = useState<OkrChatContext | null>(null);
  const [deletingOkrCycleIds, setDeletingOkrCycleIds] = useState<Set<string>>(new Set());
  const [slowDeletingOkrCycleId, setSlowDeletingOkrCycleId] = useState<string | null>(null);
  const [okrListOpen, setOkrListOpen] = useState(false);
  const [cleanupOpen, setCleanupOpen] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(() => navigationFromLocation().taskId);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(() => navigationFromLocation().projectId);
  const [selectedDeleteItemIds, setSelectedDeleteItemIds] = useState<Set<string>>(new Set());
  const [trashingItems, setTrashingItems] = useState(false);
  const [googleStatus, setGoogleStatus] = useState<GoogleConnectionStatus | null>(null);
  const [slackStatus, setSlackStatus] = useState<SlackConnectionStatus | null>(null);
  const [slackOAuthIssue, setSlackOAuthIssue] = useState<SlackOAuthIssue | null>(null);
  const [integrationStatusesLoaded, setIntegrationStatusesLoaded] = useState(false);
  const [integrationStatusRefreshing, setIntegrationStatusRefreshing] = useState(false);
  const [integrationStatusAttempt, setIntegrationStatusAttempt] = useState(0);
  const [integrationStatusError, setIntegrationStatusError] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [introLanguage, setIntroLanguage] = useState<IntroLanguage>("ko");
  const [authState, setAuthState] = useState<AuthState>({ status: "loading", user: null, reason: null });
  const [workspaceDataState, setWorkspaceDataState] = useState<"loading" | "ready" | "error">("loading");
  const [freshWorkspaceDataReady, setFreshWorkspaceDataReady] = useState(false);
  const [workspaceDataAttempt, setWorkspaceDataAttempt] = useState(0);
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    if (typeof document === "undefined") return DEFAULT_THEME;
    const preference = document.documentElement.dataset.themePreference;
    return isThemeMode(preference) ? preference : DEFAULT_THEME;
  });
  const workspaceNameInputRef = useRef<HTMLInputElement>(null);
  const assistantAutoHandledWorkspaceRef = useRef<string | null>(null);
  const workspaceRefreshAtRef = useRef(0);
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
    try { window.localStorage.setItem(THEME_STORAGE_KEY, themeMode); } catch { /* A blocked preference store must not prevent theme switching. */ }
    document.documentElement.dataset.themePreference = themeMode;
    document.documentElement.dataset.theme = themeMode;
    document.documentElement.style.colorScheme = themeColorScheme(themeMode);
  }, [themeMode]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      if (window.matchMedia("(max-width: 700px)").matches) setTaskDisplay("cards");
    }, 0);
    return () => window.clearTimeout(timeout);
  }, []);

  useEffect(() => {
    let active = true;
    workspaceRefreshAtRef.current = Date.now();
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
        workspaceRefreshAtRef.current = Date.now();
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
    if (authState.status !== "authenticated") return;
    const refreshIfStale = () => {
      if (document.visibilityState !== "visible" || Date.now() - workspaceRefreshAtRef.current < VIEW_CACHE_FRESH_MS) return;
      workspaceRefreshAtRef.current = Date.now();
      setWorkspaceDataAttempt((current) => current + 1);
    };
    refreshIfStale();
    document.addEventListener("visibilitychange", refreshIfStale);
    return () => document.removeEventListener("visibilitychange", refreshIfStale);
  }, [activeView, authState.status]);

  useEffect(() => {
    const group = new URLSearchParams(window.location.search).get("group")?.replace(/^@/, "").trim();
    if (!group) return;
    const timeout = window.setTimeout(() => {
      setRequestedGroupHandle(group);
      setWorkspaceSettingsTab("groups");
      setWorkspaceSettingsOpen(true);
      const url = new URL(window.location.href);
      url.searchParams.set("settings", "workspace");
      url.searchParams.set("tab", "groups");
      window.history.replaceState({ ...window.history.state, __okrptrWorkspaceSettings: true }, "", url);
    }, 0);
    return () => window.clearTimeout(timeout);
  }, []);

  useEffect(() => {
    if (authState.status !== "authenticated" || !inviteToken) return;
    const controller = new AbortController();
    void fetch(`/api/invitations/preview?token=${encodeURIComponent(inviteToken)}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        const data = await response.json() as { invitation?: InvitationPreview; error?: string };
        if (!response.ok || !data.invitation) throw new Error(data.error ?? "초대를 불러오지 못했습니다.");
        setInvitePreview(data.invitation);
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) setInviteLoadError(error instanceof Error ? error.message : "초대를 불러오지 못했습니다.");
      });
    return () => controller.abort();
  }, [authState.status, inviteToken]);

  const integrationWorkspaceId = workspaces.find((workspace) => workspace.current)?.id ?? workspaces[0]?.id ?? "";

  useEffect(() => {
    const needsIntegrationStatus = activeView === "integrations" || (workspaceSettingsOpen && workspaceSettingsTab === "integrations");
    if (authState.status !== "authenticated" || !needsIntegrationStatus || !integrationWorkspaceId) return;
    let active = true;
    const controller = new AbortController();
    const cached = readCachedIntegrationStatuses(integrationWorkspaceId);
    let nextGoogle = cached?.google ?? null;
    let nextSlack = cached?.slack ?? null;
    // Cached status is provisional; render it without blocking user interaction
    // while the authoritative requests below refresh it.
    startTransition(() => {
      setGoogleStatus(cached?.google ?? null);
      setSlackStatus(cached?.slack ?? null);
      setIntegrationStatusesLoaded(Boolean(cached));
      setIntegrationStatusRefreshing(true);
      setIntegrationStatusError(false);
    });

    const googleRequest = fetch("/api/google/status", { cache: "no-store", signal: controller.signal }).then(async (response) => {
      if (!response.ok) throw new Error("Google status unavailable");
      const data = await response.json() as { google: GoogleConnectionStatus };
      nextGoogle = data.google;
      if (active) setGoogleStatus(data.google);
    });
    const slackRequest = fetch("/api/slack/status", { cache: "no-store", signal: controller.signal }).then(async (response) => {
      if (!response.ok) throw new Error("Slack status unavailable");
      const data = await response.json() as { slack: SlackConnectionStatus };
      nextSlack = data.slack;
      if (active) setSlackStatus(data.slack);
    });

    void Promise.allSettled([googleRequest, slackRequest]).then((results) => {
      if (!active) return;
      setIntegrationStatusError(results.some((result) => result.status === "rejected"));
      setIntegrationStatusesLoaded(true);
      setIntegrationStatusRefreshing(false);
      writeCachedIntegrationStatuses(integrationWorkspaceId, nextGoogle, nextSlack);
    });
    return () => { active = false; controller.abort(); };
  }, [activeView, authState.status, integrationStatusAttempt, integrationWorkspaceId, workspaceSettingsOpen, workspaceSettingsTab]);

  useEffect(() => {
    if (activeView !== "integrations" && !(workspaceSettingsOpen && workspaceSettingsTab === "integrations")) return;
    const params = new URLSearchParams(window.location.search);
    const slackResult = params.get("slack");
    if (!slackResult) return;
    const timeout = window.setTimeout(() => {
      if (slackResult === "connected") {
        setSlackOAuthIssue(null);
        showNotice("선택한 Slack 워크스페이스를 연결했습니다.");
      } else if (slackResult === "setup_required") {
        setSlackOAuthIssue(null);
        showNotice("OKRPTR 연결이 완료되었습니다. 데일리 초기 설정을 마쳐 주세요.");
      } else if (Object.prototype.hasOwnProperty.call(slackOAuthIssueCopy, slackResult)) {
        const issue = slackResult as SlackOAuthIssue;
        setSlackOAuthIssue(issue);
        showNotice(slackOAuthIssueCopy[issue].detail, slackOAuthIssueCopy[issue].tone === "error" ? "error" : undefined);
      }
      const url = new URL(window.location.href);
      url.searchParams.delete("slack");
      window.history.replaceState(window.history.state, "", url);
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [activeView, showNotice, workspaceSettingsOpen, workspaceSettingsTab]);

  useEffect(() => {
    if (workspaceMenuOpen && workspaceCreateOpen) workspaceNameInputRef.current?.focus();
  }, [workspaceMenuOpen, workspaceCreateOpen]);

  useEffect(() => {
    function syncFromHistory() {
      const next = navigationFromLocation();
      if (activeView === "okr" && next.view !== "okr" && okrEditorDirty) {
        void confirmAction({ title: "OKR 수정 중", message: "저장하지 않은 OKR 변경사항을 버리고 이동할까요?", confirmLabel: "변경사항 버리기", danger: true }).then((confirmed) => {
          if (!confirmed) {
            window.history.forward();
            return;
          }
          setOkrCreating(false);
          setOkrEditorDirty(false);
          setActiveView(next.view);
          setSelectedProjectId(next.projectId);
          setSelectedTaskId(next.taskId);
        });
        return;
      }
      setActiveView(next.view);
      setSelectedProjectId(next.projectId);
      setSelectedTaskId(next.taskId);
      const settings = workspaceSettingsFromLocation();
      setWorkspaceSettingsOpen(settings.open);
      setWorkspaceSettingsTab(settings.tab);
    }
    window.addEventListener("popstate", syncFromHistory);
    return () => window.removeEventListener("popstate", syncFromHistory);
  }, [activeView, confirmAction, okrEditorDirty]);

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
  const taskContainerOptions: TaskContainerOption[] = [
    ...executionItems.map((entry) => ({ id: entry.id, kind: "project" as const, title: entry.title })),
    ...routines.filter((entry) => entry.active && entry.systemKey !== "general").map((entry) => ({ id: entry.id, kind: "routine" as const, title: entry.title })),
  ];
  const defaultOkrCycle = okrCycles.find((cycle) => cycle.status === "active") ?? okrCycles[0] ?? null;
  const selectedOkrCycle = okrCycles.find((cycle) => cycle.id === selectedOkrCycleId) ?? defaultOkrCycle;
  const createItemCycle = okrCycles.find((cycle) => cycle.id === createItemCycleId) ?? selectedOkrCycle;
  const projectChatTargets: ProjectChatTarget[] = activeItems
    .filter((entry) => entry.kind === "initiative" && Boolean(entry.cycleId))
    .map((entry) => ({
      cycleId: entry.cycleId,
      cycleName: okrCycles.find((cycle) => cycle.id === entry.cycleId)?.name ?? "OKR",
      initiativeId: entry.id,
      initiativeTitle: entry.title,
    }));
  const okrCycleItemCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const cycle of okrCycles) counts[cycle.id] = activeItems.filter((entry) => entry.cycleId === cycle.id && ["objective", "key_result", "initiative"].includes(entry.kind)).length;
    return counts;
  }, [activeItems, okrCycles]);
  const periodItems = activeItems.filter(
    (entry) => cadence === "quarterly" || entry.cadence === cadence || entry.kind === "objective",
  );
  const completed = periodItems.filter((entry) => isCompletedStatus(entry.status)).length;
  const blocked = periodItems.filter((entry) => entry.status === "blocked").length;
  const measurablePeriodItems = periodItems.filter((entry) => entry.kind !== "objective" && entry.kind !== "initiative");
  const averageProgress = measurablePeriodItems.length
    ? Math.round(measurablePeriodItems.reduce((sum, entry) => sum + entry.progress, 0) / measurablePeriodItems.length)
    : 0;
  const selectedTask = activeItems.find((entry) => entry.id === selectedTaskId && entry.kind === "task");
  const selectedProject = activeItems.find((entry) => entry.id === selectedProjectId && entry.kind === "project");
  const activeWorkspaces = workspaces.filter((entry) => !entry.scheduledDeletionAt);
  const scheduledWorkspaces = workspaces.filter((entry) => Boolean(entry.scheduledDeletionAt));
  const workspaceNameCounts = workspaces.reduce((counts, workspace) => {
    const key = workspace.name.trim().toLocaleLowerCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
    return counts;
  }, new Map<string, number>());
  const currentWorkspace = activeWorkspaces.find((entry) => entry.current) ?? activeWorkspaces[0];
  const currentTeamMember = teamMembers.find((member) => member.isCurrent && member.status === "active");
  const deletableItemIds = new Set(activeItems
    .filter((item) => canUserDeleteItem(item, currentTeamMember, authState.user?.id ?? null))
    .map((item) => item.id));
  const canDeleteRecords = currentWorkspace?.role === "owner" || currentWorkspace?.role === "admin";

  useEffect(() => {
    const timeout = window.setTimeout(() => setSelectedDeleteItemIds(new Set()), 0);
    return () => window.clearTimeout(timeout);
  }, [activeView, currentWorkspace?.id, selectedProjectId, selectedTaskId]);
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

  function openWorkspaceSettings(tab: WorkspaceSettingsTab = "general", mode: "push" | "replace" = "push") {
    setWorkspaceMenuOpen(false);
    setWorkspaceCreateOpen(false);
    setMobileMenuOpen(false);
    setWorkspaceSettingsTab(tab);
    setWorkspaceSettingsOpen(true);
    const url = new URL(window.location.href);
    url.searchParams.set("settings", "workspace");
    url.searchParams.set("tab", tab);
    if (tab !== "groups") url.searchParams.delete("group");
    window.history[mode === "push" ? "pushState" : "replaceState"]({ ...window.history.state, __okrptrWorkspaceSettings: true }, "", url);
  }

  function closeWorkspaceSettings() {
    setWorkspaceSettingsOpen(false);
    setRequestedGroupHandle(null);
    const url = new URL(window.location.href);
    url.searchParams.delete("settings");
    url.searchParams.delete("tab");
    url.searchParams.delete("group");
    const state = { ...window.history.state };
    delete state.__okrptrWorkspaceSettings;
    window.history.replaceState(state, "", url);
  }

  function reloadWithoutWorkspaceSettings() {
    const url = new URL(window.location.href);
    for (const key of ["settings", "tab", "group", "slack"]) url.searchParams.delete(key);
    window.location.href = url.toString();
  }

  function navigateView(view: View, mode: "push" | "replace" = "push") {
    if (activeView === "okr" && view !== "okr" && okrEditorDirty) {
      void confirmAction({ title: "OKR 수정 중", message: "저장하지 않은 OKR 변경사항을 버리고 이동할까요?", confirmLabel: "변경사항 버리기", danger: true }).then((confirmed) => {
        if (!confirmed) return;
        setOkrCreating(false);
        setOkrEditorDirty(false);
        setSelectedProjectId(null);
        setSelectedTaskId(null);
        setActiveView(view);
        writeNavigation(view, null, null, mode);
      });
      return;
    }
    if (view !== "okr") {
      setOkrCreating(false);
      setOkrEditorDirty(false);
    }
    setSelectedProjectId(null);
    setSelectedTaskId(null);
    setActiveView(view);
    writeNavigation(view, null, null, mode);
  }

  function refreshIntegrationStatuses() {
    setIntegrationStatusRefreshing(true);
    setIntegrationStatusError(false);
    setIntegrationStatusAttempt((attempt) => attempt + 1);
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
    const targeting = assistantTargeting;
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
    if (response.ok) { clearCachedBootstrap(); reloadWithoutWorkspaceSettings(); }
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
    if (response.ok) { clearCachedBootstrap(); reloadWithoutWorkspaceSettings(); }
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
    if (response.ok) { clearCachedBootstrap(); reloadWithoutWorkspaceSettings(); }
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
    if (response.ok) { clearCachedBootstrap(); reloadWithoutWorkspaceSettings(); }
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
    if (response.ok) { clearCachedBootstrap(); reloadWithoutWorkspaceSettings(); }
    else {
      const data = await response.json().catch(() => ({})) as { error?: string };
      setWorkspaceSaving(false);
      showNotice(data.error ?? "워크스페이스를 영구삭제하지 못했습니다.");
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
    if (!deletableItemIds.has(itemId)) return;
    setSelectedDeleteItemIds((current) => {
      const next = new Set(current);
      if (next.has(itemId)) next.delete(itemId); else next.add(itemId);
      return next;
    });
  }

  function addDeleteItems(itemIds: string[]) {
    setSelectedDeleteItemIds((current) => new Set([...current, ...itemIds.filter((id) => deletableItemIds.has(id))]));
  }

  function removeDeleteItems(itemIds: string[]) {
    const removing = new Set(itemIds);
    setSelectedDeleteItemIds((current) => new Set([...current].filter((id) => !removing.has(id))));
  }

  async function moveSelectedItemsToTrash() {
    if (!selectedDeleteItemIds.size || trashingItems) return;
    const selected = activeItems.filter((item) => selectedDeleteItemIds.has(item.id) && deletableItemIds.has(item.id) && (item.kind === "project" || item.kind === "task"));
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
    if (!deletableItemIds.has(project.id)) {
      showNotice("Project는 생성자 또는 주 DRI만 삭제할 수 있습니다.", "error");
      return;
    }
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
      key: `${currentWorkspace?.id ?? "workspace"}:create:${cycle.id}:${sourceKind}`,
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

  function openTaskCreationChat(initialMessage = "") {
    setCreateItemOpen(false);
    setOkrChatContext({
      key: `${currentWorkspace?.id ?? "workspace"}:task`,
      entry: "task",
      cycleId: selectedOkrCycle?.id ?? "",
      cycleName: "Task",
      initialMessage: initialMessage.trim(),
      sourceKind: "task",
      target: null,
      targetCandidates: [],
    });
    setSelectedProjectId(null);
    setSelectedTaskId(null);
    setActiveView("home");
    writeNavigation("home", null, null);
  }

  function openProjectCreationChat(initialMessage = "") {
    setCreateItemOpen(false);
    setOkrChatContext({
      key: `${currentWorkspace?.id ?? "workspace"}:project`,
      entry: "project",
      cycleId: selectedOkrCycle?.id ?? "",
      cycleName: selectedOkrCycle?.name ?? "Project",
      initialMessage: initialMessage.trim(),
      sourceKind: "project",
      target: null,
      targetCandidates: [],
    });
    setSelectedProjectId(null);
    setSelectedTaskId(null);
    setActiveView("home");
    writeNavigation("home", null, null);
  }

  function openRoutineCreationChat(initialMessage = "") {
    setRoutineCreateOpen(false);
    setOkrChatContext({
      key: `${currentWorkspace?.id ?? "workspace"}:routine`,
      entry: "routine",
      cycleId: "",
      cycleName: "Routine",
      initialMessage: initialMessage.trim(),
      target: null,
      targetCandidates: [],
    });
    setSelectedProjectId(null);
    setSelectedTaskId(null);
    setActiveView("home");
    writeNavigation("home", null, null);
  }

  async function createTasksFromConversation(taskText: string, containerValue: string, assigneeMemberId: string | null) {
    const titles = taskText.split("\n").map((entry) => entry.trim()).filter(Boolean);
    const [containerKind, containerId] = containerValue.split(":", 2);
    const container = containerValue ? taskContainerOptions.find((entry) => entry.kind === containerKind && entry.id === containerId) : null;
    const project = containerKind === "project" ? executionItems.find((entry) => entry.id === containerId) : null;
    if (!titles.length || (containerValue && (!container || containerKind !== "project" && containerKind !== "routine"))) return false;
    try {
      const response = await fetch("/api/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titles,
          kind: "task",
          cycleId: container?.kind === "project" ? project?.cycleId ?? null : null,
          parentId: container?.kind === "project" ? container.id : null,
          routineId: container?.kind === "routine" ? container.id : null,
          source: "web",
          assigneeMemberId,
        }),
      });
      const data = await response.json().catch(() => ({})) as { items?: OkrptrItem[]; error?: string };
      if (!response.ok || !data.items) throw new Error(data.error ?? "Task를 만들지 못했습니다.");
      const created = data.items;
      setItems((current) => [...current, ...created]);
      setOkrChatContext(null);
      navigateView("inbox");
      showNotice(container ? `Task ${created.length}개를 연결해 만들었습니다.` : `Task ${created.length}개를 General에 만들었습니다.`);
      return true;
    } catch (error) {
      showNotice(error instanceof Error ? error.message : "Task를 만들지 못했습니다.", "error");
      return false;
    }
  }

  function openProjectPage(id: string) {
    setSelectedTaskId(null);
    setSelectedProjectId(id);
    setActiveView("work");
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

  function createOkrFile() {
    if (okrEditorDirty) {
      void confirmAction({ title: "새 OKR 파일", message: "저장하지 않은 변경사항을 버리고 새 OKR 파일을 만들까요?", confirmLabel: "변경사항 버리기", danger: true }).then((confirmed) => {
        if (!confirmed) return;
        setOkrListOpen(false);
        setOkrEditorDirty(false);
        setOkrCreating(true);
        setActiveView("okr");
        writeNavigation("okr", null, null);
      });
      return;
    }
    setOkrListOpen(false);
    setOkrCreating(true);
    setActiveView("okr");
    writeNavigation("okr", null, null);
  }

  function selectOkrFile(id: string) {
    if (okrEditorDirty) {
      void confirmAction({ title: "다른 OKR 파일 열기", message: "저장하지 않은 변경사항을 버리고 다른 OKR 파일을 열까요?", confirmLabel: "변경사항 버리기", danger: true }).then((confirmed) => {
        if (!confirmed) return;
        setOkrCreating(false);
        setOkrEditorDirty(false);
        setSelectedOkrCycleId(id);
        setVisibleOkrCycleIds([id]);
        setOkrListOpen(false);
      });
      return;
    }
    setOkrCreating(false);
    setOkrEditorDirty(false);
    setSelectedOkrCycleId(id);
    setVisibleOkrCycleIds([id]);
    setOkrListOpen(false);
  }

  function applySavedOkrFile(file: { cycle: OkrFileCycleSummary }) {
    setOkrCreating(false);
    setOkrEditorDirty(false);
    setSelectedOkrCycleId(file.cycle.id);
    setVisibleOkrCycleIds([file.cycle.id]);
    setOkrCycles((current) => {
      const found = current.some((cycle) => cycle.id === file.cycle.id);
      const merged = found ? current.map((cycle) => cycle.id === file.cycle.id ? file.cycle : cycle) : [file.cycle, ...current];
      return merged.map((cycle) => ({ ...cycle, status: file.cycle.status === "active" && cycle.id !== file.cycle.id && cycle.status === "active" ? "planned" : cycle.status }));
    });
    clearCachedBootstrap();
    setWorkspaceDataAttempt((current) => current + 1);
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
    if (!objectiveTitle) {
      showNotice("Objective 이름을 먼저 적어 주세요.");
      return null;
    }
    if (!plan.keyResults.length || plan.keyResults.some((entry) => !entry.title.trim())) {
      showNotice("Objective에는 하나 이상의 Key Result가 필요합니다.");
      return null;
    }
    if (!targetCycleId) {
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
    try {
      const okrResult = await applyAssistantOkrPlan(plan, targetCycleId, null, null);
      if (!okrResult) return null;
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
      return {
        cycleId: targetCycleId,
        items: okrResult.items,
        keyResultIds: okrResult.keyResultIds,
        initiativeIds: okrResult.initiativeIds,
        projectIds: okrResult.projectIds,
      } satisfies PlanCreationResult;
    } catch {
      showNotice("OKR 구성을 만들지 못했습니다.");
      return null;
    }
  }

  async function applyAssistantOkrPlan(plan: OnboardingPlan, cycleId: string, target: OkrPlanTarget | null, _driMemberId: string | null) {
    void _driMemberId;
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
          project: "",
          driMemberId: null,
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
      showNotice(`KR ${krCount}개 · Initiative ${initiativeCount}개를 만들었습니다. 실행 계획은 Project 탭에서 만들 수 있습니다.`);
      return data;
    } catch {
      showNotice("OKR 구성을 만들지 못했습니다.");
      return null;
    }
  }

  async function createProjectFromConversation(plan: OnboardingPlan, target: ProjectChatTarget, driMemberId: string | null) {
    const projectTitle = plan.project.trim();
    if (!projectTitle) {
      showNotice("Project 이름을 먼저 정리해 주세요.");
      return false;
    }
    try {
      const projectResponse = await fetch("/api/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: projectTitle,
          kind: "project",
          cycleId: target.cycleId,
          parentId: target.initiativeId,
          status: "in_progress",
          driMemberId: driMemberId || currentTeamMember?.id || null,
        }),
      });
      const projectData = await projectResponse.json().catch(() => ({})) as { item?: OkrptrItem; error?: string };
      if (!projectResponse.ok || !projectData.item) throw new Error(projectData.error ?? "Project를 만들지 못했습니다.");
      const projectItem = projectData.item;
      const taskTitles = plan.tasks.split("\n").map((entry) => entry.trim()).filter(Boolean);
      let createdTasks: OkrptrItem[] = [];
      if (taskTitles.length) {
        const taskResponse = await fetch("/api/items", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            titles: taskTitles,
            kind: "task",
            parentId: projectItem.id,
          }),
        });
        const taskData = await taskResponse.json().catch(() => ({})) as { items?: OkrptrItem[]; error?: string };
        if (!taskResponse.ok || !taskData.items) {
          setItems((current) => [...current, projectItem]);
          setOkrChatContext(null);
          setSelectedProjectId(null);
          setSelectedTaskId(null);
          if (target.cycleId) {
            setSelectedOkrCycleId(target.cycleId);
            setVisibleOkrCycleIds((current) => current.includes(target.cycleId!) ? current : [target.cycleId!, ...current]);
          }
          navigateView("work");
          showNotice("Project는 만들었지만 하위 Task는 저장하지 못했습니다. Project에서 다시 추가해 주세요.", "error");
          return true;
        }
        createdTasks = taskData.items;
      }
      setItems((current) => [...current, projectItem, ...createdTasks]);
      setOkrChatContext(null);
      setSelectedProjectId(null);
      setSelectedTaskId(null);
      if (target.cycleId) {
        setSelectedOkrCycleId(target.cycleId);
        setVisibleOkrCycleIds((current) => current.includes(target.cycleId!) ? current : [target.cycleId!, ...current]);
      }
      navigateView("work");
      showNotice(createdTasks.length ? `Project와 하위 Task ${createdTasks.length}개를 만들었습니다.` : "Project를 만들었습니다.");
      return true;
    } catch (error) {
      showNotice(error instanceof Error ? error.message : "Project를 만들지 못했습니다.", "error");
      return false;
    }
  }

  async function createRoutineFromConversation(plan: OnboardingPlan, assigneeMemberId: string | null) {
    const routineTitle = plan.routineTitle.trim();
    if (!routineTitle) {
      showNotice("Routine 이름을 먼저 정리해 주세요.");
      return false;
    }
    try {
      const response = await fetch("/api/routines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: routineTitle,
          triggerPoint: plan.routineTrigger,
          actionPlace: plan.routinePlace,
          actionSteps: plan.routineSteps,
          cadence: plan.routineCadence,
          assigneeMemberId,
        }),
      });
      const data = await response.json().catch(() => ({})) as { routine?: Routine; error?: string };
      if (!response.ok || !data.routine) throw new Error(data.error ?? "Routine을 만들지 못했습니다.");
      const routine = data.routine;
      setRoutines((current) => [...current, routine]);
      const taskTitles = plan.tasks.split("\n").map((entry) => entry.trim()).filter(Boolean);
      let createdTasks: OkrptrItem[] = [];
      if (taskTitles.length) {
        const taskResponse = await fetch("/api/items", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            titles: taskTitles,
            kind: "task",
            routineId: routine.id,
          }),
        });
        const taskData = await taskResponse.json().catch(() => ({})) as { items?: OkrptrItem[]; error?: string };
        if (!taskResponse.ok || !taskData.items) {
          setOkrChatContext(null);
          navigateView("routines");
          showNotice("Routine은 만들었지만 하위 Task는 저장하지 못했습니다. Routine에서 다시 추가해 주세요.", "error");
          return true;
        }
        createdTasks = taskData.items;
        setItems((current) => [...current, ...createdTasks]);
      }
      setOkrChatContext(null);
      navigateView("routines");
      showNotice(createdTasks.length ? `Routine과 하위 Task ${createdTasks.length}개를 만들었습니다.` : "Routine을 만들었습니다.");
      return true;
    } catch (error) {
      showNotice(error instanceof Error ? error.message : "Routine을 만들지 못했습니다.", "error");
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
          <button className="workspace-settings-trigger" onClick={() => openWorkspaceSettings("general")} aria-label="워크스페이스 설정" title="워크스페이스 설정"><Settings size={17} /></button>
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
              <button className={`nav-item ${activeView === entry.id && !selectedProject ? "active" : ""}`} aria-current={activeView === entry.id && !selectedProject && !selectedTask ? "page" : undefined} key={entry.id} onClick={() => entry.id === "home" ? openAssistant() : navigateView(entry.id)}>
                <Icon size={16} /><span>{entry.label}</span>
              </button>
            );
          })}
        </nav>
        <nav className="mobile-navigation" aria-label="주요 메뉴">
          {mobileNavItems.map((entry) => {
            const Icon = entry.icon;
            return (
              <button className={`nav-item ${activeView === entry.id && !selectedProject ? "active" : ""}`} aria-current={activeView === entry.id && !selectedProject && !selectedTask ? "page" : undefined} key={entry.id} onClick={() => entry.id === "home" ? openAssistant() : navigateView(entry.id)}>
                <Icon size={16} /><span>{entry.label}</span>
              </button>
            );
          })}
          <button className={`nav-item ${mobileMenuOpen ? "active" : ""}`} onClick={() => setMobileMenuOpen(true)}><Menu size={16} /><span>더보기</span></button>
        </nav>
        <div className="sidebar-bottom">
          <button className="nav-item" onClick={() => setIntegrationOpen(true)}><Link2 size={16} /><span>AI 연결</span></button>
          <button className={`nav-item ${activeView === "integrations" && !selectedProject && !selectedTask ? "active" : ""}`} aria-current={activeView === "integrations" && !selectedProject && !selectedTask ? "page" : undefined} onClick={() => navigateView("integrations")}><Plug size={16} /><span>개인 앱 연동</span></button>
          <button className={`nav-item ${activeView === "billing" && !selectedProject && !selectedTask ? "active" : ""}`} aria-current={activeView === "billing" && !selectedProject && !selectedTask ? "page" : undefined} onClick={() => navigateView("billing")}><CreditCard size={16} /><span>요금제 및 결제</span></button>
          <button className="profile-row" onClick={() => setPropertyPanelOpen(true)}><span className="avatar">{accountInitial}</span><span>{accountDisplayName}</span><MoreHorizontal size={15} /></button>
        </div>
      </aside>

      {mobileMenuOpen && (
        <OverlayDialog title="더보기 메뉴" variant="sheet" className="mobile-menu-backdrop" onRequestClose={() => setMobileMenuOpen(false)}>
          {(requestClose) => <aside className="mobile-menu-sheet">
            <header><div><b>{currentWorkspace?.name || "개인 워크스페이스"}</b><small>{currentWorkspace?.personal ? "개인 워크스페이스" : "팀 워크스페이스"}</small></div><span className="mobile-menu-header-actions"><button className="icon-button" onClick={() => openWorkspaceSettings("general")} aria-label="워크스페이스 설정"><Settings size={17} /></button><button className="icon-button" onClick={() => requestClose("close-button")} aria-label="닫기"><X size={17} /></button></span></header>
            <div className="mobile-menu-list">
              {navItems.slice(5).map((entry) => { const Icon = entry.icon; return <button key={entry.id} onClick={() => { navigateView(entry.id); setMobileMenuOpen(false); }}><Icon size={16} /><span>{entry.label}</span><ChevronRight size={14} /></button>; })}
              <button onClick={() => { setMobileMenuOpen(false); setIntegrationOpen(true); }}><Link2 size={16} /><span>AI 연결</span><ChevronRight size={14} /></button>
              <button onClick={() => { setMobileMenuOpen(false); navigateView("integrations"); }}><Plug size={16} /><span>개인 앱 연동</span><ChevronRight size={14} /></button>
              <button onClick={() => { setMobileMenuOpen(false); navigateView("billing"); }}><CreditCard size={16} /><span>요금제 및 결제</span><ChevronRight size={14} /></button>
              <button className="mobile-account-entry" onClick={() => { setMobileMenuOpen(false); setPropertyPanelOpen(true); }}><span className="avatar">{accountInitial}</span><span><b>{accountDisplayName}</b><small>개인 설정</small></span><ChevronRight size={14} /></button>
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
          <div><button className="mobile-assistant-trigger" aria-label="AI 대화 열기" title="AI 대화 열기" onClick={openAssistant}><span aria-hidden="true">🤖</span></button><button aria-label="워크스페이스 설정" title="워크스페이스 설정" onClick={() => openWorkspaceSettings("general")}><Settings size={16} /></button><button aria-label="서비스 안내" title="서비스 안내" onClick={() => setOnboardingOpen(true)}><CircleHelp size={15} /></button></div>
        </header>
        <div className="page-body">
          <MarketingConsentPrompt
            key={authState.user?.id ?? ""}
            userId={authState.user?.id ?? ""}
            onNotice={(message) => showNotice(message, "error")}
          />
          {activeView !== "home" && !selectedProject && <header className="page-header">
            <div><h1>{viewTitles[activeView]}</h1><p>{pageSubtitle(activeView)}</p></div>
            {activeView === "okr" ? (
              <button className="primary-action" onClick={() => setOkrListOpen(true)}><Archive size={14} />목록보기</button>
            ) : activeView === "inbox" ? (
              <div className="page-create-actions"><button onClick={() => openTaskCreationChat()}><Bot size={14} />AI 대화로 추가</button><button className="primary-action" onClick={() => openCreateItem("task", null)}><Plus size={14} />직접 추가</button></div>
            ) : activeView === "work" ? (
              <div className="page-create-actions"><ProjectQuotaBadge /><button onClick={() => openProjectCreationChat()}><Bot size={14} />AI 대화로 추가</button><button className="primary-action" onClick={() => openCreateItem("project")}><Plus size={14} />직접 추가</button></div>
            ) : activeView === "routines" ? (
              <div className="page-create-actions"><button onClick={() => openRoutineCreationChat()}><Bot size={14} />AI 대화로 추가</button><button className="primary-action" onClick={() => setRoutineCreateOpen(true)}><Plus size={14} />직접 추가</button></div>
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
          <div className="assistant-view-shell" hidden={activeView !== "home" || Boolean(selectedProject)}>
            <HomeView
              key={okrChatContext?.key ?? `${currentWorkspace?.id ?? "workspace"}:default`}
              onCreatePlan={createOnboardingPlan}
              onCreateProject={createProjectFromConversation}
              onCreateRoutine={createRoutineFromConversation}
              onApplyOkrPlan={applyAssistantOkrPlan}
              onCreateTasks={createTasksFromConversation}
              onFinish={() => { const destination = okrChatContext?.entry === "task" ? "inbox" : okrChatContext?.entry === "project" ? "work" : okrChatContext?.entry === "routine" ? "routines" : "okr"; setOkrChatContext(null); navigateView(destination); }}
              onNavigateToOkr={() => { setOkrChatContext(null); navigateView("okr"); }}
              context={okrChatContext}
              usageScope={activeView === "home" && currentWorkspace && authState.user ? { workspaceId: currentWorkspace.id, userId: authState.user.id } : null}
              workspaceContext={assistantWorkspaceContext}
              canWrite={canWriteWorkspace}
              members={teamMembers.filter((member) => member.status === "active")}
              taskContainers={taskContainerOptions}
              projectTargets={projectChatTargets}
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
              canDeleteItem={(item) => deletableItemIds.has(item.id)}
              selectedItemIds={selectedDeleteItemIds}
              onToggleSelect={toggleDeleteSelection}
            />
          ) : (
            <>
          {activeView === "my_work" && <MyWorkView key={`${currentWorkspace?.id ?? ""}:${currentTeamMember?.id ?? ""}`} workspaceId={currentWorkspace?.id ?? ""} items={activeItems} routines={routines} currentMember={currentTeamMember ?? null} onOpenProject={openProjectPage} onOpenTask={openTaskDetail} onRoutinesChange={setRoutines} onNotice={showNotice} />}
          {activeView === "inbox" && <TaskListView items={taskItems} allItems={items} routines={routines} onOpenTask={openTaskDetail} onPatch={patchItem} canDeleteItem={(item) => deletableItemIds.has(item.id)} selectedItemIds={selectedDeleteItemIds} onToggleSelect={toggleDeleteSelection} onSelectItems={addDeleteItems} onClearItems={removeDeleteItems} onTrashSelected={() => void moveSelectedItemsToTrash()} trashing={trashingItems} />}
          {activeView === "work" && (
            <section className="project-workspace">
              <TaskDatabase
                items={executionItems}
                allItems={activeItems}
                properties={properties}
                values={propertyValues}
                hiddenProperties={hiddenProperties}
                display={taskDisplay}
                onDisplayChange={setTaskDisplay}
                onPatch={patchItem}
                onPropertyChange={setPropertyValue}
                onOpenProperties={() => openWorkspaceSettings("projects")}
                onOpenTask={openTaskDetail}
                onOpenProject={openProjectPage}
                canDeleteItem={(item) => deletableItemIds.has(item.id)}
                selectedItemIds={selectedDeleteItemIds}
                onToggleSelect={toggleDeleteSelection}
                onSelectItems={addDeleteItems}
                onClearItems={removeDeleteItems}
              />
            </section>
          )}
          {activeView === "routines" && <RoutineView workspaceId={currentWorkspace?.id ?? ""} initialRoutines={routines} teamMembers={teamMembers} onNotice={showNotice} onRoutinesChange={setRoutines} createOpen={routineCreateOpen} onCreateClose={() => setRoutineCreateOpen(false)} onCreateWithChat={openRoutineCreationChat} />}
          {activeView === "data" && <ClientDataView key={currentWorkspace?.id ?? ""} cacheKey={currentWorkspace?.id ?? ""} items={activeItems} cycles={okrCycles} readOnly={currentWorkspace?.role === "viewer"} onProgressChange={(id, progress) => setItems((current) => current.map((entry) => entry.id === id ? { ...entry, progress } : entry))} onNotice={showNotice} />}
          {activeView === "okr" && (
            <section className="okr-workbench">
              <section className="okr-document">
                {okrCreating || selectedOkrCycle ? <OkrFileSurface
                  key={`${currentWorkspace?.id ?? ""}:${okrCreating ? "new" : selectedOkrCycle?.id}`}
                  workspaceId={currentWorkspace?.id ?? ""}
                  cycle={okrCreating ? null : selectedOkrCycle ?? null}
                  creating={okrCreating}
                  readOnly={!canWriteWorkspace}
                  executionItems={activeItems}
                  onSaved={applySavedOkrFile}
                  onSplit={(cycles) => {
                    setOkrCycles(cycles);
                    clearCachedBootstrap();
                    setWorkspaceDataAttempt((current) => current + 1);
                  }}
                  onCancelCreate={() => { setOkrCreating(false); setOkrEditorDirty(false); }}
                  onNavigateProjects={() => navigateView("work")}
                  onOpenProject={openProjectPage}
                  onOpenTask={openTaskDetail}
                  onNotice={(message, tone) => showNotice(message, tone)}
                  onDirtyChange={setOkrEditorDirty}
                  onConfirm={(options) => confirmAction(options)}
                /> : <div className="okr-file-empty"><Archive size={22} /><div><h2>OKR 파일이 없습니다</h2><p>Objective·KR·Initiative를 한 번에 작성해 첫 파일을 만드세요.</p></div>{canWriteWorkspace && <button onClick={createOkrFile}><Plus size={14} />새 OKR 파일</button>}</div>}
              </section>
            </section>
          )}
          {activeView === "scrum" && <DailyScrumView workspaceId={currentWorkspace?.id ?? ""} onOpenTask={openTaskDetail} onNotice={showNotice} />}
          {activeView === "integrations" && <AppIntegrationsView google={googleStatus} slack={slackStatus} loading={integrationStatusRefreshing || !integrationStatusesLoaded} loadError={integrationStatusError} onGoogleChange={setGoogleStatus} onRefresh={refreshIntegrationStatuses} onNotice={showNotice} />}
          {activeView === "billing" && <BillingView onNotice={showNotice} />}
          {activeView === "recommendations" && <RecommendationsView workspaceId={currentWorkspace?.id ?? ""} items={activeItems} onOpenTask={openTaskDetail} onOpenProject={openProjectPage} onNavigate={navigateView} />}
          {activeView === "reviews" && <ReviewView items={periodItems} cadence={cadence} completed={completed} blocked={blocked} averageProgress={averageProgress} onOpenTask={openTaskDetail} onOpenProject={openProjectPage} />}
          {activeView === "trash" && <TrashView workspaceId={currentWorkspace?.id ?? ""} onNotice={showNotice} canDeleteRecords={canDeleteRecords} canRestore={Boolean(currentWorkspace && currentWorkspace.role !== "viewer")} />}
            </>
          )}
          </>}
        </div>
      </section>

      {activeView !== "inbox" && selectedDeleteItemIds.size > 0 && (
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
            itemCounts={okrCycleItemCounts}
            deletingIds={deletingOkrCycleIds}
            slowDeletingId={slowDeletingOkrCycleId}
            onSelect={selectOkrFile}
            onSetDefault={(id) => void setDefaultOkrFile(id)}
            onDelete={(id) => void deleteOkrFile(id)}
            onCreate={createOkrFile}
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
      {inviteToken && <InvitationDialog
        token={inviteToken}
        preview={invitePreview}
        loadError={inviteLoadError}
        onClose={() => {
          window.history.replaceState(window.history.state, "", `${window.location.pathname}${window.location.search}`);
          setInviteToken(null);
          setInvitePreview(null);
          setInviteLoadError("");
        }}
        onAccepted={() => {
          clearCachedBootstrap();
          window.history.replaceState(window.history.state, "", `${window.location.pathname}${window.location.search}`);
          window.location.reload();
        }}
      />}
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
      {integrationOpen && <AIConnectionsDialog onNotice={showNotice} onClose={() => setIntegrationOpen(false)} />}
      {propertyPanelOpen && (
        <PropertyPanel
          user={authState.user}
          displayName={accountDisplayName}
          themeMode={themeMode}
          onThemeModeChange={setThemeMode}
          onClose={() => setPropertyPanelOpen(false)}
          onSignOut={() => { clearCachedBootstrap(); window.location.href = "/api/auth/logout"; }}
        />
      )}
      {workspaceSettingsOpen && currentWorkspace && (
        <WorkspaceSettingsPanel
          key={currentWorkspace.id}
          currentWorkspace={currentWorkspace}
          scheduledWorkspaces={scheduledWorkspaces}
          teamData={teamData}
          properties={properties}
          teamMembers={teamMembers}
          tab={workspaceSettingsTab}
          requestedGroupHandle={requestedGroupHandle}
          slack={slackStatus}
          slackOAuthIssue={slackOAuthIssue}
          integrationLoading={integrationStatusRefreshing || !integrationStatusesLoaded}
          integrationLoadError={integrationStatusError}
          workspaceSaving={workspaceSaving}
          onTabChange={(tab) => openWorkspaceSettings(tab, "replace")}
          onClose={closeWorkspaceSettings}
          onTeamChange={setTeamData}
          onPropertiesChanged={setProperties}
          onOpenAvatar={() => setWorkspaceAvatarOpen(true)}
          onCleanup={() => { closeWorkspaceSettings(); setCleanupOpen(true); }}
          onDeleteWorkspace={(workspace) => void deleteWorkspace(workspace)}
          onRestoreWorkspace={(workspace) => void restoreWorkspace(workspace)}
          onPermanentlyDeleteWorkspace={(workspace) => void permanentlyDeleteWorkspace(workspace)}
          onSlackChange={setSlackStatus}
          onRefreshIntegrations={refreshIntegrationStatuses}
          onNotice={showNotice}
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
      {createItemOpen && <CreateItemPanel initialKind={createItemKind} cycleId={createItemCycle?.id ?? null} items={items} routines={routines} properties={properties} teamMembers={teamMembers} onClose={() => setCreateItemOpen(false)} onCreated={addCreatedItem} onCreateWithChat={activeView === "inbox" && createItemKind === "task" ? ({ title }) => openTaskCreationChat(title) : activeView === "work" && createItemKind === "project" ? ({ title }) => openProjectCreationChat(title) : activeView === "okr" && createItemCycle ? ({ kind, title }) => openOkrCreationChat(createItemCycle, kind, title) : undefined} />}
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
          canDelete={deletableItemIds.has(selectedTask.id)}
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
          <h1>로그인 또는 회원가입</h1>
          <p>Google이 확인한 이메일로 바로 시작하세요. 휴대전화 번호나 별도 본인인증은 요구하지 않습니다.</p>
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
  clearCachedBootstrap();
  const returnTo = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  window.location.assign(`/api/auth/google?returnTo=${encodeURIComponent(returnTo)}`);
}

function invitationTokenFromLocation() {
  if (typeof window === "undefined") return null;
  const token = new URLSearchParams(window.location.hash.replace(/^#/, "")).get("invite")?.trim() ?? "";
  return /^[a-f0-9]{64}$/.test(token) ? token : null;
}

function InvitationDialog({ token, preview, loadError, onClose, onAccepted }: {
  token: string;
  preview: InvitationPreview | null;
  loadError: string;
  onClose: () => void;
  onAccepted: () => void;
}) {
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState("");

  async function accept() {
    if (!preview || preview.status !== "pending" || accepting) return;
    setAccepting(true);
    setError("");
    const response = await fetch("/api/invitations/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    const data = await response.json() as { accepted?: boolean; workspaceName?: string; error?: string };
    setAccepting(false);
    if (!response.ok || !data.accepted) {
      setError(data.error ?? "초대를 수락하지 못했습니다.");
      return;
    }
    onAccepted();
  }

  const statusMessage = preview?.status === "expired"
    ? "이 초대는 만료되었습니다. 워크스페이스 관리자에게 재전송을 요청해 주세요."
    : preview?.status === "revoked"
      ? "취소된 초대입니다."
      : preview?.status === "accepted"
        ? "이미 가입이 완료된 초대입니다."
        : "초대받은 이메일과 같은 Google 계정으로 로그인한 경우에만 가입할 수 있습니다.";

  return (
    <OverlayDialog title="워크스페이스 초대" dismissPolicy="critical" onRequestClose={() => onClose()}>
      {(requestClose) => <section className="invitation-dialog">
        <header>
          <div><span>OKRPTR 초대</span><h2>워크스페이스에 가입하기</h2></div>
          <button className="icon-button" onClick={() => requestClose("close-button")} aria-label="초대 창 닫기" title="닫기"><X size={17} /></button>
        </header>
        {!preview && !loadError ? (
          <div className="invitation-dialog-loading" role="status"><LoaderCircle className="spin" size={18} /><span>초대를 확인하고 있습니다.</span></div>
        ) : loadError ? (
          <div className="invitation-dialog-error" role="alert"><AlertTriangle size={18} /><div><b>초대를 확인할 수 없습니다.</b><p>{loadError}</p></div></div>
        ) : preview ? (
          <>
            <div className="invitation-workspace-card">
              <span className="brand-mark">{preview.workspace.name.slice(0, 1).toLocaleUpperCase()}</span>
              <div><h3>{preview.workspace.name}</h3><p>{preview.inviterName} 님이 {teamRoleLabel(preview.role)} 역할로 초대했습니다.</p></div>
            </div>
            <dl className="invitation-details">
              <div><dt>초대 계정</dt><dd>{preview.emailHint}</dd></div>
              <div><dt>유효 기간</dt><dd>{new Date(preview.expiresAt).toLocaleDateString("ko-KR")}까지</dd></div>
            </dl>
            <p className={`invitation-status-copy status-${preview.status}`}>{statusMessage}</p>
            {error && <p className="invitation-dialog-error-text" role="alert">{error}</p>}
          </>
        ) : null}
        <footer>
          <button type="button" onClick={() => requestClose("close-button")}>닫기</button>
          {preview?.status === "pending" && <button type="button" className="primary" disabled={accepting} onClick={() => void accept()}>{accepting ? <><LoaderCircle className="spin" size={14} />가입 중</> : "이 워크스페이스에 가입"}</button>}
        </footer>
      </section>}
    </OverlayDialog>
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

function TaskDatabase({ items, allItems, properties, values, hiddenProperties, display, onDisplayChange, onPatch, onPropertyChange, onOpenProperties, onOpenTask, onOpenProject, canDeleteItem, selectedItemIds, onToggleSelect, onSelectItems, onClearItems }: {
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
  canDeleteItem: (item: OkrptrItem) => boolean;
  selectedItemIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onSelectItems: (ids: string[]) => void;
  onClearItems: (ids: string[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<ItemStatus | "all">("all");
  const [priorityFilter, setPriorityFilter] = useState<Priority | "all">("all");
  const [driFilter, setDriFilter] = useState("all");
  const [dueFilter, setDueFilter] = useState<"all" | "overdue" | "week" | "none">("all");
  const [sort, setSort] = useState<"default" | "recent" | "due" | "priority" | "name">("default");
  const [filterOpen, setFilterOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
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
  const deletableVisible = visible.filter(canDeleteItem);
  const selectedVisibleCount = deletableVisible.filter((entry) => selectedItemIds.has(entry.id)).length;

  function closeSelectionMode() {
    onClearItems(deletableVisible.map((entry) => entry.id));
    setSelectionMode(false);
  }

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
          {deletableVisible.length > 0 && <button className={selectionMode ? "active" : ""} aria-label={selectionMode ? "선택 종료" : "선택"} aria-pressed={selectionMode} onClick={() => selectionMode ? closeSelectionMode() : setSelectionMode(true)}>{selectionMode ? <X size={13} /> : <ListChecks size={13} />}<span>{selectionMode ? "선택 종료" : "선택"}</span></button>}
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
      {selectionMode && <div className="project-selection-bar" role="region" aria-label="Project 선택 모드"><span>삭제할 Project를 선택하세요</span><b>{selectedVisibleCount}개 선택</b><button onClick={() => selectedVisibleCount === deletableVisible.length ? onClearItems(deletableVisible.map((entry) => entry.id)) : onSelectItems(deletableVisible.map((entry) => entry.id))}>{selectedVisibleCount === deletableVisible.length ? "전체 해제" : "현재 목록 전체 선택"}</button></div>}
      {display === "cards" ? <div className="project-card-list" role="list" aria-label="Project 카드 목록">{visible.map((entry) => {
        const previews = propertyPreview(entry);
        return <article className={`project-card ${selectionMode ? "selection-mode" : ""}`} role="listitem" key={entry.id}>
          {selectionMode && canDeleteItem(entry) && <DeleteSelectCheckbox item={entry} selected={selectedItemIds.has(entry.id)} onToggle={onToggleSelect} />}
          <button className="project-card-open" onClick={() => onOpenProject(entry.id)}>
            <header><b>{entry.title}</b><ChevronRight size={15} /></header>
            <div className="project-card-meta"><span className={`status-tag status-${entry.status}`}>{statusLabel(entry.status)}</span><span className={`priority-${entry.priority}`}>{priorityLabels[entry.priority]}</span><span><CalendarDays size={12} />{dueLabel(entry.dueDate)}</span><span><Users size={12} />{assignmentLabel(entry, "project_dri")}</span></div>
            <div className="project-card-relation"><Link2 size={12} /><span>{entry.parentId ? byId.get(entry.parentId)?.title ?? "연결 없음" : "연결 없음"}</span></div>
            {previews.length > 0 && <div className="project-card-properties">{previews.map(({ property, value }) => <span key={property.id}><small>{property.name}</small><b>{Array.isArray(value) ? `${value.length}명` : typeof value === "boolean" ? value ? "예" : "아니오" : String(value)}</b></span>)}</div>}
            <div className="project-card-progress"><span><i style={{ width: `${entry.progress}%` }} /></span><b>{entry.progress}%</b></div>
          </button>
        </article>;
      })}{!visible.length && <div className="table-empty">{activeFilterCount || query ? <><span>조건에 맞는 Project가 없습니다.</span><button onClick={() => { resetFilters(); setQuery(""); }}>검색·필터 초기화</button></> : "표시할 Project가 없습니다."}</div>}</div>
      : display === "board" ? <BoardView items={visible} onOpenItem={(entry) => entry.kind === "project" ? onOpenProject(entry.id) : onOpenTask(entry.id)} canDeleteItem={canDeleteItem} selectedItemIds={selectedItemIds} onToggleSelect={onToggleSelect} selectionMode={selectionMode} /> : (
        <div className="database-scroll">
          <div className="task-table" role="table" aria-label="Project 표" style={{ "--custom-columns": customProperties.length, "--custom-column-tracks": customProperties.length ? `repeat(${customProperties.length}, var(--custom-column-width))` : " " } as CSSProperties}>
            <div className="task-table-row task-table-head" role="row">
              <span role="columnheader"><ListChecks size={12} />이름</span><span role="columnheader"><Activity size={12} />상태</span><span role="columnheader"><Zap size={12} />우선순위</span><span role="columnheader"><CalendarDays size={12} />기한</span><span role="columnheader"><Link2 size={12} />상위 Initiative</span><span role="columnheader"><Users size={12} />DRI</span>
              {customProperties.map((property) => <span role="columnheader" key={property.id}>{property.type === "number" ? <Hash size={12} /> : <TextCursorInput size={12} />}{property.name}</span>)}
              <button aria-label="속성 추가" title="속성 추가" onClick={onOpenProperties}><Plus size={13} /></button>
            </div>
            {visible.map((entry) => (
              <div className="task-table-row" role="row" key={entry.id}>
                <div className="name-cell">{selectionMode && canDeleteItem(entry) && <DeleteSelectCheckbox item={entry} selected={selectedItemIds.has(entry.id)} onToggle={onToggleSelect} />}<button className={`task-check ${isCompletedStatus(entry.status) ? "checked" : ""}`} aria-label={`${entry.title} ${isCompletedStatus(entry.status) ? "완료 취소" : "완료 처리"}`} aria-pressed={isCompletedStatus(entry.status)} onClick={() => void onPatch(entry.id, { status: isCompletedStatus(entry.status) ? "todo" : "done", progress: isCompletedStatus(entry.status) ? entry.progress : 100 })}><Check size={12} /></button>{entry.kind === "project" ? <button className="name-open-button" onClick={() => onOpenProject(entry.id)}>{entry.title}</button> : <input defaultValue={entry.title} onBlur={(event) => event.target.value.trim() !== entry.title && void onPatch(entry.id, { title: event.target.value })} />}</div>
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

function ProjectPageView({ project, allItems, properties, propertyValues, hiddenPropertyIds, teamMembers, onClose, onPatch, onPropertyChange, onPropertyVisibility, onAssignmentsChange, onTaskCreated, onOpenTask, readOnly, onNotice, onArchive, canDeleteItem, selectedItemIds, onToggleSelect }: {
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
  canDeleteItem: (item: OkrptrItem) => boolean;
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
  const deletableLinkedTasks = linkedTasks.filter(canDeleteItem);
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
            {canDeleteItem(project) && <DeleteSelectCheckbox item={project} selected={selectedItemIds.has(project.id)} onToggle={onToggleSelect} />}
            {canDeleteItem(project) && <button type="button" className="danger" onClick={onArchive}><Trash2 size={13} />휴지통으로 이동</button>}
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
        <ProjectDataSection key={project.id} project={project} />
        <section className="task-lineage project-lineage-compact">
          <header><b>상위 OKR</b><span>Objective → KR → Initiative</span></header>
          <LineageRow label="Objective" value={objective?.title ?? "미연결"} />
          <LineageRow label="Key Result" value={keyResult?.title ?? "미연결"} />
          <LineageRow label="Initiative" value={initiative?.title ?? "미연결"} />
        </section>
        <section className="project-linked-tasks">
          <header><div><b>연결된 Task</b><span>{linkedTasks.length}개</span></div>{deletableLinkedTasks.length > 0 && <button onClick={() => deletableLinkedTasks.forEach((task) => { if (!selectedItemIds.has(task.id)) onToggleSelect(task.id); })}><ListChecks size={13} />삭제 가능 Task 선택</button>}</header>
          <form className="project-task-quick-add" onSubmit={createLinkedTask}>
            <input value={quickTaskTitle} onChange={(event) => setQuickTaskTitle(event.target.value)} placeholder="새 Task 빠른 추가" disabled={readOnly || creatingTask} />
            <button disabled={readOnly || creatingTask || !quickTaskTitle.trim()} aria-label="Task 추가" title="Task 추가"><Plus size={15} /></button>
          </form>
          <div className="project-task-table">
            <div className="project-task-row project-task-head"><span>Task</span><span>상태</span><span>담당자</span><span>마감일</span><span>진행률</span></div>
            {linkedTasks.map((task) => {
              const assignee = task.assignments.find((assignment) => assignment.role === "task_assignee")?.memberId ?? "";
              return <div className="project-task-row" key={task.id}>
                <div className="project-task-title-cell">{canDeleteItem(task) && <DeleteSelectCheckbox item={task} selected={selectedItemIds.has(task.id)} onToggle={onToggleSelect} />}<button className="project-task-title" onClick={() => onOpenTask(task.id)}>{task.title}</button></div>
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

function ProjectDataSection({ project }: { project: OkrptrItem }) {
  const [connection, setConnection] = useState<ProjectDataConnection | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    void fetch(`/api/data-connections?itemId=${encodeURIComponent(project.id)}`, { signal: controller.signal })
      .then(async (response) => response.ok ? response.json() as Promise<{ connections: ProjectDataConnection[] }> : Promise.reject())
      .then((data) => { if (active) setConnection(data.connections[0] ?? null); })
      .catch((error: unknown) => {
        if (active && !(error instanceof DOMException && error.name === "AbortError")) setLoadError(true);
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [project.id]);

  return <section className="project-linked-data">
    <header><div><b>연결 데이터</b><span>{connection ? "1개" : "연결 없음"}</span></div><Database size={15} /></header>
    {loading ? <div className="project-data-state"><LoaderCircle className="spinning" size={15} />데이터를 불러오는 중</div>
      : loadError ? <div className="project-data-state error"><AlertTriangle size={15} />연결 데이터를 불러오지 못했습니다.</div>
      : connection ? <>
        <div className="project-data-summary">
          <div><small>데이터 소스</small><b><Link2 size={12} />{connection.name}</b></div>
          <div><small>현재 / 목표</small><b>{formatProjectDataMetric(connection.lastValue, connection.unit)} <em>/ {formatProjectDataMetric(connection.targetValue, connection.unit)}</em></b></div>
          <div><small>갱신</small><b>{projectDataCadenceLabel(connection.cadence)} · {connection.active ? "활성" : "일시정지"}</b></div>
          <div><small>최근 결과</small><b className={`sync-${connection.lastSyncStatus}`}>{projectDataSyncLabel(connection)}</b></div>
        </div>
        <div className="project-data-progress"><span><i style={{ width: `${project.progress}%` }} /></span><b>{project.progress}%</b></div>
        {connection.lastError && <p className="kr-data-error"><AlertTriangle size={13} />{connection.lastError}</p>}
      </> : <div className="project-data-state"><Database size={15} />데이터 화면에서 이 Project에 API를 연결할 수 있습니다.</div>}
  </section>;
}

function formatProjectDataMetric(value: number | null, unit: string) {
  return value === null ? "아직 값 없음" : `${new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 2 }).format(value)}${unit}`;
}

function projectDataCadenceLabel(cadence: ProjectDataConnection["cadence"]) {
  return { hourly: "매시간", daily: "매일", weekly: "매주", manual: "수동만" }[cadence];
}

function projectDataSyncLabel(connection: ProjectDataConnection) {
  if (connection.lastSyncStatus === "never") return "업데이트 전";
  if (connection.lastSyncStatus === "error") return "오류";
  return connection.lastSyncedAt ? new Date(connection.lastSyncedAt).toLocaleString("ko-KR", { dateStyle: "short", timeStyle: "short" }) : "완료";
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
  const projects = allItems.filter((entry) => entry.kind === "project" && !entry.archivedAt);
  const initiative = project?.parentId ? byId.get(project.parentId) : undefined;
  const keyResult = initiative?.parentId ? byId.get(initiative.parentId) : undefined;
  const objective = keyResult?.parentId ? byId.get(keyResult.parentId) : undefined;
  const routineMatch = task.routineId ? routines.find((entry) => entry.id === task.routineId) : undefined;
  const routine = routineMatch?.active && routineMatch.systemKey !== "general" ? routineMatch : undefined;
  const projectDri = project ? assignmentLabel(project, "project_dri") : "미지정";
  const assigneeIds = task.assignments.filter((entry) => entry.role === "task_assignee").map((entry) => entry.memberId);
  const taskContainerValue = project?.kind === "project" ? `project:${project.id}` : routine ? `routine:${routine.id}` : "";
  const lineageTitle = routine ? `Routine · ${routine.title}` : project?.kind === "project" ? `Project · ${project.title}` : routineMatch?.systemKey === "general" ? "General 수집함" : "연결 끊김";
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

  function saveContainer(value: string) {
    const [kind, id] = value.split(":", 2);
    if (!id) {
      void onPatch({ parentId: null, routineId: null, cycleId: null });
      return;
    }
    if (kind === "project") {
      const nextProject = projects.find((entry) => entry.id === id);
      if (nextProject) void onPatch({ parentId: nextProject.id, routineId: null, cycleId: nextProject.cycleId });
    } else if (kind === "routine" && routines.some((entry) => entry.id === id && entry.active && entry.systemKey !== "general")) {
      void onPatch({ parentId: null, routineId: id, cycleId: null });
    }
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
          <label className="task-container-field"><span>연결 대상</span><select value={taskContainerValue} onChange={(event) => saveContainer(event.target.value)}><option value="">General</option><optgroup label="Project">{projects.map((entry) => <option value={`project:${entry.id}`} key={entry.id}>{entry.title}</option>)}</optgroup><optgroup label="Routine">{routines.filter((entry) => entry.active && entry.systemKey !== "general").map((entry) => <option value={`routine:${entry.id}`} key={entry.id}>{entry.title}</option>)}</optgroup></select></label>
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

function canUserDeleteItem(item: OkrptrItem, currentMember: TeamMember | undefined, userId: string | null) {
  if (userId && item.createdByUserId === userId) return true;
  if (!currentMember) return false;
  const accountableRole: ItemAssignmentRole | null = item.kind === "project"
    ? "project_dri"
    : item.kind === "task" ? "task_assignee" : null;
  return Boolean(accountableRole && item.assignments.some((assignment) =>
    assignment.memberId === currentMember.id && assignment.role === accountableRole,
  ));
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
  const kind = initialKind;
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
  const taskProjectOptions = items.filter((entry) => entry.kind === "project" && !entry.archivedAt);
  const taskRoutineOptions = routines.filter((entry) => entry.active && entry.systemKey !== "general");
  const hasTaskContainerOptions = taskProjectOptions.length > 0 || taskRoutineOptions.length > 0;
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
    if (!title.trim() || saving || (kind !== "task" && kind !== "objective" && !parentId)) return;
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
          {kind === "project" && <ProjectQuotaBadge />}
          <label><span>유형</span><select value={kind} disabled><option value={initialKind}>{kindLabel(initialKind)}</option></select></label>
          <label><span>이름</span><input value={title} onChange={(event) => setTitle(event.target.value)} /></label>
          {onCreateWithChat && <div className="create-chat-nudge"><div><Bot size={15} /><span><b>대화로 정리할까요?</b><small>{kind === "task" ? "할 일을 다듬고, 연결 대상을 고르지 않으면 General에 저장합니다." : kind === "project" ? "결과와 범위를 말하면 Project 초안을 정리합니다." : "말로 설명하면 OKR 초안을 함께 정리해드려요."}</small></span></div><button type="button" onClick={() => onCreateWithChat({ kind, title })}>AI 대화로 추가<ChevronRight size={13} /></button></div>}
          {kind === "task" ? hasTaskContainerOptions ? (
            <label><span>연결 대상 · 선택 사항</span><select value={taskContainer} onChange={(event) => setTaskContainer(event.target.value)}><option value="">선택 안 함 — General에 저장</option>{taskProjectOptions.length > 0 && <optgroup label="Project">{taskProjectOptions.map((entry) => <option value={`project:${entry.id}`} key={entry.id}>{entry.title}</option>)}</optgroup>}{taskRoutineOptions.length > 0 && <optgroup label="Routine">{taskRoutineOptions.map((entry) => <option value={`routine:${entry.id}`} key={entry.id}>{entry.title}</option>)}</optgroup>}</select></label>
          ) : (
            <p className="task-container-empty task-container-general">연결할 Project·Routine이 없어 General(기본)에 저장됩니다.</p>
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
  return <label><span>{property.name}</span><PropertyValueInput type={property.type} value={value} options={property.options} members={members} onChange={(next) => onChange(property, next)} /></label>;
}

function RoutineView({ workspaceId, initialRoutines, teamMembers, onNotice, onRoutinesChange, createOpen, onCreateClose, onCreateWithChat }: { workspaceId: string; initialRoutines: Routine[]; teamMembers: TeamMember[]; onNotice: (message: string) => void; onRoutinesChange: (routines: Routine[]) => void; createOpen: boolean; onCreateClose: () => void; onCreateWithChat: (initialMessage?: string) => void }) {
  const confirmAction = useAppConfirm();
  const initialDate = localDate();
  const initialCacheKey = `routines:${workspaceId}:${initialDate}`;
  const [date, setDate] = useState(initialDate);
  const [rows, setRows] = useState<Routine[] | null>(() => routineMemoryCache.get(initialCacheKey) ?? initialRoutines);
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
  const rowsRef = useRef(rows);

  useEffect(() => { rowsRef.current = rows; }, [rows]);
  useEffect(() => {
    let active = true;
    const key = `routines:${workspaceId}:${date}`;
    const cached = routineMemoryCache.get(key);
    if (cached && viewCacheIsFresh(key)) return () => { active = false; };
    fetch(`/api/routines?date=${date}`)
      .then(async (response) => response.ok ? response.json() as Promise<{ routines: Routine[] }> : Promise.reject())
      .then((data) => { if (active) { routineMemoryCache.set(key, data.routines); markViewCacheFresh(key); setLoadError(false); setRows(data.routines); onRoutinesChange(data.routines); } })
      .catch(() => { if (active && rowsRef.current === null) setLoadError(true); });
    return () => { active = false; };
  }, [date, loadAttempt, onRoutinesChange, workspaceId]);
  useEffect(() => {
    if (!rows) return;
    const key = `routines:${workspaceId}:${date}`;
    routineMemoryCache.set(key, rows);
    markViewCacheFresh(key);
  }, [date, rows, workspaceId]);

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
      if (!response.ok) throw new Error("Routine을 추가하지 못했습니다.");
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
      setCadence("daily");
      onCreateClose();
      onNotice("Routine을 추가했습니다.");
    } catch (createError) {
      onNotice(createError instanceof Error ? createError.message : "Routine을 추가하지 못했습니다.");
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
      if (!response.ok) throw new Error("Routine 완료 상태를 저장하지 못했습니다.");
      const data = await response.json() as { routine: Routine };
      setRows((current) => {
        const next = current?.map((entry) => entry.id === routine.id ? data.routine : entry) ?? [];
        onRoutinesChange(next);
        return next;
      });
    } catch (toggleError) {
      setRows(previous);
      onNotice(toggleError instanceof Error ? toggleError.message : "Routine 완료 상태를 저장하지 못했습니다.");
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
      if (!response.ok) throw new Error("Routine 활성 상태를 저장하지 못했습니다.");
      const data = await response.json() as { routine: Routine };
      setRows((current) => {
        const next = current?.map((entry) => entry.id === routine.id ? data.routine : entry) ?? [];
        onRoutinesChange(next);
        return next;
      });
    } catch (toggleError) {
      setRows(previous);
      onNotice(toggleError instanceof Error ? toggleError.message : "Routine 활성 상태를 저장하지 못했습니다.");
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
    if (!response.ok) { onNotice("Routine 실행 방법을 저장하지 못했습니다."); return; }
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
    onNotice("Routine 실행 방법을 저장했습니다.");
  }

  async function remove(id: string) {
    const routine = rows?.find((entry) => entry.id === id);
    if (!routine || routine.systemKey === "general") return;
    if (!await confirmAction({ title: "Routine 삭제", message: `'${routine.title}' Routine을 삭제합니다.`, confirmLabel: "Routine 삭제", danger: true })) return;
    const response = await fetch(`/api/routines?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (response.ok) {
      setRows((current) => {
        const next = current?.filter((entry) => entry.id !== id) ?? [];
        onRoutinesChange(next);
        return next;
      });
      onNotice("Routine을 삭제했습니다.");
    } else onNotice("Routine을 삭제하지 못했습니다.");
  }

  async function updateAssignee(routine: Routine, memberId: string) {
    if (routine.systemKey === "general") return;
    const response = await fetch("/api/routines", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: routine.id, date, assigneeMemberId: memberId || null }),
    });
    if (!response.ok) {
      onNotice("Routine 담당자를 저장하지 못했습니다.");
      return;
    }
    const data = await response.json() as { routine: Routine };
    setRows((current) => {
      const next = current?.map((entry) => entry.id === routine.id ? data.routine : entry) ?? [];
      onRoutinesChange(next);
      return next;
    });
  }

  const createDirty = Boolean(title.trim() || description.trim() || triggerPoint.trim() || actionPlace.trim() || actionSteps.trim() || cadence !== "daily" || assigneeMemberId);

  return (<>
    <section className="routine-section">
      <div className="routine-toolbar">
        <label><CalendarDays size={14} /><input type="date" value={date} onChange={(event) => { const nextDate = event.target.value; setRows(routineMemoryCache.get(`routines:${workspaceId}:${nextDate}`) ?? null); setLoadError(false); setDate(nextDate); }} /></label>
        <p>반복 실행 날짜와 오늘의 완료 상태를 확인합니다.</p>
      </div>
      <div className="routine-cards">
        {loadError && rows === null ? <AsyncState icon={AlertTriangle} title="Routine을 불러오지 못했습니다" detail="잠시 후 다시 시도해 주세요." actionLabel="다시 시도" onAction={() => { setRows(null); setLoadError(false); setLoadAttempt((attempt) => attempt + 1); }} /> : rows === null ? <AsyncState icon={LoaderCircle} title="Routine을 불러오는 중입니다" loading /> : rows.length ? rows.map((routine) => {
          const draft = routineDraft(routine);
          return (
            <article className={`routine-card ${routine.active ? "" : "inactive"} ${routine.systemKey === "general" ? "general-routine" : ""}`} key={routine.id}>
              <header>
                {routine.systemKey === "general" ? <span className="general-routine-icon"><Inbox size={13} /></span> : <button className={`task-check ${routine.completed ? "checked" : ""}`} disabled={!routine.active} onClick={() => void toggleCompletion(routine)} aria-label={routine.completed ? "완료 취소" : "완료 처리"}><Check size={12} /></button>}
                <div><b>{routine.title}{routine.systemKey === "general" && <em className="system-badge">기본</em>}</b><small>{routine.systemKey === "general" ? "Project·Routine에 연결하지 않은 Task가 모이는 기본 목록" : `${routineCadenceLabel(routine.cadence)} · ${routine.completed ? "오늘 완료" : "오늘 미완료"}`}</small></div>
                {routine.systemKey !== "general" && <label className="routine-switch"><input type="checkbox" checked={routine.active} onChange={() => void toggleActive(routine)} /><span /><em className="sr-only">Routine 활성 상태</em></label>}
                {routine.systemKey !== "general" && <button className="icon-button" onClick={() => void remove(routine.id)} aria-label="Routine 삭제" title="Routine 삭제"><Trash2 size={13} /></button>}
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
        }) : <EmptyState icon={Repeat2} title="등록된 Routine이 없습니다" />}
      </div>
    </section>
    {createOpen && <OverlayDialog title="새 Routine" variant="drawer" dirty={createDirty} initialFocus="input" onRequestClose={onCreateClose}>
      {(requestClose) => <aside className="property-panel routine-create-panel">
        <header><div><h2>새 Routine</h2><p>OKR과 독립된 반복 실행을 추가합니다.</p></div><button className="icon-button" onClick={() => requestClose("close-button")} aria-label="새 Routine 닫기" title="새 Routine 닫기"><X size={17} /></button></header>
        <form className="property-form routine-create" onSubmit={create}>
          <label><span>이름</span><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="예: 매일 고객 피드백 확인" aria-label="Routine 이름" /></label>
          <div className="create-chat-nudge"><div><Bot size={15} /><span><b>대화로 정리할까요?</b><small>반복할 일을 말하면 트리거와 실행 방법을 정리합니다.</small></span></div><button type="button" onClick={() => onCreateWithChat(title)}>AI 대화로 추가<ChevronRight size={13} /></button></div>
          <label><span>반복 주기</span><select value={cadence} onChange={(event) => setCadence(event.target.value as RoutineCadence)} aria-label="반복 주기"><option value="daily">매일</option><option value="weekly">매주</option><option value="monthly">매월</option></select></label>
          <label><span>트리거 포인트</span><input value={triggerPoint} onChange={(event) => setTriggerPoint(event.target.value)} placeholder="예: 오전 9시" aria-label="트리거 포인트" /></label>
          <label><span>어디서</span><input value={actionPlace} onChange={(event) => setActionPlace(event.target.value)} placeholder="장소 또는 도구" aria-label="어디서 실행" /></label>
          <label><span>목적/메모</span><input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="왜 반복하는지" aria-label="Routine 목적" /></label>
          <label><span>담당자</span><select value={assigneeMemberId} onChange={(event) => setAssigneeMemberId(event.target.value)} aria-label="Routine 담당자"><option value="">담당자 없음</option>{teamMembers.filter((member) => member.status === "active").map((member) => <option value={member.id} key={member.id}>{member.displayName}</option>)}</select></label>
          <label><span>무엇을 어떻게</span><textarea value={actionSteps} onChange={(event) => setActionSteps(event.target.value)} placeholder="실행 순서와 완료 기준" aria-label="실행 방법" rows={5} /></label>
          <button className="primary-action" disabled={!title.trim() || saving}>{saving ? "추가 중" : "Routine 추가"}</button>
        </form>
      </aside>}
    </OverlayDialog>}
  </>);
}

function MyWorkView({ workspaceId, items, routines, currentMember, onOpenProject, onOpenTask, onRoutinesChange, onNotice }: {
  workspaceId: string;
  items: OkrptrItem[];
  routines: Routine[];
  currentMember: TeamMember | null;
  onOpenProject: (id: string) => void;
  onOpenTask: (id: string) => void;
  onRoutinesChange: (routines: Routine[]) => void;
  onNotice: (message: string) => void;
}) {
  const [includeCompleted, setIncludeCompleted] = useState(false);
  const [sort, setSort] = useState<MyWorkSort>(() => readMyWorkSort(workspaceId, currentMember?.id ?? ""));
  const [savingRoutineId, setSavingRoutineId] = useState<string | null>(null);
  if (!currentMember) return <EmptyState icon={Briefcase} title="현재 멤버 정보를 확인할 수 없습니다" />;

  const visible = (status: ItemStatus) => includeCompleted || !isCompletedStatus(status);
  const projects = sortMyWorkItems(items.filter((entry) => entry.kind === "project" && visible(entry.status) && entry.assignments.some((assignment) => assignment.memberId === currentMember.id && (assignment.role === "project_dri" || assignment.role === "project_worker"))), sort);
  const tasks = sortMyWorkItems(items.filter((entry) => entry.kind === "task" && visible(entry.status) && entry.assignments.some((assignment) => assignment.memberId === currentMember.id && assignment.role === "task_assignee")), sort);
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
      onNotice("Routine 완료 상태를 저장하지 못했습니다.");
      return;
    }
    const data = await response.json() as { routine: Routine };
    onRoutinesChange(routines.map((entry) => entry.id === routine.id ? data.routine : entry));
  }

  return (
    <section className="my-work-view">
      <header className="my-work-toolbar">
        <div><b>{currentMember.displayName}의 업무</b><span>명시적으로 담당된 항목만 표시합니다.</span></div>
        <div className="my-work-toolbar-actions">
          <div className="my-work-sort" role="group" aria-label="내 업무 정렬">
            {([ ["due", "기한순"], ["priority", "우선순위순"] ] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={sort === value} onClick={() => { setSort(value); saveMyWorkSort(workspaceId, currentMember.id, value); }}>{label}</button>)}
          </div>
          <label><input type="checkbox" checked={includeCompleted} onChange={(event) => setIncludeCompleted(event.target.checked)} />완료 포함</label>
        </div>
      </header>
      <MyWorkSection title="Task" count={tasks.length}>
        {tasks.map((task) => {
          const project = task.parentId ? byId.get(task.parentId) : null;
          const routine = task.routineId ? routines.find((entry) => entry.id === task.routineId) : null;
          return <button className="my-work-item" key={task.id} onClick={() => onOpenTask(task.id)}><span className="type-icon type-task">T</span><span><b>{task.title}</b><span className="my-work-item-meta"><small>{statusLabel(task.status)} · {routine?.systemKey === "general" ? "미분류 Task" : routine ? routine.title : project?.title ?? "미분류 Task"}</small><span className={`my-work-priority priority-${task.priority}`}>{priorityLabels[task.priority]}</span><span className="my-work-due">{dueLabel(task.dueDate)}</span></span></span><ChevronRight size={15} /></button>;
        })}
      </MyWorkSection>
      <MyWorkSection title="Project" count={projects.length}>
        {projects.map((project) => {
          const roles = project.assignments.filter((assignment) => assignment.memberId === currentMember.id).map((assignment) => assignment.role === "project_dri" ? "주 담당" : "보조 담당");
          return <button className="my-work-item" key={project.id} onClick={() => onOpenProject(project.id)}><span className="type-icon type-project">P</span><span><b>{project.title}</b><span className="my-work-item-meta"><small>{roles.join(" · ")} · {statusLabel(project.status)}</small><span className={`my-work-priority priority-${project.priority}`}>{priorityLabels[project.priority]}</span><span className="my-work-due">{dueLabel(project.dueDate)}</span></span></span><ChevronRight size={15} /></button>;
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

function DailyScrumView({ workspaceId, onOpenTask, onNotice }: { workspaceId: string; onOpenTask: (id: string) => void; onNotice: (message: string) => void }) {
  const initialDate = localDate();
  const initialCacheKey = `daily:${workspaceId}:${initialDate}`;
  const initialScrum = dailyScrumMemoryCache.get(initialCacheKey) ?? null;
  const [date, setDate] = useState(initialDate);
  const [scrum, setScrum] = useState<DailyDashboard | null>(initialScrum);
  const [saving, setSaving] = useState<"draft" | "submit" | "task" | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [savedNotes, setSavedNotes] = useState(initialScrum ? scrumNotesSnapshot(initialScrum) : "");
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskParent, setNewTaskParent] = useState("");
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("slack_link");
    if (!token) return;
    params.delete("slack_link");
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${params.size ? `?${params}` : ""}`);
    void fetch("/api/slack/link", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) })
      .then(async (response) => { const result = await response.json() as { error?: string }; if (!response.ok) throw new Error(result.error || "Slack 사용자를 연결하지 못했습니다."); onNotice("Slack 사용자 연결을 완료했습니다."); })
      .catch((error: unknown) => onNotice(error instanceof Error ? error.message : "Slack 사용자를 연결하지 못했습니다."));
  }, [onNotice]);
  useEffect(() => {
    let active = true;
    const key = `daily:${workspaceId}:${date}`;
    const cachedScrum = dailyScrumMemoryCache.get(key) ?? null;
    if (cachedScrum && viewCacheIsFresh(key)) return () => { active = false; };
    fetch(`/api/daily-scrum?date=${date}`)
      .then(async (response) => response.ok ? response.json() as Promise<DailyDashboard> : Promise.reject())
      .then((data) => { if (active) { dailyScrumMemoryCache.set(key, data); markViewCacheFresh(key); setLoadError(false); setScrum(data); setSavedNotes(scrumNotesSnapshot(data)); setNewTaskParent(defaultDailyParent(data)); } })
      .catch(() => { if (active && !cachedScrum) setLoadError(true); });
    return () => { active = false; };
  }, [date, loadAttempt, workspaceId]);
  const notesDirty = Boolean(scrum) && savedNotes !== scrumNotesSnapshot(scrum!);
  useEffect(() => {
    if (!notesDirty) return;
    function warnBeforeUnload(event: BeforeUnloadEvent) { event.preventDefault(); event.returnValue = ""; }
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [notesDirty]);
  if (loadError) return <AsyncState icon={AlertTriangle} title="데일리 스크럼을 불러오지 못했습니다" detail="날짜를 유지한 채 다시 불러옵니다." actionLabel="다시 시도" onAction={() => { setScrum(null); setLoadError(false); setLoadAttempt((attempt) => attempt + 1); }} />;
  if (!scrum) return <AsyncState icon={LoaderCircle} title="데일리 스크럼을 불러오는 중입니다" loading />;
  const currentScrum = scrum;
  async function save(showNotice = true) {
    setSaving("draft");
    try {
      const response = await fetch("/api/daily-scrum", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...currentScrum.draft, date }) });
      const data = await response.json() as DailyDashboard & { error?: string };
      if (!response.ok) throw new Error(data.error || "데일리 초안을 저장하지 못했습니다.");
      const key = `daily:${workspaceId}:${date}`; dailyScrumMemoryCache.set(key, data); markViewCacheFresh(key); setScrum(data); setSavedNotes(scrumNotesSnapshot(data));
      if (showNotice) onNotice("데일리 초안을 저장했습니다.");
      return data;
    } catch (saveError) {
      onNotice(saveError instanceof Error ? saveError.message : "데일리 초안을 저장하지 못했습니다.");
      return null;
    } finally {
      setSaving(null);
    }
  }

  async function submit() {
    if (notesDirty && !await save(false)) return;
    setSaving("submit");
    try {
      const response = await fetch("/api/daily-scrum/submit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ date }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "데일리를 확정하지 못했습니다.");
      await reload(); onNotice("데일리를 확정했습니다. Slack 공유는 백그라운드에서 진행됩니다.");
    } catch (error) { onNotice(error instanceof Error ? error.message : "데일리를 확정하지 못했습니다."); }
    finally { setSaving(null); }
  }
  async function reload() {
    const refreshed = await fetch(`/api/daily-scrum?date=${date}`).then((entry) => entry.json() as Promise<DailyDashboard>);
    const key = `daily:${workspaceId}:${date}`; dailyScrumMemoryCache.set(key, refreshed); markViewCacheFresh(key); setScrum(refreshed); setSavedNotes(scrumNotesSnapshot(refreshed)); return refreshed;
  }
  async function createDailyTask(event: FormEvent) {
    event.preventDefault(); if (!newTaskTitle.trim() || !newTaskParent) return; setSaving("task");
    try {
      const [parentKind, parentId = ""] = newTaskParent.split(":", 2);
      const response = await fetch("/api/daily-scrum/tasks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ date, title: newTaskTitle, parentKind, parentId: parentId || null, requestId: crypto.randomUUID() }) });
      const result = await response.json() as { error?: string }; if (!response.ok) throw new Error(result.error || "Task를 만들지 못했습니다.");
      await reload(); setNewTaskTitle(""); onNotice("오늘 기한의 Task를 만들고 데일리에 선택했습니다.");
    } catch (error) { onNotice(error instanceof Error ? error.message : "Task를 만들지 못했습니다."); }
    finally { setSaving(null); }
  }
  function updateDraft(patch: Partial<DailyDashboard["draft"]>) { setScrum({ ...currentScrum, draft: { ...currentScrum.draft, ...patch } }); }
  function toggleTask(id: string) {
    const selectedTaskIds = currentScrum.draft.selectedTaskIds.includes(id) ? currentScrum.draft.selectedTaskIds.filter((entry) => entry !== id) : [...currentScrum.draft.selectedTaskIds, id];
    updateDraft({ selectedTaskIds, noPlannedTasks: false, skipReason: null, skipNote: "" });
  }
  function toggleSkip(checked: boolean) {
    updateDraft(checked
      ? { skipReason: currentScrum.draft.skipReason ?? "workload", selectedTaskIds: [], noPlannedTasks: false }
      : { skipReason: null, skipNote: "" });
  }
  const isSkipped = Boolean(currentScrum.draft.skipReason);
  const skipNeedsNote = currentScrum.draft.skipReason === "other" && !currentScrum.draft.skipNote.trim();
  const noTaskProjects = currentScrum.createTargets.projects.filter((project) => project.needsTask);
  return <section className="daily-workspace">
    <div className="scrum-toolbar">
      <label><CalendarDays size={14} /><span className="sr-only">데일리 날짜</span><input aria-label="데일리 날짜" type="date" value={date} onChange={(event) => { const nextDate = event.target.value; const cached = dailyScrumMemoryCache.get(`daily:${workspaceId}:${nextDate}`) ?? null; setScrum(cached); setSavedNotes(cached ? scrumNotesSnapshot(cached) : ""); setLoadError(false); setDate(nextDate); }} /></label>
      <div><button onClick={() => void save()} disabled={Boolean(saving) || !notesDirty}>{saving === "draft" ? "저장 중" : notesDirty ? "초안 저장" : "저장됨"}</button><button className="primary-action" onClick={() => void submit()} disabled={Boolean(saving) || skipNeedsNote}><Send size={14} />{saving === "submit" ? "확정 중" : isSkipped ? "스킵 확정 및 공유" : "확정 및 공유"}</button></div>
    </div>
    <div className="daily-layout"><section className="daily-editor" aria-labelledby="my-daily-heading"><header><div><h2 id="my-daily-heading">내 데일리</h2><p>조회와 선택은 Task 상태·기한·담당자를 바꾸지 않습니다.</p></div>{currentScrum.latestSubmission && <small>{currentScrum.latestSubmission.skipReason ? "스킵" : "제출"} v{currentScrum.latestSubmission.version} · {formatDateTime(currentScrum.latestSubmission.submittedAt)}</small>}</header>
      <fieldset className={`daily-skip-panel ${isSkipped ? "active" : ""}`}>
        <legend>오늘 데일리 스킵</legend>
        <label className="daily-skip-toggle" htmlFor="daily-skip-toggle"><input id="daily-skip-toggle" type="checkbox" checked={isSkipped} onChange={(event) => toggleSkip(event.target.checked)} />오늘은 데일리를 스킵합니다<small>확정하면 선택한 사유가 팀과 Slack 채널에 공유됩니다.</small></label>
        <div><label><span>스킵 사유</span><select aria-label="데일리 스킵 사유" disabled={!isSkipped} value={currentScrum.draft.skipReason ?? "workload"} onChange={(event) => updateDraft({ skipReason: event.target.value as DailySkipReason, skipNote: event.target.value === "other" ? currentScrum.draft.skipNote : "" })}><option value="workload">본업 과중</option><option value="vacation">휴가</option><option value="personal">개인 일정</option><option value="other">기타</option></select></label><label><span>상세 사유 {currentScrum.draft.skipReason === "other" ? "(필수)" : "(선택)"}</span><input aria-label="데일리 스킵 상세 사유" aria-required={currentScrum.draft.skipReason === "other"} required={currentScrum.draft.skipReason === "other"} disabled={!isSkipped} value={currentScrum.draft.skipNote} onChange={(event) => updateDraft({ skipNote: event.target.value })} maxLength={500} placeholder="팀에 공유할 보충 설명" /></label></div>
        {skipNeedsNote && <p role="alert">기타 스킵 사유를 입력해 주세요.</p>}
      </fieldset>
      <div className="daily-notes"><label><span>어제</span><textarea value={currentScrum.draft.yesterdayNote} onChange={(event) => updateDraft({ yesterdayNote: event.target.value })} placeholder="어제 마무리한 일" /></label><label><span>오늘</span><textarea value={currentScrum.draft.todayNote} onChange={(event) => updateDraft({ todayNote: event.target.value })} placeholder="오늘의 초점과 메모" /></label><label><span>블로커</span><textarea value={currentScrum.draft.blockersNote} onChange={(event) => updateDraft({ blockersNote: event.target.value })} placeholder="도움이 필요한 문제" /></label></div>
      <section className={`daily-task-picker ${isSkipped ? "daily-work-disabled" : ""}`}><header><div><b>오늘 할 Task</b><span>{isSkipped ? "스킵을 해제하면 Task를 선택할 수 있습니다." : "본인에게 할당된 미완료 Task만 표시합니다."}</span></div><strong>{currentScrum.draft.selectedTaskIds.length}/50</strong></header><label className="daily-none"><input type="checkbox" disabled={isSkipped} checked={currentScrum.draft.noPlannedTasks} onChange={(event) => updateDraft({ noPlannedTasks: event.target.checked, selectedTaskIds: event.target.checked ? [] : currentScrum.draft.selectedTaskIds })} />오늘 예정 없음</label>
        {currentScrum.candidates.groups.length ? <div className="daily-task-groups">{currentScrum.candidates.groups.map((group) => <section key={group.key}><h3>{group.kind === "project" ? "Project" : group.kind === "routine" ? "Routine" : "General"} · {group.title}</h3>{group.tasks.map((task) => <div className="daily-task-option" key={task.id}><label aria-label={`${task.title} 선택`}><input type="checkbox" aria-label={`${task.title} 선택`} checked={currentScrum.draft.selectedTaskIds.includes(task.id)} disabled={isSkipped || currentScrum.draft.noPlannedTasks || (!currentScrum.draft.selectedTaskIds.includes(task.id) && currentScrum.draft.selectedTaskIds.length >= 50)} onChange={() => toggleTask(task.id)} /><span><b>{task.title}</b><small>{statusLabel(task.status)} · {dueLabel(task.dueDate)}</small></span></label><button onClick={() => onOpenTask(task.id)} aria-label={`${task.title} 열기`}><ChevronRight size={15} /></button></div>)}</section>)}</div> : <p className="daily-empty">할당된 미완료 Task가 없습니다.</p>}
      </section>
      {!isSkipped && noTaskProjects.length > 0 && <div className="daily-dri-alert"><Target size={18} /><div><b>DRI이지만 미완료 Task가 없는 Project</b><p>실행 항목을 바로 추가할 수 있습니다.</p><div>{noTaskProjects.map((project) => <button key={project.id} onClick={() => setNewTaskParent(`project:${project.id}`)}>{project.title}<Plus size={13} /></button>)}</div></div></div>}
      <form className={`daily-new-task ${isSkipped ? "daily-work-disabled" : ""}`} onSubmit={(event) => void createDailyTask(event)}><header><b>새 Task 만들기</b><span>{isSkipped ? "스킵을 해제하면 Task를 만들 수 있습니다." : "이 양식을 제출할 때만 실제 Task가 생성됩니다."}</span></header><div><select aria-label="새 Task 상위 항목" disabled={isSkipped} value={newTaskParent} onChange={(event) => setNewTaskParent(event.target.value)}>{currentScrum.createTargets.projects.map((project) => <option key={project.id} value={`project:${project.id}`}>Project · {project.title}</option>)}{currentScrum.createTargets.routines.map((routine) => <option key={routine.id} value={`routine:${routine.id}`}>Routine · {routine.title}</option>)}{currentScrum.createTargets.allowGeneral && <option value="general:">General</option>}</select><input aria-label="새 Task 제목" disabled={isSkipped} value={newTaskTitle} onChange={(event) => setNewTaskTitle(event.target.value)} maxLength={240} placeholder="오늘 할 Task 제목" /><button disabled={isSkipped || !newTaskTitle.trim() || !newTaskParent || Boolean(saving)}>{saving === "task" ? "생성 중" : "Task 생성"}</button></div></form>
    </section><section className="daily-rollup" aria-labelledby="daily-rollup-heading"><header><h2 id="daily-rollup-heading">팀 데일리</h2><p>작성 중인 초안은 상태만 표시하고, 확정된 스킵 사유만 공개합니다.</p></header><div>{currentScrum.team.map((member) => <article key={member.memberId} className={`daily-member-card ${member.status}`}><header><div><b>{member.displayName}</b><small>{member.slackConnected ? "Slack 연결" : "Slack 미연결"}</small></div><span>{member.status === "skipped" ? "스킵" : member.status === "submitted" ? "제출 완료" : member.status === "writing" ? "작성 중" : "미제출"}</span></header>{member.submission ? member.submission.skipReason ? <div className="daily-skip-summary"><b>오늘 데일리 스킵</b><span>사유 · {dailySkipLabel(member.submission.skipReason)}</span>{member.submission.skipNote && <p>{member.submission.skipNote}</p>}</div> : <div><ul>{member.submission.tasks.map((task) => <li key={task.id}>{task.isNew && <em>신규</em>}<button disabled={!task.taskId} onClick={() => task.taskId && onOpenTask(task.taskId)}>{task.taskTitle}</button><small>{task.parentTitle}</small></li>)}{member.submission.noPlannedTasks && !member.submission.tasks.length && <li>오늘 예정 없음</li>}</ul>{member.submission.todayNote && <p><b>오늘</b>{member.submission.todayNote}</p>}{member.submission.blockersNote && <p className="blocker"><b>블로커</b>{member.submission.blockersNote}</p>}</div> : <p className="daily-private-draft">{member.status === "writing" ? "초안을 작성 중입니다. 내용은 제출 후 공개됩니다." : "아직 제출된 데일리가 없습니다."}</p>}</article>)}</div>{currentScrum.legacyWorkspaceNote && <details className="daily-legacy"><summary>기존 워크스페이스 메모</summary><p>{currentScrum.legacyWorkspaceNote.todayNote || currentScrum.legacyWorkspaceNote.yesterdayNote || currentScrum.legacyWorkspaceNote.blockersNote}</p></details>}</section></div>
  </section>;
}

function defaultDailyParent(scrum: DailyDashboard) { const project = scrum.createTargets.projects.find((entry) => entry.needsTask) ?? scrum.createTargets.projects[0]; if (project) return `project:${project.id}`; if (scrum.createTargets.routines[0]) return `routine:${scrum.createTargets.routines[0].id}`; return scrum.createTargets.allowGeneral ? "general:" : ""; }

function RecommendationsView({ workspaceId, items, onOpenTask, onOpenProject, onNavigate }: { workspaceId: string; items: OkrptrItem[]; onOpenTask: (id: string) => void; onOpenProject: (id: string) => void; onNavigate: (view: View) => void }) {
  const date = localDate();
  const cacheKey = `recommendations:${workspaceId}:${date}`;
  const [rows, setRows] = useState<Recommendation[] | null>(() => recommendationMemoryCache.get(cacheKey) ?? null);
  const [loadError, setLoadError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    const cachedRows = recommendationMemoryCache.get(cacheKey) ?? null;
    if (cachedRows && viewCacheIsFresh(cacheKey)) return () => { active = false; };
    fetch(`/api/recommendations?date=${date}`)
      .then(async (response) => response.ok ? response.json() as Promise<{ recommendations: Recommendation[] }> : Promise.reject())
      .then((data) => { if (active) { recommendationMemoryCache.set(cacheKey, data.recommendations); markViewCacheFresh(cacheKey); setLoadError(false); setRows(data.recommendations); } })
      .catch(() => { if (active && !cachedRows) setLoadError(true); });
    return () => { active = false; };
  }, [cacheKey, date, loadAttempt]);
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

function HomeView({ onCreatePlan, onCreateProject, onCreateRoutine, onApplyOkrPlan, onCreateTasks, onFinish, onNavigateToOkr, context, usageScope, workspaceContext, canWrite, members, taskContainers, projectTargets, defaultDriMemberId, defaultCycleId }: {
  usageScope: AiUsageScope | null;
  onCreatePlan: (plan: OnboardingPlan, cycleId: string | null) => Promise<PlanCreationResult | null>;
  onCreateProject: (plan: OnboardingPlan, target: ProjectChatTarget, driMemberId: string | null) => Promise<boolean>;
  onCreateRoutine: (plan: OnboardingPlan, assigneeMemberId: string | null) => Promise<boolean>;
  onApplyOkrPlan: (plan: OnboardingPlan, cycleId: string, target: OkrPlanTarget | null, driMemberId: string | null) => Promise<OkrPlanApplyResult | null>;
  onCreateTasks: (taskText: string, containerValue: string, assigneeMemberId: string | null) => Promise<boolean>;
  onFinish: () => void;
  onNavigateToOkr: () => void;
  context: OkrChatContext | null;
  workspaceContext: AssistantWorkspaceContext;
  canWrite: boolean;
  members: TeamMember[];
  taskContainers: TaskContainerOption[];
  projectTargets: ProjectChatTarget[];
  defaultDriMemberId: string | null;
  defaultCycleId: string | null;
}) {
  return (
    <div className="home-layout">
      <HomeOkrChat onCreate={onCreatePlan} onCreateProject={onCreateProject} onCreateRoutine={onCreateRoutine} onApplyOkrPlan={onApplyOkrPlan} onCreateTasks={onCreateTasks} onFinish={onFinish} onNavigateToOkr={onNavigateToOkr} context={context} usageScope={usageScope} workspaceContext={workspaceContext} canWrite={canWrite} members={members} taskContainers={taskContainers} projectTargets={projectTargets} defaultDriMemberId={defaultDriMemberId} defaultCycleId={defaultCycleId} />
    </div>
  );
}

function isAssistantConversationDraft(value: unknown): value is AssistantConversationDraft {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const draft = value as Partial<AssistantConversationDraft>;
  const plan = draft.plan as Partial<OnboardingPlan> | undefined;
  return draft.version === 1
    && typeof draft.message === "string"
    && Boolean(plan)
    && typeof plan?.objectiveTitle === "string"
    && Array.isArray(plan?.keyResults)
    && Array.isArray(plan?.targetInitiatives)
    && Array.isArray(plan?.unassignedInitiatives)
    && typeof plan?.project === "string"
    && typeof plan?.tasks === "string"
    && Array.isArray(draft.guideQuestions)
    && Array.isArray(draft.conversationHistory)
    && Array.isArray(draft.visibleFields)
    && (["okr", "project", "routine", "task", "onboarding", "coach"] as unknown[]).includes(draft.mode)
    && Array.isArray(draft.targetCandidates);
}

function HomeOkrChat({ onCreate, onCreateProject, onCreateRoutine, onApplyOkrPlan, onCreateTasks, onFinish, onNavigateToOkr, context, usageScope, workspaceContext, canWrite, members, taskContainers, projectTargets, defaultDriMemberId, defaultCycleId }: {
  usageScope: AiUsageScope | null;
  onCreate: (plan: OnboardingPlan, cycleId: string | null) => Promise<PlanCreationResult | null>;
  onCreateProject: (plan: OnboardingPlan, target: ProjectChatTarget, driMemberId: string | null) => Promise<boolean>;
  onCreateRoutine: (plan: OnboardingPlan, assigneeMemberId: string | null) => Promise<boolean>;
  onApplyOkrPlan: (plan: OnboardingPlan, cycleId: string, target: OkrPlanTarget | null, driMemberId: string | null) => Promise<OkrPlanApplyResult | null>;
  onCreateTasks: (taskText: string, containerValue: string, assigneeMemberId: string | null) => Promise<boolean>;
  onFinish: () => void;
  onNavigateToOkr: () => void;
  context: OkrChatContext | null;
  workspaceContext: AssistantWorkspaceContext;
  canWrite: boolean;
  members: TeamMember[];
  taskContainers: TaskContainerOption[];
  projectTargets: ProjectChatTarget[];
  defaultDriMemberId: string | null;
  defaultCycleId: string | null;
}) {
  const [aiUsageRevision, setAiUsageRevision] = useState(0);
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
    routineCadence: "daily",
  };
  const [message, setMessage] = useState(context?.initialMessage ?? "");
  const [plan, setPlan] = useState<OnboardingPlan>({
    ...emptyPlan,
  });
  const [guideQuestions, setGuideQuestions] = useState<string[]>([]);
  const [conversationHistory, setConversationHistory] = useState<ChatMessage[]>(() => [{ id: "initial", role: "assistant", content: assistantOpeningMessage() }]);
  const [visibleFields, setVisibleFields] = useState<Set<StringPlanField>>(new Set());
  const [mode, setMode] = useState<ConversationMode>(context?.entry === "onboarding" ? "onboarding" : context?.entry === "coach" ? "coach" : context?.entry === "project" ? "project" : context?.entry === "routine" ? "routine" : context?.entry === "task" ? "task" : "okr");
  const [okrTarget, setOkrTarget] = useState<OkrPlanTarget | null>(context?.target ?? null);
  const [targetCandidates, setTargetCandidates] = useState<OkrPlanTarget[]>(context?.targetCandidates ?? []);
  const [targetSearch, setTargetSearch] = useState("");
  const [referencesOpen, setReferencesOpen] = useState(false);
  const referenceButtonRef = useRef<HTMLButtonElement>(null);
  const [projectTarget, setProjectTarget] = useState<ProjectChatTarget | null>(null);
  const [projectDriMemberId, setProjectDriMemberId] = useState(defaultDriMemberId ?? members[0]?.id ?? "");
  const [routineAssigneeMemberId, setRoutineAssigneeMemberId] = useState("");
  const [taskContainer, setTaskContainer] = useState("");
  const [taskAssigneeMemberId, setTaskAssigneeMemberId] = useState("");
  const [saving, setSaving] = useState(false);
  const [draftHydrated, setDraftHydrated] = useState(false);
  const [draftSaveState, setDraftSaveState] = useState<"loading" | "idle" | "saving" | "saved" | "error">("loading");
  const draftSaveSequenceRef = useRef(0);
  const draftKey = context?.key ?? `default:${defaultCycleId ?? "none"}`;
  const assistantFlow = mode === "onboarding" || mode === "coach";
  const draftCounts = countOkrDraft(plan);
  const taskDraftCount = plan.tasks.split("\n").map((entry) => entry.trim()).filter(Boolean).length;
  const treeReady = Boolean(plan.objectiveTitle.trim() && plan.keyResults.length && plan.keyResults.every((entry) => entry.title.trim() && entry.initiatives.every((initiative) => initiative.title.trim())) && !plan.unassignedInitiatives.length);
  const visibleTargetCandidates = useMemo(() => {
    const query = targetSearch.trim().toLocaleLowerCase();
    const candidates = targetCandidates.filter((target) => target.id !== okrTarget?.id);
    if (!query) return candidates.slice(0, 12);
    return candidates.filter((target) => `${kindLabel(target.kind)} ${target.title}`.toLocaleLowerCase().includes(query)).slice(0, 12);
  }, [okrTarget?.id, targetCandidates, targetSearch]);
  const saveLabel = mode === "task" ? `Task ${taskDraftCount}개 만들기` : mode === "routine" ? "Routine 만들기" : assistantFlow
    ? !okrTarget ? `Objective 1개 · KR ${draftCounts.keyResults}개 · Initiative ${draftCounts.initiatives}개 만들기`
      : okrTarget.kind === "objective" ? `KR ${draftCounts.keyResults}개 · Initiative ${draftCounts.initiatives}개 만들기`
        : okrTarget.kind === "key_result" ? `Initiative ${plan.targetInitiatives.length}개 만들기` : "Project 탭에서 계속"
    : mode === "project" ? "Project 만들기" : `Objective 1개 · KR ${draftCounts.keyResults}개 · Initiative ${draftCounts.initiatives}개 만들기`;
  const hasDraft = hasPlanContent(plan);
  const hasPersistableDraft = Boolean(message.trim() || hasDraft || conversationHistory.some((entry) => entry.role === "user"));
  const assistantDraftPayload = useMemo<AssistantConversationDraft>(() => ({
    version: 1,
    message,
    plan,
    guideQuestions,
    conversationHistory,
    visibleFields: [...visibleFields],
    mode,
    okrTarget,
    targetCandidates,
    projectTarget,
    projectDriMemberId,
    routineAssigneeMemberId,
    taskContainer,
    taskAssigneeMemberId,
  }), [conversationHistory, guideQuestions, message, mode, okrTarget, plan, projectDriMemberId, projectTarget, routineAssigneeMemberId, targetCandidates, taskAssigneeMemberId, taskContainer, visibleFields]);
  const canApplyDraft = mode === "task" ? Boolean(taskDraftCount) : assistantFlow
    ? !okrTarget ? treeReady
      : okrTarget.kind === "objective" ? Boolean(plan.keyResults.length && plan.keyResults.every((entry) => entry.title.trim() && entry.initiatives.every((initiative) => initiative.title.trim())) && !plan.unassignedInitiatives.length)
        : okrTarget.kind === "key_result" ? Boolean(plan.targetInitiatives.length && plan.targetInitiatives.every((entry) => entry.title.trim()))
          : false
    : mode === "project" ? Boolean(plan.project.trim() && projectTarget) : mode === "routine" ? Boolean(plan.routineTitle.trim()) : treeReady;

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const timeout = window.setTimeout(() => controller.abort(), 10_000);
    void fetch(`/api/assistant-drafts?key=${encodeURIComponent(draftKey)}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("draft load failed");
        return response.json() as Promise<{ draft?: { payload?: AssistantConversationDraft } | null }>;
      })
      .then((data) => {
        if (!active) return;
        if (!isAssistantConversationDraft(data.draft?.payload)) {
          setDraftSaveState("idle");
          return;
        }
        const restored = data.draft.payload;
        setMessage(restored.message);
        setPlan(restored.plan);
        const hasUserConversation = restored.conversationHistory.some((entry) => entry.role === "user");
        setGuideQuestions(hasUserConversation ? restored.guideQuestions : []);
        setConversationHistory(hasUserConversation ? restored.conversationHistory : [{ id: "initial", role: "assistant", content: assistantOpeningMessage() }]);
        setVisibleFields(new Set(restored.visibleFields));
        setMode(restored.mode);
        setOkrTarget(restored.okrTarget);
        setTargetCandidates(restored.targetCandidates);
        setProjectTarget(restored.projectTarget && projectTargets.some((entry) => entry.initiativeId === restored.projectTarget?.initiativeId) ? restored.projectTarget : null);
        setProjectDriMemberId(members.some((member) => member.id === restored.projectDriMemberId) ? restored.projectDriMemberId : defaultDriMemberId ?? members[0]?.id ?? "");
        setRoutineAssigneeMemberId(members.some((member) => member.id === restored.routineAssigneeMemberId) ? restored.routineAssigneeMemberId : "");
        setTaskContainer(taskContainers.some((entry) => `${entry.kind}:${entry.id}` === restored.taskContainer) ? restored.taskContainer : "");
        setTaskAssigneeMemberId(members.some((member) => member.id === restored.taskAssigneeMemberId) ? restored.taskAssigneeMemberId : "");
        setDraftSaveState("saved");
      })
      .catch(() => {
        if (active && !controller.signal.aborted) setDraftSaveState("error");
      })
      .finally(() => {
        window.clearTimeout(timeout);
        if (active) setDraftHydrated(true);
      });
    return () => {
      active = false;
      window.clearTimeout(timeout);
      controller.abort();
    };
    // The view is keyed by draft context, so restoring runs once for that context.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey]);

  useEffect(() => {
    if (!draftHydrated || !hasPersistableDraft) return;
    const sequence = ++draftSaveSequenceRef.current;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      setDraftSaveState("saving");
      void fetch(`/api/assistant-drafts?key=${encodeURIComponent(draftKey)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payload: assistantDraftPayload }),
        signal: controller.signal,
      }).then((response) => {
        if (!response.ok) throw new Error("draft save failed");
        if (draftSaveSequenceRef.current === sequence) setDraftSaveState("saved");
      }).catch(() => {
        if (!controller.signal.aborted && draftSaveSequenceRef.current === sequence) setDraftSaveState("error");
      });
    }, 450);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [assistantDraftPayload, draftHydrated, draftKey, hasPersistableDraft]);

  function clearAssistantDraft() {
    draftSaveSequenceRef.current += 1;
    setDraftSaveState("idle");
    void fetch(`/api/assistant-drafts?key=${encodeURIComponent(draftKey)}`, { method: "DELETE", keepalive: true });
  }

  function resetConversationDraft() {
    clearAssistantDraft();
    setMessage("");
    setPlan({ ...emptyPlan });
    setGuideQuestions([]);
    setConversationHistory([{ id: "initial-reset", role: "assistant", content: assistantOpeningMessage() }]);
    setVisibleFields(new Set());
    setMode(context?.entry === "onboarding" ? "onboarding" : context?.entry === "coach" ? "coach" : context?.entry === "project" ? "project" : context?.entry === "routine" ? "routine" : context?.entry === "task" ? "task" : "okr");
    setOkrTarget(context?.target ?? null);
    setTargetCandidates(context?.targetCandidates ?? []);
    setTargetSearch("");
    setReferencesOpen(false);
    setProjectTarget(null);
    setProjectDriMemberId(defaultDriMemberId ?? members[0]?.id ?? "");
    setRoutineAssigneeMemberId("");
    setTaskContainer("");
    setTaskAssigneeMemberId("");
  }
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
    if (!text || saving) return;
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
      invalidateAiUsage();
      setAiUsageRevision((revision) => revision + 1);
    }
  }
  function chooseTarget(target: OkrPlanTarget) {
    setOkrTarget(target);
    setTargetSearch("");
    setReferencesOpen(false);
    setPlan({ ...emptyPlan });
    setVisibleFields(new Set());
    setMode("coach");
    setAssistantResponse(targetPrompt(target));
    setGuideQuestions([]);
  }
  function closeReferencesOnEscape(event: ReactKeyboardEvent<HTMLElement>) {
    if (event.key !== "Escape") return;
    event.stopPropagation();
    setReferencesOpen(false);
    referenceButtonRef.current?.focus();
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
  async function save() {
    if (mode === "task") {
      if (!canWrite || !canApplyDraft) return;
      setSaving(true);
      const created = await onCreateTasks(plan.tasks, taskContainer, taskAssigneeMemberId || null);
      setSaving(false);
      if (created) {
        clearAssistantDraft();
        setPlan({ ...emptyPlan });
        setVisibleFields(new Set());
        onFinish();
      }
      return;
    }
    if (assistantFlow) {
      if (!canWrite || !canApplyDraft) return;
      const cycleId = context?.cycleId ?? defaultCycleId;
      if (!cycleId) return;
      setSaving(true);
      const result = await onApplyOkrPlan(plan, cycleId, okrTarget, null);
      setSaving(false);
      if (!result) return;
      setPlan({ ...emptyPlan });
      setVisibleFields(new Set());
      setGuideQuestions([]);
      setTargetCandidates([]);
      const createdInitiatives = result.items.filter((entry) => result.initiativeIds.includes(entry.id));
      if (createdInitiatives.length) {
        clearAssistantDraft();
        setAssistantResponse("OKR 구조를 저장했습니다. 실행 계획은 Project 탭에서 Initiative를 선택해 만들어 주세요.");
        onFinish();
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
      clearAssistantDraft();
      onFinish();
      return;
    }
    if (mode === "project") {
      if (!plan.project.trim()) {
        await organizeMessage();
        return;
      }
      if (!projectTarget) return;
      setSaving(true);
      const created = await onCreateProject(plan, projectTarget, projectDriMemberId || null);
      setSaving(false);
      if (created) {
        clearAssistantDraft();
        setPlan({ ...emptyPlan });
        setVisibleFields(new Set());
        setProjectTarget(null);
      }
      return;
    }
    if (mode === "routine") {
      if (!plan.routineTitle.trim()) {
        await organizeMessage();
        return;
      }
      setSaving(true);
      const created = await onCreateRoutine(plan, routineAssigneeMemberId || null);
      setSaving(false);
      if (created) {
        clearAssistantDraft();
        setPlan({ ...emptyPlan });
        setVisibleFields(new Set());
      }
      return;
    }
    if (!plan.objectiveTitle.trim()) {
      await organizeMessage();
      return;
    }
    setSaving(true);
    const created = await onCreate(plan, context?.cycleId ?? defaultCycleId);
    setSaving(false);
    if (created) {
      clearAssistantDraft();
      setMessage("");
      setPlan({ ...emptyPlan });
      setGuideQuestions([]);
      setVisibleFields(new Set());
      setTargetCandidates([]);
      setProjectTarget(null);
      setAssistantResponse("OKR 구조를 저장했습니다. 실행 계획은 Project 탭에서 Initiative를 선택해 만들어 주세요.");
    }
  }
  function skipOptionalStep() {
    clearAssistantDraft();
    setAssistantResponse("좋아요. 지금은 여기까지 저장했습니다. Initiative나 Project가 떠오르면 언제든 OKR 도우미를 다시 불러 주세요.");
    setPlan({ ...emptyPlan });
    setVisibleFields(new Set());
    setGuideQuestions([]);
    onFinish();
  }
  return (
    <section className="home-okr-chat" aria-labelledby="home-okr-chat-title">
      <header>
        <div><Bot size={16} /><h2 id="home-okr-chat-title">AI 대화</h2></div>
        <div className="assistant-chat-header-actions">
          <span className={`assistant-draft-status ${draftSaveState}`} aria-live="polite">{draftSaveState === "loading" ? <><LoaderCircle className="spin" size={12} />이전 초안 확인 중</> : draftSaveState === "saving" ? <><LoaderCircle className="spin" size={12} />임시저장 중</> : draftSaveState === "saved" ? <><CheckCircle2 size={12} />임시저장됨</> : draftSaveState === "error" ? <><AlertTriangle size={12} />임시저장 재시도 예정</> : null}</span>
          {hasPersistableDraft && <button type="button" className="assistant-reset-draft" onClick={resetConversationDraft}>새로 시작</button>}
          {targetCandidates.length > 0 && <button ref={referenceButtonRef} type="button" className="icon-button" aria-label="참고 항목 선택" title="참고 항목 선택" aria-expanded={referencesOpen} aria-controls={referencesOpen ? "assistant-references" : undefined} onKeyDown={closeReferencesOnEscape} onClick={() => setReferencesOpen((open) => !open)}><Link2 size={15} /></button>}
        </div>
      </header>
      <div className="home-chat-surface">
        {usageScope && <ChatAiUsage scope={usageScope} refreshKey={aiUsageRevision} />}
        <div className="chat-thread">
          {conversationHistory.map((entry) => <p className={entry.role === "user" ? "user-message" : "assistant-message"} key={entry.id}>{entry.content}</p>)}
          {referencesOpen && targetCandidates.length > 0 && <div id="assistant-references" className="assistant-target-picker" aria-label="대화 대상 선택">
            <header>
              <div><Search size={13} /><b>대화 대상</b></div>
              {okrTarget ? <span>{kindLabel(okrTarget.kind)} · {okrTarget.title}</span> : <span>전체 OKR 문맥</span>}
            </header>
            <label>
              <span className="sr-only">Objective, Key Result, Initiative, Project 검색</span>
              <input value={targetSearch} onKeyDown={closeReferencesOnEscape} onChange={(event) => setTargetSearch(event.target.value)} placeholder="Objective, KR, Initiative, Project 검색" />
            </label>
            {visibleTargetCandidates.length > 0 && <div className="assistant-target-options">
              {visibleTargetCandidates.map((target) => <button key={target.id} onKeyDown={closeReferencesOnEscape} onClick={() => chooseTarget(target)}><span>{kindLabel(target.kind)}</span>{target.title}</button>)}
            </div>}
          </div>}
          {conversationHistory.some((entry) => entry.role === "user") && guideQuestions.length > 0 && <div className="assistant-followups">{guideQuestions.map((question) => <button className="followup-message" onClick={() => chooseQuickReply(question)} key={question}>{question}</button>)}</div>}
          {!canWrite && <div className="assistant-readonly"><Eye size={14} /><span>Viewer는 대화와 분석을 이용할 수 있지만 항목을 생성할 수 없습니다.</span></div>}
          <div className="chat-input"><label htmlFor="assistant-message">메시지</label><div className="chat-composer"><textarea id="assistant-message" value={message} onChange={(event) => setMessage(event.target.value)} onKeyDown={(event) => { if ((event.ctrlKey || event.metaKey) && event.key === "Enter") void organizeMessage(); }} rows={4} placeholder={mode === "task" ? "해야 할 일을 편하게 설명해 주세요" : mode === "project" ? "만들 Project의 결과와 범위를 설명해 주세요" : mode === "routine" ? "언제 무엇을 반복할지 설명해 주세요" : "지금 이루고 싶은 목표나 막힌 일을 편하게 적어 주세요"} /><button type="button" className="chat-send-button" onClick={() => void organizeMessage()} disabled={saving || !message.trim()} aria-label={saving ? "답변 생성 중" : "메시지 보내기"}>{saving ? <LoaderCircle className="spin" size={15} /> : <Send size={15} />}<span>{saving ? "답변 중" : "보내기"}</span></button></div></div>
          <div className="chat-actions">
            {hasDraft && canWrite && <button className="welcome-primary" onClick={() => void save()} disabled={saving || !canApplyDraft}>{saving ? "생성 중" : saveLabel}<ChevronRight size={14} /></button>}
          </div>
          {hasDraft && assistantFlow && okrTarget && (okrTarget.kind === "key_result" || okrTarget.kind === "initiative") && <button className="assistant-skip" onClick={skipOptionalStep}>지금은 건너뛰기</button>}
        </div>
        {mode !== "task" && hasOkrDraft(plan) && <OkrDraftTree
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
          {mode === "project" && visibleFields.has("project") && <ProjectQuotaBadge />}
          {mode === "project" && visibleFields.has("project") && <label><span>Project</span><input value={plan.project} onChange={(event) => patch("project", event.target.value)} placeholder="결과와 범위가 분명한 첫 Project" /></label>}
          {mode === "project" && visibleFields.has("project") && <label><span>상위 Initiative</span><select value={projectTarget?.initiativeId ?? ""} onChange={(event) => setProjectTarget(projectTargets.find((entry) => entry.initiativeId === event.target.value) ?? null)}><option value="">저장 전에 선택</option>{projectTargets.map((entry) => <option value={entry.initiativeId} key={entry.initiativeId}>{entry.cycleName} · {entry.initiativeTitle}</option>)}</select></label>}
          {mode === "project" && visibleFields.has("project") && members.length > 0 && <label><span>Project DRI</span><select value={projectDriMemberId} onChange={(event) => setProjectDriMemberId(event.target.value)}>{members.map((member) => <option value={member.id} key={member.id}>{member.displayName}</option>)}</select></label>}
          {(mode === "task" || mode === "project" || mode === "routine") && visibleFields.has("tasks") && <label className="wide"><span>{mode === "task" ? "Task 초안" : plan.taskParent === "routine" || !plan.project.trim() && plan.routineTitle.trim() ? "첫 Task · Routine 아래" : plan.project.trim() ? "첫 Task · Project 아래" : "첫 Task"}</span><textarea value={plan.tasks} onChange={(event) => patch("tasks", event.target.value)} rows={4} placeholder="한 줄에 하나씩 입력" /></label>}
          {mode === "task" && visibleFields.has("tasks") && taskContainers.length > 0 && <label><span>연결 대상 · 선택 사항</span><select value={taskContainer} onChange={(event) => setTaskContainer(event.target.value)}><option value="">선택 안 함 — General에 저장</option>{taskContainers.some((entry) => entry.kind === "project") && <optgroup label="Project">{taskContainers.filter((entry) => entry.kind === "project").map((entry) => <option key={entry.id} value={`project:${entry.id}`}>{entry.title}</option>)}</optgroup>}{taskContainers.some((entry) => entry.kind === "routine") && <optgroup label="Routine">{taskContainers.filter((entry) => entry.kind === "routine").map((entry) => <option key={entry.id} value={`routine:${entry.id}`}>{entry.title}</option>)}</optgroup>}</select></label>}
          {mode === "task" && visibleFields.has("tasks") && members.length > 0 && <label><span>담당자</span><select value={taskAssigneeMemberId} onChange={(event) => setTaskAssigneeMemberId(event.target.value)}><option value="">미지정</option>{members.map((member) => <option value={member.id} key={member.id}>{member.displayName}</option>)}</select></label>}
          {mode === "task" && visibleFields.has("tasks") && taskContainers.length === 0 && <p className="task-container-empty task-container-general">연결할 Project·Routine이 없어 General(기본)에 저장됩니다.</p>}
          {visibleFields.has("tasks") && plan.project.trim() && plan.routineTitle.trim() && <label><span>Task 상위</span><select value={plan.taskParent || "project"} onChange={(event) => patch("taskParent", event.target.value)}><option value="project">Project</option><option value="routine">Routine</option></select></label>}
          {visibleFields.has("routineTitle") && <label><span>Routine 이름</span><input value={plan.routineTitle} onChange={(event) => patch("routineTitle", event.target.value)} placeholder="반복해서 할 일의 이름" /></label>}
          {visibleFields.has("routineTrigger") && <label><span>Routine 트리거</span><input value={plan.routineTrigger} onChange={(event) => patch("routineTrigger", event.target.value)} placeholder="Routine이 시작되는 시점" /></label>}
          {visibleFields.has("routinePlace") && <label><span>어디서</span><input value={plan.routinePlace} onChange={(event) => patch("routinePlace", event.target.value)} placeholder="실행할 장소나 도구" /></label>}
          {visibleFields.has("routineSteps") && <label className="wide"><span>무엇을 어떻게</span><textarea value={plan.routineSteps} onChange={(event) => patch("routineSteps", event.target.value)} rows={3} placeholder="Routine 실행 방법" /></label>}
          {mode === "routine" && visibleFields.has("routineTitle") && <label><span>반복 주기</span><select value={plan.routineCadence} onChange={(event) => setPlan((current) => ({ ...current, routineCadence: event.target.value as RoutineCadence }))}><option value="daily">매일</option><option value="weekly">매주</option><option value="monthly">매월</option></select></label>}
          {mode === "routine" && visibleFields.has("routineTitle") && members.length > 0 && <label><span>담당자</span><select value={routineAssigneeMemberId} onChange={(event) => setRoutineAssigneeMemberId(event.target.value)}><option value="">담당자 없음</option>{members.map((member) => <option value={member.id} key={member.id}>{member.displayName}</option>)}</select></label>}
          {mode === "project" && visibleFields.has("project") && projectTargets.length === 0 && <div className="task-container-empty"><span>연결할 Initiative가 없습니다.</span><button type="button" onClick={onNavigateToOkr}>먼저 Initiative 만들기</button></div>}
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
  const candidates = context.items
    .filter((item) => item.kind === "objective" || item.kind === "key_result" || item.kind === "initiative" || item.kind === "project")
    .map((item) => ({ id: item.id, kind: item.kind as OkrPlanTarget["kind"], title: item.title }));
  const focused = candidates.find((item) => item.id === context.focusedItemId) ?? null;
  return { target: focused, candidates };
}

function assistantOpeningMessage() {
  return "목표나 할 일을 편하게 이야기해 주세요. 기존 OKR과 업무를 참고해 함께 정리할게요.";
}

function targetPrompt(target: OkrPlanTarget) {
  if (target.kind === "objective") return `${target.title} Objective를 기준으로 이야기하겠습니다. 이 목표의 성공을 확인할 Key Result부터 정리할까요?`;
  if (target.kind === "key_result") return `${target.title} Key Result를 기준으로 이야기하겠습니다. 이 결과를 움직일 Initiative를 정리할까요?`;
  if (target.kind === "project") return `${target.title} Project를 기준으로 이야기하겠습니다. 진행 상황, 막힌 일, 다음 Task 중 무엇부터 정리할까요?`;
  return `${target.title} Initiative를 기준으로 이야기하겠습니다. 이 실행 방향을 실제로 움직일 Project를 정리할까요?`;
}

function aiLimitMessage(error: OrganizeError) {
  return aiUsageLimitMessage(error);
}

function OkrFileManager({
  cycles,
  selectedCycle,
  itemCounts,
  deletingIds,
  slowDeletingId,
  onSelect,
  onSetDefault,
  onDelete,
  onCreate,
  onClose,
}: {
  cycles: OkrCycle[];
  selectedCycle: OkrCycle | null;
  itemCounts: Record<string, number>;
  deletingIds: Set<string>;
  slowDeletingId: string | null;
  onSelect: (id: string) => void;
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
            latest={index === 0}
            itemCount={itemCounts[cycle.id] ?? 0}
            canDelete={cycles.length > 1}
            deleting={deletingIds.has(cycle.id)}
            slowDeleting={slowDeletingId === cycle.id}
            onSelect={onSelect}
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
  latest,
  itemCount,
  canDelete,
  deleting,
  slowDeleting,
  onSelect,
  onSetDefault,
  onDelete,
}: {
  cycle: OkrCycle;
  selected: boolean;
  latest: boolean;
  itemCount: number;
  canDelete: boolean;
  deleting: boolean;
  slowDeleting: boolean;
  onSelect: (id: string) => void;
  onSetDefault: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <article className={`okr-file-row ${selected ? "active" : ""}`}>
      <button className="okr-file-open" type="button" onClick={() => onSelect(cycle.id)} aria-label={`${cycle.name} 열기`}><Archive size={15} /><span><b>{cycle.name}</b><small>v{cycle.version} · {cycle.startDate} - {cycle.endDate} · {cycle.department || "부서 미지정"} · {itemCount}개 항목{slowDeleting ? " · 삭제 중" : ""}</small></span></button>
      <div className="okr-file-row-actions">
        {selected && <em>열림</em>}
        {cycle.status === "active" ? <em>기본</em> : <button type="button" onClick={() => onSetDefault(cycle.id)}>기본</button>}
        {latest && <em>최신</em>}
        <button type="button" className={deleting ? "is-loading" : ""} onClick={() => onDelete(cycle.id)} disabled={!canDelete || deleting} aria-label={`${cycle.name} 삭제`} title={deleting ? "삭제 중" : canDelete ? "삭제" : "마지막 파일은 삭제할 수 없습니다"}>{deleting ? <LoaderCircle size={12} /> : <Trash2 size={12} />}</button>
      </div>
    </article>
  );
}

function DeleteSelectCheckbox({ item, selected, onToggle }: { item: Pick<OkrptrItem, "id" | "kind" | "title">; selected: boolean; onToggle: (id: string) => void }) {
  return (
    <label className="delete-select" title={`${item.title} 삭제 선택`}>
      <input type="checkbox" checked={selected} onChange={() => onToggle(item.id)} aria-label={`${item.kind === "project" ? "Project" : "Task"} ${item.title} 삭제 선택`} />
      <span><Check size={11} /></span>
    </label>
  );
}

function BoardView({ items, onOpenItem, canDeleteItem, selectedItemIds, onToggleSelect, selectionMode }: { items: OkrptrItem[]; onOpenItem: (item: OkrptrItem) => void; canDeleteItem: (item: OkrptrItem) => boolean; selectedItemIds: Set<string>; onToggleSelect: (id: string) => void; selectionMode: boolean }) {
  const columns: { status: ItemStatus; label: string }[] = [
    { status: "backlog", label: "백로그" },
    { status: "todo", label: "할 일" },
    { status: "policy_discussion", label: "정책 논의" },
    { status: "in_progress", label: "진행 중" },
    { status: "developing", label: "개발 중" },
    { status: "development_done", label: "개발 완료" },
    { status: "blocked", label: "막힘" },
  ];
  return <div className="board">{columns.map((column) => { const rows = items.filter((entry) => entry.status === column.status); return <section className="board-column" key={column.status}><header><span className={`status-dot status-${column.status}`} /><b>{column.label}</b><em>{rows.length}</em></header><div>{rows.map((entry) => <article className={`board-selectable-item ${selectionMode ? "selection-mode" : ""}`} key={entry.id}>{selectionMode && canDeleteItem(entry) && <DeleteSelectCheckbox item={entry} selected={selectedItemIds.has(entry.id)} onToggle={onToggleSelect} />}<button className="board-item" onClick={() => onOpenItem(entry)}><b>{entry.title}</b><span><CalendarDays size={13} />{dueLabel(entry.dueDate)}</span></button></article>)}{!rows.length && <span className="empty-column">작업 없음</span>}</div></section>; })}</div>;
}

function TaskListView({ items, allItems, routines, onOpenTask, onPatch, canDeleteItem, selectedItemIds, onToggleSelect, onSelectItems, onClearItems, onTrashSelected, trashing }: { items: OkrptrItem[]; allItems: OkrptrItem[]; routines: Routine[]; onOpenTask: (id: string) => void; onPatch: (id: string, patch: Partial<OkrptrItem>) => Promise<unknown>; canDeleteItem: (item: OkrptrItem) => boolean; selectedItemIds: Set<string>; onToggleSelect: (id: string) => void; onSelectItems: (ids: string[]) => void; onClearItems: (ids: string[]) => void; onTrashSelected: () => void; trashing: boolean }) {
  const [selectionMode, setSelectionMode] = useState(false);
  const byId = new Map(allItems.map((entry) => [entry.id, entry]));
  const routineIds = new Set(routines.map((entry) => entry.id));
  const deletableItems = items.filter(canDeleteItem);
  const taskIds = deletableItems.map((entry) => entry.id);
  const selectedTaskCount = taskIds.filter((id) => selectedItemIds.has(id)).length;
  const allSelected = deletableItems.length > 0 && selectedTaskCount === deletableItems.length;
  const orphanedIds = deletableItems.filter((entry) => entry.parentId
    ? byId.get(entry.parentId)?.kind !== "project"
    : entry.routineId ? !routineIds.has(entry.routineId) : true).map((entry) => entry.id);
  if (!items.length) return <EmptyState icon={Inbox} title="Task가 없습니다" />;
  return (
    <section className="task-list" aria-label="Task 목록">
      <div className="task-list-summary"><span>Task {items.length}개</span>{deletableItems.length > 0 && <button aria-pressed={selectionMode} onClick={() => { if (selectionMode) onClearItems(taskIds); setSelectionMode((current) => !current); }}>{selectionMode ? <X size={13} /> : <ListChecks size={13} />}{selectionMode ? "선택 종료" : "선택"}</button>}</div>
      {selectionMode && deletableItems.length > 0 && <div className="task-selection-bar">
        <label><input type="checkbox" checked={allSelected} onChange={() => allSelected ? onClearItems(taskIds) : onSelectItems(taskIds)} /><span>{allSelected ? "전체 선택 해제" : "전체 선택"}</span></label>
        <b>{selectedTaskCount ? `${selectedTaskCount}개 선택` : `삭제 가능 ${deletableItems.length}개`}</b>
        {orphanedIds.length > 0 && <button className="orphan-task-select" onClick={() => onSelectItems(orphanedIds)}><AlertTriangle size={13} />연결 끊긴 Task {orphanedIds.length}개 선택</button>}
        <button className="task-selection-delete" disabled={!selectedTaskCount || trashing} onClick={onTrashSelected}><Trash2 size={13} />{trashing ? "이동 중" : "선택 삭제"}</button>
      </div>}
      {items.map((entry) => {
        const project = entry.parentId ? byId.get(entry.parentId) : undefined;
        const routine = entry.routineId ? routines.find((row) => row.id === entry.routineId) : undefined;
        const relation = routine?.systemKey === "general" ? "General 수집함" : routine ? `Routine · ${routine.title}` : project?.kind === "project" ? `Project · ${project.title}` : "연결 끊김";
        const assignee = assignmentLabel(entry, "task_assignee");
        return (
          <article className={`task-list-row ${selectionMode && canDeleteItem(entry) ? "deletion-selectable" : ""} ${isCompletedStatus(entry.status) ? "completed" : ""}`} key={entry.id}>
            {selectionMode && canDeleteItem(entry) && <DeleteSelectCheckbox item={entry} selected={selectedItemIds.has(entry.id)} onToggle={onToggleSelect} />}
            <button className={`task-list-check ${isCompletedStatus(entry.status) ? "checked" : ""}`} onClick={() => void onPatch(entry.id, { status: isCompletedStatus(entry.status) ? "todo" : "done", progress: isCompletedStatus(entry.status) ? entry.progress : 100 })} aria-label={`${entry.title} ${isCompletedStatus(entry.status) ? "완료 취소" : "완료"}`}><Check size={13} /></button>
            <button className="task-list-open" onClick={() => onOpenTask(entry.id)}>
              <b>{entry.title}</b>
              <span className="task-list-inline-meta"><i className={`status-dot status-${entry.status}`} />{statusLabel(entry.status)}<em>·</em>{assignee}<em>·</em>{relation}{entry.dueDate && <><em>·</em>{dueLabel(entry.dueDate)}</>}</span>
            </button>
            <button className="task-list-chevron" onClick={() => onOpenTask(entry.id)} aria-label={`${entry.title} 상세 열기`}><ChevronRight size={15} /></button>
          </article>
        );
      })}
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

function TrashView({ workspaceId, onNotice, canDeleteRecords, canRestore }: { workspaceId: string; onNotice: (message: string) => void; canDeleteRecords: boolean; canRestore: boolean }) {
  const confirmAction = useAppConfirm();
  const initialCache = trashMemoryCache.get(workspaceId) ?? null;
  const [records, setRecords] = useState<TrashRecord[] | null>(() => initialCache?.records ?? null);
  const [trashedItems, setTrashedItems] = useState<TrashedItem[] | null>(() => initialCache?.items ?? null);
  const [initiativeOptions, setInitiativeOptions] = useState<TrashInitiativeOption[]>(() => initialCache?.initiativeOptions ?? []);
  const [restoreParents, setRestoreParents] = useState<Record<string, string>>({});
  const [loadError, setLoadError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    const cached = trashMemoryCache.get(workspaceId) ?? null;
    const cacheKey = `trash:${workspaceId}`;
    if (cached && viewCacheIsFresh(cacheKey)) return () => { active = false; };
    Promise.all([fetch("/api/item-trash"), fetch("/api/trash")])
      .then(async ([itemResponse, recordResponse]) => {
        if (!itemResponse.ok || !recordResponse.ok) throw new Error("trash-load-failed");
        const itemData = await itemResponse.json() as { items: TrashedItem[]; initiativeOptions: TrashInitiativeOption[] };
        const recordData = await recordResponse.json() as { trash: TrashRecord[] };
        return { items: itemData.items, records: recordData.trash, initiativeOptions: itemData.initiativeOptions ?? [] };
      })
      .then((data) => {
        if (!active) return;
        trashMemoryCache.set(workspaceId, { records: data.records, items: data.items, initiativeOptions: data.initiativeOptions });
        markViewCacheFresh(cacheKey);
        setLoadError(false);
        setTrashedItems(data.items);
        setRecords(data.records);
        setInitiativeOptions(data.initiativeOptions);
      })
      .catch(() => { if (active && !cached) setLoadError(true); });
    return () => { active = false; };
  }, [loadAttempt, workspaceId]);

  useEffect(() => {
    if (records !== null && trashedItems !== null) {
      trashMemoryCache.set(workspaceId, { records, items: trashedItems, initiativeOptions });
      markViewCacheFresh(`trash:${workspaceId}`);
    }
  }, [initiativeOptions, records, trashedItems, workspaceId]);

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
    const restoreParentId = restoreParents[entry.id];
    if (entry.kind === "project" && entry.restoreParentRequired && !restoreParentId) {
      onNotice("복구할 Initiative를 먼저 선택해 주세요.");
      return;
    }
    const response = await fetch("/api/item-trash", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemIds: [entry.id], action: "restore", projectParentIds: restoreParentId ? { [entry.id]: restoreParentId } : {} }),
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
              {canRestore && entry.restoreParentRequired && <label className="trash-restore-parent"><span>복구할 Initiative</span><select value={restoreParents[entry.id] ?? ""} onChange={(event) => setRestoreParents((current) => ({ ...current, [entry.id]: event.target.value }))}><option value="">Initiative 선택</option>{initiativeOptions.map((initiative) => <option value={initiative.id} key={initiative.id}>{initiative.title}</option>)}</select></label>}
            </div>
            {(canRestore || entry.canDelete) && <div className="trash-actions">{canRestore && <button disabled={entry.restoreParentRequired && !restoreParents[entry.id]} onClick={() => void restoreItem(entry)}><RotateCcw size={13} />복구</button>}{entry.canDelete && <button className="danger" onClick={() => void permanentlyDeleteItem(entry)}><Trash2 size={13} />영구 삭제</button>}</div>}
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
            {canDeleteRecords && <div className="trash-actions"><button onClick={() => void restoreRecord(record)}><RotateCcw size={13} />복구</button><button className="danger" onClick={() => void permanentlyDeleteRecord(record)}><Trash2 size={13} />영구 삭제</button></div>}
          </article>
        ))}
      </section>}
    </div>
  );
}

function ReviewView({ items, cadence, completed, blocked, averageProgress, onOpenTask, onOpenProject }: { items: OkrptrItem[]; cadence: Cadence; completed: number; blocked: number; averageProgress: number; onOpenTask: (id: string) => void; onOpenProject: (id: string) => void }) {
  return <section className="review-content"><div className="metrics-row"><div><span>완료</span><strong>{completed}<small> / {items.length}</small></strong></div><div><span>평균 진행</span><strong>{averageProgress}<small>%</small></strong></div><div><span>막힘</span><strong>{blocked}</strong></div></div><div className="review-progress"><div><b>{cadenceLabels[cadence]} 측정 항목 진행률</b><span>{averageProgress}%</span></div><span><i style={{ width: `${averageProgress}%` }} /></span></div><div className="review-list"><span>검토할 항목</span>{items.slice(0, 7).map((entry) => { const tracksProgress = entry.kind !== "objective" && entry.kind !== "initiative"; return entry.kind === "task" || entry.kind === "project" ? <button key={entry.id} onClick={() => entry.kind === "task" ? onOpenTask(entry.id) : onOpenProject(entry.id)}><span className={`status-dot status-${entry.status}`} /><b>{entry.title}</b>{tracksProgress && <em>{entry.progress}%</em>}<ChevronRight size={14} /></button> : <div key={entry.id}><span className={`status-dot status-${entry.status}`} /><b>{entry.title}</b>{tracksProgress && <em>{entry.progress}%</em>}</div>; })}{!items.length && <p className="my-work-empty">이 기간에 검토할 항목이 없습니다.</p>}</div></section>;
}

function ProjectPropertyManager({ workspaceId, properties, teamMembers, readOnly, onChanged, onNotice }: { workspaceId: string; properties: PropertyDefinition[]; teamMembers: TeamMember[]; readOnly: boolean; onChanged: (properties: PropertyDefinition[]) => void; onNotice: (message: string) => void }) {
  const confirmAction = useAppConfirm();
  const cacheKey = `properties:${workspaceId}`;
  const initialCatalog = propertyCatalogMemoryCache.get(cacheKey) ?? properties;
  const [catalog, setCatalog] = useState<PropertyDefinition[]>(initialCatalog);
  const [selectedId, setSelectedId] = useState<string | null>(initialCatalog[0]?.id ?? null);
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
    if (propertyCatalogMemoryCache.has(cacheKey) && viewCacheIsFresh(cacheKey)) return () => { active = false; };
    void fetch("/api/properties?includeInactive=true")
      .then(async (response) => response.ok ? response.json() as Promise<{ properties: PropertyDefinition[] }> : Promise.reject())
      .then((data) => {
        if (!active) return;
        propertyCatalogMemoryCache.set(cacheKey, data.properties);
        markViewCacheFresh(cacheKey);
        setCatalog(data.properties);
        onChangedRef.current(data.properties);
        setSelectedId((current) => current ?? data.properties[0]?.id ?? null);
      })
      .catch(() => onNoticeRef.current("속성 목록을 새로 불러오지 못했습니다."));
    return () => { active = false; };
  }, [cacheKey]);

  function applyCatalog(next: PropertyDefinition[]) {
    const sorted = [...next].sort((left, right) => left.sortOrder - right.sortOrder);
    propertyCatalogMemoryCache.set(cacheKey, sorted);
    markViewCacheFresh(cacheKey);
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

function ProjectTemplateManager({ workspaceId, readOnly, onNotice }: { workspaceId: string; readOnly: boolean; onNotice: (message: string) => void }) {
  const confirmAction = useAppConfirm();
  const cacheKey = `templates:${workspaceId}`;
  const [templates, setTemplates] = useState<ProjectTemplate[] | null>(() => projectTemplateMemoryCache.get(cacheKey) ?? null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [templateName, setTemplateName] = useState("");
  const [creatingTemplate, setCreatingTemplate] = useState(false);
  const [saving, setSaving] = useState(false);
  const selected = templates?.find((template) => template.id === selectedId) ?? null;

  useEffect(() => {
    let active = true;
    if (projectTemplateMemoryCache.has(cacheKey) && viewCacheIsFresh(cacheKey)) return () => { active = false; };
    void fetch("/api/project-templates").then(async (response) => response.ok ? response.json() as Promise<{ templates: ProjectTemplate[] }> : Promise.reject()).then((data) => {
      if (!active) return;
      projectTemplateMemoryCache.set(cacheKey, data.templates);
      markViewCacheFresh(cacheKey);
      setTemplates(data.templates);
      setSelectedId(data.templates[0]?.id ?? null);
    }).catch(() => setTemplates([]));
    return () => { active = false; };
  }, [cacheKey]);
  useEffect(() => {
    if (!templates) return;
    projectTemplateMemoryCache.set(cacheKey, templates);
    markViewCacheFresh(cacheKey);
  }, [cacheKey, templates]);

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

function WorkspaceSettingsPanel({ currentWorkspace, scheduledWorkspaces, teamData, properties, teamMembers, tab, requestedGroupHandle, slack, slackOAuthIssue, integrationLoading, integrationLoadError, workspaceSaving, onTabChange, onClose, onTeamChange, onPropertiesChanged, onOpenAvatar, onCleanup, onDeleteWorkspace, onRestoreWorkspace, onPermanentlyDeleteWorkspace, onSlackChange, onRefreshIntegrations, onNotice }: { currentWorkspace: WorkspaceSummary; scheduledWorkspaces: WorkspaceSummary[]; teamData: TeamData | null; properties: PropertyDefinition[]; teamMembers: TeamMember[]; tab: WorkspaceSettingsTab; requestedGroupHandle: string | null; slack: SlackConnectionStatus | null; slackOAuthIssue: SlackOAuthIssue | null; integrationLoading: boolean; integrationLoadError: boolean; workspaceSaving: boolean; onTabChange: (tab: WorkspaceSettingsTab) => void; onClose: () => void; onTeamChange: (team: TeamData | null) => void; onPropertiesChanged: (properties: PropertyDefinition[]) => void; onOpenAvatar: () => void; onCleanup: () => void; onDeleteWorkspace: (workspace: WorkspaceSummary) => void; onRestoreWorkspace: (workspace: WorkspaceSummary) => void; onPermanentlyDeleteWorkspace: (workspace: WorkspaceSummary) => void; onSlackChange: (status: SlackConnectionStatus | null) => void; onRefreshIntegrations: () => void; onNotice: (message: string) => void }) {
  const [projectSettingsTab, setProjectSettingsTab] = useState<"properties" | "templates">("properties");
  const canManageWorkspace = currentWorkspace.role === "owner" || currentWorkspace.role === "admin";
  const tabs: Array<{ id: WorkspaceSettingsTab; label: string; icon: LucideIcon; visible: boolean; count?: number }> = [
    { id: "general", label: "일반", icon: Settings2, visible: true },
    { id: "members", label: "멤버", icon: Users, visible: !currentWorkspace.personal, count: teamData?.members.length },
    { id: "groups", label: "그룹", icon: AtSign, visible: !currentWorkspace.personal },
    { id: "projects", label: "Project 설정", icon: Briefcase, visible: true },
    { id: "summary", label: "관리 요약", icon: Activity, visible: !currentWorkspace.personal },
    { id: "integrations", label: "봇 연동", icon: Bot, visible: !currentWorkspace.personal },
    { id: "backups", label: "백업 및 복원", icon: Database, visible: canManageWorkspace },
    { id: "danger", label: "위험 구역", icon: AlertTriangle, visible: canManageWorkspace },
    { id: "scheduled", label: "삭제 예정", icon: Trash2, visible: scheduledWorkspaces.length > 0, count: scheduledWorkspaces.length },
  ];
  const visibleTabs = tabs.filter((entry) => entry.visible);
  const activeTab = visibleTabs.some((entry) => entry.id === tab) ? tab : "general";

  return <OverlayDialog title="워크스페이스 설정" variant="drawer" onRequestClose={() => onClose()}>{(requestClose) => <aside className="workspace-settings-panel">
    <header className="workspace-settings-header"><div><WorkspaceAvatar workspace={currentWorkspace} /><span><h2>워크스페이스 설정</h2><p>{currentWorkspace.name} · {currentWorkspace.personal ? "개인" : teamRoleLabel(currentWorkspace.role)}</p></span></div><button className="icon-button" onClick={() => requestClose("close-button")} aria-label="워크스페이스 설정 닫기"><X size={18} /></button></header>
    <div className="workspace-settings-layout">
      <nav className="workspace-settings-nav" aria-label="워크스페이스 설정 메뉴">{visibleTabs.map((entry) => { const Icon = entry.icon; return <button key={entry.id} className={activeTab === entry.id ? "active" : ""} aria-current={activeTab === entry.id ? "page" : undefined} onClick={() => onTabChange(entry.id)}><Icon size={15} /><span>{entry.label}</span>{entry.count !== undefined && <b>{entry.count}</b>}</button>; })}</nav>
      <section className="workspace-settings-content">
        {activeTab === "general" && <div className="workspace-settings-section"><header><h3>일반</h3><p>현재 선택한 워크스페이스의 기본 정보입니다.</p></header><div className="workspace-profile-card"><WorkspaceAvatar workspace={currentWorkspace} className="workspace-profile-avatar" /><div><b>{currentWorkspace.name}</b><span>{currentWorkspace.personal ? "개인 워크스페이스" : "팀 워크스페이스"}</span><small>내 권한 · {teamRoleLabel(currentWorkspace.role)}</small></div>{!currentWorkspace.personal && canManageWorkspace && <button onClick={onOpenAvatar}><ImageIcon size={14} />이미지 변경</button>}</div>{currentWorkspace.personal && <div className="workspace-settings-note"><CircleHelp size={16} /><p>개인 워크스페이스는 계정 첫 글자를 기본 이미지로 사용합니다. 조직 관리 탭은 팀 워크스페이스에서만 표시됩니다.</p></div>}{!canManageWorkspace && !currentWorkspace.personal && <div className="workspace-settings-note"><Eye size={16} /><p>워크스페이스 정보는 읽기 전용입니다. 변경은 Owner 또는 Admin에게 요청해 주세요.</p></div>}</div>}
        {activeTab === "members" && <div className="workspace-settings-section team-settings-section"><header><h3>멤버</h3><p>초대, 역할과 워크스페이스 구성원을 관리합니다.</p></header><TeamPanel key={`${currentWorkspace.id}:members`} initialTeam={teamData} initialTab="members" initialGroupHandle={null} embedded onTeamChange={onTeamChange} onClose={onClose} onNotice={onNotice} /></div>}
        {activeTab === "groups" && <div className="workspace-settings-section team-settings-section"><header><h3>그룹</h3><p>조직 그룹과 구성원, Lead 권한을 관리합니다.</p></header><TeamPanel key={`${currentWorkspace.id}:groups`} initialTeam={teamData} initialTab="groups" initialGroupHandle={requestedGroupHandle} embedded onTeamChange={onTeamChange} onClose={onClose} onNotice={onNotice} /></div>}
        {activeTab === "projects" && <div className="workspace-project-settings"><header className="workspace-settings-section-header"><div><h3>Project 설정</h3><p>모든 Project에서 함께 사용하는 속성과 본문 템플릿입니다.</p></div><div className="workspace-project-tabs" role="tablist" aria-label="Project 설정"><button role="tab" aria-selected={projectSettingsTab === "properties"} className={projectSettingsTab === "properties" ? "active" : ""} onClick={() => setProjectSettingsTab("properties")}><Settings2 size={14} />속성</button><button role="tab" aria-selected={projectSettingsTab === "templates"} className={projectSettingsTab === "templates" ? "active" : ""} onClick={() => setProjectSettingsTab("templates")}><BookTemplate size={14} />템플릿</button></div></header>{projectSettingsTab === "properties" ? <ProjectPropertyManager workspaceId={currentWorkspace.id} properties={properties} teamMembers={teamMembers} readOnly={!canManageWorkspace} onChanged={(next) => onPropertiesChanged([...next].sort((left, right) => left.sortOrder - right.sortOrder))} onNotice={onNotice} /> : <ProjectTemplateManager workspaceId={currentWorkspace.id} readOnly={!canManageWorkspace} onNotice={onNotice} />}</div>}
        {activeTab === "backups" && <WorkspaceBackups key={`${currentWorkspace.id}:backups`} workspaceId={currentWorkspace.id} workspaceName={currentWorkspace.name} onNotice={onNotice} />}
        {activeTab === "summary" && <WorkspaceManagementSummary key={`${currentWorkspace.id}:summary`} />}
        {activeTab === "integrations" && <WorkspaceSlackIntegration key={`${currentWorkspace.id}:bots`} slack={slack} slackOAuthIssue={slackOAuthIssue} loading={integrationLoading} loadError={integrationLoadError} workspaceName={currentWorkspace.name} canManageSlack={canManageWorkspace} onSlackChange={onSlackChange} onRefresh={onRefreshIntegrations} onNotice={onNotice} />}
        {activeTab === "danger" && <div className="workspace-settings-section danger-settings"><header><h3>위험 구역</h3><p>현재 워크스페이스의 실행 데이터와 워크스페이스 자체를 정리합니다.</p></header><article><div><b>OKR 실행 데이터 클린업</b><p>워크스페이스와 그룹은 유지하고 OKR·Project·Task를 휴지통으로 이동합니다.</p></div><button onClick={onCleanup}><Trash2 size={14} />클린업 열기</button></article>{!currentWorkspace.personal && currentWorkspace.role === "owner" && <article><div><b>워크스페이스 삭제 예약</b><p>즉시 접근을 중단하고 30일 동안 복구할 수 있도록 삭제 예약합니다.</p></div><button onClick={() => onDeleteWorkspace(currentWorkspace)} disabled={workspaceSaving}><Trash2 size={14} />삭제 예약</button></article>}</div>}
        {activeTab === "scheduled" && <div className="workspace-settings-section scheduled-settings"><header><h3>삭제 예정 워크스페이스</h3><p>삭제 예약된 워크스페이스를 복구하거나 즉시 영구삭제합니다.</p></header><div className="scheduled-workspace-list">{scheduledWorkspaces.map((workspace) => <article key={workspace.id}><WorkspaceAvatar workspace={workspace} /><div><b>{workspace.name}</b><small>{workspaceDeletionLabel(workspace.scheduledDeletionAt)}</small></div><button onClick={() => onRestoreWorkspace(workspace)} disabled={workspaceSaving}><RotateCcw size={14} />복구</button><button className="danger" onClick={() => onPermanentlyDeleteWorkspace(workspace)} disabled={workspaceSaving}><Trash2 size={14} />영구삭제</button></article>)}</div></div>}
      </section>
    </div>
  </aside>}</OverlayDialog>;
}

function PropertyPanel({ user, displayName, themeMode, onThemeModeChange, onClose, onSignOut }: { user: AuthUser | null; displayName: string; themeMode: ThemeMode; onThemeModeChange: (mode: ThemeMode) => void; onClose: () => void; onSignOut: () => void }) {
  return <OverlayDialog title="내 설정" variant="drawer" onRequestClose={() => onClose()}>{(requestClose) => <aside className="property-panel"><header><div><h2>내 설정</h2><p>내 계정과 화면 설정</p></div><button className="icon-button" onClick={() => requestClose("close-button")} aria-label="내 설정 닫기" title="내 설정 닫기"><X size={17} /></button></header><section className="settings-section"><h3>내 계정</h3><div className="settings-account-card"><span className="avatar">{displayName.slice(0, 1).toLocaleUpperCase()}</span><div><b>{displayName}</b><small>{user?.email || "로그인 계정"}</small></div></div></section><section className="settings-section appearance-settings"><h3>테마</h3><ThemePicker value={themeMode} onChange={onThemeModeChange} /><p>선택한 테마는 이 브라우저에 저장됩니다.</p></section><MarketingConsentSettings /><section className="settings-account-actions"><button onClick={onSignOut}><LogOut size={13} />Google 계정 로그아웃</button></section></aside>}</OverlayDialog>;
}


function TeamPanel({ initialTeam, initialTab, initialGroupHandle, embedded = false, onTeamChange, onClose, onNotice }: { initialTeam: TeamData | null; initialTab: "members" | "groups"; initialGroupHandle: string | null; embedded?: boolean; onTeamChange: (team: TeamData | null) => void; onClose: () => void; onNotice: (message: string) => void }) {
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
    if (!team) return;
    const next = { ...team, members };
    setTeam(next);
    onTeamChange(next);
  }

  function applyInvitations(invitations: TeamInvitation[], emailConfigured = team?.invitationEmailConfigured ?? false) {
    if (!team) return;
    const next = { ...team, invitations, invitationEmailConfigured: emailConfigured };
    setTeam(next);
    onTeamChange(next);
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
    const data = await response.json() as { invitation?: TeamInvitation; inviteUrl?: string; error?: string };
    setSaving(false);
    if (!response.ok || !data.invitation) {
      setError(data.error ?? "초대를 만들지 못했습니다.");
      return;
    }
    applyInvitations([data.invitation, ...(team?.invitations ?? [])], team?.invitationEmailConfigured || data.invitation.deliveryStatus === "sent");
    setEmail("");
    setInviteDisplayName("");
    setError("");
    onNotice(data.invitation.deliveryStatus === "sent" ? "초대메일을 보냈습니다." : "초대는 만들었지만 메일을 보내지 못했습니다. 링크를 복사해 전달해 주세요.");
  }

  async function invitationAction(invitation: TeamInvitation, action: "resend" | "link") {
    setError("");
    const response = await fetch("/api/team/invitations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: invitation.id, action }) });
    const data = await response.json() as { invitation?: TeamInvitation; inviteUrl?: string; error?: string };
    if (!response.ok || !data.invitation || !data.inviteUrl) {
      setError(data.error ?? "초대 링크를 갱신하지 못했습니다.");
      return;
    }
    applyInvitations(
      (team?.invitations ?? []).map((entry) => entry.id === invitation.id ? data.invitation! : entry),
      team?.invitationEmailConfigured || data.invitation.deliveryStatus === "sent",
    );
    if (action === "link") {
      await navigator.clipboard.writeText(data.inviteUrl);
      onNotice("30일 동안 유효한 새 초대 링크를 복사했습니다.");
    } else {
      onNotice(data.invitation.deliveryStatus === "sent" ? "초대메일을 다시 보냈습니다." : "메일 발송에 실패했습니다. 링크 복사를 이용해 주세요.");
    }
  }

  async function revokeInvitation(invitation: TeamInvitation) {
    const response = await fetch(`/api/team/invitations?id=${encodeURIComponent(invitation.id)}`, { method: "DELETE" });
    if (!response.ok) {
      const data = await response.json() as { error?: string };
      setError(data.error ?? "초대를 취소하지 못했습니다.");
      return;
    }
    applyInvitations((team?.invitations ?? []).filter((entry) => entry.id !== invitation.id));
    onNotice("초대를 취소했습니다.");
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
    onNotice("팀에서 제거했습니다.");
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

  const panelContent = (requestClose?: (reason?: "close-button") => void) => (
      <aside className={`property-panel team-panel ${embedded ? "team-panel-embedded" : ""}`}>
        {!embedded && <header>
          <div className="team-panel-heading">{team && <WorkspaceAvatar workspace={team.workspace} />}<span><h2>팀</h2><p>{team ? `${team.workspace.name} · ${team.members.length}명 · ${activeGroupCount}개 그룹` : "불러오는 중"}</p></span></div>
          <button className="icon-button" onClick={() => requestClose?.("close-button")} aria-label="닫기"><X size={17} /></button>
        </header>}
        {!embedded && <div className="team-tabs" role="tablist" aria-label="팀 관리">
          <button role="tab" aria-selected={tab === "members"} className={tab === "members" ? "active" : ""} onClick={() => { setTab("members"); setSelectedGroupId(null); clearGroupUrl(); }}><Users size={14} />멤버</button>
          <button role="tab" aria-selected={tab === "groups"} className={tab === "groups" ? "active" : ""} onClick={() => setTab("groups")}><AtSign size={14} />그룹</button>
        </div>}
        {tab === "members" ? (
          <>
            {team?.canManage && team.workspace.kind === "team" && (
              <form className="team-invite" onSubmit={invite}>
                <label><span>실명과 이메일로 초대</span><div><input value={inviteDisplayName} onChange={(event) => setInviteDisplayName(event.target.value)} maxLength={80} placeholder="홍길동" aria-label="초대 실명" /><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@company.com" aria-label="초대 이메일" /><select value={role} onChange={(event) => setRole(event.target.value as Exclude<TeamRole, "owner">)} aria-label="초대 역할"><option value="admin">Admin</option><option value="member">Member</option><option value="viewer">Viewer</option></select><button disabled={!email.trim() || saving} aria-label="멤버 초대" title="멤버 초대"><UserPlus size={14} /></button></div></label>
                {!team.invitationEmailConfigured && <p className="team-invite-warning">메일 발송 설정이 없어 초대 링크로만 전달할 수 있습니다.</p>}
              </form>
            )}
            {team?.workspace.kind === "personal" && <p className="team-invite-warning personal">멤버 초대는 팀 워크스페이스에서 사용할 수 있습니다.</p>}
            {error && <p className="team-panel-error">{error}</p>}
            <div className="team-list">
              {team ? team.members.map((member) => {
                const canEditName = team.canManage;
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
                    <span className="member-status member-active">활성</span>
                    {team.canManage && member.role !== "owner" ? <select value={member.role} onChange={(event) => void changeRole(member, event.target.value as Exclude<TeamRole, "owner">)} aria-label={`${member.displayName} 역할`}><option value="admin">Admin</option><option value="member">Member</option><option value="viewer">Viewer</option></select> : <span className="member-role">{teamRoleLabel(member.role)}</span>}
                    <div className="team-member-actions">
                      {team.canManage && member.role !== "owner" && !member.isCurrent && <button className="icon-button danger" onClick={() => void remove(member)} aria-label="팀에서 제거" title="팀에서 제거"><Trash2 size={13} /></button>}
                    </div>
                  </div>
                );
              }) : !error ? <EmptyState icon={Users} title="팀 정보를 불러오는 중입니다" /> : <EmptyState icon={Users} title={error} />}
            </div>
            {team && team.invitations.length > 0 && <section className="team-invitations">
              <header><b>대기 중인 초대</b><span>{team.invitations.length}</span></header>
              <div className="team-invitation-list">{team.invitations.map((invitation) => (
                <div className="team-invitation" key={invitation.id}>
                  <span className="team-avatar pending">{invitation.displayName.slice(0, 1).toLocaleUpperCase()}</span>
                  <div><b>{invitation.displayName}</b><small>{invitation.email} · {teamRoleLabel(invitation.role)}</small></div>
                  <span className={`invitation-delivery delivery-${invitation.deliveryStatus}`}>{invitation.status === "expired" ? "만료됨" : invitation.deliveryStatus === "sent" ? "메일 발송됨" : invitation.deliveryStatus === "failed" ? "발송 실패" : invitation.deliveryStatus === "unavailable" ? "링크 전달 필요" : "미발송"}</span>
                  {team.canManage && <div className="team-member-actions">
                    <button className="icon-button" onClick={() => void invitationAction(invitation, "link")} aria-label={`${invitation.displayName} 초대 링크 복사`} title="새 초대 링크 복사"><Copy size={13} /></button>
                    <button className="icon-button" onClick={() => void invitationAction(invitation, "resend")} aria-label={`${invitation.displayName} 초대메일 재전송`} title="초대메일 재전송"><RotateCcw size={13} /></button>
                    <button className="icon-button danger" onClick={() => void revokeInvitation(invitation)} aria-label={`${invitation.displayName} 초대 취소`} title="초대 취소"><Trash2 size={13} /></button>
                  </div>}
                </div>
              ))}</div>
            </section>}
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
  );
  if (embedded) return panelContent();
  return <OverlayDialog title="팀 관리" variant="drawer" dirty={panelDirty} onRequestClose={() => onClose()}>{(requestClose) => panelContent(requestClose)}</OverlayDialog>;
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


function AppIntegrationsView({ google, slack, loading, loadError, onGoogleChange, onRefresh, onNotice }: { google: GoogleConnectionStatus | null; slack: SlackConnectionStatus | null; loading: boolean; loadError: boolean; onGoogleChange: (status: GoogleConnectionStatus | null) => void; onRefresh: () => void; onNotice: (message: string) => void }) {
  const [disconnectingGoogle, setDisconnectingGoogle] = useState(false);

  async function disconnectGoogle() {
    setDisconnectingGoogle(true);
    const response = await fetch("/api/google/disconnect", { method: "POST" });
    setDisconnectingGoogle(false);
    if (!response.ok) { onNotice("Google 연결을 해제하지 못했습니다."); return; }
    onGoogleChange(google ? { ...google, connected: false, email: null, displayName: null, connectedAt: null, updatedAt: null } : null);
    onNotice("Google Calendar 연결을 해제했습니다.");
  }

  function connectGoogle() {
    if (!google?.configured) return;
    window.location.href = `/api/google/auth?returnTo=${encodeURIComponent("/?view=integrations")}`;
  }

  const slackState = loadError && !slack ? "error" : slack?.state ?? "service_unavailable";
  const slackConnected = Boolean(slack?.connected && slackState !== "service_unavailable" && slackState !== "error");

  return <section className="integrations-page" aria-label="개인 앱 연동 설정">
    <section className="integration-intro">
      <div><h2>내 계정에 연결된 앱</h2><p>내 캘린더와 개인 Slack DM처럼 현재 사용자에게만 적용되는 연결입니다.</p></div>
      <button type="button" onClick={onRefresh} disabled={loading}><RefreshCw className={loading ? "spin" : ""} size={15} />{loading ? "상태 확인 중" : "연결 상태 새로고침"}</button>
    </section>

    <section className="integration-service-card google-service-card" aria-labelledby="google-integration-heading">
      <header><span className="integration-service-icon"><CalendarDays size={20} /></span><div><h3 id="google-integration-heading">Google Calendar</h3><p>내 Task의 마감 일정을 개인 캘린더와 연결합니다.</p></div><strong className={`integration-status-badge ${google?.connected ? "connected" : google?.configured ? "idle" : "warning"}`}>{loading ? "확인 중" : google?.connected ? "연결 완료" : google?.configured ? "연결 가능" : "설정 확인 필요"}</strong></header>
      {loading ? <div className="integration-loading"><LoaderCircle className="spin" size={16} />연결 상태를 확인하고 있습니다.</div> : google?.connected ? <div className="integration-service-actions"><div><b>{google.email}</b><span>일정 생성 및 수정 권한으로 연결됨</span></div><button className="secondary-danger" onClick={() => void disconnectGoogle()} disabled={disconnectingGoogle}>{disconnectingGoogle ? "해제 중" : "연결 해제"}</button></div> : google?.configured ? <div className="integration-service-actions"><div><b>개인 연결</b><span>현재 사용자에게만 적용됩니다.</span></div><button onClick={connectGoogle}>Google로 연결</button></div> : <div className="integration-state-message warning"><AlertTriangle size={17} /><div><b>Google 연결 설정을 확인할 수 없습니다</b><p>현재 사용자가 입력할 설정은 없습니다. 상태를 다시 확인해 주세요.</p></div><button onClick={onRefresh}>다시 확인</button></div>}
    </section>

    <section className="integration-service-card slack-service-card" aria-labelledby="personal-slack-heading">
      <header><span className="integration-service-icon slack"><Hash size={20} /></span><div><h3 id="personal-slack-heading">Slack 개인 DM</h3><p>내 데일리 알림 사용 여부와 수신 시간을 설정합니다. 팀 설치·채널·자동화는 워크스페이스 설정에서 관리합니다.</p></div><strong className={`integration-status-badge ${slackConnected ? "connected" : slackState}`}>{loading ? "확인 중" : slackConnected ? "사용 가능" : "팀 연결 필요"}</strong></header>
      {loading ? <div className="integration-loading"><LoaderCircle className="spin" size={16} />개인 Slack 설정을 확인하고 있습니다.</div> : slackConnected ? <SlackDailyAdvancedSettings connected canManage={false} mode="personal" onNotice={onNotice} /> : <div className="integration-state-message warning"><AlertTriangle size={17} /><div><b>워크스페이스 Slack 연결이 필요합니다</b><p>{loadError ? "연결 상태를 불러오지 못했습니다." : "Owner 또는 Admin이 워크스페이스 설정의 봇 연동에서 Slack을 연결하면 개인 DM 설정을 사용할 수 있습니다."}</p></div></div>}
    </section>
  </section>;
}

const managementBotSignalMeta: Record<ManagementBotSignal, { label: string; detail: string; tone: "quality" | "urgent" | "done" }> = {
  missing_due_date: { label: "기한 없음", detail: "활성 Project·Task 중 마감일이 비어 있는 항목", tone: "quality" },
  missing_owner: { label: "DRI·담당자 없음", detail: "Project DRI 또는 Task 담당자가 없는 항목", tone: "quality" },
  overdue: { label: "기한 초과", detail: "마감일이 지났지만 아직 완료되지 않은 항목", tone: "urgent" },
  completed_yesterday: { label: "어제 완료", detail: "어제 완료 상태로 변경된 Project·Task", tone: "done" },
  due_today: { label: "오늘 마감", detail: "오늘까지 완료해야 하는 활성 Project·Task", tone: "urgent" },
};

function managementScheduleSummary(settings: Pick<ManagementBotSettings, "weekdays" | "reportTime" | "channelId" | "channelName" | "signals">) {
  const weekdays = settings.weekdays.join(",") === "1,2,3,4,5" ? "평일" : settings.weekdays.map((day) => ["일", "월", "화", "수", "목", "금", "토"][day]).join("·");
  const channel = settings.channelId ? `#${settings.channelName || settings.channelId}` : "채널 미선택";
  return `${weekdays} ${settings.reportTime} · ${channel} · ${settings.signals.length}개 점검`;
}

function WorkspaceManagementSummary() {
  const [date, setDate] = useState(() => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date()));
  const [snapshot, setSnapshot] = useState<ManagementBotSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/workspace-management-bot?mode=summary&date=${encodeURIComponent(date)}`, { signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json() as { snapshot?: ManagementBotSnapshot; error?: string };
        if (!response.ok || !payload.snapshot) throw new Error(payload.error || "관리 요약을 불러오지 못했습니다.");
        setSnapshot(payload.snapshot);
      })
      .catch((loadError: unknown) => {
        if (loadError instanceof DOMException && loadError.name === "AbortError") {
          return;
        }
        setError(loadError instanceof Error ? loadError.message : "관리 요약을 불러오지 못했습니다.");
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [attempt, date]);

  function reload(nextDate?: string) {
    setLoading(true);
    setError("");
    if (nextDate !== undefined) setDate(nextDate);
    else setAttempt((current) => current + 1);
  }

  return <section className="workspace-management-summary-pane">
    <header className="workspace-settings-section-header management-summary-header"><div><h3>관리 요약</h3><p>정보가 부족하거나 지금 대응해야 할 Project·Task를 봇 설정과 분리해 확인합니다.</p></div><div className="management-summary-controls"><label><span>기준일</span><input aria-label="관리 요약 기준일" type="date" value={date} onChange={(event) => reload(event.target.value)} /></label><button type="button" onClick={() => reload()} disabled={loading}><RefreshCw className={loading ? "spin" : ""} size={14} />새로고침</button></div></header>
    {loading && !snapshot ? <div className="workspace-management-loading"><LoaderCircle className="spin" size={16} />관리 항목을 정리하고 있습니다.</div> : error && !snapshot ? <div className="workspace-management-error" role="alert"><AlertTriangle size={17} /><div><b>관리 요약을 불러오지 못했습니다</b><p>{error}</p><button type="button" onClick={() => reload()}>다시 시도</button></div></div> : snapshot && <div className="management-summary-content">
      <div className="management-summary-total"><span>{snapshot.date} 기준</span><b>{snapshot.totalCount}개</b><small>중복 항목은 각 관리 기준에 각각 집계됩니다.</small></div>
      {error && <p className="management-summary-refresh-error">최신 정보를 갱신하지 못해 이전 결과를 표시합니다.</p>}
      <div className="management-summary-groups">{snapshot.groups.map((group) => { const meta = managementBotSignalMeta[group.signal]; return <details className={meta.tone} key={group.signal}><summary><span><b>{meta.label}</b><small>{meta.detail}</small></span><em>{group.count}</em><ChevronDown size={15} /></summary><div>{group.items.length ? <ul>{group.items.map((item) => <li key={item.id}><a href={item.kind === "project" ? `/?project=${encodeURIComponent(item.id)}` : `/?task=${encodeURIComponent(item.id)}`}><span>{item.title}</span><small>{item.kind === "project" ? "Project" : "Task"}{item.dueDate ? ` · ${item.dueDate}` : ""}</small><ChevronRight size={14} /></a></li>)}</ul> : <p>해당 항목이 없습니다.</p>}</div></details>; })}</div>
    </div>}
  </section>;
}

function WorkspaceManagementBot({ active, canManage, onSummary, onNotice }: { active: boolean; canManage: boolean; onSummary: (status: string, summary: string) => void; onNotice: (message: string) => void }) {
  const [data, setData] = useState<ManagementBotData | null>(null);
  const [draft, setDraft] = useState<ManagementBotSettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const loadedRef = useRef(false);

  useEffect(() => {
    if (!active || loadedRef.current) return;
    loadedRef.current = true;
    const controller = new AbortController();
    setLoading(true);
    void fetch("/api/workspace-management-bot?mode=settings", { signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json() as ManagementBotData & { error?: string };
        if (!response.ok || !payload.settings) throw new Error(payload.error || "관리 봇 정보를 불러오지 못했습니다.");
        setData(payload);
        setDraft(payload.settings);
        onSummary(payload.settings.enabled ? "사용 중" : "중지", managementScheduleSummary(payload.settings));
        setError("");
      })
      .catch((loadError: unknown) => {
        if (loadError instanceof DOMException && loadError.name === "AbortError") return;
        setError(loadError instanceof Error ? loadError.message : "관리 봇 정보를 불러오지 못했습니다.");
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [active, onSummary]);

  async function save(sendTest = false) {
    if (!draft || saving || !canManage) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/workspace-management-bot?mode=settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: draft.enabled, weekdays: draft.weekdays, reportTime: draft.reportTime, timezone: draft.timezone, channelId: draft.channelId, signals: draft.signals }),
      });
      const next = await response.json() as ManagementBotData & { error?: string };
      if (!response.ok || !next.settings) throw new Error(next.error || "관리 봇 설정을 저장하지 못했습니다.");
      setData(next);
      setDraft(next.settings);
      onSummary(next.settings.enabled ? "사용 중" : "중지", managementScheduleSummary(next.settings));
      if (sendTest) {
        const testResponse = await fetch("/api/workspace-management-bot", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "test" }) });
        const testData = await testResponse.json() as { sent?: boolean; snapshot?: ManagementBotSnapshot; error?: string };
        if (!testResponse.ok || !testData.sent) throw new Error(testData.error || "테스트 리포트를 보내지 못했습니다.");
        onNotice("선택한 Slack 채널로 관리 리포트 테스트를 보냈습니다.");
      } else {
        onNotice(next.settings.enabled ? "워크스페이스 관리 봇을 저장했습니다." : "워크스페이스 관리 봇을 껐습니다.");
      }
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "관리 봇 설정을 처리하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  function toggleDay(day: number) {
    if (!draft || !canManage) return;
    setDraft({ ...draft, weekdays: draft.weekdays.includes(day) ? draft.weekdays.filter((entry) => entry !== day) : [...draft.weekdays, day].sort() });
  }

  function toggleSignal(signal: ManagementBotSignal) {
    if (!draft || !canManage) return;
    setDraft({ ...draft, signals: draft.signals.includes(signal) ? draft.signals.filter((entry) => entry !== signal) : [...draft.signals, signal] });
  }

  if (!active && !data) return null;
  if (loading) return <section className="workspace-management-pane embedded"><div className="workspace-management-loading"><LoaderCircle className="spin" size={16} />관리 봇 설정을 확인하고 있습니다.</div></section>;
  if (!data || !draft) return <section className="workspace-management-pane embedded"><div className="workspace-management-error" role="alert"><AlertTriangle size={17} /><div><b>관리 봇을 불러오지 못했습니다</b><p>{error || "잠시 후 다시 확인해 주세요."}</p></div></div></section>;
  const weekdayLabels = ["일", "월", "화", "수", "목", "금", "토"];

  return <section className="workspace-management-pane embedded">
    {!data.slackConnected && <div className="workspace-settings-note management-slack-note"><Hash size={16} /><div><b>Slack 연결 후 관리 봇을 설정할 수 있습니다</b><p>관리 봇은 워크스페이스 공용 채널로 리포트를 보냅니다. 위의 Slack 연결을 먼저 완료해 주세요.</p></div></div>}
    {!canManage && <div className="workspace-settings-note"><Eye size={16} /><p>관리 봇 설정은 읽기 전용입니다. Owner 또는 Admin이 발송 항목과 시간을 변경할 수 있습니다.</p></div>}

    <div className="management-bot-config compact">
        <div className="management-bot-toggle"><div><b>매일 워크스페이스 관리 리포트</b><p>선택한 요일과 시간에 최신 데이터를 다시 계산합니다.</p></div><label><input type="checkbox" aria-label="워크스페이스 관리 봇 사용" checked={draft.enabled} disabled={!canManage || !data.slackConnected} onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })} /><span aria-hidden="true" /><span className="sr-only">워크스페이스 관리 봇 사용</span></label></div>
        <div className="management-schedule-grid core"><label><span>발송 시간</span><input type="time" step="900" value={draft.reportTime} disabled={!canManage} onChange={(event) => setDraft({ ...draft, reportTime: event.target.value })} /></label><label className="management-channel-field"><span>Slack 발송 대상</span><select aria-label="Slack 발송 채널" value={draft.channelId} disabled={!canManage || !data.slackConnected} onChange={(event) => setDraft({ ...draft, channelId: event.target.value })}><option value="">채널 선택</option>{draft.channelId && !data.channels.some((channel) => channel.id === draft.channelId) && <option value={draft.channelId}>#{draft.channelName || draft.channelId}</option>}{data.channels.map((channel) => <option value={channel.id} key={channel.id}>#{channel.name}{channel.isPrivate ? " · 비공개" : ""}</option>)}</select></label></div>
        <div className="management-weekdays" aria-label="관리 리포트 발송 요일">{weekdayLabels.map((label, day) => <button type="button" className={draft.weekdays.includes(day) ? "active" : ""} aria-pressed={draft.weekdays.includes(day)} disabled={!canManage} onClick={() => toggleDay(day)} key={label}>{label}</button>)}</div>
        <details className="bot-advanced-settings"><summary>고급 설정 <ChevronDown size={14} /></summary><div><label className="management-timezone-field"><span>시간대</span><select value={draft.timezone} disabled={!canManage} onChange={(event) => setDraft({ ...draft, timezone: event.target.value })}><option>Asia/Seoul</option><option>America/Los_Angeles</option><option>America/New_York</option><option>Europe/London</option><option>Asia/Tokyo</option></select></label><fieldset className="management-signal-picker"><legend>정리할 정보와 Urgency</legend>{(Object.keys(managementBotSignalMeta) as ManagementBotSignal[]).map((signal) => { const meta = managementBotSignalMeta[signal]; return <label key={signal} className={meta.tone}><input type="checkbox" checked={draft.signals.includes(signal)} disabled={!canManage} onChange={() => toggleSignal(signal)} /><span><b>{meta.label}</b><small>{meta.detail}</small></span><span className="sr-only">관리 리포트 정리 항목 선택</span></label>; })}</fieldset>{(draft.lastSentAt || draft.lastError) && <p className={`management-bot-last ${draft.lastError ? "error" : ""}`}>{draft.lastError ? `최근 전송 실패 · ${draft.lastError}` : `최근 전송 · ${formatDateTime(draft.lastSentAt!)}`}</p>}</div></details>
        {error && <p className="management-bot-error" role="alert">{error}</p>}
        {canManage && <div className="management-bot-actions"><button onClick={() => void save(false)} disabled={saving || draft.signals.length === 0 || draft.weekdays.length === 0}>{saving ? "저장 중" : "설정 저장"}</button><button onClick={() => void save(true)} disabled={saving || !draft.channelId || draft.signals.length === 0}>테스트 보내기</button></div>}
    </div>
  </section>;
}

type WorkspaceBotId = "daily" | "management" | "automation";

function BotAccordionRow({ id, icon: Icon, title, description, status, summary, expanded, onToggle, children }: { id: WorkspaceBotId; icon: LucideIcon; title: string; description: string; status: string; summary: string; expanded: boolean; onToggle: (id: WorkspaceBotId) => void; children: ReactNode }) {
  const panelId = `workspace-bot-panel-${id}`;
  return <section className={`bot-accordion-row ${expanded ? "open" : ""}`}>
    <button type="button" className="bot-accordion-trigger" aria-expanded={expanded} aria-controls={panelId} onClick={() => onToggle(id)}><span className="bot-accordion-icon"><Icon size={17} /></span><span className="bot-accordion-copy"><b>{title}</b><small>{description}</small><em>{summary}</em></span><span className={`bot-accordion-status ${status === "사용 중" || status === "설정 완료" ? "active" : ""}`}>{status}</span><ChevronDown className="bot-accordion-chevron" size={16} /></button>
    <div id={panelId} className="bot-accordion-panel" hidden={!expanded}>{children}</div>
  </section>;
}

function WorkspaceSlackIntegration({ slack, slackOAuthIssue, loading, loadError, workspaceName, canManageSlack, onSlackChange, onRefresh, onNotice }: { slack: SlackConnectionStatus | null; slackOAuthIssue: SlackOAuthIssue | null; loading: boolean; loadError: boolean; workspaceName: string; canManageSlack: boolean; onSlackChange: (status: SlackConnectionStatus | null) => void; onRefresh: () => void; onNotice: (message: string) => void }) {
  const [disconnectingSlack, setDisconnectingSlack] = useState(false);
  const [botRefreshAttempt, setBotRefreshAttempt] = useState(0);
  const [openBot, setOpenBot] = useState<WorkspaceBotId | null>(() => {
    if (typeof window === "undefined") return null;
    const value = new URLSearchParams(window.location.search).get("bot");
    return value === "daily" || value === "management" || value === "automation" ? value : null;
  });
  const [botSummaries, setBotSummaries] = useState<Record<WorkspaceBotId, { status: string; summary: string }>>({
    daily: { status: "설정 확인", summary: "시간과 대상 멤버를 설정합니다" },
    management: { status: "설정 확인", summary: "시간과 발송 채널을 설정합니다" },
    automation: { status: "설정 확인", summary: "추천 규칙 또는 직접 규칙을 만듭니다" },
  });
  const slackState = loadError && !slack ? "error" : slack?.state ?? "service_unavailable";
  const slackConnected = Boolean(slack?.connected && slackState !== "service_unavailable" && slackState !== "error");
  const connectedSlackName = slack?.connectedTeam?.name || slack?.teamName || "Slack";
  const slackAction = slackState === "connected" ? "연결 완료" : slackState === "setup_required" ? "초기 설정 필요" : slackState === "reauthorization_required" ? "권한 업데이트 필요" : slackState === "workspace_disconnected" ? "연결 필요" : "잠시 사용 불가";
  const displayedBotSummaries = slackConnected ? botSummaries : {
    daily: { status: "연결 필요", summary: "Slack 연결 후 설정할 수 있습니다" },
    management: { status: "연결 필요", summary: "Slack 연결 후 설정할 수 있습니다" },
    automation: { status: "연결 필요", summary: "Slack 연결 후 설정할 수 있습니다" },
  };

  useEffect(() => {
    function syncBotFromHistory() {
      const value = new URLSearchParams(window.location.search).get("bot");
      setOpenBot(value === "daily" || value === "management" || value === "automation" ? value : null);
    }
    window.addEventListener("popstate", syncBotFromHistory);
    return () => window.removeEventListener("popstate", syncBotFromHistory);
  }, []);

  const updateDailySummary = useCallback((status: string, summary: string) => setBotSummaries((current) => ({ ...current, daily: { status, summary } })), []);
  const updateManagementSummary = useCallback((status: string, summary: string) => setBotSummaries((current) => ({ ...current, management: { status, summary } })), []);
  const updateAutomationSummary = useCallback((status: string, summary: string) => setBotSummaries((current) => ({ ...current, automation: { status, summary } })), []);

  function toggleBot(id: WorkspaceBotId) {
    const next = openBot === id ? null : id;
    setOpenBot(next);
    const url = new URL(window.location.href);
    if (next) url.searchParams.set("bot", next); else url.searchParams.delete("bot");
    window.history.pushState(window.history.state, "", url);
  }

  function connectSlack() {
    if (!canManageSlack || !slack || !["workspace_disconnected", "reauthorization_required"].includes(slack.state)) return;
    window.location.href = `/api/slack/auth?returnTo=${encodeURIComponent("/?settings=workspace&tab=integrations")}`;
  }

  function refreshSlackStatus() {
    setBotRefreshAttempt((attempt) => attempt + 1);
    onRefresh();
  }

  async function disconnectSlack() {
    setDisconnectingSlack(true);
    const response = await fetch("/api/slack/disconnect", { method: "POST" });
    setDisconnectingSlack(false);
    if (!response.ok) { onNotice("Slack 연결을 해제하지 못했습니다."); return; }
    onSlackChange(slack ? { ...slack, connected: false, state: "workspace_disconnected", statusMessage: "Owner 또는 Admin이 이 OKRPTR 워크스페이스에 사용할 Slack을 선택하고 승인할 수 있습니다.", missingScopes: [], connectedTeam: null, teamName: null, teamId: null, botUserId: null, connectedAt: null, updatedAt: null } : null);
    onNotice("Slack 연결을 해제했습니다. 자동화 규칙은 보관됩니다.");
  }

  return <section className="workspace-integration-section">
    <header className="workspace-settings-section-header workspace-bot-header">
      <div><h3>Slack과 봇</h3><p>연결 상태와 워크스페이스 알림을 관리합니다.</p></div>
      <button type="button" onClick={refreshSlackStatus} disabled={loading}><RefreshCw className={loading ? "spin" : ""} size={14} />{loading ? "확인 중" : "새로고침"}</button>
    </header>
    <div className="workspace-integration-pane">
      <section className="integration-service-card slack-service-card" aria-labelledby="workspace-slack-heading">
      <header><span className="integration-service-icon slack"><Hash size={19} /></span><div><h3 id="workspace-slack-heading">Slack</h3><p>{slackConnected ? connectedSlackName : `${workspaceName}에 사용할 Slack 워크스페이스`}</p></div><strong className={`integration-status-badge ${slackState}`}>{loading && !slack ? "확인 중" : slackAction}</strong></header>
      {slackOAuthIssue && <div className={`integration-state-message ${slackOAuthIssueCopy[slackOAuthIssue].tone}`} role="alert"><AlertTriangle size={17} /><div><b>{slackOAuthIssueCopy[slackOAuthIssue].title}</b><p>{slackOAuthIssueCopy[slackOAuthIssue].detail}</p></div></div>}
      {!slackConnected && <section className="slack-one-button-connect" aria-label="Slack 팀 연결">
        <div><b>{slackState === "service_unavailable" || slackState === "error" ? "Slack 연결을 준비하고 있습니다" : "팀 Slack을 연결하세요"}</b><p>{slackState === "error" ? "연결 상태를 불러오지 못했습니다." : slack?.statusMessage || "Slack 사용자와 채널은 승인 후 자동으로 불러옵니다."}</p></div>
        {loading && !slack ? <span className="integration-inline-loading"><LoaderCircle className="spin" size={14} />확인 중</span>
          : slackState === "error" || slackState === "service_unavailable" ? <span className="integration-role-note">잠시 후 사용 가능</span>
          : slackState === "workspace_disconnected" && canManageSlack ? <button className="slack-primary-action" onClick={connectSlack}><Hash size={15} />Slack 연결</button>
          : slackState === "workspace_disconnected" ? <span className="integration-role-note">Owner 또는 Admin만 연결할 수 있습니다.</span>
          : slackState === "reauthorization_required" && canManageSlack ? <button className="slack-primary-action" onClick={connectSlack}>권한 업데이트</button>
          : <span className="integration-role-note">관리자가 권한을 업데이트해야 합니다.</span>}
      </section>}
      {slackState === "reauthorization_required" && <div className="integration-state-message warning"><AlertTriangle size={17} /><div><b>새 봇 기능 권한이 필요합니다</b><p>권한 업데이트 전까지 일부 DM·채널 기능이 작동하지 않을 수 있습니다.</p></div></div>}
      {slackConnected && canManageSlack && <details className="slack-advanced-settings"><summary>Slack 연결 관리 <ChevronDown size={14} /></summary><div><button className="secondary-danger" onClick={() => void disconnectSlack()} disabled={disconnectingSlack}>{disconnectingSlack ? "연결 해제 중" : "Slack 연결 해제"}</button></div></details>}
      </section>
      <div className="bot-accordion" aria-label="워크스페이스 봇 목록">
        <BotAccordionRow id="daily" icon={Bot} title="데일리 봇" description="멤버별 데일리 DM과 공유 채널" status={displayedBotSummaries.daily.status} summary={displayedBotSummaries.daily.summary} expanded={openBot === "daily"} onToggle={toggleBot}><SlackDailySettingsPanel key={`daily-${botRefreshAttempt}`} active={openBot === "daily"} connected={slackConnected} canManage={canManageSlack} teamName={connectedSlackName} onSummary={updateDailySummary} onNotice={onNotice} /></BotAccordionRow>
        <BotAccordionRow id="management" icon={Activity} title="관리 봇" description="누락 정보와 긴급 업무 리포트" status={displayedBotSummaries.management.status} summary={displayedBotSummaries.management.summary} expanded={openBot === "management"} onToggle={toggleBot}><WorkspaceManagementBot key={`management-${botRefreshAttempt}`} active={openBot === "management"} canManage={canManageSlack} onSummary={updateManagementSummary} onNotice={onNotice} /></BotAccordionRow>
        <BotAccordionRow id="automation" icon={Zap} title="업무 자동화" description="Task 생성과 상태 변경 알림" status={displayedBotSummaries.automation.status} summary={displayedBotSummaries.automation.summary} expanded={openBot === "automation"} onToggle={toggleBot}><SlackAutomationManager key={`automation-${botRefreshAttempt}`} active={openBot === "automation"} connected={slackConnected} canManage={canManageSlack} workspaceName={workspaceName} onSummary={updateAutomationSummary} onNotice={onNotice} /></BotAccordionRow>
      </div>
    </div>
  </section>;
}

type SlackDailyAdminData = {
  connected: boolean; teamName: string | null; needsReauthorization: boolean; setupComplete: boolean;
  settings: { enabled: boolean; weekdays: number[]; reminderTime: string; timezone: string; installStatus: string; onboardingCompletedAt: string | null; lastSyncedAt: string | null; lastError: string };
  channels: Array<{ id: string; name: string; isPrivate: boolean; isMember: boolean }>;
  members: Array<{ memberId: string; displayName: string; email: string; linked: boolean; slackDisplayName: string | null; preference: { enabled: boolean; reminderTime: string | null; timezone: string | null }; reminder: { status: string; postAt: number; error: string } | null }>;
  failedPublications: Array<{ id: string; channelId: string; memberName: string; date: string; error: string; attempts: number }>;
};
type SlackDailyPreferenceData = { linked: boolean; enabled: boolean; reminderTime: string; timezone: string; usesWorkspaceTime: boolean; usesWorkspaceTimezone: boolean };

type SlackOnboardingResult = {
  setupComplete: boolean;
  admin: SlackDailyAdminData;
  tests: {
    dm: { status: "sent" | "skipped" | "failed"; memberId: string | null; error?: string };
    channels: Array<{ channelId: string; channelName: string; status: "sent" | "failed"; error?: string }>;
  };
  schedules: Array<{ memberId: string; status: "scheduled" | "failed"; postAt: number | null; error?: string }>;
};

function SlackDailySettingsPanel({ active, connected, canManage, teamName, onSummary, onNotice }: { active: boolean; connected: boolean; canManage: boolean; teamName: string; onSummary: (status: string, summary: string) => void; onNotice: (message: string) => void }) {
  const [admin, setAdmin] = useState<SlackDailyAdminData | null>(null);
  const [channels, setChannels] = useState<Array<{ id: string; name: string; isPrivate: boolean; isMember: boolean }>>([]);
  const [channelsLoading, setChannelsLoading] = useState(false);
  const [channelLoadError, setChannelLoadError] = useState(false);
  const [channelLoadAttempt, setChannelLoadAttempt] = useState(0);
  const [editing, setEditing] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sendingMemberId, setSendingMemberId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [result, setResult] = useState<SlackOnboardingResult | null>(null);
  const loadedRef = useRef(false);
  const channelsLoadedRef = useRef(false);

  useEffect(() => {
    if (!active || !connected || !canManage || loadedRef.current) return;
    loadedRef.current = true;
    let mounted = true;
    const controller = new AbortController();
    setLoadError(false);
    void fetch("/api/slack/daily/settings", { cache: "no-store", signal: controller.signal }).then(async (response) => {
      const data = await response.json() as SlackDailyAdminData & { error?: string };
      if (!response.ok) throw new Error(data.error || "Slack 설정을 불러오지 못했습니다.");
      return data;
    }).then((nextAdmin) => {
      if (!mounted) return;
      setAdmin(nextAdmin);
      setChannels(nextAdmin.channels);
      const targetCount = nextAdmin.members.filter((member) => member.linked && member.preference.enabled).length;
      const days = nextAdmin.settings.weekdays.join(",") === "1,2,3,4,5" ? "평일" : nextAdmin.settings.weekdays.map((day) => ["일", "월", "화", "수", "목", "금", "토"][day]).join("·");
      onSummary(nextAdmin.setupComplete ? "설정 완료" : "설정 필요", `${days} ${nextAdmin.settings.reminderTime} · ${targetCount}명 · ${nextAdmin.channels.length ? nextAdmin.channels.map((channel) => `#${channel.name}`).join(", ") : "DM 전용"}`);
      setLoadError(false);
    }).catch((error: unknown) => {
      if (error instanceof DOMException && error.name === "AbortError") return;
      if (mounted) { setLoadError(true); onSummary("불러오기 실패", "설정을 다시 확인해 주세요"); }
    });
    return () => {
      mounted = false;
      controller.abort();
      loadedRef.current = false;
    };
  }, [active, connected, canManage, loadAttempt, onSummary]);

  const shouldLoadChannels = Boolean(admin && (!admin.setupComplete || editing));
  useEffect(() => {
    if (!active || !connected || !canManage || !shouldLoadChannels || channelsLoadedRef.current) return;
    channelsLoadedRef.current = true;
    const controller = new AbortController();
    setChannelsLoading(true);
    setChannelLoadError(false);
    void fetch("/api/slack/channels?joinable=1", { cache: "no-store", signal: controller.signal }).then(async (response) => {
      const data = await response.json() as { channels?: Array<{ id: string; name: string; isPrivate: boolean; isMember: boolean }>; error?: string };
      if (!response.ok) throw new Error(data.error || "Slack 채널을 불러오지 못했습니다.");
      return data.channels ?? [];
    }).then((nextChannels) => setChannels(nextChannels)).catch((error: unknown) => {
      if (error instanceof DOMException && error.name === "AbortError") return;
      channelsLoadedRef.current = false;
      setChannelLoadError(true);
    }).finally(() => { if (!controller.signal.aborted) setChannelsLoading(false); });
    return () => {
      controller.abort();
      channelsLoadedRef.current = false;
    };
  }, [active, shouldLoadChannels, canManage, channelLoadAttempt, connected]);


  useEffect(() => {
    if (connected || !active) return;
    onSummary("연결 필요", "Slack 연결 후 설정할 수 있습니다");
  }, [active, connected, onSummary]);

  async function completeSetup() {
    if (!admin) return;
    const memberIds = admin.members.filter((member) => member.linked && member.preference.enabled).map((member) => member.memberId);
    if (!memberIds.length) { onNotice("알림을 받을 멤버를 한 명 이상 선택해 주세요."); return; }
    setBusy(true);
    try {
      const response = await fetch("/api/slack/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          weekdays: admin.settings.weekdays,
          reminderTime: admin.settings.reminderTime,
          timezone: admin.settings.timezone,
          memberIds,
          channelIds: admin.channels.map((channel) => channel.id),
        }),
      });
      const data = await response.json() as SlackOnboardingResult & { error?: string };
      if (!response.ok || !data.admin) throw new Error(data.error || "데일리 설정을 저장하지 못했습니다.");
      setAdmin(data.admin);
      setResult(data);
      setEditing(false);
      const targetCount = data.admin.members.filter((member) => member.linked && member.preference.enabled).length;
      const days = data.admin.settings.weekdays.join(",") === "1,2,3,4,5" ? "평일" : data.admin.settings.weekdays.map((day) => ["일", "월", "화", "수", "목", "금", "토"][day]).join("·");
      onSummary("설정 완료", `${days} ${data.admin.settings.reminderTime} · ${targetCount}명 · ${data.admin.channels.length ? data.admin.channels.map((channel) => `#${channel.name}`).join(", ") : "DM 전용"}`);
      const failed = data.schedules.some((entry) => entry.status === "failed") || data.tests.dm.status === "failed" || data.tests.channels.some((entry) => entry.status === "failed");
      onNotice(failed ? "설정은 저장했습니다. 실패한 테스트만 고급 설정에서 다시 시도해 주세요." : "Slack 연결과 데일리 테스트를 완료했습니다.");
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "데일리 설정을 저장하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function retrySetupResult(kind: "dm" | "channel" | "schedule", id: string | null) {
    if (!result) return;
    setBusy(true);
    try {
      const payload = kind === "dm" ? { action: "test_dm", memberId: id }
        : kind === "channel" ? { action: "test_channel", channelId: id }
          : { action: "resync" };
      const response = await fetch("/api/slack/daily/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await response.json() as SlackDailyAdminData & { error?: string };
      if (!response.ok) throw new Error(data.error || "Slack 테스트를 다시 실행하지 못했습니다.");
      if (kind === "dm") setResult({ ...result, tests: { ...result.tests, dm: { ...result.tests.dm, status: "sent", error: undefined } } });
      if (kind === "channel") setResult({ ...result, tests: { ...result.tests, channels: result.tests.channels.map((entry) => entry.channelId === id ? { ...entry, status: "sent", error: undefined } : entry) } });
      if (kind === "schedule" && data.settings) {
        setAdmin(data);
        setResult({ ...result, schedules: result.schedules.map((entry) => data.members.find((member) => member.memberId === entry.memberId)?.reminder ? { ...entry, status: "scheduled", error: undefined } : entry) });
      }
      onNotice("실패한 Slack 항목을 다시 확인했습니다.");
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "Slack 테스트를 다시 실행하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function sendDailyNow(member: SlackDailyAdminData["members"][number]) {
    setSendingMemberId(member.memberId);
    try {
      const response = await fetch("/api/slack/daily/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send_now", memberId: member.memberId }),
      });
      const data = await response.json() as { sent?: boolean; error?: string };
      if (!response.ok || !data.sent) throw new Error(data.error || "데일리 봇 DM을 보내지 못했습니다.");
      onNotice(`${member.displayName}님에게 데일리 봇 DM을 보냈습니다.`);
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "데일리 봇 DM을 보내지 못했습니다.");
    } finally {
      setSendingMemberId(null);
    }
  }

  if (!active && !admin) return null;
  if (!connected) return <div className="slack-daily-locked"><LockKeyhole size={18} /><div><b>Slack 연결 후 데일리 봇을 설정할 수 있습니다</b><p>기존 설정은 그대로 유지되며 Slack 연결을 완료하면 다시 사용할 수 있습니다.</p></div></div>;
  if (!canManage) return <section className="slack-connected-summary"><div><CheckCircle2 size={18} /><p><b>OKRPTR 연결 완료</b><span>연결된 Slack 워크스페이스: {teamName}</span><span>관리자가 설정한 시간에 내 Slack DM으로 데일리를 받을 수 있습니다.</span></p></div></section>;
  if (loadError) return <section className="integration-state-message error"><AlertTriangle size={17} /><div><b>Slack 설정을 불러오지 못했습니다</b><p>연결은 유지됩니다. 잠시 후 다시 확인해 주세요.</p></div><button onClick={() => { loadedRef.current = false; setLoadError(false); setLoadAttempt((attempt) => attempt + 1); }}>다시 불러오기</button></section>;
  if (!admin) return <div className="slack-daily-loading"><LoaderCircle className="spin" size={15} />데일리 설정 확인 중</div>;

  const showSetup = !admin.setupComplete || editing;
  const targetMembers = admin.members.filter((member) => member.linked && member.preference.enabled);
  const linkedMembers = admin.members.filter((member) => member.linked);
  const nextReminder = targetMembers.flatMap((member) => member.reminder?.postAt ? [member.reminder.postAt] : []).sort((a, b) => a - b)[0];
  const weekdayLabels = ["일", "월", "화", "수", "목", "금", "토"];

  return <div className="slack-one-button-flow">
    {showSetup ? <section className="slack-onboarding-card" aria-labelledby="slack-onboarding-title">
      <header><div><h4 id="slack-onboarding-title">데일리 설정</h4><p>발송 시간, 멤버와 공유 채널을 정합니다.</p></div>{admin.setupComplete && <button type="button" onClick={() => setEditing(false)}>취소</button>}</header>
      <div className="slack-onboarding-grid single">
        <label><span>발송 시간</span><input aria-label="Slack 데일리 발송 시간" type="time" value={admin.settings.reminderTime} onChange={(event) => setAdmin({ ...admin, settings: { ...admin.settings, reminderTime: event.target.value } })} /></label>
      </div>
      <fieldset className="slack-onboarding-weekdays"><legend>발송 요일</legend><div>{weekdayLabels.map((label, day) => <label key={label}><input type="checkbox" checked={admin.settings.weekdays.includes(day)} onChange={(event) => setAdmin({ ...admin, settings: { ...admin.settings, weekdays: event.target.checked ? [...admin.settings.weekdays, day].sort() : admin.settings.weekdays.filter((entry) => entry !== day) } })} /><span>{label}</span></label>)}</div></fieldset>
      <fieldset className="slack-onboarding-members"><legend>알림 받을 멤버</legend><div className="bot-target-shortcut"><p>이메일이 같은 Slack 계정을 연결합니다.</p><button type="button" onClick={() => setAdmin({ ...admin, members: admin.members.map((member) => member.linked ? { ...member, preference: { ...member.preference, enabled: true } } : member) })}>연결 멤버 전체 선택</button></div><div>{admin.members.map((member) => <label key={member.memberId} className={member.linked ? "" : "disabled"}><input aria-label={`${member.displayName} Slack 알림 대상`} type="checkbox" disabled={!member.linked} checked={member.linked && member.preference.enabled} onChange={(event) => setAdmin({ ...admin, members: admin.members.map((entry) => entry.memberId === member.memberId ? { ...entry, preference: { ...entry.preference, enabled: event.target.checked } } : entry) })} /><span><b>{member.displayName}</b><small>{member.linked ? "Slack 연결됨" : "Slack 계정 미연결"}</small></span></label>)}</div></fieldset>
      <fieldset className="slack-onboarding-channels"><legend>공유 채널</legend>{channelsLoading && <div className="integration-inline-loading"><LoaderCircle className="spin" size={13} />채널 확인 중</div>}{channelLoadError && <div className="slack-channel-load-error"><span>채널을 불러오지 못했습니다.</span><button type="button" onClick={() => { channelsLoadedRef.current = false; setChannelLoadError(false); setChannelLoadAttempt((attempt) => attempt + 1); }}>다시 불러오기</button></div>}<label className="slack-no-channel"><input aria-label="채널 공유 안 함" type="radio" name="slack-channel-sharing" checked={admin.channels.length === 0} onChange={() => setAdmin({ ...admin, channels: [] })} /><span><b>공유 안 함</b><small>개인 DM만 발송</small></span></label>{channels.map((channel) => <label key={channel.id}><input aria-label={`${channel.name} Slack 공유 채널`} type="checkbox" checked={admin.channels.some((entry) => entry.id === channel.id)} onChange={(event) => setAdmin({ ...admin, channels: event.target.checked ? [...admin.channels, channel] : admin.channels.filter((entry) => entry.id !== channel.id) })} /><span><b>#{channel.name}</b><small>{channel.isPrivate ? "비공개 · 봇 참여 중" : channel.isMember ? "공개 · 봇 참여 중" : "공개 · 선택 시 참여"}</small></span></label>)}</fieldset>
      <details className="bot-advanced-settings"><summary>고급 설정 <ChevronDown size={14} /></summary><div><label className="daily-timezone-field"><span>시간대</span><select aria-label="Slack 데일리 시간대" value={admin.settings.timezone} onChange={(event) => setAdmin({ ...admin, settings: { ...admin.settings, timezone: event.target.value } })}><option>Asia/Seoul</option><option>America/Los_Angeles</option><option>America/New_York</option><option>Europe/London</option><option>Asia/Tokyo</option></select></label></div></details><footer><button className="slack-primary-action" type="button" disabled={busy || admin.settings.weekdays.length === 0} onClick={() => void completeSetup()}>{busy ? <LoaderCircle className="spin" size={14} /> : <CheckCircle2 size={14} />}{busy ? "설정·테스트 중" : "설정 완료"}</button></footer>
    </section> : <section className="slack-connected-summary">
      <div className="slack-connected-title"><CheckCircle2 size={19} /><p><b>데일리 봇 사용 중</b><span>{teamName}</span></p><button type="button" onClick={() => setEditing(true)}>설정</button></div>
      <dl><div><dt>대상</dt><dd>{targetMembers.length}명</dd></div><div><dt>다음 발송</dt><dd>{nextReminder ? new Date(nextReminder * 1000).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "예약 확인 필요"}</dd></div><div><dt>공유 채널</dt><dd>{admin.channels.length ? admin.channels.map((channel) => `#${channel.name}`).join(", ") : "공유 안 함"}</dd></div></dl>
      <section className="slack-manual-send" aria-labelledby="slack-manual-send-title"><header><b id="slack-manual-send-title">즉시 발송</b><small>멤버에게 데일리 DM을 바로 보냅니다.</small></header>{linkedMembers.length ? <div className="slack-member-links">{linkedMembers.map((member) => <div key={member.memberId}><span className="linked" /><p><b>{member.displayName}</b><small>{member.preference.enabled ? "예약 대상" : "수동 발송만"}</small></p><button type="button" disabled={busy || sendingMemberId !== null} onClick={() => void sendDailyNow(member)}>{sendingMemberId === member.memberId ? <><LoaderCircle className="spin" size={13} />발송 중</> : "지금 보내기"}</button></div>)}</div> : <p className="slack-manual-send-empty">Slack에 연결된 멤버가 없습니다.</p>}</section>
      {result && <div className="slack-test-results" role="status"><p className={result.tests.dm.status}><span>{result.tests.dm.status === "sent" ? "설치자 테스트 DM 성공" : result.tests.dm.status === "skipped" ? "설치자 DM 테스트 생략" : `테스트 DM 실패 · ${result.tests.dm.error || "다시 시도 필요"}`}</span>{result.tests.dm.status === "failed" && <button disabled={busy} onClick={() => void retrySetupResult("dm", result.tests.dm.memberId)}>재시도</button>}</p>{result.tests.channels.map((channel) => <p key={channel.channelId} className={channel.status}><span>{channel.status === "sent" ? `#${channel.channelName} 테스트 성공` : `#${channel.channelName} 실패 · ${channel.error || "다시 시도 필요"}`}</span>{channel.status === "failed" && <button disabled={busy} onClick={() => void retrySetupResult("channel", channel.channelId)}>재시도</button>}</p>)}{result.schedules.filter((entry) => entry.status === "failed").map((entry) => <p key={entry.memberId} className="failed"><span>예약 실패 · {admin.members.find((member) => member.memberId === entry.memberId)?.displayName || entry.memberId}</span><button disabled={busy} onClick={() => void retrySetupResult("schedule", null)}>재시도</button></p>)}</div>}
    </section>}
    {admin.setupComplete && <details className="slack-advanced-settings" onToggle={(event) => setAdvancedOpen(event.currentTarget.open)}><summary>멤버 연결·실패 기록 <ChevronDown size={14} /></summary>{advancedOpen && <SlackDailyAdvancedSettings connected canManage mode="workspace" onNotice={onNotice} />}</details>}
  </div>;
}

function SlackDailyAdvancedSettings({ connected, canManage, mode = "workspace", onNotice }: { connected: boolean; canManage: boolean; mode?: "personal" | "workspace"; onNotice: (message: string) => void }) {
  const [preference, setPreference] = useState<SlackDailyPreferenceData | null>(null);
  const [admin, setAdmin] = useState<SlackDailyAdminData | null>(null);
  const [availableChannels, setAvailableChannels] = useState<Array<{ id: string; name: string; isPrivate: boolean; isMember: boolean }>>([]);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  useEffect(() => {
    if (!connected) return;
    let active = true;
    const preferenceRequest = mode === "personal" ? fetch("/api/slack/daily/preferences").then(async (response) => {
      if (!response.ok) throw new Error("preference load failed");
      return response.json() as Promise<SlackDailyPreferenceData>;
    }) : Promise.resolve(null);
    const adminRequest = mode === "workspace" && canManage ? Promise.all([
      fetch("/api/slack/daily/settings").then(async (response) => { if (!response.ok) throw new Error("settings load failed"); return response.json() as Promise<SlackDailyAdminData>; }),
      fetch("/api/slack/channels?joinable=1").then(async (response) => { if (!response.ok) throw new Error("channels load failed"); return response.json() as Promise<{ channels?: Array<{ id: string; name: string; isPrivate: boolean; isMember: boolean }> }>; }),
    ]) : Promise.resolve(null);
    void Promise.all([preferenceRequest, adminRequest]).then(([nextPreference, adminResult]) => {
      if (!active) return;
      setLoadError(false);
      if (nextPreference) setPreference(nextPreference);
      if (adminResult) { setAdmin(adminResult[0]); setAvailableChannels(adminResult[1].channels ?? []); }
    }).catch(() => { if (active) setLoadError(true); });
    return () => { active = false; };
  }, [connected, canManage, loadAttempt, mode]);

  async function savePreference(patch: Partial<Pick<SlackDailyPreferenceData, "enabled" | "reminderTime" | "timezone">>) {
    setBusy(true);
    try {
      const response = await fetch("/api/slack/daily/preferences", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
      const data = await response.json() as SlackDailyPreferenceData & { error?: string }; if (!response.ok) throw new Error(data.error || "개인 알림을 저장하지 못했습니다.");
      setPreference(data); onNotice("개인 Slack 데일리 알림을 저장했습니다.");
    } catch (error) { onNotice(error instanceof Error ? error.message : "개인 알림을 저장하지 못했습니다."); } finally { setBusy(false); }
  }
  async function patchAdmin(payload: Record<string, unknown>, notice: string) {
    setBusy(true);
    try {
      const response = await fetch("/api/slack/daily/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await response.json() as SlackDailyAdminData & { error?: string }; if (!response.ok) throw new Error(data.error || "Slack 데일리 설정을 저장하지 못했습니다.");
      if (data.settings) setAdmin(data); onNotice(notice);
    } catch (error) { onNotice(error instanceof Error ? error.message : "Slack 데일리 설정을 저장하지 못했습니다."); } finally { setBusy(false); }
  }
  if (!connected) return null;
  if (loadError) return <section className="integration-state-message error"><AlertTriangle size={17} /><div><b>Slack 데일리 설정을 불러오지 못했습니다</b><p>연결은 유지됩니다. 잠시 후 다시 불러와 주세요.</p></div><button onClick={() => { setLoadError(false); setPreference(null); setAdmin(null); setLoadAttempt((attempt) => attempt + 1); }}>다시 불러오기</button></section>;
  return <div className="slack-setup-flow">
    {mode === "workspace" && <section className="integration-step" aria-labelledby="slack-step-members">
      <span className="integration-step-number">2</span><div className="integration-step-copy"><h4 id="slack-step-members">사용자 이메일 연결 상태</h4><p>OKRPTR와 Slack 이메일이 같으면 자동으로 연결됩니다.</p></div>
      <div className="integration-step-body">
        {canManage && !admin ? <div className="slack-daily-loading"><LoaderCircle className="spin" size={14} />사용자 연결 상태 확인 중</div> : canManage && admin ? <><div className="integration-step-summary"><b>{admin.members.filter((member) => member.linked).length}/{admin.members.length}명 연결</b><span>미연결 사용자는 Slack의 `/okrptr daily`에서 일회용 연결 링크를 받을 수 있습니다.</span></div><div className="slack-member-links">{admin.members.map((member) => <div key={member.memberId}><span className={member.linked ? "linked" : "unlinked"} /><p><b>{member.displayName}</b><small>{member.linked ? "Slack 연결됨" : "Slack 미연결"}{member.reminder ? ` · 알림 ${member.reminder.status}` : ""}</small></p></div>)}</div></> : <div className="integration-connected-note"><CheckCircle2 size={15} />사용자별 Slack 연결 상태는 Owner 또는 Admin이 확인합니다.</div>}
      </div>
    </section>}

    {mode === "personal" && <><section className="integration-step" aria-labelledby="slack-personal-link">
      <span className="integration-step-number">1</span><div className="integration-step-copy"><h4 id="slack-personal-link">내 Slack 계정</h4><p>워크스페이스 멤버와 Slack 사용자를 연결합니다.</p></div>
      <div className="integration-step-body">{preference ? <div className={`integration-personal-link ${preference.linked ? "linked" : "unlinked"}`}><span>{preference.linked ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}</span><p><b>{preference.linked ? "내 Slack 계정이 연결되었습니다" : "내 Slack 계정 연결이 필요합니다"}</b><small>{preference.linked ? "개인 DM 알림을 설정할 수 있습니다." : "Slack에서 `/okrptr daily`를 입력해 일회용 연결 링크를 받아 주세요."}</small></p></div> : <div className="slack-daily-loading"><LoaderCircle className="spin" size={14} />개인 연결 상태 확인 중</div>}</div>
    </section><section className="integration-step" aria-labelledby="slack-step-preference">
      <span className="integration-step-number">3</span><div className="integration-step-copy"><h4 id="slack-step-preference">개인 데일리 알림 시간</h4><p>평일 아침에 오늘 할 Task를 고르는 DM을 받습니다.</p></div>
      <div className="integration-step-body">{preference ? <div className="slack-personal-preference"><label><input type="checkbox" checked={preference.enabled} disabled={busy || !preference.linked} onChange={(event) => void savePreference({ enabled: event.target.checked })} /><span>내 Slack DM 알림 사용</span></label><label><span>시간</span><input aria-label="개인 데일리 알림 시간" type="time" value={preference.reminderTime} disabled={busy || !preference.linked} onChange={(event) => void savePreference({ reminderTime: event.target.value })} /></label><label><span>시간대</span><select aria-label="개인 데일리 알림 시간대" value={preference.timezone} disabled={busy || !preference.linked} onChange={(event) => void savePreference({ timezone: event.target.value })}><option>Asia/Seoul</option><option>America/Los_Angeles</option><option>America/New_York</option><option>Europe/London</option><option>Asia/Tokyo</option></select></label>{!preference.linked && <p>Slack 사용자 연결을 완료하면 알림 설정이 활성화됩니다.</p>}</div> : <div className="slack-daily-loading"><LoaderCircle className="spin" size={14} />개인 알림 설정 확인 중</div>}</div>
    </section></>}

    {mode === "workspace" && <><section className="integration-step" aria-labelledby="slack-step-channel">
      <span className="integration-step-number">4</span><div className="integration-step-copy"><h4 id="slack-step-channel">팀 공유 채널</h4><p>확정된 데일리와 스킵 사유를 공유할 채널과 기본 시간을 정합니다.</p></div>
      <div className="integration-step-body">{canManage && admin ? <div className="slack-daily-admin">
        <div className="slack-admin-grid"><label><span>기본 시간</span><input aria-label="Slack 데일리 기본 시간" type="time" value={admin.settings.reminderTime} onChange={(event) => setAdmin({ ...admin, settings: { ...admin.settings, reminderTime: event.target.value } })} /></label><label><span>기본 시간대</span><select aria-label="Slack 데일리 기본 시간대" value={admin.settings.timezone} onChange={(event) => setAdmin({ ...admin, settings: { ...admin.settings, timezone: event.target.value } })}><option>Asia/Seoul</option><option>America/Los_Angeles</option><option>America/New_York</option><option>Europe/London</option><option>Asia/Tokyo</option></select></label></div>
        <div className="slack-weekdays" aria-label="Slack 데일리 기본 요일">{["일", "월", "화", "수", "목", "금", "토"].map((label, day) => <label key={label}><input type="checkbox" checked={admin.settings.weekdays.includes(day)} onChange={(event) => setAdmin({ ...admin, settings: { ...admin.settings, weekdays: event.target.checked ? [...admin.settings.weekdays, day].sort() : admin.settings.weekdays.filter((entry) => entry !== day) } })} />{label}</label>)}</div>
        <fieldset><legend>개인 카드 공유 채널</legend>{availableChannels.length ? availableChannels.map((channel) => <label key={channel.id}><input type="checkbox" checked={admin.channels.some((entry) => entry.id === channel.id)} onChange={(event) => setAdmin({ ...admin, channels: event.target.checked ? [...admin.channels, channel] : admin.channels.filter((entry) => entry.id !== channel.id) })} /><span>#{channel.name}{channel.isPrivate ? " · 비공개" : ""}</span></label>) : <p>봇이 참여한 채널이 없습니다. Slack에서 OKRPTR 봇을 채널에 초대한 뒤 5단계의 재동기화를 실행하세요.</p>}</fieldset>
        <div className="slack-admin-actions"><button disabled={busy} onClick={() => void patchAdmin({ reminderTime: admin.settings.reminderTime, timezone: admin.settings.timezone, weekdays: admin.settings.weekdays, channelIds: admin.channels.map((channel) => channel.id) }, "Slack 데일리 기본 설정을 저장했습니다.")}>{busy ? "저장 중" : "팀 공유 설정 저장"}</button></div>
      </div> : <div className="integration-role-note">팀 기본 시간과 공유 채널은 Owner 또는 Admin이 관리합니다.</div>}</div>
    </section>

    <section className="integration-step" aria-labelledby="slack-step-test">
      <span className="integration-step-number">5</span><div className="integration-step-copy"><h4 id="slack-step-test">테스트 DM과 작동 확인</h4><p>사용자 연결과 다음 알림 예약을 확인하고 실제 테스트 DM을 보냅니다.</p></div>
      <div className="integration-step-body">{canManage && admin ? <><div className="slack-admin-actions"><button disabled={busy} onClick={() => void patchAdmin({ action: "resync" }, "Slack 사용자와 예약을 재동기화했습니다.")}><RefreshCw size={13} />사용자·예약 재동기화</button></div><div className="slack-member-links slack-test-list">{admin.members.map((member) => <div key={member.memberId}><span className={member.linked ? "linked" : "unlinked"} /><p><b>{member.displayName}</b><small>{member.linked ? member.reminder ? `다음 알림 · ${member.reminder.status}` : "알림 예약 확인 필요" : "Slack 미연결"}</small></p>{member.linked && <button disabled={busy} onClick={() => void patchAdmin({ action: "test_dm", memberId: member.memberId }, `${member.displayName}님에게 테스트 DM을 보냈습니다.`)}>테스트 DM</button>}</div>)}</div>{admin.failedPublications.length > 0 && <div className="slack-publication-failures"><b>채널 전송 실패</b>{admin.failedPublications.map((failure) => <div key={failure.id}><p>{failure.memberName} · {failure.date} · {failure.channelId}<small>{failure.error}</small></p><button disabled={busy} onClick={() => void patchAdmin({ action: "retry_publication", publicationId: failure.id }, "채널 전송을 다시 시도했습니다.")}>재시도</button></div>)}</div>}</> : <div className="integration-connected-note"><CheckCircle2 size={15} />연결된 사용자는 Slack에서 `/okrptr daily`로 언제든 데일리를 열 수 있습니다.</div>}</div>
    </section></>}
  </div>;
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

const slackAutomationRecommendations = [
  { id: "blocked", name: "막힘 상태 알림", description: "Task가 막힘 상태가 되면 바로 알립니다.", triggerType: "task_status_changed" as const, triggerStatus: "blocked", messageTemplate: "업무가 막힘 상태로 변경되었습니다.\n*{{title}}*\n우선순위: {{priority}} · {{workspace}}" },
  { id: "created", name: "새 Task 알림", description: "새 Task가 만들어지면 담당 채널에 알립니다.", triggerType: "task_created" as const, triggerStatus: "", messageTemplate: slackAutomationDefaults.task_created },
] as const;

function SlackAutomationManager({ active, connected, canManage, workspaceName, onSummary, onNotice }: { active: boolean; connected: boolean; canManage: boolean; workspaceName: string; onSummary: (status: string, summary: string) => void; onNotice: (message: string) => void }) {
  const confirmAction = useAppConfirm();
  const [automations, setAutomations] = useState<SlackAutomation[]>([]);
  const [deliveries, setDeliveries] = useState<SlackAutomationDelivery[]>([]);
  const [channels, setChannels] = useState<Array<{ id: string; name: string; isPrivate: boolean; isMember: boolean }>>([]);
  const [recommendedChannels, setRecommendedChannels] = useState<Record<string, string>>({ blocked: "", created: "" });
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<SlackAutomationDraft>(emptySlackAutomationDraft());
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const loadedRef = useRef(false);

  useEffect(() => {
    if (!active || !connected || loadedRef.current) return;
    loadedRef.current = true;
    let mounted = true;
    let completed = false;
    setLoading(true);
    void Promise.all([
      fetchSlackAutomationData(),
      canManage ? fetch("/api/slack/channels?joinable=1").then(async (response) => {
        const data = await response.json() as { channels?: Array<{ id: string; name: string; isPrivate: boolean; isMember: boolean }>; error?: string };
        if (!response.ok) throw new Error(data.error || "Slack 채널을 불러오지 못했습니다.");
        return data.channels ?? [];
      }) : Promise.resolve([]),
    ])
      .then(([data, nextChannels]) => {
        completed = true;
        if (!mounted) return;
        setAutomations(data.automations);
        setDeliveries(data.deliveries);
        setChannels(nextChannels);
        const activeCount = data.automations.filter((entry) => entry.active).length;
        onSummary(activeCount ? "사용 중" : data.automations.length ? "중지" : "설정 필요", `활성 규칙 ${activeCount}개 · 전체 ${data.automations.length}개`);
      })
      .catch((error: unknown) => {
        completed = true;
        if (mounted) { onSummary("불러오기 실패", "설정을 다시 확인해 주세요"); onNotice(error instanceof Error ? error.message : "자동화를 불러오지 못했습니다."); }
      })
      .finally(() => { if (mounted) { setLoading(false); setLoaded(true); } });
    return () => {
      mounted = false;
      if (!completed) loadedRef.current = false;
    };
  }, [active, canManage, connected, onNotice, onSummary]);

  useEffect(() => {
    if (connected || !active) return;
    onSummary("연결 필요", "Slack 연결 후 설정할 수 있습니다");
  }, [active, connected, onSummary]);

  async function loadAutomations(showLoading = true) {
    if (showLoading) setLoading(true);
    try {
      const data = await fetchSlackAutomationData();
      setAutomations(data.automations);
      setDeliveries(data.deliveries);
      const activeCount = data.automations.filter((entry) => entry.active).length;
      onSummary(activeCount ? "사용 중" : data.automations.length ? "중지" : "설정 필요", `활성 규칙 ${activeCount}개 · 전체 ${data.automations.length}개`);
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

  async function createRecommendedAutomation(recommendation: (typeof slackAutomationRecommendations)[number]) {
    const channelId = recommendedChannels[recommendation.id];
    if (!channelId) { onNotice("추천 자동화를 보낼 Slack 채널을 선택해 주세요."); return; }
    const duplicate = automations.find((entry) => entry.channelId === channelId && entry.triggerType === recommendation.triggerType && entry.triggerStatus === recommendation.triggerStatus);
    if (duplicate) { onNotice(`같은 채널에 '${duplicate.name}' 규칙이 이미 있습니다.`); return; }
    setBusyId(`recommended:${recommendation.id}`);
    try {
      const response = await fetch("/api/slack/automations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: recommendation.name, triggerType: recommendation.triggerType, triggerStatus: recommendation.triggerStatus, channelId, messageTemplate: recommendation.messageTemplate, active: true }) });
      const data = await response.json() as { automation?: SlackAutomation; error?: string };
      if (!response.ok || !data.automation) throw new Error(data.error || "추천 자동화를 만들지 못했습니다.");
      const next = [data.automation, ...automations];
      setAutomations(next);
      onSummary("사용 중", `활성 규칙 ${next.filter((entry) => entry.active).length}개 · 전체 ${next.length}개`);
      onNotice(`'${recommendation.name}' 추천 자동화를 만들었습니다.`);
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "추천 자동화를 만들지 못했습니다.");
    } finally {
      setBusyId(null);
    }
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
      setAutomations((current) => {
        const next = editingId ? current.map((entry) => entry.id === editingId ? data.automation! : entry) : [data.automation!, ...current];
        const activeCount = next.filter((entry) => entry.active).length;
        onSummary(activeCount ? "사용 중" : next.length ? "중지" : "설정 필요", `활성 규칙 ${activeCount}개 · 전체 ${next.length}개`);
        return next;
      });
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
      setAutomations((current) => {
        const next = current.map((entry) => entry.id === automation.id ? data.automation! : entry);
        const activeCount = next.filter((entry) => entry.active).length;
        onSummary(activeCount ? "사용 중" : next.length ? "중지" : "설정 필요", `활성 규칙 ${activeCount}개 · 전체 ${next.length}개`);
        return next;
      });
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
      setAutomations((current) => {
        const next = current.filter((entry) => entry.id !== automation.id);
        const activeCount = next.filter((entry) => entry.active).length;
        onSummary(activeCount ? "사용 중" : next.length ? "중지" : "설정 필요", `활성 규칙 ${activeCount}개 · 전체 ${next.length}개`);
        return next;
      });
      setDeliveries((current) => current.filter((entry) => entry.automationId !== automation.id));
      onNotice("Slack 자동화를 삭제했습니다.");
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "자동화를 삭제하지 못했습니다.");
    } finally {
      setBusyId(null);
    }
  }

  if (!active && !loaded) return null;
  if (!connected) return <div className="slack-automation-locked"><Zap size={16} /><div><b>Slack 연결 후 업무 자동화 봇을 설정할 수 있습니다</b><p>연결을 완료하면 업무 생성과 상태 변경을 채널로 자동 전송할 수 있습니다.</p></div></div>;

  return <div className="slack-automation-manager">
    {canManage && <section className="automation-recommendations"><header><h3>추천 자동화</h3><p>발송 채널만 고르면 추천 조건과 메시지로 바로 시작합니다.</p></header><div>{slackAutomationRecommendations.map((recommendation) => <article key={recommendation.id}><div><b>{recommendation.name}</b><p>{recommendation.description}</p></div><select aria-label={`${recommendation.name} Slack 채널`} value={recommendedChannels[recommendation.id]} onChange={(event) => setRecommendedChannels((current) => ({ ...current, [recommendation.id]: event.target.value }))}><option value="">채널 선택</option>{channels.map((channel) => <option value={channel.id} key={channel.id}>#{channel.name}{channel.isPrivate ? " · 비공개" : ""}</option>)}</select><button type="button" disabled={busyId === `recommended:${recommendation.id}`} onClick={() => void createRecommendedAutomation(recommendation)}>{busyId === `recommended:${recommendation.id}` ? <LoaderCircle className="spin" size={13} /> : <Plus size={13} />}추가</button></article>)}</div></section>}
    <div className="slack-automation-heading"><div><h3>현재 자동화</h3><p>{workspaceName}에서 작동하는 규칙입니다.</p></div>{canManage && <button type="button" onClick={startCreate}><Plus size={14} />직접 규칙 만들기</button>}</div>
    <div className="slack-bot-note"><Bot size={15} /><p>각 자동화는 독립된 규칙으로 작동하며, 메시지는 연결된 <b>OKRPTR 봇</b> 이름으로 전송됩니다.</p></div>
    {formOpen && <form className="slack-automation-form" onSubmit={(event) => void saveAutomation(event)}>
      <div className="slack-form-title"><b>{editingId ? "자동화 수정" : "새 자동화"}</b><button type="button" className="icon-button" onClick={() => setFormOpen(false)} aria-label="작성 취소"><X size={14} /></button></div>
      <div className="slack-form-grid">
        <label><span>자동화 이름</span><input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="예: 새 업무 알림" maxLength={80} /></label>
        <label><span>Slack 발송 채널</span><select value={draft.channelId} onChange={(event) => setDraft({ ...draft, channelId: event.target.value })}><option value="">채널 선택</option>{draft.channelId && !channels.some((channel) => channel.id === draft.channelId) && <option value={draft.channelId}>#{draft.channelId}</option>}{channels.map((channel) => <option value={channel.id} key={channel.id}>#{channel.name}{channel.isPrivate ? " · 비공개" : ""}</option>)}</select></label>
        <label><span>트리거</span><select value={draft.triggerType} onChange={(event) => { const triggerType = event.target.value as SlackAutomationTrigger; setDraft({ ...draft, triggerType, triggerStatus: "", messageTemplate: slackAutomationDefaults[triggerType] }); }}><option value="task_created">업무가 생성될 때</option><option value="task_status_changed">업무 상태가 바뀔 때</option></select></label>
        {draft.triggerType === "task_status_changed" && <label><span>바뀐 상태</span><select value={draft.triggerStatus} onChange={(event) => setDraft({ ...draft, triggerStatus: event.target.value })}><option value="">모든 상태</option>{(["backlog", "todo", "policy_discussion", "in_progress", "developing", "development_done", "done", "blocked"] as ItemStatus[]).map((status) => <option value={status} key={status}>{statusLabel(status)}</option>)}</select></label>}
      </div>
      <label className="slack-message-field"><span>보낼 메시지</span><textarea value={draft.messageTemplate} onChange={(event) => setDraft({ ...draft, messageTemplate: event.target.value })} maxLength={3000} rows={4} /></label>
      <div className="slack-variable-row"><span>변수</span>{["{{title}}", "{{status}}", "{{from_status}}", "{{priority}}", "{{workspace}}"].map((variable) => <button type="button" key={variable} onClick={() => setDraft({ ...draft, messageTemplate: `${draft.messageTemplate}${draft.messageTemplate.endsWith(" ") || draft.messageTemplate.endsWith("\n") ? "" : " "}${variable}` })}>{variable}</button>)}</div>
      <p className="slack-channel-help">비공개 채널은 OKRPTR 봇이 참여한 채널만 선택할 수 있습니다.</p>
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

function kindLabel(kind: ItemKind) { return { objective: "Objective", key_result: "Key Result", initiative: "Initiative", project: "Project", task: "Task" }[kind]; }
function statusLabel(status: ItemStatus) { return statusLabels[status]; }
function isCompletedStatus(status: ItemStatus) { return status === "done" || status === "development_done"; }
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
function trashSummary(record: TrashRecord) { return `OKR ${record.cycleCount}개, 작업 ${record.itemCount}개, Routine ${record.routineCount}개 보관`; }
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
function pageSubtitle(view: View) { return { home: "자유롭게 이야기하면 OKR과 실행 항목으로 정리", my_work: "내가 담당하는 Project, Task, Routine", inbox: "워크스페이스 전체 Task 목록", work: "Initiative 아래의 Project 속성과 상태 관리", routines: "OKR과 독립된 반복 실행과 하위 Task 관리", okr: "Objective부터 Project·Task까지의 OKR 실행 구조", data: "Key Result와 Project에 외부 API 수치 연결", scrum: "내 Task를 기준으로 어제, 오늘, 막힘 정리", recommendations: "현재 데이터에서 계산한 다음 정리 항목", reviews: "주기별 진행과 막힘", trash: "삭제한 Project·Task와 전체 데이터 정리 기록", integrations: "내 Google Calendar와 개인 Slack DM 연결", billing: "워크스페이스 플랜, 사용량, 카드와 결제 기록 관리" }[view]; }
function routineCadenceLabel(cadence: RoutineCadence) { return { daily: "매일", weekly: "매주", monthly: "매월" }[cadence]; }
function recommendationIcon(kind: Recommendation["kind"]) { if (kind === "blocked") return "!"; if (kind === "overdue") return "D"; if (kind === "due_soon") return "3"; return "P"; }
