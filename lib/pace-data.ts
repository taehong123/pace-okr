import { env } from "cloudflare:workers";
import { and, asc, desc, eq, inArray, isNull, like, lte, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { readGoogleSession } from "@/lib/google-session";
import {
  activityLog,
  aiUsageEvents,
  checklistItems,
  dailyScrums,
  googleCalendarEvents,
  googleConnections,
  googleOAuthStates,
  itemAssignments,
  itemPropertyValues,
  items,
  integrationTokens,
  okrCycles,
  propertyDefinitions,
  projectDocuments,
  projectHiddenProperties,
  projectTemplates,
  routineCompletions,
  routines,
  slackAutomationDeliveries,
  slackAutomations,
  slackConnections,
  slackOAuthStates,
  trashRecords,
  userWorkspacePreferences,
  workspaceRules,
  workspaceGroupMembers,
  workspaceGroups,
  workspaceMembers,
  workspaces,
  type PaceItem,
  type PropertyDefinition,
  type ProjectDocument,
  type ProjectTemplate,
  type WorkspaceGroup,
  type WorkspaceGroupMember,
  type WorkspaceMember,
  type WorkspaceRule,
  type IntegrationToken,
  type OkrCycle,
  type GoogleConnection,
  type SlackConnection,
  type SlackAutomation,
  type SlackAutomationDelivery,
  type TrashRecord,
} from "@/db/schema";
import { decryptSlackSecret } from "@/lib/slack-oauth";
import {
  defaultSlackAutomationTemplate,
  isSlackAutomationTrigger,
  normalizeSlackChannelId,
  postSlackMessage,
  renderSlackAutomationMessage,
  slackAutomationMatches,
  type SlackAutomationContext,
  type SlackAutomationTrigger,
} from "@/lib/slack-automation";

export const ITEM_KINDS = ["objective", "key_result", "initiative", "project", "task"] as const;
export const ITEM_STATUSES = ["backlog", "todo", "policy_discussion", "in_progress", "developing", "development_done", "done", "blocked", "archived"] as const;
export const ITEM_PRIORITIES = ["low", "medium", "high", "urgent"] as const;
export const ITEM_CADENCES = ["daily", "weekly", "monthly", "quarterly"] as const;
export const OKR_CYCLE_STATUSES = ["planned", "active", "closed"] as const;
export const PROPERTY_TYPES = ["text", "number", "select", "date", "checkbox", "member", "members"] as const;
export const ITEM_ASSIGNMENT_ROLES = ["project_dri", "project_worker", "task_assignee"] as const;
export const ROUTINE_CADENCES = ["daily", "weekly", "monthly"] as const;
export const GENERAL_ROUTINE_SYSTEM_KEY = "general";
const LEGACY_SEED_OBJECTIVE_TITLE = "셀프 서브 도입으로 팀의 성장 속도를 높인다";
const LEGACY_SEED_ITEM_TITLES = [
  LEGACY_SEED_OBJECTIVE_TITLE,
  "신규 사용자의 첫 주 활성화율 32% → 48%",
  "가입 후 10분 안에 첫 가치 경험 만들기",
  "온보딩 활성화 개선",
  "온보딩 체크리스트 실험",
  "결제 화면 카피 확정",
  "활성화 이벤트 QA",
  "신규 사용자 5명 인터뷰",
  "가격 정책 페이지 개선 아이디어",
  "모바일 가입 이탈 구간 확인",
];
const LEGACY_SEED_ROUTINE_TITLES = ["오늘의 최우선 Task 정리", "주간 회고 작성"];
export const TEAM_ROLES = ["owner", "admin", "member", "viewer"] as const;
export const GROUP_COLORS = ["gray", "blue", "green", "yellow", "orange", "red", "purple"] as const;
export const GROUP_VISIBILITIES = ["open", "private"] as const;
export const GROUP_ROLES = ["lead", "member"] as const;

export type ItemKind = (typeof ITEM_KINDS)[number];
export type ItemStatus = (typeof ITEM_STATUSES)[number];
export type ItemPriority = (typeof ITEM_PRIORITIES)[number];
export type ItemCadence = (typeof ITEM_CADENCES)[number];
export type OkrCycleStatus = (typeof OKR_CYCLE_STATUSES)[number];
export type PropertyType = (typeof PROPERTY_TYPES)[number];
export type PropertyValue = string | number | boolean | string[] | null;
export type ItemAssignmentRole = (typeof ITEM_ASSIGNMENT_ROLES)[number];
export type RoutineCadence = (typeof ROUTINE_CADENCES)[number];
export type WorkspaceRuleInput = Partial<{
  captureInstruction: string;
  structureInstruction: string;
  routineInstruction: string;
  defaultPriority: ItemPriority;
  defaultCadence: ItemCadence;
  reviewBeforeCreate: boolean;
  configured: boolean;
}>;
export type TeamRole = (typeof TEAM_ROLES)[number];
export type GroupColor = (typeof GROUP_COLORS)[number];
export type GroupVisibility = (typeof GROUP_VISIBILITIES)[number];
export type GroupRole = (typeof GROUP_ROLES)[number];
export type AiUsageSummary = {
  spentWonMicros: number;
  requestsToday: number;
  requestsThisMinute: number;
};

export type OkrPlanInput = {
  cycleId: string;
  targetId?: string | null;
  targetKind?: "objective" | "key_result" | "initiative" | null;
  objective?: string;
  keyResult?: string;
  initiative?: string;
  project?: string;
  driMemberId?: string | null;
};

export type RequestAuthorization = {
  ownerId: string;
  userId: string;
  email: string | null;
  displayName: string;
  role: TeamRole;
  apiToken: boolean;
};

export type IntegrationTokenSummary = Pick<IntegrationToken, "id" | "name" | "tokenPrefix" | "createdAt" | "lastUsedAt" | "revokedAt">;

const DEFAULT_PROJECT_EXECUTION_PROPERTIES: { name: string; type: PropertyType; systemKey?: string; options?: string[]; defaultValue?: PropertyValue }[] = [
  { name: "상위 Initiative", type: "text", systemKey: "parent_id" },
  { name: "상태", type: "select", systemKey: "status", options: [...ITEM_STATUSES.filter((status) => status !== "archived")] },
  { name: "우선순위", type: "select", systemKey: "priority", options: [...ITEM_PRIORITIES] },
  { name: "주기", type: "select", systemKey: "cadence", options: [...ITEM_CADENCES] },
  { name: "기한", type: "date", systemKey: "due_date" },
  { name: "DRI", type: "member", systemKey: "project_dri" },
  { name: "하위 업무자", type: "members", systemKey: "project_workers" },
  { name: "시기", type: "select", options: ["이번 주", "이번 달", "이번 분기", "다음 분기", "미정"] },
  { name: "KR 기여 예상치", type: "number" },
  { name: "예상 기간", type: "number" },
];

type RuntimeEnv = typeof env & {
  OKRPTR_API_TOKEN?: string;
  OKITA_API_TOKEN?: string;
  PACE_API_TOKEN?: string;
  GOOGLE_TOKEN_ENCRYPTION_KEY?: string;
  SLACK_TOKEN_ENCRYPTION_KEY?: string;
};
let schemaReady: Promise<void> | null = null;
const workspaceReady = new Map<string, Promise<void>>();

const parentKind: Record<ItemKind, ItemKind | null> = {
  objective: null,
  key_result: "objective",
  initiative: "key_result",
  project: "initiative",
  task: "project",
};
const completedStatuses = new Set<ItemStatus>(["done", "development_done"]);
const okrKinds = new Set<ItemKind>(["objective", "key_result", "initiative"]);
const reservedAssignmentPropertyNames = new Set(["dri", "owner", "assignee", "담당", "담당자", "worker", "workers", "하위 업무자", "업무자", "작업자", "참여자"]);

async function ensureSchema() {
  if (!schemaReady) {
    const d1 = (env as RuntimeEnv).DB;
    schemaReady = (async () => {
      if (await schemaIsCurrent(d1)) return;
      await d1.batch([
        d1.prepare(`CREATE TABLE IF NOT EXISTS workspaces (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          owner_user_id TEXT NOT NULL,
          deletion_requested_at TEXT,
          scheduled_deletion_at TEXT,
          deletion_requested_by_user_id TEXT,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`),
        d1.prepare("DROP INDEX IF EXISTS idx_workspaces_owner_user"),
        d1.prepare("CREATE INDEX IF NOT EXISTS idx_workspaces_owner ON workspaces(owner_user_id)"),
        d1.prepare(`CREATE TABLE IF NOT EXISTS workspace_members (
          id TEXT PRIMARY KEY,
          workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
          user_id TEXT,
          email TEXT,
          display_name TEXT NOT NULL DEFAULT '',
          role TEXT NOT NULL DEFAULT 'member',
          status TEXT NOT NULL DEFAULT 'invited',
          invited_by_user_id TEXT,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`),
        d1.prepare("DROP INDEX IF EXISTS idx_workspace_members_user"),
        d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_workspace_members_workspace_user ON workspace_members(workspace_id, user_id)"),
        d1.prepare("CREATE INDEX IF NOT EXISTS idx_workspace_members_user_lookup ON workspace_members(user_id, status)"),
        d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_workspace_members_workspace_email ON workspace_members(workspace_id, email)"),
        d1.prepare("CREATE INDEX IF NOT EXISTS idx_workspace_members_workspace_status ON workspace_members(workspace_id, status)"),
        d1.prepare(`CREATE TABLE IF NOT EXISTS user_workspace_preferences (
          user_id TEXT PRIMARY KEY,
          active_workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`),
        d1.prepare("CREATE INDEX IF NOT EXISTS idx_user_workspace_preferences_active ON user_workspace_preferences(active_workspace_id)"),
        d1.prepare(`CREATE TABLE IF NOT EXISTS workspace_rules (
          workspace_id TEXT PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
          capture_instruction TEXT NOT NULL DEFAULT '',
          structure_instruction TEXT NOT NULL DEFAULT '',
          routine_instruction TEXT NOT NULL DEFAULT '',
          default_priority TEXT NOT NULL DEFAULT 'medium',
          default_cadence TEXT NOT NULL DEFAULT 'weekly',
          review_before_create INTEGER NOT NULL DEFAULT 1,
          configured INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`),
        d1.prepare(`CREATE TABLE IF NOT EXISTS integration_tokens (
          id TEXT PRIMARY KEY,
          workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
          user_id TEXT NOT NULL,
          name TEXT NOT NULL DEFAULT 'Codex',
          token_hash TEXT NOT NULL,
          token_prefix TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          last_used_at TEXT,
          revoked_at TEXT
        )`),
        d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_integration_tokens_hash ON integration_tokens(token_hash)"),
        d1.prepare("CREATE INDEX IF NOT EXISTS idx_integration_tokens_workspace_user ON integration_tokens(workspace_id, user_id, revoked_at)"),
        d1.prepare(`CREATE TABLE IF NOT EXISTS okr_cycles (
          id TEXT PRIMARY KEY,
          owner_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          department TEXT NOT NULL DEFAULT '',
          version INTEGER NOT NULL DEFAULT 1,
          start_date TEXT NOT NULL,
          end_date TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'active',
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`),
        d1.prepare("CREATE INDEX IF NOT EXISTS idx_okr_cycles_owner_status ON okr_cycles(owner_id, status)"),
        d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_okr_cycles_owner_version ON okr_cycles(owner_id, version)"),
        d1.prepare(`CREATE TABLE IF NOT EXISTS workspace_groups (
          id TEXT PRIMARY KEY,
          workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          handle TEXT NOT NULL,
          description TEXT NOT NULL DEFAULT '',
          color TEXT NOT NULL DEFAULT 'gray',
          visibility TEXT NOT NULL DEFAULT 'open',
          archived INTEGER NOT NULL DEFAULT 0,
          created_by_user_id TEXT,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`),
        d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_workspace_groups_workspace_handle ON workspace_groups(workspace_id, handle)"),
        d1.prepare("CREATE INDEX IF NOT EXISTS idx_workspace_groups_workspace_archived ON workspace_groups(workspace_id, archived)"),
        d1.prepare(`CREATE TABLE IF NOT EXISTS workspace_group_members (
          id TEXT PRIMARY KEY,
          group_id TEXT NOT NULL REFERENCES workspace_groups(id) ON DELETE CASCADE,
          member_id TEXT NOT NULL REFERENCES workspace_members(id) ON DELETE CASCADE,
          role TEXT NOT NULL DEFAULT 'member',
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`),
        d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_workspace_group_members_unique ON workspace_group_members(group_id, member_id)"),
        d1.prepare("CREATE INDEX IF NOT EXISTS idx_workspace_group_members_member ON workspace_group_members(member_id)"),
        d1.prepare("CREATE INDEX IF NOT EXISTS idx_workspace_group_members_group_role ON workspace_group_members(group_id, role)"),
        d1.prepare(`CREATE TABLE IF NOT EXISTS items (
          id TEXT PRIMARY KEY,
          owner_id TEXT NOT NULL,
          cycle_id TEXT REFERENCES okr_cycles(id) ON DELETE SET NULL,
          parent_id TEXT,
          routine_id TEXT REFERENCES routines(id) ON DELETE SET NULL,
          kind TEXT NOT NULL,
          title TEXT NOT NULL,
          description TEXT NOT NULL DEFAULT '',
          status TEXT NOT NULL DEFAULT 'todo',
          priority TEXT NOT NULL DEFAULT 'medium',
          cadence TEXT NOT NULL DEFAULT 'weekly',
          progress INTEGER NOT NULL DEFAULT 0,
          due_date TEXT,
          source TEXT NOT NULL DEFAULT 'web',
          source_ref TEXT,
          sort_order INTEGER NOT NULL DEFAULT 0,
          archived_at TEXT,
          archived_from_status TEXT,
          archive_root_id TEXT,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`),
        d1.prepare("CREATE INDEX IF NOT EXISTS idx_items_owner_status ON items(owner_id, status)"),
        d1.prepare("CREATE INDEX IF NOT EXISTS idx_items_owner_parent ON items(owner_id, parent_id)"),
        d1.prepare("CREATE INDEX IF NOT EXISTS idx_items_owner_cadence ON items(owner_id, cadence)"),
        d1.prepare(`CREATE TABLE IF NOT EXISTS item_assignments (
          id TEXT PRIMARY KEY,
          owner_id TEXT NOT NULL,
          item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
          member_id TEXT NOT NULL REFERENCES workspace_members(id) ON DELETE CASCADE,
          role TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`),
        d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_item_assignments_unique ON item_assignments(owner_id, item_id, member_id, role)"),
        d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_item_assignments_single_role ON item_assignments(owner_id, item_id, role) WHERE role IN ('project_dri', 'task_assignee')"),
        d1.prepare("CREATE INDEX IF NOT EXISTS idx_item_assignments_owner_item ON item_assignments(owner_id, item_id)"),
        d1.prepare("CREATE INDEX IF NOT EXISTS idx_item_assignments_member ON item_assignments(member_id)"),
        d1.prepare(`CREATE TABLE IF NOT EXISTS activity_log (
          id TEXT PRIMARY KEY,
          owner_id TEXT NOT NULL,
          item_id TEXT NOT NULL,
          action TEXT NOT NULL,
          source TEXT NOT NULL DEFAULT 'web',
          payload TEXT NOT NULL DEFAULT '{}',
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`),
        d1.prepare("CREATE INDEX IF NOT EXISTS idx_activity_owner_created ON activity_log(owner_id, created_at)"),
        d1.prepare("CREATE INDEX IF NOT EXISTS idx_activity_item ON activity_log(item_id)"),
        d1.prepare(`CREATE TABLE IF NOT EXISTS property_definitions (
          id TEXT PRIMARY KEY,
          owner_id TEXT NOT NULL,
          name TEXT NOT NULL,
          type TEXT NOT NULL,
          options TEXT NOT NULL DEFAULT '[]',
          default_value TEXT NOT NULL DEFAULT 'null',
          system_key TEXT,
          active INTEGER NOT NULL DEFAULT 1,
          sort_order INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`),
        d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_property_definitions_owner_name ON property_definitions(owner_id, name)"),
        d1.prepare(`CREATE TABLE IF NOT EXISTS item_property_values (
          id TEXT PRIMARY KEY,
          owner_id TEXT NOT NULL,
          item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
          property_id TEXT NOT NULL REFERENCES property_definitions(id) ON DELETE CASCADE,
          value TEXT NOT NULL DEFAULT 'null',
          legacy_value TEXT,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`),
        d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_item_property_values_unique ON item_property_values(owner_id, item_id, property_id)"),
        d1.prepare("CREATE INDEX IF NOT EXISTS idx_item_property_values_owner_item ON item_property_values(owner_id, item_id)"),
        d1.prepare("CREATE INDEX IF NOT EXISTS idx_item_property_values_owner_property ON item_property_values(owner_id, property_id)"),
        d1.prepare(`CREATE TABLE IF NOT EXISTS project_hidden_properties (
          id TEXT PRIMARY KEY,
          owner_id TEXT NOT NULL,
          project_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
          property_id TEXT NOT NULL REFERENCES property_definitions(id) ON DELETE CASCADE,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`),
        d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_project_hidden_properties_unique ON project_hidden_properties(owner_id, project_id, property_id)"),
        d1.prepare("CREATE INDEX IF NOT EXISTS idx_project_hidden_properties_project ON project_hidden_properties(owner_id, project_id)"),
        d1.prepare("CREATE INDEX IF NOT EXISTS idx_project_hidden_properties_property ON project_hidden_properties(owner_id, property_id)"),
        d1.prepare(`CREATE TABLE IF NOT EXISTS project_documents (
          id TEXT PRIMARY KEY,
          owner_id TEXT NOT NULL,
          project_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
          content TEXT NOT NULL DEFAULT '[]',
          plain_text TEXT NOT NULL DEFAULT '',
          version INTEGER NOT NULL DEFAULT 1,
          updated_by_user_id TEXT,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`),
        d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_project_documents_project ON project_documents(owner_id, project_id)"),
        d1.prepare("CREATE INDEX IF NOT EXISTS idx_project_documents_owner_updated ON project_documents(owner_id, updated_at)"),
        d1.prepare(`CREATE TABLE IF NOT EXISTS project_templates (
          id TEXT PRIMARY KEY,
          owner_id TEXT NOT NULL,
          name TEXT NOT NULL,
          description TEXT NOT NULL DEFAULT '',
          content TEXT NOT NULL DEFAULT '[]',
          plain_text TEXT NOT NULL DEFAULT '',
          created_by_user_id TEXT,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`),
        d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_project_templates_owner_name ON project_templates(owner_id, name)"),
        d1.prepare("CREATE INDEX IF NOT EXISTS idx_project_templates_owner_updated ON project_templates(owner_id, updated_at)"),
        d1.prepare(`CREATE TABLE IF NOT EXISTS checklist_items (
          id TEXT PRIMARY KEY,
          owner_id TEXT NOT NULL,
          task_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
          title TEXT NOT NULL,
          completed INTEGER NOT NULL DEFAULT 0,
          sort_order INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`),
        d1.prepare("CREATE INDEX IF NOT EXISTS idx_checklist_owner_task ON checklist_items(owner_id, task_id)"),
        d1.prepare(`CREATE TABLE IF NOT EXISTS daily_scrums (
          id TEXT PRIMARY KEY,
          owner_id TEXT NOT NULL,
          scrum_date TEXT NOT NULL,
          yesterday_note TEXT NOT NULL DEFAULT '',
          today_note TEXT NOT NULL DEFAULT '',
          blockers_note TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`),
        d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_scrums_owner_date ON daily_scrums(owner_id, scrum_date)"),
        d1.prepare(`CREATE TABLE IF NOT EXISTS routines (
          id TEXT PRIMARY KEY,
          owner_id TEXT NOT NULL,
          system_key TEXT,
          assignee_member_id TEXT REFERENCES workspace_members(id) ON DELETE SET NULL,
          title TEXT NOT NULL,
          description TEXT NOT NULL DEFAULT '',
          trigger_point TEXT NOT NULL DEFAULT '',
          action_place TEXT NOT NULL DEFAULT '',
          action_steps TEXT NOT NULL DEFAULT '',
          cadence TEXT NOT NULL DEFAULT 'daily',
          active INTEGER NOT NULL DEFAULT 1,
          sort_order INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`),
        d1.prepare("CREATE INDEX IF NOT EXISTS idx_routines_owner_active ON routines(owner_id, active)"),
        d1.prepare("CREATE INDEX IF NOT EXISTS idx_routines_owner_sort ON routines(owner_id, sort_order)"),
        d1.prepare(`CREATE TABLE IF NOT EXISTS routine_completions (
          id TEXT PRIMARY KEY,
          owner_id TEXT NOT NULL,
          routine_id TEXT NOT NULL REFERENCES routines(id) ON DELETE CASCADE,
          completion_date TEXT NOT NULL,
          note TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`),
        d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_routine_completions_unique ON routine_completions(owner_id, routine_id, completion_date)"),
        d1.prepare("CREATE INDEX IF NOT EXISTS idx_routine_completions_owner_date ON routine_completions(owner_id, completion_date)"),
        d1.prepare(`CREATE TABLE IF NOT EXISTS ai_usage_events (
          id TEXT PRIMARY KEY,
          owner_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          model TEXT NOT NULL,
          source TEXT NOT NULL DEFAULT 'web',
          input_chars INTEGER NOT NULL DEFAULT 0,
          input_tokens INTEGER NOT NULL DEFAULT 0,
          output_tokens INTEGER NOT NULL DEFAULT 0,
          estimated_cost_won_micros INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`),
        d1.prepare("CREATE INDEX IF NOT EXISTS idx_ai_usage_owner_created ON ai_usage_events(owner_id, created_at)"),
        d1.prepare("CREATE INDEX IF NOT EXISTS idx_ai_usage_user_created ON ai_usage_events(user_id, created_at)"),
        d1.prepare(`CREATE TABLE IF NOT EXISTS google_connections (
          id TEXT PRIMARY KEY,
          owner_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          google_account_id TEXT NOT NULL DEFAULT '',
          email TEXT NOT NULL DEFAULT '',
          display_name TEXT NOT NULL DEFAULT '',
          encrypted_refresh_token TEXT NOT NULL,
          scope TEXT NOT NULL DEFAULT '',
          connected_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`),
        d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_google_connections_owner_user ON google_connections(owner_id, user_id)"),
        d1.prepare("CREATE INDEX IF NOT EXISTS idx_google_connections_user ON google_connections(user_id)"),
        d1.prepare(`CREATE TABLE IF NOT EXISTS google_oauth_states (
          state TEXT PRIMARY KEY,
          owner_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          return_to TEXT NOT NULL DEFAULT '/',
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          expires_at TEXT NOT NULL
        )`),
        d1.prepare("CREATE INDEX IF NOT EXISTS idx_google_oauth_states_expires ON google_oauth_states(expires_at)"),
        d1.prepare(`CREATE TABLE IF NOT EXISTS google_calendar_events (
          id TEXT PRIMARY KEY,
          owner_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
          calendar_id TEXT NOT NULL DEFAULT 'primary',
          google_event_id TEXT NOT NULL,
          html_link TEXT NOT NULL DEFAULT '',
          synced_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`),
        d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_google_calendar_events_item ON google_calendar_events(owner_id, user_id, item_id)"),
        d1.prepare("CREATE INDEX IF NOT EXISTS idx_google_calendar_events_owner ON google_calendar_events(owner_id)"),
        d1.prepare(`CREATE TABLE IF NOT EXISTS slack_connections (
          id TEXT PRIMARY KEY,
          owner_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          team_id TEXT NOT NULL,
          team_name TEXT NOT NULL DEFAULT '',
          bot_user_id TEXT NOT NULL DEFAULT '',
          app_id TEXT NOT NULL DEFAULT '',
          encrypted_bot_token TEXT NOT NULL,
          scope TEXT NOT NULL DEFAULT '',
          connected_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`),
        d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_slack_connections_owner_user ON slack_connections(owner_id, user_id)"),
        d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_slack_connections_team ON slack_connections(team_id)"),
        d1.prepare("CREATE INDEX IF NOT EXISTS idx_slack_connections_owner ON slack_connections(owner_id)"),
        d1.prepare(`CREATE TABLE IF NOT EXISTS slack_automations (
          id TEXT PRIMARY KEY,
          owner_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
          created_by_user_id TEXT NOT NULL,
          name TEXT NOT NULL,
          trigger_type TEXT NOT NULL,
          trigger_status TEXT NOT NULL DEFAULT '',
          channel_id TEXT NOT NULL,
          message_template TEXT NOT NULL,
          active INTEGER NOT NULL DEFAULT 1,
          last_triggered_at TEXT,
          last_delivery_status TEXT NOT NULL DEFAULT 'never',
          last_error TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`),
        d1.prepare("CREATE INDEX IF NOT EXISTS idx_slack_automations_owner ON slack_automations(owner_id)"),
        d1.prepare("CREATE INDEX IF NOT EXISTS idx_slack_automations_owner_active_trigger ON slack_automations(owner_id, active, trigger_type)"),
        d1.prepare(`CREATE TABLE IF NOT EXISTS slack_automation_deliveries (
          id TEXT PRIMARY KEY,
          owner_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
          automation_id TEXT NOT NULL REFERENCES slack_automations(id) ON DELETE CASCADE,
          item_id TEXT REFERENCES items(id) ON DELETE SET NULL,
          event_key TEXT NOT NULL,
          trigger_type TEXT NOT NULL,
          channel_id TEXT NOT NULL,
          message TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending',
          error TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          sent_at TEXT
        )`),
        d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_slack_automation_deliveries_event ON slack_automation_deliveries(event_key)"),
        d1.prepare("CREATE INDEX IF NOT EXISTS idx_slack_automation_deliveries_owner_created ON slack_automation_deliveries(owner_id, created_at)"),
        d1.prepare("CREATE INDEX IF NOT EXISTS idx_slack_automation_deliveries_automation_created ON slack_automation_deliveries(automation_id, created_at)"),
        d1.prepare(`CREATE TABLE IF NOT EXISTS slack_oauth_states (
          state TEXT PRIMARY KEY,
          owner_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          return_to TEXT NOT NULL DEFAULT '/',
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          expires_at TEXT NOT NULL
        )`),
        d1.prepare("CREATE INDEX IF NOT EXISTS idx_slack_oauth_states_expires ON slack_oauth_states(expires_at)"),
        d1.prepare(`CREATE TABLE IF NOT EXISTS trash_records (
          id TEXT PRIMARY KEY,
          owner_id TEXT NOT NULL,
          category TEXT NOT NULL,
          title TEXT NOT NULL,
          payload TEXT NOT NULL,
          item_count INTEGER NOT NULL DEFAULT 0,
          routine_count INTEGER NOT NULL DEFAULT 0,
          cycle_count INTEGER NOT NULL DEFAULT 0,
          created_by_user_id TEXT,
          archived_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`),
        d1.prepare("CREATE INDEX IF NOT EXISTS idx_trash_records_owner_archived ON trash_records(owner_id, archived_at)"),
        d1.prepare("PRAGMA optimize"),
      ]);
      await addColumnIfMissing(d1, "ALTER TABLE routines ADD COLUMN trigger_point TEXT NOT NULL DEFAULT ''");
      await addColumnIfMissing(d1, "ALTER TABLE routines ADD COLUMN action_place TEXT NOT NULL DEFAULT ''");
      await addColumnIfMissing(d1, "ALTER TABLE routines ADD COLUMN action_steps TEXT NOT NULL DEFAULT ''");
      await addColumnIfMissing(d1, "ALTER TABLE routines ADD COLUMN system_key TEXT");
      await addColumnIfMissing(d1, "ALTER TABLE routines ADD COLUMN assignee_member_id TEXT REFERENCES workspace_members(id) ON DELETE SET NULL");
      await addColumnIfMissing(d1, "ALTER TABLE okr_cycles ADD COLUMN department TEXT NOT NULL DEFAULT ''");
      await addColumnIfMissing(d1, "ALTER TABLE items ADD COLUMN cycle_id TEXT REFERENCES okr_cycles(id) ON DELETE SET NULL");
      await addColumnIfMissing(d1, "ALTER TABLE items ADD COLUMN routine_id TEXT REFERENCES routines(id) ON DELETE SET NULL");
      await addColumnIfMissing(d1, "ALTER TABLE items ADD COLUMN archived_at TEXT");
      await addColumnIfMissing(d1, "ALTER TABLE items ADD COLUMN archived_from_status TEXT");
      await addColumnIfMissing(d1, "ALTER TABLE items ADD COLUMN archive_root_id TEXT");
      await addColumnIfMissing(d1, "ALTER TABLE integration_tokens ADD COLUMN last_used_at TEXT");
      await addColumnIfMissing(d1, "ALTER TABLE workspaces ADD COLUMN deletion_requested_at TEXT");
      await addColumnIfMissing(d1, "ALTER TABLE workspaces ADD COLUMN scheduled_deletion_at TEXT");
      await addColumnIfMissing(d1, "ALTER TABLE workspaces ADD COLUMN deletion_requested_by_user_id TEXT");
      await addColumnIfMissing(d1, "ALTER TABLE property_definitions ADD COLUMN default_value TEXT NOT NULL DEFAULT 'null'");
      await addColumnIfMissing(d1, "ALTER TABLE property_definitions ADD COLUMN system_key TEXT");
      await addColumnIfMissing(d1, "ALTER TABLE property_definitions ADD COLUMN active INTEGER NOT NULL DEFAULT 1");
      await addColumnIfMissing(d1, "ALTER TABLE item_property_values ADD COLUMN legacy_value TEXT");
      await d1.batch([
        d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_routines_owner_system_key ON routines(owner_id, system_key) WHERE system_key IS NOT NULL"),
        d1.prepare("CREATE INDEX IF NOT EXISTS idx_routines_assignee ON routines(assignee_member_id)"),
        d1.prepare("CREATE INDEX IF NOT EXISTS idx_workspaces_scheduled_deletion ON workspaces(scheduled_deletion_at)"),
        d1.prepare("CREATE INDEX IF NOT EXISTS idx_items_owner_routine ON items(owner_id, routine_id)"),
        d1.prepare("CREATE INDEX IF NOT EXISTS idx_items_owner_cycle ON items(owner_id, cycle_id)"),
        d1.prepare("CREATE INDEX IF NOT EXISTS idx_items_owner_archived ON items(owner_id, archived_at)"),
        d1.prepare("CREATE INDEX IF NOT EXISTS idx_items_owner_archive_root ON items(owner_id, archive_root_id)"),
        d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_property_definitions_owner_system ON property_definitions(owner_id, system_key) WHERE system_key IS NOT NULL"),
        d1.prepare("CREATE INDEX IF NOT EXISTS idx_property_definitions_owner_active_sort ON property_definitions(owner_id, active, sort_order)"),
        d1.prepare(`UPDATE items
          SET archived_at = COALESCE(updated_at, CURRENT_TIMESTAMP),
              archived_from_status = CASE kind WHEN 'project' THEN 'backlog' ELSE 'todo' END,
              archive_root_id = CASE kind WHEN 'project' THEN id ELSE parent_id END
          WHERE status = 'archived' AND archived_at IS NULL`),
      ]);
    })()
      .catch((error: unknown) => {
        schemaReady = null;
        throw error;
      });
  }

  await schemaReady;
}

async function schemaIsCurrent(d1: RuntimeEnv["DB"]) {
  try {
    // The latest migration is a sufficient sentinel because migrations run in order.
    await d1.prepare(`SELECT
      deletion_requested_at,
      scheduled_deletion_at,
      deletion_requested_by_user_id
    FROM workspaces
    LIMIT 0`).first();
    await d1.prepare(`SELECT
      system_key,
      assignee_member_id
    FROM routines
    LIMIT 0`).first();
    await d1.prepare(`SELECT default_value, system_key, active FROM property_definitions LIMIT 0`).first();
    await d1.prepare(`SELECT version FROM project_documents LIMIT 0`).first();
    return true;
  } catch {
    return false;
  }
}

async function addColumnIfMissing(d1: RuntimeEnv["DB"], statement: string) {
  try {
    await d1.prepare(statement).run();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/duplicate column|already exists/i.test(message)) throw error;
  }
}

export async function ensureWorkspace(ownerId: string) {
  let ready = workspaceReady.get(ownerId);
  if (!ready) {
    ready = (async () => {
      await ensureSchema();
      await migrateLegacyHierarchy(ownerId);
      await removeLegacySeedWorkspaceData(ownerId);
      if (!await workspaceInitializationIsCurrent(ownerId)) {
        await seedProjectExecutionProperties(ownerId);
        await migrateLegacyItemAssignments(ownerId);
        await ensureActiveOkrCycle(ownerId);
      }
      await seedProjectExecutionProperties(ownerId);
      const general = await ensureGeneralRoutine(ownerId);
      await migrateInboxTasksToGeneral(ownerId, general.id);
      await migratePersonalWorkspaceAssignments(ownerId);
    })();
    workspaceReady.set(ownerId, ready);
    void ready.catch(() => workspaceReady.delete(ownerId));
  }
  await ready;
}

function generalRoutineId(ownerId: string) {
  return `general-${ownerId}`;
}

export async function ensureGeneralRoutine(ownerId: string) {
  const now = new Date().toISOString();
  await getDb().insert(routines).values({
    id: generalRoutineId(ownerId),
    ownerId,
    systemKey: GENERAL_ROUTINE_SYSTEM_KEY,
    assigneeMemberId: null,
    title: "General",
    description: "Project나 개별 Routine에 속하지 않는 일반 업무",
    cadence: "daily",
    active: true,
    sortOrder: -1000,
    createdAt: now,
    updatedAt: now,
  }).onConflictDoNothing();
  const [general] = await getDb()
    .select()
    .from(routines)
    .where(and(eq(routines.ownerId, ownerId), eq(routines.systemKey, GENERAL_ROUTINE_SYSTEM_KEY)))
    .limit(1);
  if (!general) throw new Error("General routine could not be initialized");
  return general;
}

async function migrateInboxTasksToGeneral(ownerId: string, routineId: string) {
  await getDb().update(items).set({
    routineId,
    cycleId: null,
    status: "todo",
    updatedAt: new Date().toISOString(),
  }).where(and(
    eq(items.ownerId, ownerId),
    eq(items.kind, "task"),
    isNull(items.parentId),
    isNull(items.routineId),
  ));
  await getDb().update(items).set({ status: "todo", updatedAt: new Date().toISOString() })
    .where(and(eq(items.ownerId, ownerId), eq(items.status, "inbox")));
  await getDb().update(items).set({ archivedFromStatus: "todo", updatedAt: new Date().toISOString() })
    .where(and(eq(items.ownerId, ownerId), eq(items.archivedFromStatus, "inbox")));
  await getDb().update(slackAutomations).set({ triggerStatus: "todo", updatedAt: new Date().toISOString() })
    .where(and(eq(slackAutomations.ownerId, ownerId), eq(slackAutomations.triggerStatus, "inbox")));
}

async function migratePersonalWorkspaceAssignments(ownerId: string) {
  const [workspace] = await getDb().select().from(workspaces).where(eq(workspaces.id, ownerId)).limit(1);
  if (!workspace || workspace.ownerUserId !== ownerId) return;
  const members = await getDb().select({ id: workspaceMembers.id }).from(workspaceMembers).where(and(
    eq(workspaceMembers.workspaceId, ownerId),
    eq(workspaceMembers.status, "active"),
  ));
  if (members.length !== 1) return;
  const memberId = members[0].id;
  const d1 = (env as RuntimeEnv).DB;
  const now = new Date().toISOString();
  await d1.batch([
    d1.prepare(`INSERT OR IGNORE INTO item_assignments
      (id, owner_id, item_id, member_id, role, created_at, updated_at)
      SELECT lower(hex(randomblob(16))), owner_id, id, ?,
        CASE kind WHEN 'project' THEN 'project_dri' ELSE 'task_assignee' END, ?, ?
      FROM items
      WHERE owner_id = ? AND kind IN ('project', 'task') AND archived_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM item_assignments AS assignment
          WHERE assignment.owner_id = items.owner_id AND assignment.item_id = items.id
            AND assignment.role = CASE items.kind WHEN 'project' THEN 'project_dri' ELSE 'task_assignee' END
        )`).bind(memberId, now, now, ownerId),
    d1.prepare(`UPDATE routines SET assignee_member_id = ?, updated_at = ?
      WHERE owner_id = ? AND system_key IS NULL AND assignee_member_id IS NULL`).bind(memberId, now, ownerId),
  ]);
}

async function workspaceInitializationIsCurrent(ownerId: string) {
  const rows = await getDb()
    .select({ name: propertyDefinitions.name })
    .from(propertyDefinitions)
    .where(and(
      eq(propertyDefinitions.ownerId, ownerId),
      inArray(propertyDefinitions.name, DEFAULT_PROJECT_EXECUTION_PROPERTIES.map((property) => property.name)),
    ));
  const names = new Set(rows.map((row) => row.name));
  return DEFAULT_PROJECT_EXECUTION_PROPERTIES.every((property) => names.has(property.name));
}

export async function listOkrCycles(ownerId: string) {
  await ensureSchema();
  await ensureActiveOkrCycle(ownerId);
  const rows = await getDb()
    .select()
    .from(okrCycles)
    .where(eq(okrCycles.ownerId, ownerId))
    .orderBy(desc(okrCycles.version), desc(okrCycles.createdAt));
  return rows.map(serializeOkrCycle);
}

export async function getActiveOkrCycle(ownerId: string) {
  await ensureSchema();
  return ensureActiveOkrCycle(ownerId);
}

export async function createOkrCycle(ownerId: string, input: { name?: string; department?: string; startDate?: string; endDate?: string; status?: OkrCycleStatus }) {
  await ensureSchema();
  const existing = await getDb().select().from(okrCycles).where(eq(okrCycles.ownerId, ownerId));
  const version = (existing.reduce((max, cycle) => Math.max(max, cycle.version), 0) || 0) + 1;
  const period = defaultQuarterPeriod(new Date());
  const [created] = await getDb()
    .insert(okrCycles)
    .values({
      id: crypto.randomUUID(),
      ownerId,
      name: normalizeCycleName(input.name, version, period),
      department: input.department?.trim() ?? "",
      version,
      startDate: input.startDate || period.startDate,
      endDate: input.endDate || period.endDate,
      status: input.status ?? "planned",
    })
    .returning();
  return serializeOkrCycle(created);
}

export async function updateOkrCycle(ownerId: string, id: string, patch: Partial<{ name: string; department: string; startDate: string; endDate: string; status: OkrCycleStatus }>) {
  await ensureSchema();
  if (patch.status !== undefined && !OKR_CYCLE_STATUSES.includes(patch.status)) throw new Error("Unsupported OKR cycle status");
  if (patch.status === "active") {
    await getDb()
      .update(okrCycles)
      .set({ status: "planned", updatedAt: new Date().toISOString() })
      .where(and(eq(okrCycles.ownerId, ownerId), eq(okrCycles.status, "active")));
  }
  const values = {
    name: patch.name?.trim(),
    department: patch.department?.trim(),
    startDate: patch.startDate,
    endDate: patch.endDate,
    status: patch.status,
    updatedAt: new Date().toISOString(),
  };
  const [updated] = await getDb()
    .update(okrCycles)
    .set(values)
    .where(and(eq(okrCycles.ownerId, ownerId), eq(okrCycles.id, id)))
    .returning();
  if (!updated) throw new Error("OKR cycle not found");
  return serializeOkrCycle(updated);
}

export async function deleteOkrCycle(ownerId: string, id: string) {
  await ensureSchema();
  const [[target], [countRow]] = await Promise.all([
    getDb().select().from(okrCycles).where(and(eq(okrCycles.ownerId, ownerId), eq(okrCycles.id, id))).limit(1),
    getDb().select({ count: sql<number>`count(*)` }).from(okrCycles).where(eq(okrCycles.ownerId, ownerId)),
  ]);
  if (!target) throw new Error("OKR cycle not found");
  if ((countRow?.count ?? 0) <= 1) throw new Error("At least one OKR file is required");

  await getDb()
    .update(items)
    .set({ cycleId: null, updatedAt: new Date().toISOString() })
    .where(and(eq(items.ownerId, ownerId), eq(items.cycleId, id)));
  await getDb().delete(okrCycles).where(and(eq(okrCycles.ownerId, ownerId), eq(okrCycles.id, id)));

  let nextActiveId: string | null = null;
  if (target.status === "active") {
    const [nextCycle] = await getDb()
      .select()
      .from(okrCycles)
      .where(eq(okrCycles.ownerId, ownerId))
      .orderBy(desc(okrCycles.version), desc(okrCycles.createdAt))
      .limit(1);
    if (nextCycle) {
      nextActiveId = nextCycle.id;
      await getDb()
        .update(okrCycles)
        .set({ status: "active", updatedAt: new Date().toISOString() })
        .where(and(eq(okrCycles.ownerId, ownerId), eq(okrCycles.id, nextCycle.id)));
    }
  }

  return { deletedId: id, nextActiveId };
}

export async function cleanupWorkspaceExecutionData(ownerId: string, createdByUserId: string | null = null) {
  await ensureSchema();
  const [itemCount, routineCount, cycleCount] = await Promise.all([
    getDb().select({ count: sql<number>`count(*)` }).from(items).where(eq(items.ownerId, ownerId)),
    getDb().select({ count: sql<number>`count(*)` }).from(routines).where(eq(routines.ownerId, ownerId)),
    getDb().select({ count: sql<number>`count(*)` }).from(okrCycles).where(eq(okrCycles.ownerId, ownerId)),
  ]);
  const protectedBefore = await protectedWorkspaceCounts(ownerId);
  const archivedRecord = await archiveWorkspaceExecutionData(ownerId, createdByUserId);

  await getDb().delete(slackAutomationDeliveries).where(eq(slackAutomationDeliveries.ownerId, ownerId));
  await getDb().delete(checklistItems).where(eq(checklistItems.ownerId, ownerId));
  await getDb().delete(itemAssignments).where(eq(itemAssignments.ownerId, ownerId));
  await getDb().delete(projectHiddenProperties).where(eq(projectHiddenProperties.ownerId, ownerId));
  await getDb().delete(itemPropertyValues).where(eq(itemPropertyValues.ownerId, ownerId));
  await getDb().delete(googleCalendarEvents).where(eq(googleCalendarEvents.ownerId, ownerId));
  await getDb().delete(activityLog).where(eq(activityLog.ownerId, ownerId));
  await getDb().delete(dailyScrums).where(eq(dailyScrums.ownerId, ownerId));
  await getDb().delete(routineCompletions).where(eq(routineCompletions.ownerId, ownerId));
  await getDb().delete(routines).where(eq(routines.ownerId, ownerId));
  await getDb().delete(items).where(eq(items.ownerId, ownerId));
  await getDb().delete(okrCycles).where(eq(okrCycles.ownerId, ownerId));

  const activeCycle = await ensureActiveOkrCycle(ownerId);
  const protectedAfter = await protectedWorkspaceCounts(ownerId);
  for (const key of Object.keys(protectedBefore) as Array<keyof typeof protectedBefore>) {
    if (protectedAfter[key] < protectedBefore[key]) {
      throw new Error("Cleanup touched protected workspace data");
    }
  }
  return {
    deletedItems: itemCount[0]?.count ?? 0,
    deletedRoutines: routineCount[0]?.count ?? 0,
    deletedCycles: cycleCount[0]?.count ?? 0,
    archivedRecord: archivedRecord ? serializeTrashRecord(archivedRecord) : null,
    protectedData: protectedAfter,
    activeCycle: serializeOkrCycle(activeCycle),
  };
}

async function archiveWorkspaceExecutionData(ownerId: string, createdByUserId: string | null) {
  const [
    itemRows,
    itemAssignmentRows,
    propertyValueRows,
    hiddenPropertyRows,
    checklistRows,
    calendarEventRows,
    activityRows,
    scrumRows,
    routineCompletionRows,
    routineRows,
    cycleRows,
  ] = await Promise.all([
    getDb().select().from(items).where(eq(items.ownerId, ownerId)),
    getDb().select().from(itemAssignments).where(eq(itemAssignments.ownerId, ownerId)),
    getDb().select().from(itemPropertyValues).where(eq(itemPropertyValues.ownerId, ownerId)),
    getDb().select().from(projectHiddenProperties).where(eq(projectHiddenProperties.ownerId, ownerId)),
    getDb().select().from(checklistItems).where(eq(checklistItems.ownerId, ownerId)),
    getDb().select().from(googleCalendarEvents).where(eq(googleCalendarEvents.ownerId, ownerId)),
    getDb().select().from(activityLog).where(eq(activityLog.ownerId, ownerId)),
    getDb().select().from(dailyScrums).where(eq(dailyScrums.ownerId, ownerId)),
    getDb().select().from(routineCompletions).where(eq(routineCompletions.ownerId, ownerId)),
    getDb().select().from(routines).where(eq(routines.ownerId, ownerId)),
    getDb().select().from(okrCycles).where(eq(okrCycles.ownerId, ownerId)),
  ]);
  if (!itemRows.length && !routineRows.length && !cycleRows.length && !scrumRows.length) return null;

  const archivedAt = new Date().toISOString();
  const [record] = await getDb()
    .insert(trashRecords)
    .values({
      id: crypto.randomUUID(),
      ownerId,
      category: "workspace_cleanup",
      title: `OKR cleanup ${archivedAt.slice(0, 10)}`,
      payload: JSON.stringify({
        items: itemRows,
        itemAssignments: itemAssignmentRows,
        itemPropertyValues: propertyValueRows,
        projectHiddenProperties: hiddenPropertyRows,
        checklistItems: checklistRows,
        googleCalendarEvents: calendarEventRows,
        activityLog: activityRows,
        dailyScrums: scrumRows,
        routineCompletions: routineCompletionRows,
        routines: routineRows,
        okrCycles: cycleRows,
      }),
      itemCount: itemRows.length,
      routineCount: routineRows.length,
      cycleCount: cycleRows.length,
      createdByUserId,
      archivedAt,
    })
    .returning();
  return record;
}

async function protectedWorkspaceCounts(ownerId: string) {
  const [
    workspaceCount,
    memberCount,
    groupCount,
    groupMemberCount,
    propertyCount,
    googleConnectionCount,
    slackConnectionCount,
    slackAutomationCount,
    trashRecordCount,
  ] = await Promise.all([
    getDb().select({ count: sql<number>`count(*)` }).from(workspaces).where(eq(workspaces.id, ownerId)),
    getDb().select({ count: sql<number>`count(*)` }).from(workspaceMembers).where(eq(workspaceMembers.workspaceId, ownerId)),
    getDb().select({ count: sql<number>`count(*)` }).from(workspaceGroups).where(eq(workspaceGroups.workspaceId, ownerId)),
    getDb()
      .select({ count: sql<number>`count(*)` })
      .from(workspaceGroupMembers)
      .innerJoin(workspaceGroups, eq(workspaceGroupMembers.groupId, workspaceGroups.id))
      .where(eq(workspaceGroups.workspaceId, ownerId)),
    getDb().select({ count: sql<number>`count(*)` }).from(propertyDefinitions).where(eq(propertyDefinitions.ownerId, ownerId)),
    getDb().select({ count: sql<number>`count(*)` }).from(googleConnections).where(eq(googleConnections.ownerId, ownerId)),
    getDb().select({ count: sql<number>`count(*)` }).from(slackConnections).where(eq(slackConnections.ownerId, ownerId)),
    getDb().select({ count: sql<number>`count(*)` }).from(slackAutomations).where(eq(slackAutomations.ownerId, ownerId)),
    getDb().select({ count: sql<number>`count(*)` }).from(trashRecords).where(eq(trashRecords.ownerId, ownerId)),
  ]);

  return {
    workspaces: workspaceCount[0]?.count ?? 0,
    members: memberCount[0]?.count ?? 0,
    groups: groupCount[0]?.count ?? 0,
    groupMembers: groupMemberCount[0]?.count ?? 0,
    properties: propertyCount[0]?.count ?? 0,
    googleConnections: googleConnectionCount[0]?.count ?? 0,
    slackConnections: slackConnectionCount[0]?.count ?? 0,
    slackAutomations: slackAutomationCount[0]?.count ?? 0,
    trashRecords: trashRecordCount[0]?.count ?? 0,
  };
}

export async function listTrashRecords(ownerId: string) {
  await ensureSchema();
  const rows = await getDb()
    .select()
    .from(trashRecords)
    .where(eq(trashRecords.ownerId, ownerId))
    .orderBy(desc(trashRecords.archivedAt))
    .limit(100);
  return rows.map(serializeTrashRecord);
}

export async function deleteTrashRecord(ownerId: string, id: string) {
  await ensureSchema();
  const [record] = await getDb()
    .delete(trashRecords)
    .where(and(eq(trashRecords.ownerId, ownerId), eq(trashRecords.id, id)))
    .returning();
  if (!record) throw new Error("Trash record not found");
  return serializeTrashRecord(record);
}

type WorkspaceCleanupArchive = {
  items: Array<typeof items.$inferInsert>;
  itemAssignments: Array<typeof itemAssignments.$inferInsert>;
  itemPropertyValues: Array<typeof itemPropertyValues.$inferInsert>;
  projectHiddenProperties: Array<typeof projectHiddenProperties.$inferInsert>;
  checklistItems: Array<typeof checklistItems.$inferInsert>;
  googleCalendarEvents: Array<typeof googleCalendarEvents.$inferInsert>;
  activityLog: Array<typeof activityLog.$inferInsert>;
  dailyScrums: Array<typeof dailyScrums.$inferInsert>;
  routineCompletions: Array<typeof routineCompletions.$inferInsert>;
  routines: Array<typeof routines.$inferInsert>;
  okrCycles: Array<typeof okrCycles.$inferInsert>;
};

export async function restoreTrashRecord(ownerId: string, id: string) {
  const [record] = await getDb().select().from(trashRecords).where(and(eq(trashRecords.ownerId, ownerId), eq(trashRecords.id, id))).limit(1);
  if (!record) throw new Error("Trash record not found");
  if (record.category !== "workspace_cleanup") throw new Error("This trash record cannot be restored");

  const payload = JSON.parse(record.payload) as Partial<WorkspaceCleanupArchive>;
  const [currentItems, currentRoutines, currentScrums] = await Promise.all([
    getDb().select({ count: sql<number>`count(*)` }).from(items).where(eq(items.ownerId, ownerId)),
    getDb().select({ count: sql<number>`count(*)` }).from(routines).where(eq(routines.ownerId, ownerId)),
    getDb().select({ count: sql<number>`count(*)` }).from(dailyScrums).where(eq(dailyScrums.ownerId, ownerId)),
  ]);
  if ((currentItems[0]?.count ?? 0) > 0 || (currentRoutines[0]?.count ?? 0) > 0 || (currentScrums[0]?.count ?? 0) > 0) {
    throw new Error("Restore requires an empty execution workspace");
  }

  await getDb().delete(okrCycles).where(eq(okrCycles.ownerId, ownerId));
  if (payload.okrCycles?.length) await getDb().insert(okrCycles).values(payload.okrCycles).onConflictDoNothing();
  if (payload.routines?.length) await getDb().insert(routines).values(payload.routines).onConflictDoNothing();
  if (payload.items?.length) await getDb().insert(items).values(payload.items).onConflictDoNothing();

  await Promise.all([
    payload.itemAssignments?.length ? getDb().insert(itemAssignments).values(payload.itemAssignments).onConflictDoNothing() : Promise.resolve(),
    payload.itemPropertyValues?.length ? getDb().insert(itemPropertyValues).values(payload.itemPropertyValues).onConflictDoNothing() : Promise.resolve(),
    payload.projectHiddenProperties?.length ? getDb().insert(projectHiddenProperties).values(payload.projectHiddenProperties).onConflictDoNothing() : Promise.resolve(),
    payload.checklistItems?.length ? getDb().insert(checklistItems).values(payload.checklistItems).onConflictDoNothing() : Promise.resolve(),
    payload.googleCalendarEvents?.length ? getDb().insert(googleCalendarEvents).values(payload.googleCalendarEvents).onConflictDoNothing() : Promise.resolve(),
    payload.activityLog?.length ? getDb().insert(activityLog).values(payload.activityLog).onConflictDoNothing() : Promise.resolve(),
    payload.dailyScrums?.length ? getDb().insert(dailyScrums).values(payload.dailyScrums).onConflictDoNothing() : Promise.resolve(),
    payload.routineCompletions?.length ? getDb().insert(routineCompletions).values(payload.routineCompletions).onConflictDoNothing() : Promise.resolve(),
  ]);
  await getDb().delete(trashRecords).where(and(eq(trashRecords.ownerId, ownerId), eq(trashRecords.id, id)));
  return serializeTrashRecord(record);
}

export function serializeTrashRecord(record: TrashRecord) {
  return {
    id: record.id,
    category: record.category,
    title: record.title,
    itemCount: record.itemCount,
    routineCount: record.routineCount,
    cycleCount: record.cycleCount,
    archivedAt: record.archivedAt,
  };
}

async function ensureActiveOkrCycle(ownerId: string) {
  const [active] = await getDb()
    .select()
    .from(okrCycles)
    .where(and(eq(okrCycles.ownerId, ownerId), eq(okrCycles.status, "active")))
    .orderBy(desc(okrCycles.version))
    .limit(1);
  if (active) return active;

  const existing = await getDb().select().from(okrCycles).where(eq(okrCycles.ownerId, ownerId));
  const version = (existing.reduce((max, cycle) => Math.max(max, cycle.version), 0) || 0) + 1;
  const period = defaultQuarterPeriod(new Date());
  const [created] = await getDb()
    .insert(okrCycles)
    .values({
      id: crypto.randomUUID(),
      ownerId,
      name: normalizeCycleName(undefined, version, period),
      version,
      startDate: period.startDate,
      endDate: period.endDate,
      status: "active",
    })
    .returning();
  return created;
}

async function defaultCycleIdForKind(ownerId: string, kind: ItemKind) {
  if (!okrKinds.has(kind)) return null;
  const cycle = await ensureActiveOkrCycle(ownerId);
  return cycle.id;
}

function serializeOkrCycle(cycle: OkrCycle) {
  return {
    id: cycle.id,
    name: cycle.name,
    department: cycle.department,
    version: cycle.version,
    startDate: cycle.startDate,
    endDate: cycle.endDate,
    status: cycle.status as OkrCycleStatus,
    createdAt: cycle.createdAt,
    updatedAt: cycle.updatedAt,
  };
}

function defaultQuarterPeriod(date: Date) {
  const year = date.getFullYear();
  const quarter = Math.floor(date.getMonth() / 3) + 1;
  const start = new Date(Date.UTC(year, (quarter - 1) * 3, 1));
  const end = new Date(Date.UTC(year, quarter * 3, 0));
  return {
    year,
    quarter,
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}

function normalizeCycleName(name: string | undefined, version: number, period: ReturnType<typeof defaultQuarterPeriod>) {
  return name?.trim() || `${period.year} Q${period.quarter} OKR v${version}`;
}

export async function getWorkspaceRules(ownerId: string) {
  const [saved] = await getDb().select().from(workspaceRules).where(eq(workspaceRules.workspaceId, ownerId)).limit(1);
  if (saved) return serializeWorkspaceRules(saved);
  const [created] = await getDb()
    .insert(workspaceRules)
    .values({
      workspaceId: ownerId,
      captureInstruction: "대화에서 나온 일은 우선 있는 그대로 잡고, 실행 구조가 명확할 때만 Project 또는 독립 Routine 아래 Task로 연결합니다.",
      structureInstruction: "OKR은 Objective > Key Result > Initiative > Project > Task로 정리합니다. Routine은 Project처럼 Task를 담는 실행 컨테이너지만 OKR 계층과 독립적으로 관리합니다.",
      routineInstruction: "루틴은 트리거 포인트, 어디서/어떤 도구로, 무엇을 어떻게 할지까지 함께 정리합니다.",
      defaultPriority: "medium",
      defaultCadence: "weekly",
      reviewBeforeCreate: true,
      configured: false,
    })
    .returning();
  return serializeWorkspaceRules(created);
}

export async function saveWorkspaceRules(ownerId: string, input: WorkspaceRuleInput) {
  const current = await getWorkspaceRules(ownerId);
  const defaultPriority = input.defaultPriority ?? current.defaultPriority;
  const defaultCadence = input.defaultCadence ?? current.defaultCadence;
  if (!ITEM_PRIORITIES.includes(defaultPriority)) throw new Error("Unsupported default priority");
  if (!ITEM_CADENCES.includes(defaultCadence)) throw new Error("Unsupported default cadence");
  const values = {
    captureInstruction: normalizeRuleText(input.captureInstruction ?? current.captureInstruction),
    structureInstruction: normalizeRuleText(input.structureInstruction ?? current.structureInstruction),
    routineInstruction: normalizeRuleText(input.routineInstruction ?? current.routineInstruction),
    defaultPriority,
    defaultCadence,
    reviewBeforeCreate: input.reviewBeforeCreate ?? current.reviewBeforeCreate,
    configured: input.configured ?? true,
    updatedAt: new Date().toISOString(),
  };
  const [saved] = await getDb()
    .insert(workspaceRules)
    .values({ workspaceId: ownerId, ...values })
    .onConflictDoUpdate({
      target: workspaceRules.workspaceId,
      set: values,
    })
    .returning();
  return serializeWorkspaceRules(saved);
}

function normalizeRuleText(value: string) {
  return value.trim().slice(0, 2000);
}

export function serializeWorkspaceRules(rule: WorkspaceRule) {
  return {
    workspaceId: rule.workspaceId,
    captureInstruction: rule.captureInstruction,
    structureInstruction: rule.structureInstruction,
    routineInstruction: rule.routineInstruction,
    defaultPriority: rule.defaultPriority as ItemPriority,
    defaultCadence: rule.defaultCadence as ItemCadence,
    reviewBeforeCreate: rule.reviewBeforeCreate,
    configured: rule.configured,
    createdAt: rule.createdAt,
    updatedAt: rule.updatedAt,
  };
}

export async function getAiUsageSummary(ownerId: string, userId: string): Promise<AiUsageSummary> {
  await ensureSchema();
  const ownerAndUser = and(eq(aiUsageEvents.ownerId, ownerId), eq(aiUsageEvents.userId, userId));
  const [lifetime] = await getDb()
    .select({ spentWonMicros: sql<number>`coalesce(sum(${aiUsageEvents.estimatedCostWonMicros}), 0)` })
    .from(aiUsageEvents)
    .where(ownerAndUser);
  const [today] = await getDb()
    .select({ requestsToday: sql<number>`count(*)` })
    .from(aiUsageEvents)
    .where(and(ownerAndUser, sql`${aiUsageEvents.createdAt} >= datetime('now', 'start of day')`));
  const [minute] = await getDb()
    .select({ requestsThisMinute: sql<number>`count(*)` })
    .from(aiUsageEvents)
    .where(and(ownerAndUser, sql`${aiUsageEvents.createdAt} >= datetime('now', '-1 minute')`));
  return {
    spentWonMicros: Number(lifetime?.spentWonMicros ?? 0),
    requestsToday: Number(today?.requestsToday ?? 0),
    requestsThisMinute: Number(minute?.requestsThisMinute ?? 0),
  };
}

export async function recordAiUsageEvent(input: {
  ownerId: string;
  userId: string;
  model: string;
  source?: string;
  inputChars: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCostWonMicros: number;
}) {
  await ensureSchema();
  await getDb().insert(aiUsageEvents).values({
    id: crypto.randomUUID(),
    ownerId: input.ownerId,
    userId: input.userId,
    model: input.model,
    source: input.source ?? "web",
    inputChars: Math.max(0, Math.round(input.inputChars)),
    inputTokens: Math.max(0, Math.round(input.inputTokens)),
    outputTokens: Math.max(0, Math.round(input.outputTokens)),
    estimatedCostWonMicros: Math.max(0, Math.round(input.estimatedCostWonMicros)),
  });
}

export async function createGoogleOAuthState(ownerId: string, userId: string, returnTo = "/") {
  await ensureSchema();
  const state = crypto.randomUUID();
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const d1 = (env as RuntimeEnv).DB;
  await d1.batch([
    d1.prepare("DELETE FROM google_oauth_states WHERE expires_at <= ?").bind(now),
    d1.prepare(`INSERT INTO google_oauth_states (state, owner_id, user_id, return_to, expires_at)
      VALUES (?, ?, ?, ?, ?)`).bind(state, ownerId, userId, normalizeReturnTo(returnTo), expiresAt),
  ]);
  return state;
}

export async function consumeGoogleOAuthState(state: string) {
  await ensureSchema();
  const [saved] = await getDb().delete(googleOAuthStates).where(eq(googleOAuthStates.state, state)).returning();
  if (!saved) return null;
  if (saved.expiresAt <= new Date().toISOString()) return null;
  return saved;
}

export async function getGoogleConnection(ownerId: string, userId: string) {
  await ensureSchema();
  const [connection] = await getDb()
    .select()
    .from(googleConnections)
    .where(and(eq(googleConnections.ownerId, ownerId), eq(googleConnections.userId, userId)))
    .limit(1);
  return connection ?? null;
}

export async function saveGoogleConnection(input: {
  ownerId: string;
  userId: string;
  googleAccountId: string;
  email: string;
  displayName: string;
  encryptedRefreshToken: string;
  scope: string;
}) {
  await ensureSchema();
  const now = new Date().toISOString();
  const values = {
    googleAccountId: input.googleAccountId,
    email: input.email,
    displayName: input.displayName,
    encryptedRefreshToken: input.encryptedRefreshToken,
    scope: input.scope,
    updatedAt: now,
  };
  const [connection] = await getDb()
    .insert(googleConnections)
    .values({
      id: crypto.randomUUID(),
      ownerId: input.ownerId,
      userId: input.userId,
      connectedAt: now,
      ...values,
    })
    .onConflictDoUpdate({
      target: [googleConnections.ownerId, googleConnections.userId],
      set: values,
    })
    .returning();
  return connection;
}

export async function deleteGoogleConnection(ownerId: string, userId: string) {
  await ensureSchema();
  const current = await getGoogleConnection(ownerId, userId);
  await getDb().delete(googleConnections).where(and(eq(googleConnections.ownerId, ownerId), eq(googleConnections.userId, userId)));
  return current;
}

export function serializeGoogleConnection(connection: GoogleConnection | null, configured: boolean) {
  return {
    configured,
    connected: Boolean(connection),
    email: connection?.email ?? null,
    displayName: connection?.displayName ?? null,
    scope: connection?.scope ?? "",
    connectedAt: connection?.connectedAt ?? null,
    updatedAt: connection?.updatedAt ?? null,
  };
}

export async function getGoogleCalendarEvent(ownerId: string, userId: string, itemId: string) {
  await ensureSchema();
  const [event] = await getDb()
    .select()
    .from(googleCalendarEvents)
    .where(and(eq(googleCalendarEvents.ownerId, ownerId), eq(googleCalendarEvents.userId, userId), eq(googleCalendarEvents.itemId, itemId)))
    .limit(1);
  return event ?? null;
}

export async function saveGoogleCalendarEvent(input: {
  ownerId: string;
  userId: string;
  itemId: string;
  calendarId: string;
  googleEventId: string;
  htmlLink: string;
}) {
  await ensureSchema();
  const syncedAt = new Date().toISOString();
  const values = {
    calendarId: input.calendarId,
    googleEventId: input.googleEventId,
    htmlLink: input.htmlLink,
    syncedAt,
  };
  const [event] = await getDb()
    .insert(googleCalendarEvents)
    .values({
      id: crypto.randomUUID(),
      ownerId: input.ownerId,
      userId: input.userId,
      itemId: input.itemId,
      ...values,
    })
    .onConflictDoUpdate({
      target: [googleCalendarEvents.ownerId, googleCalendarEvents.userId, googleCalendarEvents.itemId],
      set: values,
    })
    .returning();
  return event;
}

export async function createSlackOAuthState(ownerId: string, userId: string, returnTo = "/") {
  await ensureSchema();
  const state = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  await getDb().delete(slackOAuthStates).where(lte(slackOAuthStates.expiresAt, new Date().toISOString()));
  await getDb().insert(slackOAuthStates).values({
    state,
    ownerId,
    userId,
    returnTo: normalizeReturnTo(returnTo),
    expiresAt,
  });
  return state;
}

export async function consumeSlackOAuthState(state: string) {
  await ensureSchema();
  const [saved] = await getDb().select().from(slackOAuthStates).where(eq(slackOAuthStates.state, state)).limit(1);
  if (!saved) return null;
  await getDb().delete(slackOAuthStates).where(eq(slackOAuthStates.state, state));
  if (saved.expiresAt <= new Date().toISOString()) return null;
  return saved;
}

export async function getSlackConnection(ownerId: string) {
  await ensureSchema();
  const [row] = await getDb()
    .select({ connection: slackConnections })
    .from(slackConnections)
    .innerJoin(workspaces, eq(slackConnections.ownerId, workspaces.id))
    .where(and(
      eq(slackConnections.ownerId, ownerId),
      isNull(workspaces.scheduledDeletionAt),
    ))
    .orderBy(desc(slackConnections.updatedAt))
    .limit(1);
  return row?.connection ?? null;
}

export async function getSlackConnectionByTeam(teamId: string) {
  await ensureSchema();
  const [row] = await getDb()
    .select({ connection: slackConnections })
    .from(slackConnections)
    .innerJoin(workspaces, eq(slackConnections.ownerId, workspaces.id))
    .where(and(
      eq(slackConnections.teamId, teamId),
      isNull(workspaces.scheduledDeletionAt),
    ))
    .limit(1);
  return row?.connection ?? null;
}

export async function saveSlackConnection(input: {
  ownerId: string;
  userId: string;
  teamId: string;
  teamName: string;
  botUserId: string;
  appId: string;
  encryptedBotToken: string;
  scope: string;
}) {
  await ensureSchema();
  const now = new Date().toISOString();
  const values = {
    userId: input.userId,
    teamId: input.teamId,
    teamName: input.teamName,
    botUserId: input.botUserId,
    appId: input.appId,
    encryptedBotToken: input.encryptedBotToken,
    scope: input.scope,
    updatedAt: now,
  };
  await getDb().delete(slackConnections).where(eq(slackConnections.ownerId, input.ownerId));
  const [connection] = await getDb()
    .insert(slackConnections)
    .values({
      id: crypto.randomUUID(),
      ownerId: input.ownerId,
      connectedAt: now,
      ...values,
    })
    .onConflictDoUpdate({
      target: slackConnections.teamId,
      set: { ...values, ownerId: input.ownerId },
    })
    .returning();
  return connection;
}

export async function deleteSlackConnection(ownerId: string) {
  await ensureSchema();
  const current = await getSlackConnection(ownerId);
  await getDb().delete(slackConnections).where(eq(slackConnections.ownerId, ownerId));
  return current;
}

export function serializeSlackConnection(connection: SlackConnection | null, configured: boolean, urls: { redirectUrl: string; commandUrl: string }) {
  return {
    configured,
    connected: Boolean(connection),
    teamName: connection?.teamName ?? null,
    teamId: connection?.teamId ?? null,
    botUserId: connection?.botUserId ?? null,
    scope: connection?.scope ?? "",
    connectedAt: connection?.connectedAt ?? null,
    updatedAt: connection?.updatedAt ?? null,
    redirectUrl: urls.redirectUrl,
    commandUrl: urls.commandUrl,
  };
}

export type SlackAutomationInput = {
  name?: string;
  triggerType?: string;
  triggerStatus?: string;
  channelId?: string;
  messageTemplate?: string;
  active?: boolean;
};

export async function listSlackAutomations(ownerId: string) {
  await ensureSchema();
  const rows = await getDb()
    .select()
    .from(slackAutomations)
    .where(eq(slackAutomations.ownerId, ownerId))
    .orderBy(desc(slackAutomations.createdAt));
  return rows.map(serializeSlackAutomation);
}

export async function listSlackAutomationDeliveries(ownerId: string, limit = 20) {
  await ensureSchema();
  const rows = await getDb()
    .select()
    .from(slackAutomationDeliveries)
    .where(eq(slackAutomationDeliveries.ownerId, ownerId))
    .orderBy(desc(slackAutomationDeliveries.createdAt))
    .limit(Math.min(Math.max(limit, 1), 50));
  return rows.map(serializeSlackAutomationDelivery);
}

export async function createSlackAutomation(ownerId: string, userId: string, input: SlackAutomationInput) {
  await ensureSchema();
  if (!await getSlackConnection(ownerId)) throw new Error("Slack을 먼저 연결해 주세요");
  const requestedTrigger = input.triggerType?.trim();
  const values = validateSlackAutomationInput({
    ...input,
    messageTemplate: input.messageTemplate?.trim() || (requestedTrigger && isSlackAutomationTrigger(requestedTrigger) ? defaultSlackAutomationTemplate(requestedTrigger) : undefined),
  }, false);
  const now = new Date().toISOString();
  const [created] = await getDb().insert(slackAutomations).values({
    id: crypto.randomUUID(),
    ownerId,
    createdByUserId: userId,
    name: values.name!,
    triggerType: values.triggerType!,
    triggerStatus: values.triggerStatus!,
    channelId: values.channelId!,
    messageTemplate: values.messageTemplate!,
    active: values.active ?? true,
    createdAt: now,
    updatedAt: now,
  }).returning();
  return serializeSlackAutomation(created);
}

export async function updateSlackAutomation(ownerId: string, id: string, input: SlackAutomationInput) {
  await ensureSchema();
  const current = await getSlackAutomation(ownerId, id);
  if (!current) throw new Error("Slack 자동화를 찾을 수 없습니다");
  const next = validateSlackAutomationInput({
    name: input.name ?? current.name,
    triggerType: input.triggerType ?? current.triggerType,
    triggerStatus: input.triggerStatus ?? current.triggerStatus,
    channelId: input.channelId ?? current.channelId,
    messageTemplate: input.messageTemplate ?? current.messageTemplate,
    active: input.active ?? current.active,
  }, false);
  const [updated] = await getDb().update(slackAutomations).set({
    name: next.name,
    triggerType: next.triggerType,
    triggerStatus: next.triggerStatus,
    channelId: next.channelId,
    messageTemplate: next.messageTemplate,
    active: next.active,
    updatedAt: new Date().toISOString(),
  }).where(and(eq(slackAutomations.ownerId, ownerId), eq(slackAutomations.id, id))).returning();
  return serializeSlackAutomation(updated);
}

export async function deleteSlackAutomation(ownerId: string, id: string) {
  await ensureSchema();
  const [deleted] = await getDb().delete(slackAutomations)
    .where(and(eq(slackAutomations.ownerId, ownerId), eq(slackAutomations.id, id)))
    .returning();
  if (!deleted) throw new Error("Slack 자동화를 찾을 수 없습니다");
  return { deleted: true, id };
}

export async function testSlackAutomation(ownerId: string, id: string) {
  await ensureSchema();
  const automation = await getSlackAutomation(ownerId, id);
  if (!automation) throw new Error("Slack 자동화를 찾을 수 없습니다");
  const workspace = await getWorkspaceName(ownerId);
  const context: SlackAutomationContext = {
    title: "Slack 자동화 테스트 업무",
    status: automation.triggerStatus || "in_progress",
    fromStatus: "todo",
    priority: "high",
    kind: "task",
    workspace,
  };
  const delivery = await deliverSlackAutomation(automation, context, null, `test:${ownerId}:${automation.id}:${crypto.randomUUID()}`, "test");
  if (!delivery) throw new Error("테스트 전송을 시작하지 못했습니다");
  if (delivery.status === "failed") throw new Error(delivery.error);
  return serializeSlackAutomationDelivery(delivery);
}

export async function dispatchSlackAutomationEvent(ownerId: string, event: {
  triggerType: SlackAutomationTrigger;
  item: PaceItem;
  fromStatus?: string | null;
}) {
  if (event.item.kind !== "task") return;
  try {
    await ensureSchema();
    const automations = await getDb().select().from(slackAutomations).where(and(
      eq(slackAutomations.ownerId, ownerId),
      eq(slackAutomations.active, true),
      eq(slackAutomations.triggerType, event.triggerType),
    ));
    if (!automations.length) return;
    const workspace = await getWorkspaceName(ownerId);
    const context: SlackAutomationContext = {
      title: event.item.title,
      status: event.item.status,
      fromStatus: event.fromStatus,
      priority: event.item.priority,
      kind: event.item.kind,
      workspace,
    };
    for (const automation of automations) {
      if (!slackAutomationMatches(automation, { triggerType: event.triggerType, status: event.item.status })) continue;
      const eventKey = `${ownerId}:${event.triggerType}:${automation.id}:${event.item.id}:${event.fromStatus ?? ""}:${event.item.status}:${event.item.updatedAt}`;
      await deliverSlackAutomation(automation, context, event.item.id, eventKey, event.triggerType);
    }
  } catch (error) {
    console.error("Slack automation dispatch failed", error);
  }
}

function validateSlackAutomationInput(input: SlackAutomationInput, partial: boolean) {
  const name = input.name?.trim();
  if (!partial && !name) throw new Error("자동화 이름을 입력해 주세요");
  if (name && name.length > 80) throw new Error("자동화 이름은 80자 이하여야 합니다");
  const triggerType = input.triggerType?.trim();
  if (!partial && (!triggerType || !isSlackAutomationTrigger(triggerType))) throw new Error("지원하지 않는 트리거입니다");
  if (triggerType && !isSlackAutomationTrigger(triggerType)) throw new Error("지원하지 않는 트리거입니다");
  const triggerStatus = triggerType === "task_status_changed" ? input.triggerStatus?.trim() ?? "" : "";
  if (triggerStatus && !ITEM_STATUSES.includes(triggerStatus as ItemStatus)) throw new Error("지원하지 않는 업무 상태입니다");
  const channelId = input.channelId === undefined && partial ? undefined : normalizeSlackChannelId(input.channelId ?? "");
  const messageTemplate = input.messageTemplate?.trim();
  if (!partial && !messageTemplate) throw new Error("Slack 메시지를 입력해 주세요");
  if (messageTemplate && messageTemplate.length > 3000) throw new Error("Slack 메시지는 3,000자 이하여야 합니다");
  return { name, triggerType, triggerStatus, channelId, messageTemplate, active: input.active };
}

async function getSlackAutomation(ownerId: string, id: string) {
  const [automation] = await getDb().select().from(slackAutomations)
    .where(and(eq(slackAutomations.ownerId, ownerId), eq(slackAutomations.id, id))).limit(1);
  return automation ?? null;
}

async function getWorkspaceName(ownerId: string) {
  const [workspace] = await getDb().select({ name: workspaces.name }).from(workspaces).where(eq(workspaces.id, ownerId)).limit(1);
  return workspace?.name ?? "OKRPTR";
}

async function deliverSlackAutomation(
  automation: SlackAutomation,
  context: SlackAutomationContext,
  itemId: string | null,
  eventKey: string,
  triggerType: string,
) {
  const now = new Date().toISOString();
  const message = renderSlackAutomationMessage(automation.messageTemplate, context);
  const [delivery] = await getDb().insert(slackAutomationDeliveries).values({
    id: crypto.randomUUID(),
    ownerId: automation.ownerId,
    automationId: automation.id,
    itemId,
    eventKey,
    triggerType,
    channelId: automation.channelId,
    message,
    status: "pending",
    createdAt: now,
  }).onConflictDoNothing({ target: slackAutomationDeliveries.eventKey }).returning();
  if (!delivery) return null;

  try {
    const runtime = env as RuntimeEnv;
    const connection = await getSlackConnection(automation.ownerId);
    if (!connection) throw new Error("Slack 연결이 끊어졌습니다. 다시 연결해 주세요.");
    if (!runtime.SLACK_TOKEN_ENCRYPTION_KEY) throw new Error("Slack 암호화 설정이 없습니다");
    const token = await decryptSlackSecret(connection.encryptedBotToken, runtime.SLACK_TOKEN_ENCRYPTION_KEY);
    await postSlackMessage(token, automation.channelId, message);
    const sentAt = new Date().toISOString();
    const [sent] = await getDb().update(slackAutomationDeliveries).set({ status: "sent", sentAt, error: "" })
      .where(eq(slackAutomationDeliveries.id, delivery.id)).returning();
    await getDb().update(slackAutomations).set({ lastTriggeredAt: sentAt, lastDeliveryStatus: "sent", lastError: "", updatedAt: sentAt })
      .where(eq(slackAutomations.id, automation.id));
    return sent;
  } catch (error) {
    const message = (error instanceof Error ? error.message : String(error)).slice(0, 500);
    const failedAt = new Date().toISOString();
    const [failed] = await getDb().update(slackAutomationDeliveries).set({ status: "failed", error: message })
      .where(eq(slackAutomationDeliveries.id, delivery.id)).returning();
    await getDb().update(slackAutomations).set({ lastTriggeredAt: failedAt, lastDeliveryStatus: "failed", lastError: message, updatedAt: failedAt })
      .where(eq(slackAutomations.id, automation.id));
    return failed;
  }
}

function serializeSlackAutomation(automation: SlackAutomation) {
  return {
    id: automation.id,
    name: automation.name,
    triggerType: automation.triggerType,
    triggerStatus: automation.triggerStatus,
    channelId: automation.channelId,
    messageTemplate: automation.messageTemplate,
    active: automation.active,
    lastTriggeredAt: automation.lastTriggeredAt,
    lastDeliveryStatus: automation.lastDeliveryStatus,
    lastError: automation.lastError,
    createdAt: automation.createdAt,
    updatedAt: automation.updatedAt,
  };
}

function serializeSlackAutomationDelivery(delivery: SlackAutomationDelivery) {
  return {
    id: delivery.id,
    automationId: delivery.automationId,
    itemId: delivery.itemId,
    triggerType: delivery.triggerType,
    channelId: delivery.channelId,
    message: delivery.message,
    status: delivery.status,
    error: delivery.error,
    createdAt: delivery.createdAt,
    sentAt: delivery.sentAt,
  };
}

export async function createIntegrationToken(
  authorization: RequestAuthorization,
  name = "Codex",
) {
  await ensureSchema();
  const token = `okrptr_${randomTokenPart(32)}`;
  const now = new Date().toISOString();
  const [record] = await getDb().insert(integrationTokens).values({
    id: crypto.randomUUID(),
    workspaceId: authorization.ownerId,
    userId: authorization.userId,
    name: name.trim().slice(0, 50) || "Codex",
    tokenHash: await hashIntegrationToken(token),
    tokenPrefix: `${token.slice(0, 14)}...`,
    createdAt: now,
  }).returning();
  const activeTokens = await getDb().select({ id: integrationTokens.id }).from(integrationTokens).where(and(
    eq(integrationTokens.workspaceId, authorization.ownerId),
    eq(integrationTokens.userId, authorization.userId),
    isNull(integrationTokens.revokedAt),
  )).orderBy(desc(integrationTokens.createdAt));
  const staleIds = activeTokens.slice(10).map((entry) => entry.id);
  if (staleIds.length) {
    await getDb().update(integrationTokens).set({ revokedAt: now }).where(inArray(integrationTokens.id, staleIds));
  }
  return { token, connection: serializeIntegrationToken(record) };
}

export async function listIntegrationTokens(authorization: RequestAuthorization) {
  await ensureSchema();
  const rows = await getDb().select().from(integrationTokens).where(and(
    eq(integrationTokens.workspaceId, authorization.ownerId),
    eq(integrationTokens.userId, authorization.userId),
    isNull(integrationTokens.revokedAt),
  )).orderBy(desc(integrationTokens.createdAt));
  return rows.map(serializeIntegrationToken);
}

export async function revokeIntegrationTokens(authorization: RequestAuthorization, id?: string) {
  await ensureSchema();
  const now = new Date().toISOString();
  const baseCondition = and(
    eq(integrationTokens.workspaceId, authorization.ownerId),
    eq(integrationTokens.userId, authorization.userId),
    isNull(integrationTokens.revokedAt),
  );
  const condition = id ? and(baseCondition, eq(integrationTokens.id, id)) : baseCondition;
  const revoked = await getDb().update(integrationTokens).set({ revokedAt: now }).where(condition).returning({ id: integrationTokens.id });
  return { revoked: revoked.length, ids: revoked.map((entry) => entry.id) };
}

function serializeIntegrationToken(record: IntegrationToken): IntegrationTokenSummary {
  return {
    id: record.id,
    name: record.name,
    tokenPrefix: record.tokenPrefix,
    createdAt: record.createdAt,
    lastUsedAt: record.lastUsedAt,
    revokedAt: record.revokedAt,
  };
}

function randomTokenPart(byteLength: number) {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function hashIntegrationToken(token: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function authorizeRequest(
  request: Request,
  options: { allowViewerWrite?: boolean } = {},
): Promise<RequestAuthorization | Response> {
  const userId = request.headers.get("oai-authenticated-user-id");
  const configuredToken = (env as RuntimeEnv).OKRPTR_API_TOKEN ?? (env as RuntimeEnv).OKITA_API_TOKEN ?? (env as RuntimeEnv).PACE_API_TOKEN;
  const suppliedToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (suppliedToken?.startsWith("okrptr_")) {
    await ensureSchema();
    const [tokenRow] = await getDb()
      .select({ token: integrationTokens })
      .from(integrationTokens)
      .innerJoin(workspaces, eq(integrationTokens.workspaceId, workspaces.id))
      .where(and(
        eq(integrationTokens.tokenHash, await hashIntegrationToken(suppliedToken)),
        isNull(integrationTokens.revokedAt),
        isNull(workspaces.scheduledDeletionAt),
      ))
      .limit(1);
    const token = tokenRow?.token;
    if (token) {
      await getDb().update(integrationTokens).set({ lastUsedAt: new Date().toISOString() }).where(eq(integrationTokens.id, token.id));
      const [membership] = await getDb().select().from(workspaceMembers).where(and(
        eq(workspaceMembers.workspaceId, token.workspaceId),
        eq(workspaceMembers.userId, token.userId),
        eq(workspaceMembers.status, "active"),
      )).limit(1);
      if (!membership) {
        return Response.json({ error: "This OKRPTR connection no longer has workspace access." }, { status: 403 });
      }
      const role = membership.role as TeamRole;
      if (!options.allowViewerWrite && role === "viewer" && !["GET", "HEAD", "OPTIONS"].includes(request.method)) {
        return Response.json({ error: "Viewer access is read-only." }, { status: 403 });
      }
      return {
        ownerId: token.workspaceId,
        userId: token.userId,
        email: membership.email,
        displayName: membership.displayName,
        role,
        apiToken: true,
      };
    }
  }
  if (configuredToken && suppliedToken === configuredToken) {
    const ownerId = requestedWorkspaceId(request) || request.headers.get("x-okrptr-user-id") || request.headers.get("x-okita-user-id") || request.headers.get("x-pace-user-id") || "api-workspace";
    await ensureWorkspaceShell(ownerId, null, "API");
    return { ownerId, userId: "api-token", email: null, displayName: "API", role: "owner", apiToken: true };
  }

  const hostname = new URL(request.url).hostname;
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    await ensureSchema();
    const membership = await resolveWorkspaceMembership("local-user", "local@okrptr.com", "Local Owner", requestedWorkspaceId(request));
    return { ownerId: membership?.workspaceId ?? "local-user", userId: "local-user", email: "local@okrptr.com", displayName: "Local Owner", role: (membership?.role as TeamRole | undefined) ?? "owner", apiToken: false };
  }

  if (userId) {
    try {
      await ensureSchema();
      const email = normalizeEmail(request.headers.get("oai-authenticated-user-email"));
      const displayName = cleanDisplayName(authenticatedDisplayName(request)) || email?.split("@")[0] || "Member";
      const membership = await resolveWorkspaceMembership(userId, email, displayName, requestedWorkspaceId(request));
      if (!membership || membership.status !== "active") {
        return Response.json({ error: "This account is not an active workspace member." }, { status: 403 });
      }
      const role = membership.role as TeamRole;
      if (!options.allowViewerWrite && role === "viewer" && !["GET", "HEAD", "OPTIONS"].includes(request.method)) {
        return Response.json({ error: "Viewer access is read-only." }, { status: 403 });
      }
      return { ownerId: membership.workspaceId, userId, email, displayName: membership.displayName, role, apiToken: false };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to resolve workspace access.";
      return Response.json({ error: message }, { status: 500 });
    }
  }

  const googleSession = await readGoogleSession(request, (env as RuntimeEnv).GOOGLE_TOKEN_ENCRYPTION_KEY);
  if (googleSession) {
    try {
      await ensureSchema();
      const canonicalUserId = await canonicalUserIdForGoogle(googleSession.sub, googleSession.email);
      const membership = await resolveWorkspaceMembership(canonicalUserId, googleSession.email, googleSession.name, requestedWorkspaceId(request));
      if (!membership || membership.status !== "active") {
        return Response.json({ error: "This Google account is not an active workspace member." }, { status: 403 });
      }
      const role = membership.role as TeamRole;
      if (!options.allowViewerWrite && role === "viewer" && !["GET", "HEAD", "OPTIONS"].includes(request.method)) {
        return Response.json({ error: "Viewer access is read-only." }, { status: 403 });
      }
      return { ownerId: membership.workspaceId, userId: canonicalUserId, email: googleSession.email, displayName: membership.displayName, role, apiToken: false };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to resolve Google workspace access.";
      return Response.json({ error: message }, { status: 500 });
    }
  }

  return Response.json(
    { error: "Authentication required. Sign in or provide an OKRPTR API token." },
    { status: 401, headers: { "WWW-Authenticate": "Bearer" } },
  );
}

async function canonicalUserIdForGoogle(subject: string, email: string) {
  const matches = await getDb().select().from(workspaceMembers).where(and(
    sql`lower(${workspaceMembers.email}) = ${email.toLocaleLowerCase()}`,
    eq(workspaceMembers.status, "active"),
  )).orderBy(asc(workspaceMembers.createdAt));
  return matches.find((entry) => entry.userId)?.userId ?? `google:${subject}`;
}

async function ensureWorkspaceShell(ownerId: string, email: string | null = null, displayName = "Workspace Owner") {
  const now = new Date().toISOString();
  const workspaceName = displayName && displayName !== "Workspace Owner" ? `${displayName}의 개인 워크스페이스` : "개인 워크스페이스";
  await getDb().insert(workspaces).values({ id: ownerId, name: workspaceName, ownerUserId: ownerId, createdAt: now, updatedAt: now }).onConflictDoNothing();
  const [personalWorkspace] = await getDb().select().from(workspaces).where(and(eq(workspaces.id, ownerId), eq(workspaces.ownerUserId, ownerId))).limit(1);
  if (personalWorkspace && (personalWorkspace.name === "OKRPTR Workspace" || personalWorkspace.name.endsWith(" Workspace"))) {
    await getDb().update(workspaces).set({ name: workspaceName, updatedAt: now }).where(eq(workspaces.id, ownerId));
  }
  await getDb().insert(workspaceMembers).values({
    id: crypto.randomUUID(),
    workspaceId: ownerId,
    userId: ownerId,
    email,
    displayName,
    role: "owner",
    status: "active",
    createdAt: now,
    updatedAt: now,
  }).onConflictDoNothing();
}

async function resolveWorkspaceMembership(userId: string, email: string | null, displayName: string, requestedId: string | null) {
  const [initialMemberships, invitations, preferenceRows] = await Promise.all([
    activeWorkspaceMemberships(userId),
    email
      ? getDb().select().from(workspaceMembers).where(and(eq(workspaceMembers.email, email), eq(workspaceMembers.status, "invited"))).orderBy(asc(workspaceMembers.createdAt))
      : Promise.resolve([]),
    getDb().select().from(userWorkspacePreferences).where(eq(userWorkspacePreferences.userId, userId)).limit(1),
  ]);
  let memberships = initialMemberships;
  if (!memberships.length) {
    await ensureWorkspaceShell(userId, email, displayName);
    memberships = await activeWorkspaceMemberships(userId);
  }

  const activatedWorkspaceIds: string[] = [];
  if (email) {
    for (const invitation of invitations) {
      const [existingMembership] = await getDb().select().from(workspaceMembers).where(and(eq(workspaceMembers.workspaceId, invitation.workspaceId), eq(workspaceMembers.userId, userId))).limit(1);
      if (existingMembership) continue;
      await getDb().update(workspaceMembers).set({
        userId,
        displayName: displayNameForExistingMember(invitation.displayName, displayName, email),
        status: "active",
        updatedAt: new Date().toISOString(),
      }).where(eq(workspaceMembers.id, invitation.id));
      activatedWorkspaceIds.push(invitation.workspaceId);
    }
  }

  if (activatedWorkspaceIds.length) memberships = await activeWorkspaceMemberships(userId);
  const now = new Date().toISOString();
  const normalizedMemberships = memberships.map((membership) => ({
    ...membership,
    email,
    displayName: displayNameForExistingMember(membership.displayName, displayName, email),
  }));
  for (const membership of normalizedMemberships) {
    const previous = memberships.find((entry) => entry.id === membership.id);
    if (previous?.email === membership.email && previous.displayName === membership.displayName) continue;
    await getDb().update(workspaceMembers).set({ email: membership.email, displayName: membership.displayName, updatedAt: now }).where(eq(workspaceMembers.id, membership.id));
  }
  const [preference] = preferenceRows;
  const newlyJoined = [...activatedWorkspaceIds].reverse().find((workspaceId) => normalizedMemberships.some((entry) => entry.workspaceId === workspaceId));
  const selected = (newlyJoined ? normalizedMemberships.find((entry) => entry.workspaceId === newlyJoined) : null)
    ?? normalizedMemberships.find((entry) => entry.workspaceId === requestedId)
    ?? normalizedMemberships.find((entry) => entry.workspaceId === preference?.activeWorkspaceId)
    ?? normalizedMemberships.find((entry) => entry.workspaceId === userId)
    ?? normalizedMemberships[0]
    ?? null;
  if (newlyJoined && selected) {
    await getDb().insert(userWorkspacePreferences).values({ userId, activeWorkspaceId: selected.workspaceId, updatedAt: now }).onConflictDoUpdate({
      target: userWorkspacePreferences.userId,
      set: { activeWorkspaceId: selected.workspaceId, updatedAt: now },
    });
  }
  return selected;
}

async function activeWorkspaceMemberships(userId: string) {
  const rows = await getDb()
    .select({ membership: workspaceMembers })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaceMembers.workspaceId, workspaces.id))
    .where(and(
      eq(workspaceMembers.userId, userId),
      eq(workspaceMembers.status, "active"),
      isNull(workspaces.scheduledDeletionAt),
    ))
    .orderBy(asc(workspaceMembers.createdAt));
  return rows.map((row) => row.membership);
}

function requestedWorkspaceId(request: Request) {
  const header = request.headers.get("x-okrptr-workspace-id")?.trim();
  if (header) return header;
  const cookie = request.headers.get("cookie")
    ?.split(";")
    .map((entry) => entry.trim().split("="))
    .find(([name]) => name === "okrptr_workspace_id")?.[1];
  return cookie ? decodeURIComponent(cookie) : null;
}

function normalizeReturnTo(value: string) {
  if (!value.startsWith("/") || value.startsWith("//")) return "/";
  return value.slice(0, 200);
}

export async function listUserWorkspaces(userId: string, currentWorkspaceId: string) {
  await purgeExpiredWorkspaces();
  const rows = await getDb()
    .select({ workspace: workspaces, membership: workspaceMembers })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaceMembers.workspaceId, workspaces.id))
    .where(and(
      eq(workspaceMembers.userId, userId),
      eq(workspaceMembers.status, "active"),
      or(isNull(workspaces.scheduledDeletionAt), eq(workspaceMembers.role, "owner")),
    ))
    .orderBy(asc(workspaces.createdAt));
  return rows.map(({ workspace, membership }) => ({
    id: workspace.id,
    name: workspace.name,
    createdAt: workspace.createdAt,
    personal: workspace.id === workspace.ownerUserId,
    role: membership.role as TeamRole,
    current: workspace.id === currentWorkspaceId && !workspace.scheduledDeletionAt,
    deletionRequestedAt: workspace.deletionRequestedAt,
    scheduledDeletionAt: workspace.scheduledDeletionAt,
  }));
}

export async function createWorkspaceForUser(userId: string, email: string | null, displayName: string, nameInput: string) {
  const name = nameInput.trim();
  if (!name) throw new Error("Workspace name is required");
  if (name.length > 80) throw new Error("Workspace name must be 80 characters or fewer");
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await getDb().insert(workspaces).values({ id, name, ownerUserId: userId, createdAt: now, updatedAt: now });
  await getDb().insert(workspaceMembers).values({ id: crypto.randomUUID(), workspaceId: id, userId, email, displayName, role: "owner", status: "active", createdAt: now, updatedAt: now });
  await setActiveWorkspace(userId, id);
  return {
    id,
    name,
    createdAt: now,
    personal: false,
    role: "owner" as TeamRole,
    current: true,
    deletionRequestedAt: null,
    scheduledDeletionAt: null,
  };
}

export async function scheduleWorkspaceDeletionForUser(userId: string, workspaceId: string) {
  await ensureSchema();
  await purgeExpiredWorkspaces();
  const id = workspaceId.trim();
  if (!id) throw new Error("workspaceId is required");
  const [row] = await getDb()
    .select({ workspace: workspaces, membership: workspaceMembers })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaceMembers.workspaceId, workspaces.id))
    .where(and(eq(workspaceMembers.workspaceId, id), eq(workspaceMembers.userId, userId), eq(workspaceMembers.status, "active")))
    .limit(1);
  if (!row) throw new Error("Workspace not found or access denied");
  if (row.membership.role !== "owner") throw new Error("Only the workspace owner can delete a workspace");
  if (row.workspace.id === row.workspace.ownerUserId) throw new Error("Personal workspace cannot be deleted");

  const remaining = (await listUserWorkspaces(userId, id)).filter((workspace) => workspace.id !== id && !workspace.scheduledDeletionAt);
  if (!remaining.length) throw new Error("Create or keep another workspace before deleting this one");
  const nextWorkspace = remaining.find((workspace) => workspace.personal) ?? remaining[0];
  const now = new Date().toISOString();
  const scheduledDeletionAt = row.workspace.scheduledDeletionAt ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const deletionRequestedAt = row.workspace.deletionRequestedAt ?? now;
  await getDb().update(workspaces).set({
    deletionRequestedAt,
    scheduledDeletionAt,
    deletionRequestedByUserId: userId,
    updatedAt: now,
  }).where(eq(workspaces.id, id));
  await getDb().update(userWorkspacePreferences).set({ activeWorkspaceId: null, updatedAt: now }).where(eq(userWorkspacePreferences.activeWorkspaceId, id));
  await setActiveWorkspace(userId, nextWorkspace.id);
  return {
    deleted: false,
    deletionScheduled: true,
    id,
    deletionRequestedAt,
    scheduledDeletionAt,
    nextWorkspaceId: nextWorkspace.id,
    nextWorkspace,
  };
}

export async function restoreWorkspaceForUser(userId: string, workspaceId: string) {
  await ensureSchema();
  await purgeExpiredWorkspaces();
  const id = workspaceId.trim();
  if (!id) throw new Error("workspaceId is required");
  const [row] = await getDb()
    .select({ workspace: workspaces, membership: workspaceMembers })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaceMembers.workspaceId, workspaces.id))
    .where(and(eq(workspaceMembers.workspaceId, id), eq(workspaceMembers.userId, userId), eq(workspaceMembers.status, "active")))
    .limit(1);
  if (!row) throw new Error("Workspace not found or access denied");
  if (row.membership.role !== "owner") throw new Error("Only the workspace owner can restore a workspace");
  if (!row.workspace.scheduledDeletionAt) throw new Error("Workspace is not scheduled for deletion");
  const now = new Date().toISOString();
  await getDb().update(workspaces).set({
    deletionRequestedAt: null,
    scheduledDeletionAt: null,
    deletionRequestedByUserId: null,
    updatedAt: now,
  }).where(eq(workspaces.id, id));
  return {
    restored: true,
    workspace: {
      id: row.workspace.id,
      name: row.workspace.name,
      personal: false,
      role: "owner" as TeamRole,
      current: false,
      deletionRequestedAt: null,
      scheduledDeletionAt: null,
    },
  };
}

async function purgeExpiredWorkspaces() {
  const expired = await getDb()
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(lte(workspaces.scheduledDeletionAt, new Date().toISOString()))
    .limit(10);
  for (const workspace of expired) await permanentlyDeleteWorkspace(workspace.id);
}

async function permanentlyDeleteWorkspace(id: string) {
  const groupRows = await getDb().select({ id: workspaceGroups.id }).from(workspaceGroups).where(eq(workspaceGroups.workspaceId, id));
  if (groupRows.length) await getDb().delete(workspaceGroupMembers).where(inArray(workspaceGroupMembers.groupId, groupRows.map((group) => group.id)));
  await getDb().delete(googleCalendarEvents).where(eq(googleCalendarEvents.ownerId, id));
  await getDb().delete(googleConnections).where(eq(googleConnections.ownerId, id));
  await getDb().delete(googleOAuthStates).where(eq(googleOAuthStates.ownerId, id));
  await getDb().delete(slackAutomationDeliveries).where(eq(slackAutomationDeliveries.ownerId, id));
  await getDb().delete(slackAutomations).where(eq(slackAutomations.ownerId, id));
  await getDb().delete(slackConnections).where(eq(slackConnections.ownerId, id));
  await getDb().delete(slackOAuthStates).where(eq(slackOAuthStates.ownerId, id));
  await getDb().delete(integrationTokens).where(eq(integrationTokens.workspaceId, id));
  await getDb().delete(aiUsageEvents).where(eq(aiUsageEvents.ownerId, id));
  await getDb().delete(activityLog).where(eq(activityLog.ownerId, id));
  await getDb().delete(routineCompletions).where(eq(routineCompletions.ownerId, id));
  await getDb().delete(routines).where(eq(routines.ownerId, id));
  await getDb().delete(checklistItems).where(eq(checklistItems.ownerId, id));
  await getDb().delete(itemPropertyValues).where(eq(itemPropertyValues.ownerId, id));
  await getDb().delete(itemAssignments).where(eq(itemAssignments.ownerId, id));
  await getDb().delete(projectHiddenProperties).where(eq(projectHiddenProperties.ownerId, id));
  await getDb().delete(projectDocuments).where(eq(projectDocuments.ownerId, id));
  await getDb().delete(projectTemplates).where(eq(projectTemplates.ownerId, id));
  await getDb().delete(propertyDefinitions).where(eq(propertyDefinitions.ownerId, id));
  await getDb().delete(dailyScrums).where(eq(dailyScrums.ownerId, id));
  await getDb().delete(trashRecords).where(eq(trashRecords.ownerId, id));
  await getDb().delete(items).where(eq(items.ownerId, id));
  await getDb().delete(okrCycles).where(eq(okrCycles.ownerId, id));
  await getDb().delete(workspaceRules).where(eq(workspaceRules.workspaceId, id));
  await getDb().delete(workspaceGroups).where(eq(workspaceGroups.workspaceId, id));
  await getDb().delete(workspaceMembers).where(eq(workspaceMembers.workspaceId, id));
  await getDb().delete(workspaces).where(eq(workspaces.id, id));
}

export async function setActiveWorkspace(userId: string, workspaceId: string) {
  await purgeExpiredWorkspaces();
  const [row] = await getDb()
    .select({ membership: workspaceMembers })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaceMembers.workspaceId, workspaces.id))
    .where(and(
      eq(workspaceMembers.workspaceId, workspaceId),
      eq(workspaceMembers.userId, userId),
      eq(workspaceMembers.status, "active"),
      isNull(workspaces.scheduledDeletionAt),
    )).limit(1);
  if (!row) throw new Error("Workspace not found or access denied");
  await getDb().insert(userWorkspacePreferences).values({ userId, activeWorkspaceId: workspaceId, updatedAt: new Date().toISOString() }).onConflictDoUpdate({
    target: userWorkspacePreferences.userId,
    set: { activeWorkspaceId: workspaceId, updatedAt: new Date().toISOString() },
  });
  return row.membership;
}

function normalizeEmail(value: string | null) {
  const email = value?.trim().toLocaleLowerCase() ?? "";
  return email || null;
}

function authenticatedDisplayName(request: Request) {
  const raw = request.headers.get("oai-authenticated-user-full-name")?.trim();
  if (!raw) return "";
  if (request.headers.get("oai-authenticated-user-full-name-encoding") !== "percent-encoded-utf-8") return raw;
  try {
    return decodeURIComponent(raw);
  } catch {
    return "";
  }
}

function cleanDisplayName(value: string | null | undefined) {
  const name = value?.trim().replace(/\s+/g, " ") ?? "";
  if (!name || name.length > 80) return "";
  if (/^\S+@\S+\.\S+$/.test(name)) return "";
  return name;
}

function displayNameForExistingMember(currentName: string, incomingName: string, email: string | null) {
  const current = cleanDisplayName(currentName);
  const incoming = cleanDisplayName(incomingName);
  if (!incoming) return current || email?.split("@")[0] || "Member";
  if (!current || current === "Member" || current === email?.split("@")[0]) return incoming;
  return current;
}

export function canManageTeam(authorization: RequestAuthorization) {
  return authorization.role === "owner" || authorization.role === "admin" || authorization.apiToken;
}

export async function getTeam(ownerId: string, currentUserId: string) {
  const [workspace] = await getDb().select().from(workspaces).where(eq(workspaces.id, ownerId)).limit(1);
  if (!workspace) throw new Error("Workspace not found");
  const members = await getDb().select().from(workspaceMembers).where(eq(workspaceMembers.workspaceId, ownerId)).orderBy(asc(workspaceMembers.createdAt));
  return {
    workspace: { id: workspace.id, name: workspace.name },
    members: members.map((member) => serializeTeamMember(member, currentUserId)),
  };
}

export async function inviteTeamMember(ownerId: string, actorUserId: string, emailInput: string, role: Exclude<TeamRole, "owner">, displayNameInput = "") {
  const email = normalizeEmail(emailInput);
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) throw new Error("A valid email is required");
  if (!(["admin", "member", "viewer"] as TeamRole[]).includes(role)) throw new Error("Unsupported team role");
  const [existing] = await getDb().select().from(workspaceMembers).where(and(eq(workspaceMembers.workspaceId, ownerId), eq(workspaceMembers.email, email))).limit(1);
  if (existing) throw new Error("This email is already a workspace member or invitation");
  const now = new Date().toISOString();
  const displayName = cleanDisplayName(displayNameInput) || email.split("@")[0];
  const member: WorkspaceMember = {
    id: crypto.randomUUID(),
    workspaceId: ownerId,
    userId: null,
    email,
    displayName,
    role,
    status: "invited",
    invitedByUserId: actorUserId,
    createdAt: now,
    updatedAt: now,
  };
  await getDb().insert(workspaceMembers).values(member);
  return serializeTeamMember(member, actorUserId);
}

export async function updateTeamMember(ownerId: string, memberId: string, patch: { role?: Exclude<TeamRole, "owner">; displayName?: string }, currentUserId: string, canManage = false) {
  const member = await getWorkspaceMember(ownerId, memberId);
  const values: { role?: Exclude<TeamRole, "owner">; displayName?: string } = {};
  if (patch.role !== undefined) {
    if (!canManage) throw new Error("Owner or Admin access is required.");
    if (!(["admin", "member", "viewer"] as TeamRole[]).includes(patch.role)) throw new Error("Unsupported team role");
    if (member.role === "owner") throw new Error("The Owner role cannot be changed");
    values.role = patch.role;
  }
  if (patch.displayName !== undefined) {
    const displayName = cleanDisplayName(patch.displayName);
    if (!displayName) throw new Error("Display name is required");
    if (!canManage && member.userId !== currentUserId) throw new Error("You can only update your own display name");
    values.displayName = displayName;
  }
  if (!Object.keys(values).length) throw new Error("No supported team member changes were provided");
  const updated = { ...member, ...values, updatedAt: new Date().toISOString() };
  await getDb().update(workspaceMembers).set({ ...values, updatedAt: updated.updatedAt }).where(eq(workspaceMembers.id, member.id));
  return serializeTeamMember(updated, currentUserId);
}

export async function removeTeamMember(ownerId: string, memberId: string, currentUserId: string) {
  const member = await getWorkspaceMember(ownerId, memberId);
  if (member.role === "owner") throw new Error("The Owner cannot be removed");
  if (member.userId === currentUserId) throw new Error("You cannot remove yourself");
  await getDb().delete(workspaceMembers).where(and(eq(workspaceMembers.workspaceId, ownerId), eq(workspaceMembers.id, memberId)));
  return { deleted: true, id: memberId };
}

async function getWorkspaceMember(ownerId: string, memberId: string) {
  const [member] = await getDb().select().from(workspaceMembers).where(and(eq(workspaceMembers.workspaceId, ownerId), eq(workspaceMembers.id, memberId))).limit(1);
  if (!member) throw new Error("Team member not found");
  return member;
}

function serializeTeamMember(member: WorkspaceMember, currentUserId: string) {
  return {
    id: member.id,
    email: member.email ?? "",
    displayName: member.displayName || member.email?.split("@")[0] || "Member",
    role: member.role as TeamRole,
    status: member.status as "invited" | "active",
    isCurrent: member.userId === currentUserId,
    createdAt: member.createdAt,
  };
}

export async function listGroups(authorization: RequestAuthorization, includeArchived = false) {
  const rows = await getDb().select().from(workspaceGroups).where(eq(workspaceGroups.workspaceId, authorization.ownerId));
  const memberships = await getDb()
    .select({
      id: workspaceGroupMembers.id,
      groupId: workspaceGroupMembers.groupId,
      memberId: workspaceGroupMembers.memberId,
      role: workspaceGroupMembers.role,
      createdAt: workspaceGroupMembers.createdAt,
      updatedAt: workspaceGroupMembers.updatedAt,
    })
    .from(workspaceGroupMembers)
    .innerJoin(workspaceGroups, eq(workspaceGroupMembers.groupId, workspaceGroups.id))
    .where(eq(workspaceGroups.workspaceId, authorization.ownerId));
  const currentMember = await getCurrentWorkspaceMember(authorization);
  const administrator = canManageTeam(authorization);

  return rows
    .filter((group) => includeArchived || !group.archived)
    .filter((group) => group.visibility === "open" || administrator || memberships.some((entry) => entry.groupId === group.id && entry.memberId === currentMember?.id))
    .map((group) => serializeGroup(group, memberships.filter((entry) => entry.groupId === group.id), currentMember?.id ?? null, administrator))
    .sort((left, right) => left.name.localeCompare(right.name));
}

export async function createGroup(
  authorization: RequestAuthorization,
  input: { name: string; handle?: string; description?: string; color?: GroupColor; visibility?: GroupVisibility },
) {
  if (!canManageTeam(authorization)) throw new Error("Owner or Admin access is required");
  const name = cleanGroupName(input.name);
  const description = cleanGroupDescription(input.description ?? "");
  const color = requireGroupColor(input.color ?? "gray");
  const visibility = requireGroupVisibility(input.visibility ?? "open");
  const handle = input.handle
    ? await requireAvailableGroupHandle(authorization.ownerId, input.handle)
    : await nextAvailableGroupHandle(authorization.ownerId, name);
  const now = new Date().toISOString();
  const group: WorkspaceGroup = {
    id: crypto.randomUUID(),
    workspaceId: authorization.ownerId,
    name,
    handle,
    description,
    color,
    visibility,
    archived: false,
    createdByUserId: authorization.userId,
    createdAt: now,
    updatedAt: now,
  };
  await getDb().insert(workspaceGroups).values(group);

  const creator = await getCurrentWorkspaceMember(authorization);
  if (creator) {
    await getDb().insert(workspaceGroupMembers).values({
      id: crypto.randomUUID(),
      groupId: group.id,
      memberId: creator.id,
      role: "lead",
      createdAt: now,
      updatedAt: now,
    });
  }
  return getVisibleGroup(authorization, group.id, true);
}

export async function updateGroup(
  authorization: RequestAuthorization,
  id: string,
  patch: Partial<{ name: string; handle: string; description: string; color: GroupColor; visibility: GroupVisibility; archived: boolean }>,
) {
  const context = await getGroupContext(authorization, id);
  if (!context.visible) throw new Error("Group not found");
  const canEdit = context.administrator || context.currentMembership?.role === "lead";
  if (!canEdit) throw new Error("Group Lead, Owner, or Admin access is required");
  if (context.group.archived && !context.administrator && patch.archived !== false) throw new Error("Archived groups can only be changed by an Owner or Admin");
  if (patch.archived !== undefined && !context.administrator) throw new Error("Only an Owner or Admin can archive or restore a group");

  const values: Partial<WorkspaceGroup> = { updatedAt: new Date().toISOString() };
  if (patch.name !== undefined) values.name = cleanGroupName(patch.name);
  if (patch.description !== undefined) values.description = cleanGroupDescription(patch.description);
  if (patch.color !== undefined) values.color = requireGroupColor(patch.color);
  if (patch.visibility !== undefined) values.visibility = requireGroupVisibility(patch.visibility);
  if (patch.handle !== undefined) values.handle = await requireAvailableGroupHandle(authorization.ownerId, patch.handle, id);
  if (patch.archived !== undefined) values.archived = patch.archived;
  await getDb().update(workspaceGroups).set(values).where(and(eq(workspaceGroups.workspaceId, authorization.ownerId), eq(workspaceGroups.id, id)));
  return getVisibleGroup(authorization, id, true);
}

export async function deleteGroup(authorization: RequestAuthorization, id: string) {
  if (!canManageTeam(authorization)) throw new Error("Owner or Admin access is required");
  const group = await getWorkspaceGroup(authorization.ownerId, id);
  if (!group.archived) throw new Error("Archive the group before deleting it permanently");
  await getDb().delete(workspaceGroups).where(and(eq(workspaceGroups.workspaceId, authorization.ownerId), eq(workspaceGroups.id, id)));
  return { deleted: true, id: group.id, name: group.name };
}

export async function listGroupMembers(authorization: RequestAuthorization, groupId: string) {
  const context = await getGroupContext(authorization, groupId);
  if (!context.visible) throw new Error("Group not found");
  const rows = await getDb()
    .select({ relation: workspaceGroupMembers, member: workspaceMembers })
    .from(workspaceGroupMembers)
    .innerJoin(workspaceMembers, eq(workspaceGroupMembers.memberId, workspaceMembers.id))
    .where(eq(workspaceGroupMembers.groupId, groupId));
  const members = rows
    .filter(({ member }) => member.workspaceId === authorization.ownerId)
    .map(({ relation, member }) => serializeGroupMember(relation, member, authorization.userId))
    .sort((left, right) => Number(right.groupRole === "lead") - Number(left.groupRole === "lead") || left.displayName.localeCompare(right.displayName));
  return {
    group: serializeGroup(context.group, rows.map(({ relation }) => relation), context.currentMember?.id ?? null, context.administrator),
    members,
    canManageMembers: !context.group.archived && (context.administrator || context.currentMembership?.role === "lead"),
  };
}

export async function addGroupMember(authorization: RequestAuthorization, groupId: string, memberId: string, role: GroupRole = "member") {
  const context = await requireGroupManager(authorization, groupId);
  requireGroupRole(role);
  const member = await getWorkspaceMember(authorization.ownerId, memberId);
  if (role === "lead" && member.role === "viewer") throw new Error("A Viewer cannot be assigned as a Group Lead");
  const [existing] = await getDb().select().from(workspaceGroupMembers).where(and(eq(workspaceGroupMembers.groupId, groupId), eq(workspaceGroupMembers.memberId, memberId))).limit(1);
  if (existing) throw new Error("This member is already in the group");
  const now = new Date().toISOString();
  const relation: WorkspaceGroupMember = { id: crypto.randomUUID(), groupId: context.group.id, memberId: member.id, role, createdAt: now, updatedAt: now };
  await getDb().insert(workspaceGroupMembers).values(relation);
  return serializeGroupMember(relation, member, authorization.userId);
}

export async function updateGroupMember(authorization: RequestAuthorization, groupId: string, memberId: string, role: GroupRole) {
  await requireGroupManager(authorization, groupId);
  requireGroupRole(role);
  const member = await getWorkspaceMember(authorization.ownerId, memberId);
  if (role === "lead" && member.role === "viewer") throw new Error("A Viewer cannot be assigned as a Group Lead");
  const relation = await getGroupMemberRelation(groupId, memberId);
  const updated = { ...relation, role, updatedAt: new Date().toISOString() };
  await getDb().update(workspaceGroupMembers).set({ role, updatedAt: updated.updatedAt }).where(eq(workspaceGroupMembers.id, relation.id));
  return serializeGroupMember(updated, member, authorization.userId);
}

export async function removeGroupMember(authorization: RequestAuthorization, groupId: string, memberId: string) {
  await requireGroupManager(authorization, groupId);
  await getWorkspaceMember(authorization.ownerId, memberId);
  const relation = await getGroupMemberRelation(groupId, memberId);
  await getDb().delete(workspaceGroupMembers).where(eq(workspaceGroupMembers.id, relation.id));
  return { deleted: true, groupId, memberId };
}

async function getVisibleGroup(authorization: RequestAuthorization, id: string, includeArchived = false) {
  const groups = await listGroups(authorization, includeArchived);
  const group = groups.find((entry) => entry.id === id);
  if (!group) throw new Error("Group not found");
  return group;
}

async function getGroupContext(authorization: RequestAuthorization, id: string) {
  const group = await getWorkspaceGroup(authorization.ownerId, id);
  const currentMember = await getCurrentWorkspaceMember(authorization);
  const [currentMembership] = currentMember
    ? await getDb().select().from(workspaceGroupMembers).where(and(eq(workspaceGroupMembers.groupId, id), eq(workspaceGroupMembers.memberId, currentMember.id))).limit(1)
    : [];
  const administrator = canManageTeam(authorization);
  return {
    group,
    currentMember,
    currentMembership: currentMembership ?? null,
    administrator,
    visible: group.visibility === "open" || administrator || Boolean(currentMembership),
  };
}

async function requireGroupManager(authorization: RequestAuthorization, groupId: string) {
  const context = await getGroupContext(authorization, groupId);
  if (!context.visible) throw new Error("Group not found");
  if (context.group.archived) throw new Error("Restore the group before changing its members");
  if (!context.administrator && context.currentMembership?.role !== "lead") throw new Error("Group Lead, Owner, or Admin access is required");
  return context;
}

async function getCurrentWorkspaceMember(authorization: RequestAuthorization) {
  const [direct] = await getDb().select().from(workspaceMembers).where(and(eq(workspaceMembers.workspaceId, authorization.ownerId), eq(workspaceMembers.userId, authorization.userId))).limit(1);
  if (direct) return direct;
  if (!authorization.apiToken) return null;
  const [owner] = await getDb().select().from(workspaceMembers).where(and(eq(workspaceMembers.workspaceId, authorization.ownerId), eq(workspaceMembers.role, "owner"))).limit(1);
  return owner ?? null;
}

async function getWorkspaceGroup(ownerId: string, id: string) {
  const [group] = await getDb().select().from(workspaceGroups).where(and(eq(workspaceGroups.workspaceId, ownerId), eq(workspaceGroups.id, id))).limit(1);
  if (!group) throw new Error("Group not found");
  return group;
}

async function getGroupMemberRelation(groupId: string, memberId: string) {
  const [relation] = await getDb().select().from(workspaceGroupMembers).where(and(eq(workspaceGroupMembers.groupId, groupId), eq(workspaceGroupMembers.memberId, memberId))).limit(1);
  if (!relation) throw new Error("Group member not found");
  return relation;
}

function serializeGroup(
  group: WorkspaceGroup,
  memberships: Pick<WorkspaceGroupMember, "memberId" | "role">[],
  currentMemberId: string | null,
  administrator: boolean,
) {
  const currentMembership = memberships.find((entry) => entry.memberId === currentMemberId);
  return {
    id: group.id,
    name: group.name,
    handle: group.handle,
    description: group.description,
    color: group.color as GroupColor,
    visibility: group.visibility as GroupVisibility,
    archived: group.archived,
    memberCount: memberships.length,
    isMember: Boolean(currentMembership),
    isLead: currentMembership?.role === "lead",
    canEdit: administrator || currentMembership?.role === "lead",
    canArchive: administrator,
    createdAt: group.createdAt,
    updatedAt: group.updatedAt,
  };
}

function serializeGroupMember(relation: WorkspaceGroupMember, member: WorkspaceMember, currentUserId: string) {
  return {
    id: relation.id,
    memberId: member.id,
    email: member.email ?? "",
    displayName: member.displayName || member.email?.split("@")[0] || "Member",
    status: member.status as "invited" | "active",
    workspaceRole: member.role as TeamRole,
    groupRole: relation.role as GroupRole,
    isCurrent: member.userId === currentUserId,
    createdAt: relation.createdAt,
  };
}

function cleanGroupName(value: string) {
  const name = value.trim().replace(/\s+/g, " ");
  if (!name) throw new Error("Group name is required");
  if (name.length > 80) throw new Error("Group name must be 80 characters or fewer");
  return name;
}

function cleanGroupDescription(value: string) {
  const description = value.trim();
  if (description.length > 500) throw new Error("Group description must be 500 characters or fewer");
  return description;
}

function normalizeGroupHandle(value: string) {
  return value
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}_-]+/gu, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "")
    .slice(0, 32);
}

async function requireAvailableGroupHandle(ownerId: string, input: string, exceptId?: string) {
  const handle = normalizeGroupHandle(input);
  if (!handle) throw new Error("Group handle is required");
  const [existing] = await getDb().select().from(workspaceGroups).where(and(eq(workspaceGroups.workspaceId, ownerId), eq(workspaceGroups.handle, handle))).limit(1);
  if (existing && existing.id !== exceptId) throw new Error(`The group handle @${handle} is already in use`);
  return handle;
}

async function nextAvailableGroupHandle(ownerId: string, name: string) {
  const base = normalizeGroupHandle(name) || "group";
  for (let number = 1; number <= 100; number += 1) {
    const suffix = number === 1 ? "" : `-${number}`;
    const candidate = `${base.slice(0, 32 - suffix.length)}${suffix}`;
    const [existing] = await getDb().select({ id: workspaceGroups.id }).from(workspaceGroups).where(and(eq(workspaceGroups.workspaceId, ownerId), eq(workspaceGroups.handle, candidate))).limit(1);
    if (!existing) return candidate;
  }
  throw new Error("Unable to create a unique group handle");
}

function requireGroupColor(value: GroupColor) {
  if (!GROUP_COLORS.includes(value)) throw new Error("Unsupported group color");
  return value;
}

function requireGroupVisibility(value: GroupVisibility) {
  if (!GROUP_VISIBILITIES.includes(value)) throw new Error("Unsupported group visibility");
  return value;
}

function requireGroupRole(value: GroupRole) {
  if (!GROUP_ROLES.includes(value)) throw new Error("Unsupported group role");
  return value;
}

export async function listItems(
  ownerId: string,
  filter: {
    kind?: ItemKind;
    status?: ItemStatus;
    cadence?: ItemCadence;
    parentId?: string;
    query?: string;
    limit?: number;
    includeArchived?: boolean;
  } = {},
) {
  const conditions = [eq(items.ownerId, ownerId)];
  if (!filter.includeArchived && filter.status !== "archived") conditions.push(isNull(items.archivedAt));
  if (filter.kind) conditions.push(eq(items.kind, filter.kind));
  if (filter.status) conditions.push(eq(items.status, filter.status));
  if (filter.cadence) conditions.push(eq(items.cadence, filter.cadence));
  if (filter.parentId) conditions.push(eq(items.parentId, filter.parentId));
  if (filter.query) {
    conditions.push(
      or(
        like(items.title, `%${filter.query}%`),
        like(items.description, `%${filter.query}%`),
      )!,
    );
  }

  return getDb()
    .select()
    .from(items)
    .where(and(...conditions))
    .orderBy(asc(items.sortOrder), desc(items.createdAt))
    .limit(Math.min(filter.limit ?? 200, 200));
}

export async function getItem(ownerId: string, id: string) {
  const [item] = await getDb()
    .select()
    .from(items)
    .where(and(eq(items.ownerId, ownerId), eq(items.id, id)))
    .limit(1);
  return item ?? null;
}

export async function createOkrPlan(ownerId: string, userId: string, input: OkrPlanInput) {
  await ensureWorkspace(ownerId);
  const cycleId = input.cycleId.trim();
  if (!cycleId) throw new Error("cycleId is required");
  const [cycle] = await getDb().select({ id: okrCycles.id }).from(okrCycles).where(and(eq(okrCycles.ownerId, ownerId), eq(okrCycles.id, cycleId))).limit(1);
  if (!cycle) throw new Error("OKR cycle not found");

  const objectiveTitle = cleanPlanTitle(input.objective);
  const keyResultTitle = cleanPlanTitle(input.keyResult);
  const initiativeTitle = cleanPlanTitle(input.initiative);
  const projectTitle = cleanPlanTitle(input.project);
  const targetKind = input.targetKind ?? null;
  const targetId = input.targetId?.trim() || null;
  const rules = await getWorkspaceRules(ownerId);
  const createdAt = new Date().toISOString();
  const specs: Array<{ id: string; kind: ItemKind; title: string; parentId: string | null; status: ItemStatus }> = [];

  let parentId: string | null = null;
  if (!targetId) {
    if (targetKind) throw new Error("targetId is required when targetKind is provided");
    if (!objectiveTitle || !keyResultTitle) throw new Error("Objective and Key Result are required");
    const objectiveId = crypto.randomUUID();
    specs.push({ id: objectiveId, kind: "objective", title: objectiveTitle, parentId: null, status: "in_progress" });
    const keyResultId = crypto.randomUUID();
    specs.push({ id: keyResultId, kind: "key_result", title: keyResultTitle, parentId: objectiveId, status: "todo" });
    parentId = keyResultId;
  } else {
    if (!targetKind) throw new Error("targetKind is required when targetId is provided");
    const target = await getItem(ownerId, targetId);
    if (!target || target.archivedAt) throw new Error("Target item not found");
    if (target.kind !== targetKind) throw new Error("Target item kind does not match");
    if (target.cycleId !== cycleId) throw new Error("Target item must belong to the selected OKR cycle");
    parentId = target.id;
    if (targetKind === "objective") {
      if (!keyResultTitle) throw new Error("Key Result is required");
      const keyResultId = crypto.randomUUID();
      specs.push({ id: keyResultId, kind: "key_result", title: keyResultTitle, parentId, status: "todo" });
      parentId = keyResultId;
    }
  }

  const deepestKind = specs.at(-1)?.kind ?? targetKind;
  if (deepestKind === "key_result") {
    if (projectTitle && !initiativeTitle) throw new Error("Project requires an Initiative");
    if (initiativeTitle) {
      const initiativeId = crypto.randomUUID();
      specs.push({ id: initiativeId, kind: "initiative", title: initiativeTitle, parentId, status: "todo" });
      parentId = initiativeId;
    }
  } else if (deepestKind === "initiative" && initiativeTitle) {
    throw new Error("Initiative already exists for this target");
  }

  const nextKind = specs.at(-1)?.kind ?? targetKind;
  if (projectTitle) {
    if (nextKind !== "initiative") throw new Error("Project requires an Initiative target");
    specs.push({ id: crypto.randomUUID(), kind: "project", title: projectTitle, parentId, status: "in_progress" });
  }
  if (!specs.length) throw new Error("No OKR plan content to create");

  const projectSpec = specs.find((entry) => entry.kind === "project");
  let driMemberId = input.driMemberId?.trim() || null;
  if (projectSpec) {
    if (!driMemberId) {
      const [currentMember] = await getDb().select({ id: workspaceMembers.id }).from(workspaceMembers).where(and(
        eq(workspaceMembers.workspaceId, ownerId),
        eq(workspaceMembers.userId, userId),
        eq(workspaceMembers.status, "active"),
      )).limit(1);
      driMemberId = currentMember?.id ?? null;
    } else {
      const [member] = await getDb().select({ id: workspaceMembers.id }).from(workspaceMembers).where(and(
        eq(workspaceMembers.workspaceId, ownerId),
        eq(workspaceMembers.id, driMemberId),
        eq(workspaceMembers.status, "active"),
      )).limit(1);
      if (!member) throw new Error("Project DRI must be an active workspace member");
    }
  }

  const d1 = (env as RuntimeEnv).DB;
  const statements = specs.flatMap((spec) => [
    d1.prepare(`INSERT INTO items
      (id, owner_id, cycle_id, parent_id, kind, title, description, status, priority, cadence, progress, source, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, '', ?, ?, ?, 0, 'web', ?, ?)`)
      .bind(spec.id, ownerId, cycleId, spec.parentId, spec.kind, spec.title, spec.status, rules.defaultPriority, rules.defaultCadence, createdAt, createdAt),
    d1.prepare(`INSERT INTO activity_log (id, owner_id, item_id, action, source, payload, created_at)
      VALUES (?, ?, ?, 'created', 'web', ?, ?)`)
      .bind(crypto.randomUUID(), ownerId, spec.id, JSON.stringify({ kind: spec.kind, status: spec.status, origin: "okr_assistant" }), createdAt),
  ]);
  if (projectSpec && driMemberId) {
    statements.push(d1.prepare(`INSERT INTO item_assignments
      (id, owner_id, item_id, member_id, role, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'project_dri', ?, ?)`)
      .bind(crypto.randomUUID(), ownerId, projectSpec.id, driMemberId, createdAt, createdAt));
  }
  statements.push(d1.prepare("UPDATE workspace_rules SET configured = 1, updated_at = ? WHERE workspace_id = ?").bind(createdAt, ownerId));
  await d1.batch(statements);

  const rows = await getDb().select().from(items).where(and(eq(items.ownerId, ownerId), inArray(items.id, specs.map((entry) => entry.id))));
  const byId = new Map(rows.map((row) => [row.id, row]));
  const assignments = await getItemAssignmentMap(ownerId, specs.map((entry) => entry.id));
  const createdItems = specs.map((spec) => serializeItem(byId.get(spec.id)!, {}, assignments[spec.id] ?? []));
  return {
    items: createdItems,
    cycleId,
    objectiveId: specs.find((entry) => entry.kind === "objective")?.id ?? (targetKind === "objective" ? targetId : null),
    keyResultId: specs.find((entry) => entry.kind === "key_result")?.id ?? (targetKind === "key_result" ? targetId : null),
    initiativeId: specs.find((entry) => entry.kind === "initiative")?.id ?? (targetKind === "initiative" ? targetId : null),
    projectId: projectSpec?.id ?? null,
  };
}

function cleanPlanTitle(value: string | undefined) {
  return value?.trim().slice(0, 500) ?? "";
}

export async function createItem(
  ownerId: string,
  input: {
    title: string;
    kind?: ItemKind;
    cycleId?: string | null;
    parentId?: string | null;
    routineId?: string | null;
    description?: string;
    status?: ItemStatus;
    priority?: ItemPriority;
    cadence?: ItemCadence;
    progress?: number;
    dueDate?: string | null;
    source?: string;
    sourceRef?: string | null;
    templateId?: string | null;
    createdByUserId?: string | null;
  },
) {
  await ensureWorkspace(ownerId);
  const kind = input.kind ?? "task";
  const projectProperties = kind === "project" ? await listProjectPropertyDefinitions(ownerId) : [];
  const systemDefault = (key: string) => parsePropertyValue(projectProperties.find((property) => property.systemKey === key)?.defaultValue ?? "null");
  const defaultParentId = systemDefault("parent_id");
  const parentId = input.parentId ?? (typeof defaultParentId === "string" ? defaultParentId : null);
  let routineId = input.routineId ?? null;
  if (kind === "task" && !parentId && !routineId) routineId = (await ensureGeneralRoutine(ownerId)).id;
  const defaultStatus = systemDefault("status");
  const status = input.status ?? (typeof defaultStatus === "string" && ITEM_STATUSES.includes(defaultStatus as ItemStatus) ? defaultStatus as ItemStatus : "todo");
  await validateParent(ownerId, kind, parentId, routineId);
  const rules = await getWorkspaceRules(ownerId);
  const cycleId = input.cycleId === undefined ? await defaultCycleIdForKind(ownerId, kind) : input.cycleId;
  const defaultPriority = systemDefault("priority");
  const defaultCadence = systemDefault("cadence");
  const defaultDueDate = systemDefault("due_date");
  if (input.templateId) {
    const template = await getProjectTemplate(ownerId, input.templateId);
    if (!template) throw new Error("Template not found");
    if (kind !== "project") throw new Error("Templates can only be applied to Projects");
  }

  const id = crypto.randomUUID();
  const [created] = await getDb()
    .insert(items)
    .values({
      id,
      ownerId,
      cycleId,
      parentId,
      routineId,
      kind,
      title: input.title.trim(),
      description: input.description?.trim() ?? "",
      status,
      priority: input.priority ?? (typeof defaultPriority === "string" && ITEM_PRIORITIES.includes(defaultPriority as ItemPriority) ? defaultPriority as ItemPriority : rules.defaultPriority),
      cadence: input.cadence ?? (typeof defaultCadence === "string" && ITEM_CADENCES.includes(defaultCadence as ItemCadence) ? defaultCadence as ItemCadence : rules.defaultCadence),
      progress: clampProgress(input.progress ?? 0),
      dueDate: input.dueDate ?? (typeof defaultDueDate === "string" ? defaultDueDate : null),
      source: input.source ?? "web",
      sourceRef: input.sourceRef ?? null,
    })
    .returning();

  if (kind === "project") {
    for (const property of projectProperties.filter((entry) => !entry.systemKey)) {
      const defaultValue = parsePropertyValue(property.defaultValue);
      if (defaultValue !== null) await setPropertyValue(ownerId, created.id, property.id, defaultValue);
    }
    const defaultDri = systemDefault("project_dri");
    const defaultWorkers = systemDefault("project_workers");
    if (typeof defaultDri === "string") await replaceItemAssignmentRole(ownerId, created.id, "project_dri", [defaultDri]);
    if (Array.isArray(defaultWorkers)) await replaceItemAssignmentRole(ownerId, created.id, "project_worker", defaultWorkers);
    if (input.templateId) await applyProjectTemplate(ownerId, created.id, input.templateId, input.createdByUserId);
  }

  const finalCreated = kind === "project" && input.templateId ? await getItem(ownerId, created.id) ?? created : created;
  await logActivity(ownerId, created.id, "created", created.source, { kind, status });
  await dispatchSlackAutomationEvent(ownerId, { triggerType: "task_created", item: finalCreated });
  return finalCreated;
}

export async function updateItem(
  ownerId: string,
  id: string,
  patch: Partial<{
    title: string;
    description: string;
    status: ItemStatus;
    cycleId: string | null;
    priority: ItemPriority;
    cadence: ItemCadence;
    progress: number;
    dueDate: string | null;
    parentId: string | null;
    routineId: string | null;
    source: string;
  }>,
) {
  await ensureWorkspace(ownerId);
  const current = await getItem(ownerId, id);
  if (!current) throw new Error("Item not found");
  if (current.archivedAt) throw new Error("Restore the item before changing it");
  if (patch.status === "archived") throw new Error("Use the Project archive action instead");

  const normalizedPatch = { ...patch };
  if (current.kind === "task") {
    if (normalizedPatch.parentId) normalizedPatch.routineId = null;
    if (normalizedPatch.routineId) normalizedPatch.parentId = null;
    const nextParentId = normalizedPatch.parentId === undefined ? current.parentId : normalizedPatch.parentId;
    let nextRoutineId = normalizedPatch.routineId === undefined ? current.routineId : normalizedPatch.routineId;
    if (!nextParentId && !nextRoutineId) {
      nextRoutineId = (await ensureGeneralRoutine(ownerId)).id;
      normalizedPatch.routineId = nextRoutineId;
    }
  }

  if (normalizedPatch.parentId !== undefined || normalizedPatch.status !== undefined || normalizedPatch.routineId !== undefined) {
    await validateParent(
      ownerId,
      current.kind as ItemKind,
      normalizedPatch.parentId === undefined ? current.parentId : normalizedPatch.parentId,
      normalizedPatch.routineId === undefined ? current.routineId : normalizedPatch.routineId,
    );
  }

  const nextStatus = normalizedPatch.status ?? (current.status as ItemStatus);
  const values = {
    ...normalizedPatch,
    title: normalizedPatch.title?.trim(),
    description: normalizedPatch.description?.trim(),
    progress: completedStatuses.has(nextStatus) ? 100 : normalizedPatch.progress === undefined ? undefined : clampProgress(normalizedPatch.progress),
    updatedAt: new Date().toISOString(),
  };

  const [updated] = await getDb()
    .update(items)
    .set(values)
    .where(and(eq(items.ownerId, ownerId), eq(items.id, id)))
    .returning();

  await logActivity(ownerId, id, "updated", normalizedPatch.source ?? "web", normalizedPatch);
  if (current.status !== updated.status) {
    await dispatchSlackAutomationEvent(ownerId, {
      triggerType: "task_status_changed",
      item: updated,
      fromStatus: current.status,
    });
  }
  return updated;
}

export type ItemAssignmentSummary = {
  id: string;
  memberId: string;
  displayName: string;
  email: string;
  role: ItemAssignmentRole;
};

export async function getItemAssignmentMap(ownerId: string, itemIds?: string[]) {
  if (itemIds && itemIds.length === 0) return {} as Record<string, ItemAssignmentSummary[]>;
  const conditions = [eq(itemAssignments.ownerId, ownerId)];
  if (itemIds) conditions.push(inArray(itemAssignments.itemId, itemIds));
  const rows = await getDb()
    .select({
      id: itemAssignments.id,
      itemId: itemAssignments.itemId,
      memberId: itemAssignments.memberId,
      displayName: workspaceMembers.displayName,
      email: workspaceMembers.email,
      role: itemAssignments.role,
    })
    .from(itemAssignments)
    .innerJoin(workspaceMembers, eq(itemAssignments.memberId, workspaceMembers.id))
    .where(and(...conditions))
    .orderBy(asc(itemAssignments.createdAt));
  const result: Record<string, ItemAssignmentSummary[]> = {};
  for (const row of rows) {
    result[row.itemId] ??= [];
    result[row.itemId].push({
      id: row.id,
      memberId: row.memberId,
      displayName: row.displayName,
      email: row.email ?? "",
      role: row.role as ItemAssignmentRole,
    });
  }
  return result;
}

export async function replaceItemAssignmentRole(
  ownerId: string,
  itemId: string,
  role: ItemAssignmentRole,
  memberIds: string[],
) {
  if (!ITEM_ASSIGNMENT_ROLES.includes(role)) throw new Error("Unsupported assignment role");
  const item = await getItem(ownerId, itemId);
  if (!item) throw new Error("Item not found");
  if (item.archivedAt) throw new Error("Restore the item before changing assignments");
  const expectedKind = role === "task_assignee" ? "task" : "project";
  if (item.kind !== expectedKind) throw new Error(`${role} can only be used on ${expectedKind}`);
  const uniqueMemberIds = [...new Set(memberIds.filter(Boolean))];
  if (role !== "project_worker" && uniqueMemberIds.length > 1) throw new Error("Only one accountable member is allowed");

  if (uniqueMemberIds.length) {
    const members = await getDb()
      .select({ id: workspaceMembers.id })
      .from(workspaceMembers)
      .where(and(
        eq(workspaceMembers.workspaceId, ownerId),
        eq(workspaceMembers.status, "active"),
        inArray(workspaceMembers.id, uniqueMemberIds),
      ));
    if (members.length !== uniqueMemberIds.length) throw new Error("Every assignee must be an active workspace member");
  }

  const now = new Date().toISOString();
  const d1 = (env as RuntimeEnv).DB;
  await d1.batch([
    d1.prepare("DELETE FROM item_assignments WHERE owner_id = ? AND item_id = ? AND role = ?")
      .bind(ownerId, itemId, role),
    ...uniqueMemberIds.map((memberId) => d1.prepare(`INSERT INTO item_assignments
      (id, owner_id, item_id, member_id, role, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .bind(crypto.randomUUID(), ownerId, itemId, memberId, role, now, now)),
  ]);
  await logActivity(ownerId, itemId, "assignments_updated", "web", { role, memberIds: uniqueMemberIds });
  return (await getItemAssignmentMap(ownerId, [itemId]))[itemId] ?? [];
}

export type TrashedItemRoot = {
  item: PaceItem;
  taskCount: number;
};

export async function listTrashedItems(ownerId: string): Promise<TrashedItemRoot[]> {
  const roots = await getDb()
    .select()
    .from(items)
    .where(and(
      eq(items.ownerId, ownerId),
      inArray(items.kind, ["project", "task"]),
      sql`${items.archivedAt} IS NOT NULL`,
      or(
        eq(items.kind, "project"),
        isNull(items.archiveRootId),
        sql`${items.archiveRootId} = ${items.id}`,
      ),
    ))
    .orderBy(desc(items.archivedAt));
  const archivedTasks = await getDb()
    .select({ archiveRootId: items.archiveRootId })
    .from(items)
    .where(and(eq(items.ownerId, ownerId), eq(items.kind, "task"), sql`${items.archivedAt} IS NOT NULL`));
  const taskCounts = new Map<string, number>();
  for (const task of archivedTasks) {
    if (task.archiveRootId) taskCounts.set(task.archiveRootId, (taskCounts.get(task.archiveRootId) ?? 0) + 1);
  }
  return roots.map((item) => ({ item, taskCount: item.kind === "project" ? taskCounts.get(item.id) ?? 0 : 0 }));
}

export async function listArchivedProjects(ownerId: string) {
  return (await listTrashedItems(ownerId))
    .filter((entry) => entry.item.kind === "project")
    .map((entry) => ({ project: entry.item, taskCount: entry.taskCount }));
}

export async function trashItems(
  ownerId: string,
  input: { itemIds?: string[]; scope?: "all_project_task" },
) {
  const requestedIds = [...new Set((input.itemIds ?? []).map((id) => id.trim()).filter(Boolean))];
  if (input.scope !== "all_project_task" && requestedIds.length === 0) throw new Error("itemIds are required");
  const candidates = await getDb()
    .select()
    .from(items)
    .where(and(
      eq(items.ownerId, ownerId),
      inArray(items.kind, ["project", "task"]),
      isNull(items.archivedAt),
      input.scope === "all_project_task" ? undefined : inArray(items.id, requestedIds),
    ));
  if (!candidates.length) return { trashedRootIds: [] as string[], projectCount: 0, taskCount: 0, affectedItemCount: 0 };
  if (input.scope !== "all_project_task" && candidates.length !== requestedIds.length) {
    throw new Error("One or more Project or Task items were not found");
  }

  const projectIds = new Set(candidates.filter((item) => item.kind === "project").map((item) => item.id));
  const standaloneTaskIds = candidates
    .filter((item) => item.kind === "task" && (!item.parentId || !projectIds.has(item.parentId)))
    .map((item) => item.id);
  const selectedProjectIds = [...projectIds];
  const projectTaskRows = selectedProjectIds.length
    ? await getDb().select({ id: items.id }).from(items).where(and(
      eq(items.ownerId, ownerId),
      eq(items.kind, "task"),
      inArray(items.parentId, selectedProjectIds),
      isNull(items.archivedAt),
    ))
    : [];
  const now = new Date().toISOString();
  const d1 = (env as RuntimeEnv).DB;
  const statements = [
    ...selectedProjectIds.flatMap((projectId) => [
      d1.prepare(`UPDATE items
        SET archived_from_status = CASE
              WHEN archived_at IS NULL OR archived_from_status IS NULL THEN status
              ELSE archived_from_status
            END,
            status = 'archived',
            archived_at = COALESCE(archived_at, ?),
            archive_root_id = ?,
            updated_at = ?
        WHERE owner_id = ? AND (id = ? OR (parent_id = ? AND kind = 'task'))`)
        .bind(now, projectId, now, ownerId, projectId, projectId),
      d1.prepare(`INSERT INTO activity_log (id, owner_id, item_id, action, source, payload, created_at)
        VALUES (?, ?, ?, 'item_trashed', 'web', ?, ?)`)
        .bind(crypto.randomUUID(), ownerId, projectId, JSON.stringify({ rootId: projectId, kind: "project" }), now),
    ]),
    ...standaloneTaskIds.flatMap((taskId) => [
      d1.prepare(`UPDATE items
        SET archived_from_status = CASE
              WHEN archived_from_status IS NULL THEN status
              ELSE archived_from_status
            END,
            status = 'archived', archived_at = ?, archive_root_id = id, updated_at = ?
        WHERE owner_id = ? AND id = ? AND kind = 'task' AND archived_at IS NULL`)
        .bind(now, now, ownerId, taskId),
      d1.prepare(`INSERT INTO activity_log (id, owner_id, item_id, action, source, payload, created_at)
        VALUES (?, ?, ?, 'item_trashed', 'web', ?, ?)`)
        .bind(crypto.randomUUID(), ownerId, taskId, JSON.stringify({ rootId: taskId, kind: "task" }), now),
    ]),
  ];
  if (statements.length) await d1.batch(statements);
  const trashedTaskIds = new Set([...projectTaskRows.map((entry) => entry.id), ...standaloneTaskIds]);
  return {
    trashedRootIds: [...selectedProjectIds, ...standaloneTaskIds],
    projectCount: selectedProjectIds.length,
    taskCount: trashedTaskIds.size,
    affectedItemCount: selectedProjectIds.length + trashedTaskIds.size,
  };
}

export async function restoreTrashedItems(ownerId: string, itemIds: string[]) {
  const requestedIds = [...new Set(itemIds.map((id) => id.trim()).filter(Boolean))];
  if (!requestedIds.length) throw new Error("itemIds are required");
  const roots = await getDb().select().from(items).where(and(
    eq(items.ownerId, ownerId),
    inArray(items.id, requestedIds),
    inArray(items.kind, ["project", "task"]),
    sql`${items.archivedAt} IS NOT NULL`,
  ));
  if (roots.length !== requestedIds.length) throw new Error("One or more trashed items were not found");
  const now = new Date().toISOString();
  const d1 = (env as RuntimeEnv).DB;
  const statements: D1PreparedStatement[] = [];
  let restoredCount = 0;
  for (const root of roots) {
    if (root.kind === "project") {
      const [{ count }] = await getDb().select({ count: sql<number>`count(*)` }).from(items).where(and(
        eq(items.ownerId, ownerId),
        or(eq(items.id, root.id), eq(items.archiveRootId, root.id)),
      ));
      restoredCount += Number(count ?? 0);
      statements.push(d1.prepare(`UPDATE items
        SET status = CASE
              WHEN archived_from_status IS NULL OR archived_from_status = 'archived'
                THEN CASE kind WHEN 'project' THEN 'backlog' ELSE 'todo' END
              ELSE archived_from_status
            END,
            archived_at = NULL, archived_from_status = NULL, archive_root_id = NULL, updated_at = ?
        WHERE owner_id = ? AND (id = ? OR archive_root_id = ?)`)
        .bind(now, ownerId, root.id, root.id));
    } else {
      let parentActive = false;
      if (root.parentId) {
        const parent = await getItem(ownerId, root.parentId);
        parentActive = Boolean(parent && parent.kind === "project" && !parent.archivedAt);
      }
      let routineId = root.routineId;
      if (!parentActive) {
        const routine = routineId ? await getRoutine(ownerId, routineId) : null;
        routineId = routine ? routine.id : (await ensureGeneralRoutine(ownerId)).id;
      }
      statements.push(d1.prepare(`UPDATE items
        SET status = CASE WHEN archived_from_status IS NULL OR archived_from_status = 'archived' THEN 'todo' ELSE archived_from_status END,
            parent_id = ?, routine_id = ?, archived_at = NULL, archived_from_status = NULL,
            archive_root_id = NULL, updated_at = ?
        WHERE owner_id = ? AND id = ? AND kind = 'task'`)
        .bind(parentActive ? root.parentId : null, parentActive ? null : routineId, now, ownerId, root.id));
      restoredCount += 1;
    }
    statements.push(d1.prepare(`INSERT INTO activity_log (id, owner_id, item_id, action, source, payload, created_at)
      VALUES (?, ?, ?, 'item_restored', 'web', ?, ?)`)
      .bind(crypto.randomUUID(), ownerId, root.id, JSON.stringify({ rootId: root.id, kind: root.kind }), now));
  }
  await d1.batch(statements);
  return { restored: true, restoredRootIds: roots.map((root) => root.id), restoredCount };
}

export async function permanentlyDeleteTrashedItems(ownerId: string, itemIds: string[], confirmationText: string) {
  if (confirmationText !== "영구 삭제") throw new Error("Permanent deletion confirmation does not match");
  const requestedIds = [...new Set(itemIds.map((id) => id.trim()).filter(Boolean))];
  if (!requestedIds.length) throw new Error("itemIds are required");
  const roots = await getDb().select().from(items).where(and(
    eq(items.ownerId, ownerId),
    inArray(items.id, requestedIds),
    inArray(items.kind, ["project", "task"]),
    sql`${items.archivedAt} IS NOT NULL`,
  ));
  if (roots.length !== requestedIds.length) throw new Error("One or more trashed items were not found");
  const projectIds = new Set(roots.filter((root) => root.kind === "project").map((root) => root.id));
  const standaloneTaskIds = roots.filter((root) => root.kind === "task" && (!root.parentId || !projectIds.has(root.parentId))).map((root) => root.id);
  const affectedRows = await getDb().select({ id: items.id, kind: items.kind }).from(items).where(and(
    eq(items.ownerId, ownerId),
    or(
      selectedIdCondition(items.id, standaloneTaskIds),
      selectedIdCondition(items.id, [...projectIds]),
      selectedIdCondition(items.archiveRootId, [...projectIds]),
      selectedIdCondition(items.parentId, [...projectIds]),
    ),
  ));
  const affectedIds = [...new Set(affectedRows.map((row) => row.id))];
  if (!affectedIds.length) return { deleted: true, deletedRootIds: [] as string[], deletedProjectCount: 0, deletedTaskCount: 0, deletedItemCount: 0 };
  const placeholders = affectedIds.map(() => "?").join(", ");
  const d1 = (env as RuntimeEnv).DB;
  await d1.batch([
    d1.prepare(`DELETE FROM activity_log WHERE owner_id = ? AND item_id IN (${placeholders})`).bind(ownerId, ...affectedIds),
    d1.prepare(`DELETE FROM google_calendar_events WHERE owner_id = ? AND item_id IN (${placeholders})`).bind(ownerId, ...affectedIds),
    d1.prepare(`DELETE FROM checklist_items WHERE owner_id = ? AND task_id IN (${placeholders})`).bind(ownerId, ...affectedIds),
    d1.prepare(`DELETE FROM item_property_values WHERE owner_id = ? AND item_id IN (${placeholders})`).bind(ownerId, ...affectedIds),
    d1.prepare(`DELETE FROM item_assignments WHERE owner_id = ? AND item_id IN (${placeholders})`).bind(ownerId, ...affectedIds),
    d1.prepare(`DELETE FROM project_documents WHERE owner_id = ? AND project_id IN (${placeholders})`).bind(ownerId, ...affectedIds),
    d1.prepare(`DELETE FROM project_hidden_properties WHERE owner_id = ? AND project_id IN (${placeholders})`).bind(ownerId, ...affectedIds),
    d1.prepare(`UPDATE slack_automation_deliveries SET item_id = NULL WHERE owner_id = ? AND item_id IN (${placeholders})`).bind(ownerId, ...affectedIds),
    d1.prepare(`DELETE FROM items WHERE owner_id = ? AND id IN (${placeholders})`).bind(ownerId, ...affectedIds),
  ]);
  return {
    deleted: true,
    deletedRootIds: roots.map((root) => root.id),
    deletedProjectCount: affectedRows.filter((row) => row.kind === "project").length,
    deletedTaskCount: affectedRows.filter((row) => row.kind === "task").length,
    deletedItemCount: affectedRows.length,
  };
}

function selectedIdCondition(column: typeof items.id | typeof items.parentId | typeof items.archiveRootId, ids: string[]) {
  return ids.length ? inArray(column, ids) : sql`0 = 1`;
}

export async function archiveProject(ownerId: string, projectId: string) {
  const project = await getItem(ownerId, projectId);
  if (!project || project.kind !== "project") throw new Error("Project not found");
  if (project.archivedAt) throw new Error("Project is already archived");
  const result = await trashItems(ownerId, { itemIds: [projectId] });
  return { project: (await getItem(ownerId, projectId))!, affectedCount: result.affectedItemCount };
}

export async function restoreProject(ownerId: string, projectId: string) {
  const project = await getItem(ownerId, projectId);
  if (!project || project.kind !== "project") throw new Error("Project not found");
  if (!project.archivedAt) throw new Error("Project is not archived");
  const result = await restoreTrashedItems(ownerId, [projectId]);
  return { project: (await getItem(ownerId, projectId))!, affectedCount: result.restoredCount };
}

export async function permanentlyDeleteArchivedProject(ownerId: string, projectId: string, confirmationTitle: string) {
  const project = await getItem(ownerId, projectId);
  if (!project || project.kind !== "project") throw new Error("Project not found");
  if (!project.archivedAt) throw new Error("Archive the Project before deleting it permanently");
  if (confirmationTitle.trim() !== project.title) throw new Error("Project title confirmation does not match");
  const result = await permanentlyDeleteTrashedItems(ownerId, [projectId], "영구 삭제");
  return {
    deleted: true,
    projectId,
    title: project.title,
    deletedTaskCount: result.deletedTaskCount,
    deletedItemCount: result.deletedItemCount,
  };
}

export async function listPropertyDefinitions(ownerId: string) {
  return getDb()
    .select()
    .from(propertyDefinitions)
    .where(eq(propertyDefinitions.ownerId, ownerId))
    .orderBy(asc(propertyDefinitions.sortOrder), asc(propertyDefinitions.createdAt));
}

export async function listProjectPropertyDefinitions(ownerId: string, includeInactive = false) {
  return (await listPropertyDefinitions(ownerId)).filter((property) =>
    (includeInactive || property.active) && (property.systemKey || !isReservedAssignmentPropertyName(property.name)),
  );
}

export async function getPropertyDefinition(ownerId: string, id: string) {
  const [property] = await getDb()
    .select()
    .from(propertyDefinitions)
    .where(and(eq(propertyDefinitions.ownerId, ownerId), eq(propertyDefinitions.id, id)))
    .limit(1);
  return property ?? null;
}

export async function createPropertyDefinition(
  ownerId: string,
  input: { name: string; type: PropertyType; options?: string[]; defaultValue?: PropertyValue },
) {
  const name = input.name.trim();
  if (!name) throw new Error("Property name is required");
  if (!PROPERTY_TYPES.includes(input.type)) throw new Error("Unsupported property type");
  if (isReservedAssignmentPropertyName(name)) throw new Error("Assignment fields are managed as workspace member tags");

  const existing = await listPropertyDefinitions(ownerId);
  if (existing.some((property) => property.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
    throw new Error("Property name already exists");
  }

  const [created] = await getDb()
    .insert(propertyDefinitions)
    .values({
      id: crypto.randomUUID(),
      ownerId,
      name,
      type: input.type,
      options: JSON.stringify(normalizeOptions(input.options ?? [])),
      defaultValue: JSON.stringify(normalizePropertyValue({ name, type: input.type, options: JSON.stringify(normalizeOptions(input.options ?? [])) } as PropertyDefinition, input.defaultValue ?? null)),
      active: true,
      sortOrder: (existing.at(-1)?.sortOrder ?? 0) + 10,
    })
    .returning();
  return created;
}

export async function deletePropertyDefinition(ownerId: string, id: string) {
  const property = await getPropertyDefinition(ownerId, id);
  if (!property) throw new Error("Property not found");
  await getDb()
    .update(propertyDefinitions)
    .set({ active: false, updatedAt: new Date().toISOString() })
    .where(and(eq(propertyDefinitions.ownerId, ownerId), eq(propertyDefinitions.id, id)));
  return { ...property, active: false };
}

export async function analyzePropertyTypeChange(
  ownerId: string,
  id: string,
  input: { type: PropertyType; options?: string[] },
) {
  const property = await getPropertyDefinition(ownerId, id);
  if (!property) throw new Error("Property not found");
  const rows = await getDb().select().from(itemPropertyValues).where(and(
    eq(itemPropertyValues.ownerId, ownerId),
    eq(itemPropertyValues.propertyId, id),
  ));
  const candidate = { ...property, type: input.type, options: JSON.stringify(normalizeOptions(input.options ?? [])) };
  let convertibleCount = 0;
  let incompatibleCount = 0;
  for (const row of rows) {
    try {
      normalizePropertyValue(candidate, parsePropertyValue(row.value));
      convertibleCount += 1;
    } catch {
      incompatibleCount += 1;
    }
  }
  return { valueCount: rows.length, convertibleCount, incompatibleCount };
}

export async function updatePropertyDefinition(
  ownerId: string,
  id: string,
  patch: Partial<{ name: string; type: PropertyType; options: string[]; defaultValue: PropertyValue; sortOrder: number; active: boolean }>,
) {
  const property = await getPropertyDefinition(ownerId, id);
  if (!property) throw new Error("Property not found");
  const name = patch.name === undefined ? property.name : patch.name.trim();
  if (!name) throw new Error("Property name is required");
  const type = patch.type ?? property.type as PropertyType;
  if (!PROPERTY_TYPES.includes(type)) throw new Error("Unsupported property type");
  if (!property.systemKey && isReservedAssignmentPropertyName(name)) throw new Error("Assignment fields are managed as workspace member tags");
  const existing = await listPropertyDefinitions(ownerId);
  if (existing.some((entry) => entry.id !== id && entry.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
    throw new Error("Property name already exists");
  }
  const options = patch.options === undefined ? parseOptions(property.options) : normalizeOptions(patch.options);
  const nextDefinition = { ...property, name, type, options: JSON.stringify(options) };
  const nextDefault = patch.defaultValue === undefined
    ? parsePropertyValue(property.defaultValue)
    : normalizePropertyValue(nextDefinition, patch.defaultValue);

  if (type !== property.type || patch.options !== undefined) {
    const rows = await getDb().select().from(itemPropertyValues).where(and(
      eq(itemPropertyValues.ownerId, ownerId),
      eq(itemPropertyValues.propertyId, id),
    ));
    for (const row of rows) {
      try {
        const normalized = normalizePropertyValue(nextDefinition, parsePropertyValue(row.value));
        await getDb().update(itemPropertyValues).set({
          value: JSON.stringify(normalized),
          legacyValue: null,
          updatedAt: new Date().toISOString(),
        }).where(eq(itemPropertyValues.id, row.id));
      } catch {
        await getDb().update(itemPropertyValues).set({
          value: "null",
          legacyValue: row.value,
          updatedAt: new Date().toISOString(),
        }).where(eq(itemPropertyValues.id, row.id));
      }
    }
  }

  const [updated] = await getDb().update(propertyDefinitions).set({
    name,
    type,
    options: JSON.stringify(options),
    defaultValue: JSON.stringify(nextDefault),
    sortOrder: patch.sortOrder ?? property.sortOrder,
    active: patch.active ?? property.active,
    updatedAt: new Date().toISOString(),
  }).where(and(eq(propertyDefinitions.ownerId, ownerId), eq(propertyDefinitions.id, id))).returning();
  return updated;
}

export async function setPropertyValue(
  ownerId: string,
  itemId: string,
  propertyId: string,
  value: PropertyValue,
) {
  const [itemRecord, property] = await Promise.all([
    getItem(ownerId, itemId),
    getPropertyDefinition(ownerId, propertyId),
  ]);
  if (!itemRecord) throw new Error("Item not found");
  if (!property) throw new Error("Property not found");
  if (!property.active) throw new Error("Restore the property before changing its value");
  if (property.systemKey) throw new Error("System properties must be changed through the Project fields");
  if (itemRecord.kind !== "project") throw new Error("Custom properties can only be set on Project items");
  if (itemRecord.archivedAt) throw new Error("Restore the Project before changing its properties");

  const normalized = normalizePropertyValue(property, value);
  if ((property.type === "member" || property.type === "members") && normalized !== null) {
    const memberIds = (Array.isArray(normalized) ? normalized : [normalized]).filter((entry): entry is string => typeof entry === "string");
    const members = await getDb().select({ id: workspaceMembers.id }).from(workspaceMembers).where(and(
      eq(workspaceMembers.workspaceId, ownerId),
      eq(workspaceMembers.status, "active"),
      inArray(workspaceMembers.id, memberIds),
    ));
    if (members.length !== new Set(memberIds).size) throw new Error("Property members must be active workspace members");
  }
  if (normalized === null) {
    await getDb()
      .delete(itemPropertyValues)
      .where(
        and(
          eq(itemPropertyValues.ownerId, ownerId),
          eq(itemPropertyValues.itemId, itemId),
          eq(itemPropertyValues.propertyId, propertyId),
        ),
      );
    return null;
  }

  const updatedAt = new Date().toISOString();
  const [stored] = await getDb()
    .insert(itemPropertyValues)
    .values({
      id: crypto.randomUUID(),
      ownerId,
      itemId,
      propertyId,
      value: JSON.stringify(normalized),
      updatedAt,
    })
    .onConflictDoUpdate({
      target: [itemPropertyValues.ownerId, itemPropertyValues.itemId, itemPropertyValues.propertyId],
      set: { value: JSON.stringify(normalized), updatedAt },
    })
    .returning();

  await logActivity(ownerId, itemId, "property_updated", "web", {
    propertyId,
    value: normalized,
  });
  return stored;
}

export async function getPropertyValueMap(ownerId: string) {
  const rows = await getDb()
    .select()
    .from(itemPropertyValues)
    .where(eq(itemPropertyValues.ownerId, ownerId));
  const result: Record<string, Record<string, PropertyValue>> = {};
  for (const row of rows) {
    result[row.itemId] ??= {};
    result[row.itemId][row.propertyId] = parsePropertyValue(row.value);
  }
  return result;
}

export async function getProjectPropertyValueMap(ownerId: string) {
  const rows = await getDb()
    .select({
      itemId: itemPropertyValues.itemId,
      propertyId: itemPropertyValues.propertyId,
      value: itemPropertyValues.value,
    })
    .from(itemPropertyValues)
    .innerJoin(items, eq(itemPropertyValues.itemId, items.id))
    .where(and(eq(itemPropertyValues.ownerId, ownerId), eq(items.ownerId, ownerId), eq(items.kind, "project")));
  const result: Record<string, Record<string, PropertyValue>> = {};
  for (const row of rows) {
    result[row.itemId] ??= {};
    result[row.itemId][row.propertyId] = parsePropertyValue(row.value);
  }
  return result;
}

export async function getProjectPropertyUsageCounts(ownerId: string) {
  const [values, definitions, projects, assignments] = await Promise.all([
    getProjectPropertyValueMap(ownerId),
    listProjectPropertyDefinitions(ownerId, true),
    getDb().select().from(items).where(and(eq(items.ownerId, ownerId), eq(items.kind, "project"))),
    getDb().select({ itemId: itemAssignments.itemId, role: itemAssignments.role }).from(itemAssignments).where(and(
      eq(itemAssignments.ownerId, ownerId),
      inArray(itemAssignments.role, ["project_dri", "project_worker"]),
    )),
  ]);
  const counts: Record<string, number> = {};
  for (const itemValues of Object.values(values)) {
    for (const propertyId of Object.keys(itemValues)) counts[propertyId] = (counts[propertyId] ?? 0) + 1;
  }
  for (const property of definitions.filter((entry) => entry.systemKey)) {
    if (property.systemKey === "parent_id") counts[property.id] = projects.filter((project) => Boolean(project.parentId)).length;
    else if (property.systemKey === "due_date") counts[property.id] = projects.filter((project) => Boolean(project.dueDate)).length;
    else if (property.systemKey === "project_dri") counts[property.id] = new Set(assignments.filter((entry) => entry.role === "project_dri").map((entry) => entry.itemId)).size;
    else if (property.systemKey === "project_workers") counts[property.id] = new Set(assignments.filter((entry) => entry.role === "project_worker").map((entry) => entry.itemId)).size;
    else counts[property.id] = projects.length;
  }
  return counts;
}

export async function getProjectHiddenPropertyMap(ownerId: string) {
  const rows = await getDb()
    .select()
    .from(projectHiddenProperties)
    .where(eq(projectHiddenProperties.ownerId, ownerId));
  const result: Record<string, string[]> = {};
  for (const row of rows) {
    result[row.projectId] ??= [];
    result[row.projectId].push(row.propertyId);
  }
  return result;
}

export async function setProjectPropertyHidden(
  ownerId: string,
  projectId: string,
  propertyId: string,
  hidden: boolean,
) {
  const [project, property] = await Promise.all([
    getItem(ownerId, projectId),
    getPropertyDefinition(ownerId, propertyId),
  ]);
  if (!project || project.kind !== "project") throw new Error("Project not found");
  if (!property) throw new Error("Property not found");
  if (hidden) {
    await getDb()
      .insert(projectHiddenProperties)
      .values({ id: crypto.randomUUID(), ownerId, projectId, propertyId })
      .onConflictDoNothing();
  } else {
    await getDb()
      .delete(projectHiddenProperties)
      .where(and(
        eq(projectHiddenProperties.ownerId, ownerId),
        eq(projectHiddenProperties.projectId, projectId),
        eq(projectHiddenProperties.propertyId, propertyId),
      ));
  }
  return { projectId, propertyId, hidden };
}

export async function getItemPropertiesByName(ownerId: string) {
  const [definitions, values] = await Promise.all([
    listProjectPropertyDefinitions(ownerId),
    getPropertyValueMap(ownerId),
  ]);
  const names = new Map(definitions.map((property) => [property.id, property.name]));
  const result: Record<string, Record<string, PropertyValue>> = {};
  for (const [itemId, itemValues] of Object.entries(values)) {
    result[itemId] = {};
    for (const [propertyId, value] of Object.entries(itemValues)) {
      const name = names.get(propertyId);
      if (name) result[itemId][name] = value;
    }
  }
  return result;
}

export async function setItemPropertiesByName(
  ownerId: string,
  itemId: string,
  values: Record<string, PropertyValue>,
) {
  const definitions = await listProjectPropertyDefinitions(ownerId);
  const byName = new Map(definitions.map((property) => [property.name.toLocaleLowerCase(), property]));
  for (const [name, value] of Object.entries(values)) {
    const property = byName.get(name.toLocaleLowerCase());
    if (!property) throw new Error(`Property not found: ${name}`);
    await setPropertyValue(ownerId, itemId, property.id, value);
  }
}

function isReservedAssignmentPropertyName(name: string) {
  return reservedAssignmentPropertyNames.has(name.trim().toLocaleLowerCase());
}

export function serializePropertyDefinition(property: PropertyDefinition, valueCount = 0) {
  return {
    id: property.id,
    name: property.name,
    type: property.type,
    options: parseOptions(property.options),
    defaultValue: parsePropertyValue(property.defaultValue),
    systemKey: property.systemKey,
    active: property.active,
    sortOrder: property.sortOrder,
    valueCount,
  };
}

export async function getProjectDocument(ownerId: string, projectId: string) {
  const project = await getItem(ownerId, projectId);
  if (!project || project.kind !== "project") throw new Error("Project not found");
  const [document] = await getDb().select().from(projectDocuments).where(and(
    eq(projectDocuments.ownerId, ownerId),
    eq(projectDocuments.projectId, projectId),
  )).limit(1);
  if (document) return serializeProjectDocument(document);
  return {
    id: null,
    projectId,
    content: JSON.stringify(blocksFromPlainText(project.description)),
    plainText: project.description,
    version: 0,
    updatedAt: project.updatedAt,
  };
}

export async function saveProjectDocument(
  ownerId: string,
  projectId: string,
  input: { content: string; plainText: string; expectedVersion: number; userId?: string | null },
) {
  const project = await getItem(ownerId, projectId);
  if (!project || project.kind !== "project") throw new Error("Project not found");
  if (project.archivedAt) throw new Error("Restore the Project before changing its document");
  const content = normalizeBlockContent(input.content);
  const plainText = normalizeDocumentText(input.plainText);
  const [current] = await getDb().select().from(projectDocuments).where(and(
    eq(projectDocuments.ownerId, ownerId),
    eq(projectDocuments.projectId, projectId),
  )).limit(1);
  const currentVersion = current?.version ?? 0;
  if (input.expectedVersion !== currentVersion) throw new Error("Document version conflict");
  const now = new Date().toISOString();
  const nextVersion = currentVersion + 1;
  const d1 = (env as RuntimeEnv).DB;
  const documentStatement = current
    ? d1.prepare(`UPDATE project_documents
        SET content = ?, plain_text = ?, version = ?, updated_by_user_id = ?, updated_at = ?
        WHERE owner_id = ? AND project_id = ? AND version = ?`)
      .bind(content, plainText, nextVersion, input.userId ?? null, now, ownerId, projectId, currentVersion)
    : d1.prepare(`INSERT INTO project_documents
        (id, owner_id, project_id, content, plain_text, version, updated_by_user_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(crypto.randomUUID(), ownerId, projectId, content, plainText, nextVersion, input.userId ?? null, now, now);
  await d1.batch([
    documentStatement,
    d1.prepare(`UPDATE items SET description = ?, updated_at = ?
        WHERE owner_id = ? AND id = ? AND EXISTS (
          SELECT 1 FROM project_documents
          WHERE owner_id = ? AND project_id = ? AND version = ? AND updated_at = ?
        )`)
      .bind(plainText, now, ownerId, projectId, ownerId, projectId, nextVersion, now),
  ]);
  const [saved] = await getDb().select().from(projectDocuments).where(and(
    eq(projectDocuments.ownerId, ownerId),
    eq(projectDocuments.projectId, projectId),
  )).limit(1);
  if (!saved) throw new Error("Project document could not be saved");
  if (saved.version !== nextVersion || saved.updatedAt !== now) throw new Error("Document version conflict");
  await logActivity(ownerId, projectId, "project_document_updated", "web", { version: nextVersion });
  return serializeProjectDocument(saved);
}

export async function listProjectTemplates(ownerId: string) {
  const rows = await getDb().select().from(projectTemplates).where(eq(projectTemplates.ownerId, ownerId)).orderBy(
    desc(projectTemplates.updatedAt),
    asc(projectTemplates.name),
  );
  return rows.map(serializeProjectTemplate);
}

export async function getProjectTemplate(ownerId: string, id: string) {
  const [template] = await getDb().select().from(projectTemplates).where(and(
    eq(projectTemplates.ownerId, ownerId),
    eq(projectTemplates.id, id),
  )).limit(1);
  return template ?? null;
}

export async function createProjectTemplate(
  ownerId: string,
  input: { name: string; description?: string; content?: string; plainText?: string; userId?: string | null },
) {
  const name = normalizeTemplateName(input.name);
  const existing = await listProjectTemplates(ownerId);
  if (existing.some((entry) => entry.name.toLocaleLowerCase() === name.toLocaleLowerCase())) throw new Error("Template name already exists");
  const now = new Date().toISOString();
  const [created] = await getDb().insert(projectTemplates).values({
    id: crypto.randomUUID(),
    ownerId,
    name,
    description: normalizeTemplateDescription(input.description ?? ""),
    content: normalizeBlockContent(input.content ?? "[]"),
    plainText: normalizeDocumentText(input.plainText ?? ""),
    createdByUserId: input.userId ?? null,
    createdAt: now,
    updatedAt: now,
  }).returning();
  return serializeProjectTemplate(created);
}

export async function updateProjectTemplate(
  ownerId: string,
  id: string,
  patch: Partial<{ name: string; description: string; content: string; plainText: string }>,
) {
  const template = await getProjectTemplate(ownerId, id);
  if (!template) throw new Error("Template not found");
  const name = patch.name === undefined ? template.name : normalizeTemplateName(patch.name);
  if (name.toLocaleLowerCase() !== template.name.toLocaleLowerCase()) {
    const existing = await listProjectTemplates(ownerId);
    if (existing.some((entry) => entry.id !== id && entry.name.toLocaleLowerCase() === name.toLocaleLowerCase())) throw new Error("Template name already exists");
  }
  const [updated] = await getDb().update(projectTemplates).set({
    name,
    description: patch.description === undefined ? template.description : normalizeTemplateDescription(patch.description),
    content: patch.content === undefined ? template.content : normalizeBlockContent(patch.content),
    plainText: patch.plainText === undefined ? template.plainText : normalizeDocumentText(patch.plainText),
    updatedAt: new Date().toISOString(),
  }).where(and(eq(projectTemplates.ownerId, ownerId), eq(projectTemplates.id, id))).returning();
  return serializeProjectTemplate(updated);
}

export async function deleteProjectTemplate(ownerId: string, id: string) {
  const template = await getProjectTemplate(ownerId, id);
  if (!template) throw new Error("Template not found");
  await getDb().delete(projectTemplates).where(and(eq(projectTemplates.ownerId, ownerId), eq(projectTemplates.id, id)));
  return { deleted: true, id, name: template.name };
}

export async function applyProjectTemplate(ownerId: string, projectId: string, templateId: string, userId?: string | null) {
  const template = await getProjectTemplate(ownerId, templateId);
  if (!template) throw new Error("Template not found");
  const document = await getProjectDocument(ownerId, projectId);
  const templateBlocks = parseBlockArray(template.content);
  const existingBlocks = parseBlockArray(document.content);
  const content = JSON.stringify([...templateBlocks, ...existingBlocks]);
  const plainText = [template.plainText.trim(), document.plainText.trim()].filter(Boolean).join("\n\n");
  return saveProjectDocument(ownerId, projectId, {
    content,
    plainText,
    expectedVersion: document.version,
    userId,
  });
}

function serializeProjectDocument(document: ProjectDocument) {
  return {
    id: document.id,
    projectId: document.projectId,
    content: document.content,
    plainText: document.plainText,
    version: document.version,
    updatedAt: document.updatedAt,
  };
}

function serializeProjectTemplate(template: ProjectTemplate) {
  return {
    id: template.id,
    name: template.name,
    description: template.description,
    content: template.content,
    plainText: template.plainText,
    createdAt: template.createdAt,
    updatedAt: template.updatedAt,
  };
}

function normalizeBlockContent(value: string) {
  if (value.length > 500_000) throw new Error("Project document is too large");
  return JSON.stringify(parseBlockArray(value));
}

function parseBlockArray(value: string): Record<string, unknown>[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("Document content must be valid block JSON");
  }
  if (!Array.isArray(parsed) || !parsed.every((entry) => entry && typeof entry === "object" && !Array.isArray(entry))) {
    throw new Error("Document content must be a block array");
  }
  return parsed as Record<string, unknown>[];
}

function blocksFromPlainText(value: string) {
  const lines = value.split(/\r?\n/);
  const blocks = lines.map((line) => {
    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) return { type: "heading", props: { level: heading[1].length }, content: heading[2] };
    return { type: "paragraph", content: line };
  });
  return blocks.length ? blocks : [{ type: "paragraph", content: "" }];
}

function normalizeDocumentText(value: string) {
  if (value.length > 200_000) throw new Error("Project document text is too large");
  return value.replace(/\r\n/g, "\n").trim();
}

function normalizeTemplateName(value: string) {
  const name = value.trim().replace(/\s+/g, " ");
  if (!name) throw new Error("Template name is required");
  if (name.length > 100) throw new Error("Template name is too long");
  return name;
}

function normalizeTemplateDescription(value: string) {
  const description = value.trim();
  if (description.length > 500) throw new Error("Template description is too long");
  return description;
}

export async function getPeriodReview(ownerId: string, cadence: ItemCadence) {
  const now = new Date();
  const days = cadence === "daily" ? 1 : cadence === "weekly" ? 7 : cadence === "monthly" ? 31 : 92;
  const boundary = new Date(now.getTime() + days * 86_400_000).toISOString().slice(0, 10);
  const rows = await getDb()
    .select()
    .from(items)
    .where(
      and(
        eq(items.ownerId, ownerId),
        isNull(items.archivedAt),
        or(eq(items.cadence, cadence), and(sql`${items.dueDate} IS NOT NULL`, lte(items.dueDate, boundary))),
      ),
    )
    .orderBy(asc(items.dueDate), asc(items.sortOrder))
    .limit(100);

  const completed = rows.filter((item) => completedStatuses.has(item.status as ItemStatus)).length;
  const blocked = rows.filter((item) => item.status === "blocked").length;
  const averageProgress = rows.length
    ? Math.round(rows.reduce((sum, item) => sum + item.progress, 0) / rows.length)
    : 0;

  return { cadence, total: rows.length, completed, blocked, averageProgress, items: rows };
}

export async function listChecklistItems(ownerId: string, taskId: string) {
  await requireTask(ownerId, taskId);
  return getDb()
    .select()
    .from(checklistItems)
    .where(and(eq(checklistItems.ownerId, ownerId), eq(checklistItems.taskId, taskId)))
    .orderBy(asc(checklistItems.sortOrder), asc(checklistItems.createdAt));
}

export async function createChecklistItem(ownerId: string, taskId: string, title: string) {
  await requireTask(ownerId, taskId);
  const normalizedTitle = title.trim();
  if (!normalizedTitle) throw new Error("Checklist title is required");

  const existing = await listChecklistItems(ownerId, taskId);
  const [created] = await getDb()
    .insert(checklistItems)
    .values({
      id: crypto.randomUUID(),
      ownerId,
      taskId,
      title: normalizedTitle,
      sortOrder: (existing.at(-1)?.sortOrder ?? 0) + 10,
    })
    .returning();
  await syncChecklistProgress(ownerId, taskId);
  return created;
}

export async function updateChecklistItem(
  ownerId: string,
  id: string,
  patch: Partial<{ title: string; completed: boolean }>,
) {
  const [current] = await getDb()
    .select()
    .from(checklistItems)
    .where(and(eq(checklistItems.ownerId, ownerId), eq(checklistItems.id, id)))
    .limit(1);
  if (!current) throw new Error("Checklist item not found");

  const values: Partial<typeof checklistItems.$inferInsert> = { updatedAt: new Date().toISOString() };
  if (patch.title !== undefined) {
    const title = patch.title.trim();
    if (!title) throw new Error("Checklist title is required");
    values.title = title;
  }
  if (patch.completed !== undefined) values.completed = patch.completed;

  const [updated] = await getDb()
    .update(checklistItems)
    .set(values)
    .where(and(eq(checklistItems.ownerId, ownerId), eq(checklistItems.id, id)))
    .returning();
  await syncChecklistProgress(ownerId, current.taskId);
  return updated;
}

export async function deleteChecklistItem(ownerId: string, id: string) {
  const [current] = await getDb()
    .select()
    .from(checklistItems)
    .where(and(eq(checklistItems.ownerId, ownerId), eq(checklistItems.id, id)))
    .limit(1);
  if (!current) throw new Error("Checklist item not found");

  await getDb()
    .delete(checklistItems)
    .where(and(eq(checklistItems.ownerId, ownerId), eq(checklistItems.id, id)));
  await syncChecklistProgress(ownerId, current.taskId);
  return current;
}

export function serializeChecklistItem(item: typeof checklistItems.$inferSelect) {
  return {
    id: item.id,
    taskId: item.taskId,
    title: item.title,
    completed: item.completed,
    sortOrder: item.sortOrder,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

export async function listRoutines(
  ownerId: string,
  requestedDate: string,
  includeInactive = true,
) {
  const date = normalizeDate(requestedDate);
  const routineRows = await getDb()
    .select()
    .from(routines)
    .where(includeInactive ? eq(routines.ownerId, ownerId) : and(eq(routines.ownerId, ownerId), eq(routines.active, true)))
    .orderBy(asc(routines.sortOrder), asc(routines.createdAt));
  const completionRows = await getDb()
    .select()
    .from(routineCompletions)
    .where(and(eq(routineCompletions.ownerId, ownerId), eq(routineCompletions.completionDate, date)));
  const completionByRoutine = new Map(completionRows.map((completion) => [completion.routineId, completion]));
  return routineRows.map((routine) => serializeRoutine(routine, date, completionByRoutine.get(routine.id)));
}

export async function createRoutine(
  ownerId: string,
  input: {
    title: string;
    description?: string;
    triggerPoint?: string;
    actionPlace?: string;
    actionSteps?: string;
    cadence?: RoutineCadence;
    active?: boolean;
    assigneeMemberId?: string | null;
  },
) {
  const title = input.title.trim();
  if (!title) throw new Error("Routine title is required");
  const cadence = input.cadence ?? "daily";
  if (!ROUTINE_CADENCES.includes(cadence)) throw new Error("Unsupported routine cadence");
  await validateRoutineAssignee(ownerId, input.assigneeMemberId ?? null);
  const [last] = await getDb()
    .select({ sortOrder: routines.sortOrder })
    .from(routines)
    .where(eq(routines.ownerId, ownerId))
    .orderBy(desc(routines.sortOrder))
    .limit(1);
  const [created] = await getDb()
    .insert(routines)
    .values({
      id: crypto.randomUUID(),
      ownerId,
      systemKey: null,
      assigneeMemberId: input.assigneeMemberId ?? null,
      title,
      description: input.description?.trim() ?? "",
      triggerPoint: input.triggerPoint?.trim() ?? "",
      actionPlace: input.actionPlace?.trim() ?? "",
      actionSteps: input.actionSteps?.trim() ?? "",
      cadence,
      active: input.active ?? true,
      sortOrder: (last?.sortOrder ?? 0) + 10,
    })
    .returning();
  return created;
}

export async function updateRoutine(
  ownerId: string,
  id: string,
  patch: Partial<{
    title: string;
    description: string;
    triggerPoint: string;
    actionPlace: string;
    actionSteps: string;
    cadence: RoutineCadence;
    active: boolean;
    assigneeMemberId: string | null;
  }>,
) {
  const current = await getRoutine(ownerId, id);
  if (!current) throw new Error("Routine not found");
  if (current.systemKey === GENERAL_ROUTINE_SYSTEM_KEY) throw new Error("General routine is protected");
  if (patch.title !== undefined && !patch.title.trim()) throw new Error("Routine title is required");
  if (patch.cadence !== undefined && !ROUTINE_CADENCES.includes(patch.cadence)) {
    throw new Error("Unsupported routine cadence");
  }
  if (patch.assigneeMemberId !== undefined) await validateRoutineAssignee(ownerId, patch.assigneeMemberId);
  const [updated] = await getDb()
    .update(routines)
    .set({
      title: patch.title?.trim(),
      description: patch.description?.trim(),
      triggerPoint: patch.triggerPoint?.trim(),
      actionPlace: patch.actionPlace?.trim(),
      actionSteps: patch.actionSteps?.trim(),
      cadence: patch.cadence,
      active: patch.active,
      assigneeMemberId: patch.assigneeMemberId,
      updatedAt: new Date().toISOString(),
    })
    .where(and(eq(routines.ownerId, ownerId), eq(routines.id, id)))
    .returning();
  return updated;
}

export async function deleteRoutine(ownerId: string, id: string) {
  const current = await getRoutine(ownerId, id);
  if (!current) throw new Error("Routine not found");
  if (current.systemKey === GENERAL_ROUTINE_SYSTEM_KEY) throw new Error("General routine is protected");
  const general = await ensureGeneralRoutine(ownerId);
  await getDb()
    .update(items)
    .set({ routineId: general.id, cycleId: null, updatedAt: new Date().toISOString() })
    .where(and(eq(items.ownerId, ownerId), eq(items.routineId, id)));
  await getDb()
    .delete(routineCompletions)
    .where(and(eq(routineCompletions.ownerId, ownerId), eq(routineCompletions.routineId, id)));
  await getDb()
    .delete(routines)
    .where(and(eq(routines.ownerId, ownerId), eq(routines.id, id)));
  return current;
}

export async function setRoutineCompletion(
  ownerId: string,
  routineId: string,
  completionDate: string,
  completed: boolean,
  note = "",
) {
  const date = normalizeDate(completionDate);
  const routine = await getRoutine(ownerId, routineId);
  if (!routine) throw new Error("Routine not found");
  if (routine.systemKey === GENERAL_ROUTINE_SYSTEM_KEY) throw new Error("General routine cannot be completed");
  if (!completed) {
    await getDb()
      .delete(routineCompletions)
      .where(
        and(
          eq(routineCompletions.ownerId, ownerId),
          eq(routineCompletions.routineId, routineId),
          eq(routineCompletions.completionDate, date),
        ),
      );
  } else {
    await getDb()
      .insert(routineCompletions)
      .values({ id: crypto.randomUUID(), ownerId, routineId, completionDate: date, note: note.trim() })
      .onConflictDoUpdate({
        target: [routineCompletions.ownerId, routineCompletions.routineId, routineCompletions.completionDate],
        set: { note: note.trim() },
      });
  }
  const rows = await listRoutines(ownerId, date);
  return rows.find((entry) => entry.id === routineId)!;
}

async function getRoutine(ownerId: string, id: string) {
  const [routine] = await getDb()
    .select()
    .from(routines)
    .where(and(eq(routines.ownerId, ownerId), eq(routines.id, id)))
    .limit(1);
  return routine ?? null;
}

async function validateRoutineAssignee(ownerId: string, memberId: string | null) {
  if (!memberId) return;
  const [member] = await getDb().select({ id: workspaceMembers.id }).from(workspaceMembers).where(and(
    eq(workspaceMembers.workspaceId, ownerId),
    eq(workspaceMembers.id, memberId),
    eq(workspaceMembers.status, "active"),
  )).limit(1);
  if (!member) throw new Error("Routine assignee must be an active workspace member");
}

export function serializeRoutine(
  routine: typeof routines.$inferSelect,
  date: string,
  completion?: typeof routineCompletions.$inferSelect,
) {
  return {
    id: routine.id,
    systemKey: routine.systemKey,
    assigneeMemberId: routine.assigneeMemberId,
    title: routine.title,
    description: routine.description,
    triggerPoint: routine.triggerPoint,
    actionPlace: routine.actionPlace,
    actionSteps: routine.actionSteps,
    cadence: routine.cadence,
    active: routine.active,
    sortOrder: routine.sortOrder,
    date,
    completed: Boolean(completion),
    completionId: completion?.id ?? null,
    note: completion?.note ?? "",
    createdAt: routine.createdAt,
    updatedAt: routine.updatedAt,
  };
}

export async function getDailyScrum(ownerId: string, scrumDate: string) {
  const date = normalizeDate(scrumDate);
  const previousDate = addDays(date, -1);
  const [saved] = await getDb()
    .select()
    .from(dailyScrums)
    .where(and(eq(dailyScrums.ownerId, ownerId), eq(dailyScrums.scrumDate, date)))
    .limit(1);
  const tasks = await listItems(ownerId, { kind: "task", limit: 200 });
  const activeTasks = tasks.filter((task) => task.status !== "done");
  const yesterdayTasks = tasks
    .filter(
      (task) =>
        task.status === "done" &&
        (task.updatedAt.slice(0, 10) === previousDate || task.dueDate === previousDate),
    )
    .slice(0, 8);
  const todayTasks = activeTasks
    .filter(
      (task) =>
        task.status === "in_progress" ||
        task.dueDate === date ||
        (task.dueDate !== null && task.dueDate < date),
    )
    .sort(compareTaskUrgency)
    .slice(0, 8);
  const blockers = tasks.filter((task) => task.status === "blocked").slice(0, 8);

  return {
    date,
    yesterdayNote: saved?.yesterdayNote ?? "",
    todayNote: saved?.todayNote ?? "",
    blockersNote: saved?.blockersNote ?? "",
    yesterdayTasks,
    todayTasks,
    blockers,
    updatedAt: saved?.updatedAt ?? null,
  };
}

export async function saveDailyScrum(
  ownerId: string,
  scrumDate: string,
  input: { yesterdayNote?: string; todayNote?: string; blockersNote?: string },
) {
  const date = normalizeDate(scrumDate);
  const updatedAt = new Date().toISOString();
  await getDb()
    .insert(dailyScrums)
    .values({
      id: crypto.randomUUID(),
      ownerId,
      scrumDate: date,
      yesterdayNote: input.yesterdayNote?.trim() ?? "",
      todayNote: input.todayNote?.trim() ?? "",
      blockersNote: input.blockersNote?.trim() ?? "",
      updatedAt,
    })
    .onConflictDoUpdate({
      target: [dailyScrums.ownerId, dailyScrums.scrumDate],
      set: {
        yesterdayNote: input.yesterdayNote?.trim() ?? "",
        todayNote: input.todayNote?.trim() ?? "",
        blockersNote: input.blockersNote?.trim() ?? "",
        updatedAt,
      },
    });
  return getDailyScrum(ownerId, date);
}

export type RecommendationKind = "blocked" | "overdue" | "due_soon" | "empty_project";
export type Recommendation = {
  id: string;
  kind: RecommendationKind;
  title: string;
  detail: string;
  itemIds: string[];
  score: number;
};

export async function getRecommendations(ownerId: string, requestedDate?: string) {
  const date = normalizeDate(requestedDate ?? new Date().toISOString().slice(0, 10));
  const dueSoon = addDays(date, 3);
  const rows = await listItems(ownerId, { limit: 200 });
  const tasks = rows.filter((item) => item.kind === "task");
  const projects = rows.filter((item) => item.kind === "project");
  const openTasks = tasks.filter((task) => task.status !== "done");
  const recommendations: Recommendation[] = [];

  const blocked = openTasks.filter((task) => task.status === "blocked");
  if (blocked.length) {
    recommendations.push({
      id: "blocked-tasks",
      kind: "blocked",
      title: `막힌 Task ${blocked.length}개를 먼저 해소하세요`,
      detail: "막힘이 길어지면 상위 Project와 Key Result의 진행도도 함께 멈춥니다.",
      itemIds: blocked.map((task) => task.id),
      score: 100,
    });
  }

  const overdue = openTasks.filter((task) => task.dueDate !== null && task.dueDate < date);
  if (overdue.length) {
    recommendations.push({
      id: "overdue-tasks",
      kind: "overdue",
      title: `기한이 지난 Task ${overdue.length}개를 재계획하세요`,
      detail: "완료일을 조정하거나 오늘 실행할 작업으로 명확히 정리하는 편이 좋습니다.",
      itemIds: overdue.map((task) => task.id),
      score: 90,
    });
  }

  const urgent = openTasks.filter(
    (task) =>
      task.dueDate !== null &&
      task.dueDate >= date &&
      task.dueDate <= dueSoon &&
      (task.priority === "high" || task.priority === "urgent"),
  );
  if (urgent.length) {
    recommendations.push({
      id: "due-soon-tasks",
      kind: "due_soon",
      title: `3일 안에 마감되는 중요 Task ${urgent.length}개가 있습니다`,
      detail: "오늘 할 일에 올리거나 담당자와 완료 기준을 확인하세요.",
      itemIds: urgent.map((task) => task.id),
      score: 70,
    });
  }

  const projectIdsWithTasks = new Set(tasks.map((task) => task.parentId).filter(Boolean));
  const emptyProjects = projects.filter((project) => !projectIdsWithTasks.has(project.id));
  if (emptyProjects.length) {
    recommendations.push({
      id: "empty-projects",
      kind: "empty_project",
      title: `실행 Task가 없는 Project ${emptyProjects.length}개를 확인하세요`,
      detail: "다음 행동이 없다면 Project의 범위를 줄이거나 첫 Task를 추가하세요.",
      itemIds: emptyProjects.map((project) => project.id),
      score: 55,
    });
  }

  return recommendations.sort((a, b) => b.score - a.score);
}

async function requireTask(ownerId: string, taskId: string) {
  const task = await getItem(ownerId, taskId);
  if (!task) throw new Error("Task not found");
  if (task.kind !== "task") throw new Error("Checklists can only belong to a Task");
  return task;
}

async function syncChecklistProgress(ownerId: string, taskId: string) {
  const rows = await getDb()
    .select()
    .from(checklistItems)
    .where(and(eq(checklistItems.ownerId, ownerId), eq(checklistItems.taskId, taskId)));
  const progress = rows.length
    ? Math.round((rows.filter((row) => row.completed).length / rows.length) * 100)
    : 0;
  await getDb()
    .update(items)
    .set({ progress, updatedAt: new Date().toISOString() })
    .where(and(eq(items.ownerId, ownerId), eq(items.id, taskId)));
}

function normalizeDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Date must use YYYY-MM-DD");
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error("Date is invalid");
  }
  return value;
}

function addDays(value: string, days: number) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function compareTaskUrgency(a: PaceItem, b: PaceItem) {
  if (a.status === "blocked" && b.status !== "blocked") return -1;
  if (b.status === "blocked" && a.status !== "blocked") return 1;
  if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
  if (a.dueDate) return -1;
  if (b.dueDate) return 1;
  const priorityWeight: Record<string, number> = { low: 1, medium: 2, high: 3, urgent: 4 };
  return (priorityWeight[b.priority] ?? 0) - (priorityWeight[a.priority] ?? 0);
}

async function validateParent(
  ownerId: string,
  kind: ItemKind,
  parentId: string | null,
  routineId: string | null = null,
) {
  if (routineId && kind !== "task") {
    throw new Error("Only Task can be linked under Routine");
  }
  if (routineId && parentId) {
    throw new Error("Task can be linked under either Project or Routine");
  }
  if (routineId) {
    const routine = await getRoutine(ownerId, routineId);
    if (!routine) throw new Error("Routine not found");
    return;
  }
  const expected = parentKind[kind];
  if (!expected) {
    if (parentId) throw new Error("Objective cannot have a parent");
    return;
  }

  if (!parentId) {
    throw new Error(`${kind} requires a ${expected} parent`);
  }

  const parent = await getItem(ownerId, parentId);
  if (!parent) throw new Error("Parent item not found");
  if (parent.archivedAt) throw new Error("Restore the parent item before linking work to it");
  if (parent.kind !== expected) {
    throw new Error(`${kind} must be linked under ${expected}`);
  }
}

async function migrateLegacyHierarchy(ownerId: string) {
  const d1 = (env as RuntimeEnv).DB;
  await d1.batch([
    d1.prepare(`INSERT OR IGNORE INTO checklist_items
      (id, owner_id, task_id, title, completed, sort_order, created_at, updated_at)
      SELECT 'legacy-action-' || id, owner_id, parent_id, title,
        CASE WHEN status = 'done' THEN 1 ELSE 0 END,
        sort_order, created_at, updated_at
      FROM items AS action_item
      WHERE action_item.owner_id = ? AND action_item.kind = 'action'
        AND EXISTS (
          SELECT 1 FROM items AS parent_task
          WHERE parent_task.owner_id = action_item.owner_id
            AND parent_task.id = action_item.parent_id
            AND parent_task.kind = 'task'
        )`).bind(ownerId),
    d1.prepare(`DELETE FROM items
      WHERE owner_id = ? AND kind = 'action'
        AND parent_id IN (
          SELECT id FROM items WHERE owner_id = ? AND kind = 'task'
        )`).bind(ownerId, ownerId),
    d1.prepare(`UPDATE items
      SET kind = 'task', parent_id = NULL, status = 'todo', source = 'migration',
        updated_at = CURRENT_TIMESTAMP
      WHERE owner_id = ? AND kind = 'action'`).bind(ownerId),
    d1.prepare(`UPDATE items
      SET parent_id = NULL, routine_id = NULL, status = 'todo', source = 'migration',
        updated_at = CURRENT_TIMESTAMP
      WHERE owner_id = ? AND kind = 'task'
        AND parent_id IN (
          SELECT id FROM items WHERE owner_id = ? AND kind = 'initiative'
        )`).bind(ownerId, ownerId),
  ]);
}

async function removeLegacySeedWorkspaceData(ownerId: string) {
  const seedItems = await getDb()
    .select({ id: items.id })
    .from(items)
    .where(and(eq(items.ownerId, ownerId), inArray(items.title, LEGACY_SEED_ITEM_TITLES)));
  const seedItemIds = seedItems.map((entry) => entry.id);
  if (seedItemIds.length) {
    await getDb().delete(checklistItems).where(and(eq(checklistItems.ownerId, ownerId), inArray(checklistItems.taskId, seedItemIds)));
    await getDb().delete(itemAssignments).where(and(eq(itemAssignments.ownerId, ownerId), inArray(itemAssignments.itemId, seedItemIds)));
    await getDb().delete(projectHiddenProperties).where(and(eq(projectHiddenProperties.ownerId, ownerId), inArray(projectHiddenProperties.projectId, seedItemIds)));
    await getDb().delete(itemPropertyValues).where(and(eq(itemPropertyValues.ownerId, ownerId), inArray(itemPropertyValues.itemId, seedItemIds)));
    await getDb().delete(items).where(and(eq(items.ownerId, ownerId), inArray(items.id, seedItemIds)));
  }
  await getDb().delete(routines).where(and(eq(routines.ownerId, ownerId), inArray(routines.title, LEGACY_SEED_ROUTINE_TITLES)));
}

async function seedProjectExecutionProperties(ownerId: string) {
  let existing = await listPropertyDefinitions(ownerId);
  for (const definition of DEFAULT_PROJECT_EXECUTION_PROPERTIES.filter((entry) => entry.systemKey)) {
    if (existing.some((property) => property.systemKey === definition.systemKey)) continue;
    const legacy = existing.find((property) => !property.systemKey && property.name.toLocaleLowerCase() === definition.name.toLocaleLowerCase());
    if (!legacy) continue;
    await getDb().update(propertyDefinitions).set({
      systemKey: definition.systemKey,
      type: definition.type,
      options: JSON.stringify(normalizeOptions(definition.options ?? [])),
      active: true,
      updatedAt: new Date().toISOString(),
    }).where(eq(propertyDefinitions.id, legacy.id));
  }
  existing = await listPropertyDefinitions(ownerId);
  const existingNames = new Set(existing.map((property) => property.name.toLocaleLowerCase()));
  const existingSystemKeys = new Set(existing.map((property) => property.systemKey).filter(Boolean));
  const missing = DEFAULT_PROJECT_EXECUTION_PROPERTIES.filter((property) => property.systemKey
    ? !existingSystemKeys.has(property.systemKey)
    : !existingNames.has(property.name.toLocaleLowerCase()));
  if (!missing.length) return;

  const baseSortOrder = existing.at(-1)?.sortOrder ?? 0;
  await getDb().insert(propertyDefinitions).values(
    missing.map((property, index) => ({
      id: crypto.randomUUID(),
      ownerId,
      name: property.name,
      type: property.type,
      options: JSON.stringify(normalizeOptions(property.options ?? [])),
      defaultValue: JSON.stringify(property.defaultValue ?? null),
      systemKey: property.systemKey ?? null,
      active: true,
      sortOrder: baseSortOrder + ((index + 1) * 10),
    })),
  );
}

async function migrateLegacyItemAssignments(ownerId: string) {
  const d1 = (env as RuntimeEnv).DB;
  await d1.prepare(`INSERT OR IGNORE INTO item_assignments
    (id, owner_id, item_id, member_id, role, created_at, updated_at)
    SELECT 'legacy-assignment-' || ipv.id,
      ipv.owner_id,
      ipv.item_id,
      member.id,
      CASE item.kind WHEN 'project' THEN 'project_dri' ELSE 'task_assignee' END,
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    FROM item_property_values AS ipv
    INNER JOIN property_definitions AS property
      ON property.id = ipv.property_id AND property.owner_id = ipv.owner_id
    INNER JOIN items AS item
      ON item.id = ipv.item_id AND item.owner_id = ipv.owner_id
    INNER JOIN workspace_members AS member
      ON member.workspace_id = ipv.owner_id AND member.status = 'active'
      AND LOWER(TRIM(member.display_name)) = LOWER(TRIM(ipv.value, '"@ '))
    WHERE ipv.owner_id = ?
      AND item.kind IN ('project', 'task')
      AND LOWER(TRIM(property.name)) IN ('dri', 'owner', 'assignee', '담당', '담당자')
      AND INSTR(TRIM(ipv.value, '"'), ',') = 0
      AND (
        SELECT COUNT(*) FROM workspace_members AS candidate
        WHERE candidate.workspace_id = ipv.owner_id
          AND candidate.status = 'active'
          AND LOWER(TRIM(candidate.display_name)) = LOWER(TRIM(ipv.value, '"@ '))
      ) = 1`).bind(ownerId).run();
}

async function logActivity(
  ownerId: string,
  itemId: string,
  action: string,
  source: string,
  payload: unknown,
) {
  await getDb().insert(activityLog).values({
    id: crypto.randomUUID(),
    ownerId,
    itemId,
    action,
    source,
    payload: JSON.stringify(payload),
  });
}

function clampProgress(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function normalizeOptions(options: string[]) {
  return [...new Set(options.map((option) => option.trim()).filter(Boolean))].slice(0, 50);
}

function parseOptions(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((option): option is string => typeof option === "string") : [];
  } catch {
    return [];
  }
}

function parsePropertyValue(value: string): PropertyValue {
  try {
    const parsed = JSON.parse(value) as unknown;
    return typeof parsed === "string" || typeof parsed === "number" || typeof parsed === "boolean" || parsed === null || (Array.isArray(parsed) && parsed.every((entry) => typeof entry === "string"))
      ? parsed
      : null;
  } catch {
    return value;
  }
}

function normalizePropertyValue(property: PropertyDefinition, value: PropertyValue): PropertyValue {
  if (value === null || value === "" || (Array.isArray(value) && value.length === 0)) return null;
  if (property.type === "members") {
    if (!Array.isArray(value)) throw new Error(`${property.name} must be a member list`);
    return [...new Set(value.map((entry) => entry.trim()).filter(Boolean))];
  }
  if (property.type === "member") {
    if (Array.isArray(value) || typeof value !== "string") throw new Error(`${property.name} must be one member`);
    return value.trim() || null;
  }
  if (property.type === "number") {
    const number = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(number)) throw new Error(`${property.name} must be a number`);
    return number;
  }
  if (property.type === "checkbox") {
    if (typeof value !== "boolean") throw new Error(`${property.name} must be true or false`);
    return value;
  }
  if (typeof value !== "string") throw new Error(`${property.name} must be text`);
  const text = value.trim();
  if (!text) return null;
  if (property.type === "date" && !/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    throw new Error(`${property.name} must use YYYY-MM-DD`);
  }
  if (property.type === "select" && !parseOptions(property.options).includes(text)) {
    throw new Error(`${property.name} must use one of its configured options`);
  }
  return text;
}

export function serializeItem(
  item: PaceItem,
  properties: Record<string, PropertyValue> = {},
  assignments: ItemAssignmentSummary[] = [],
) {
  return {
    id: item.id,
    cycleId: item.cycleId,
    parentId: item.parentId,
    routineId: item.routineId,
    kind: item.kind,
    title: item.title,
    description: item.description,
    status: item.status,
    priority: item.priority,
    cadence: item.cadence,
    progress: item.progress,
    dueDate: item.dueDate,
    source: item.source,
    archivedAt: item.archivedAt,
    archivedFromStatus: item.archivedFromStatus,
    archiveRootId: item.archiveRootId,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    properties,
    assignments,
  };
}
