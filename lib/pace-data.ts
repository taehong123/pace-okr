import { env } from "cloudflare:workers";
import { and, asc, desc, eq, like, lte, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  activityLog,
  checklistItems,
  dailyScrums,
  itemPropertyValues,
  items,
  propertyDefinitions,
  routineCompletions,
  routines,
  userWorkspacePreferences,
  workspaceGroupMembers,
  workspaceGroups,
  workspaceMembers,
  workspaces,
  type PaceItem,
  type PropertyDefinition,
  type WorkspaceGroup,
  type WorkspaceGroupMember,
  type WorkspaceMember,
} from "@/db/schema";

export const ITEM_KINDS = ["objective", "key_result", "initiative", "project", "task"] as const;
export const ITEM_STATUSES = ["inbox", "todo", "in_progress", "done", "blocked"] as const;
export const ITEM_PRIORITIES = ["low", "medium", "high", "urgent"] as const;
export const ITEM_CADENCES = ["daily", "weekly", "monthly", "quarterly"] as const;
export const PROPERTY_TYPES = ["text", "number", "select", "date", "checkbox"] as const;
export const ROUTINE_CADENCES = ["daily", "weekly", "monthly"] as const;
export const TEAM_ROLES = ["owner", "admin", "member", "viewer"] as const;
export const GROUP_COLORS = ["gray", "blue", "green", "yellow", "orange", "red", "purple"] as const;
export const GROUP_VISIBILITIES = ["open", "private"] as const;
export const GROUP_ROLES = ["lead", "member"] as const;

export type ItemKind = (typeof ITEM_KINDS)[number];
export type ItemStatus = (typeof ITEM_STATUSES)[number];
export type ItemPriority = (typeof ITEM_PRIORITIES)[number];
export type ItemCadence = (typeof ITEM_CADENCES)[number];
export type PropertyType = (typeof PROPERTY_TYPES)[number];
export type PropertyValue = string | number | boolean | null;
export type RoutineCadence = (typeof ROUTINE_CADENCES)[number];
export type TeamRole = (typeof TEAM_ROLES)[number];
export type GroupColor = (typeof GROUP_COLORS)[number];
export type GroupVisibility = (typeof GROUP_VISIBILITIES)[number];
export type GroupRole = (typeof GROUP_ROLES)[number];

export type RequestAuthorization = {
  ownerId: string;
  userId: string;
  email: string | null;
  displayName: string;
  role: TeamRole;
  apiToken: boolean;
};

type RuntimeEnv = typeof env & { OKRPTR_API_TOKEN?: string; OKITA_API_TOKEN?: string; PACE_API_TOKEN?: string };
let schemaReady: Promise<void> | null = null;

const parentKind: Record<ItemKind, ItemKind | null> = {
  objective: null,
  key_result: "objective",
  initiative: "key_result",
  project: "initiative",
  task: "project",
};

async function ensureSchema() {
  if (!schemaReady) {
    const d1 = (env as RuntimeEnv).DB;
    schemaReady = (async () => {
      await d1.batch([
        d1.prepare(`CREATE TABLE IF NOT EXISTS workspaces (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          owner_user_id TEXT NOT NULL,
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
          parent_id TEXT,
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
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`),
        d1.prepare("CREATE INDEX IF NOT EXISTS idx_items_owner_status ON items(owner_id, status)"),
        d1.prepare("CREATE INDEX IF NOT EXISTS idx_items_owner_parent ON items(owner_id, parent_id)"),
        d1.prepare("CREATE INDEX IF NOT EXISTS idx_items_owner_cadence ON items(owner_id, cadence)"),
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
          sort_order INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`),
        d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_property_definitions_owner_name ON property_definitions(owner_id, name)"),
        d1.prepare("CREATE INDEX IF NOT EXISTS idx_property_definitions_owner_sort ON property_definitions(owner_id, sort_order)"),
        d1.prepare(`CREATE TABLE IF NOT EXISTS item_property_values (
          id TEXT PRIMARY KEY,
          owner_id TEXT NOT NULL,
          item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
          property_id TEXT NOT NULL REFERENCES property_definitions(id) ON DELETE CASCADE,
          value TEXT NOT NULL DEFAULT 'null',
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`),
        d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_item_property_values_unique ON item_property_values(owner_id, item_id, property_id)"),
        d1.prepare("CREATE INDEX IF NOT EXISTS idx_item_property_values_owner_item ON item_property_values(owner_id, item_id)"),
        d1.prepare("CREATE INDEX IF NOT EXISTS idx_item_property_values_owner_property ON item_property_values(owner_id, property_id)"),
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
        d1.prepare("PRAGMA optimize"),
      ]);
      await addColumnIfMissing(d1, "ALTER TABLE routines ADD COLUMN trigger_point TEXT NOT NULL DEFAULT ''");
      await addColumnIfMissing(d1, "ALTER TABLE routines ADD COLUMN action_place TEXT NOT NULL DEFAULT ''");
      await addColumnIfMissing(d1, "ALTER TABLE routines ADD COLUMN action_steps TEXT NOT NULL DEFAULT ''");
    })()
      .catch((error: unknown) => {
        schemaReady = null;
        throw error;
      });
  }

  await schemaReady;
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
  await ensureSchema();
  await migrateLegacyHierarchy(ownerId);
  const [workspace] = await getDb().select().from(workspaces).where(eq(workspaces.id, ownerId)).limit(1);
  if (workspace?.id === workspace?.ownerUserId) await seedWorkspace(ownerId);
  await seedProperties(ownerId);
}

export async function authorizeRequest(
  request: Request,
  options: { allowViewerWrite?: boolean } = {},
): Promise<RequestAuthorization | Response> {
  const userId = request.headers.get("oai-authenticated-user-id");
  const configuredToken = (env as RuntimeEnv).OKRPTR_API_TOKEN ?? (env as RuntimeEnv).OKITA_API_TOKEN ?? (env as RuntimeEnv).PACE_API_TOKEN;
  const suppliedToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
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
      const displayName = authenticatedDisplayName(request) || email?.split("@")[0] || "Member";
      const membership = await resolveWorkspaceMembership(userId, email, displayName, requestedWorkspaceId(request));
      if (!membership || membership.status !== "active") {
        return Response.json({ error: "This account is not an active workspace member." }, { status: 403 });
      }
      const role = membership.role as TeamRole;
      if (!options.allowViewerWrite && role === "viewer" && !["GET", "HEAD", "OPTIONS"].includes(request.method)) {
        return Response.json({ error: "Viewer access is read-only." }, { status: 403 });
      }
      return { ownerId: membership.workspaceId, userId, email, displayName, role, apiToken: false };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to resolve workspace access.";
      return Response.json({ error: message }, { status: 500 });
    }
  }

  return Response.json(
    { error: "Authentication required. Sign in or provide an OKRPTR API token." },
    { status: 401, headers: { "WWW-Authenticate": "Bearer" } },
  );
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
  await ensureWorkspaceShell(userId, email, displayName);
  if (email) {
    const invitations = await getDb().select().from(workspaceMembers).where(and(eq(workspaceMembers.email, email), eq(workspaceMembers.status, "invited"))).orderBy(asc(workspaceMembers.createdAt));
    for (const invitation of invitations) {
      const [existingMembership] = await getDb().select().from(workspaceMembers).where(and(eq(workspaceMembers.workspaceId, invitation.workspaceId), eq(workspaceMembers.userId, userId))).limit(1);
      if (existingMembership) continue;
      await getDb().update(workspaceMembers).set({ userId, displayName, status: "active", updatedAt: new Date().toISOString() }).where(eq(workspaceMembers.id, invitation.id));
    }
  }

  const memberships = await getDb().select().from(workspaceMembers).where(and(eq(workspaceMembers.userId, userId), eq(workspaceMembers.status, "active"))).orderBy(asc(workspaceMembers.createdAt));
  const now = new Date().toISOString();
  await getDb().update(workspaceMembers).set({ email, displayName, updatedAt: now }).where(eq(workspaceMembers.userId, userId));
  const [preference] = await getDb().select().from(userWorkspacePreferences).where(eq(userWorkspacePreferences.userId, userId)).limit(1);
  return memberships.find((entry) => entry.workspaceId === requestedId)
    ?? memberships.find((entry) => entry.workspaceId === preference?.activeWorkspaceId)
    ?? memberships.find((entry) => entry.workspaceId === userId)
    ?? memberships[0]
    ?? null;
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

export async function listUserWorkspaces(userId: string, currentWorkspaceId: string) {
  const rows = await getDb()
    .select({ workspace: workspaces, membership: workspaceMembers })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaceMembers.workspaceId, workspaces.id))
    .where(and(eq(workspaceMembers.userId, userId), eq(workspaceMembers.status, "active")))
    .orderBy(asc(workspaces.createdAt));
  return rows.map(({ workspace, membership }) => ({
    id: workspace.id,
    name: workspace.name,
    personal: workspace.id === workspace.ownerUserId,
    role: membership.role as TeamRole,
    current: workspace.id === currentWorkspaceId,
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
  return { id, name, personal: false, role: "owner" as TeamRole, current: true };
}

export async function setActiveWorkspace(userId: string, workspaceId: string) {
  const [membership] = await getDb().select().from(workspaceMembers).where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId), eq(workspaceMembers.status, "active"))).limit(1);
  if (!membership) throw new Error("Workspace not found or access denied");
  await getDb().insert(userWorkspacePreferences).values({ userId, activeWorkspaceId: workspaceId, updatedAt: new Date().toISOString() }).onConflictDoUpdate({
    target: userWorkspacePreferences.userId,
    set: { activeWorkspaceId: workspaceId, updatedAt: new Date().toISOString() },
  });
  return membership;
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

export async function inviteTeamMember(ownerId: string, actorUserId: string, emailInput: string, role: Exclude<TeamRole, "owner">) {
  const email = normalizeEmail(emailInput);
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) throw new Error("A valid email is required");
  if (!(["admin", "member", "viewer"] as TeamRole[]).includes(role)) throw new Error("Unsupported team role");
  const [existing] = await getDb().select().from(workspaceMembers).where(and(eq(workspaceMembers.workspaceId, ownerId), eq(workspaceMembers.email, email))).limit(1);
  if (existing) throw new Error("This email is already a workspace member or invitation");
  const now = new Date().toISOString();
  const member: WorkspaceMember = {
    id: crypto.randomUUID(),
    workspaceId: ownerId,
    userId: null,
    email,
    displayName: email.split("@")[0],
    role,
    status: "invited",
    invitedByUserId: actorUserId,
    createdAt: now,
    updatedAt: now,
  };
  await getDb().insert(workspaceMembers).values(member);
  return serializeTeamMember(member, actorUserId);
}

export async function updateTeamMember(ownerId: string, memberId: string, role: Exclude<TeamRole, "owner">, currentUserId: string) {
  if (!(["admin", "member", "viewer"] as TeamRole[]).includes(role)) throw new Error("Unsupported team role");
  const member = await getWorkspaceMember(ownerId, memberId);
  if (member.role === "owner") throw new Error("The Owner role cannot be changed");
  const updated = { ...member, role, updatedAt: new Date().toISOString() };
  await getDb().update(workspaceMembers).set({ role, updatedAt: updated.updatedAt }).where(eq(workspaceMembers.id, member.id));
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
  } = {},
) {
  const conditions = [eq(items.ownerId, ownerId)];
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

export async function createItem(
  ownerId: string,
  input: {
    title: string;
    kind?: ItemKind;
    parentId?: string | null;
    description?: string;
    status?: ItemStatus;
    priority?: ItemPriority;
    cadence?: ItemCadence;
    progress?: number;
    dueDate?: string | null;
    source?: string;
    sourceRef?: string | null;
  },
) {
  const kind = input.kind ?? "task";
  const status = input.status ?? (kind === "task" && !input.parentId ? "inbox" : "todo");
  await validateParent(ownerId, kind, input.parentId ?? null, status);

  const id = crypto.randomUUID();
  const [created] = await getDb()
    .insert(items)
    .values({
      id,
      ownerId,
      parentId: input.parentId ?? null,
      kind,
      title: input.title.trim(),
      description: input.description?.trim() ?? "",
      status,
      priority: input.priority ?? "medium",
      cadence: input.cadence ?? "weekly",
      progress: clampProgress(input.progress ?? 0),
      dueDate: input.dueDate ?? null,
      source: input.source ?? "web",
      sourceRef: input.sourceRef ?? null,
    })
    .returning();

  await logActivity(ownerId, created.id, "created", created.source, { kind, status });
  return created;
}

export async function updateItem(
  ownerId: string,
  id: string,
  patch: Partial<{
    title: string;
    description: string;
    status: ItemStatus;
    priority: ItemPriority;
    cadence: ItemCadence;
    progress: number;
    dueDate: string | null;
    parentId: string | null;
    source: string;
  }>,
) {
  const current = await getItem(ownerId, id);
  if (!current) throw new Error("Item not found");

  if (patch.parentId !== undefined || patch.status !== undefined) {
    await validateParent(
      ownerId,
      current.kind as ItemKind,
      patch.parentId === undefined ? current.parentId : patch.parentId,
      patch.status ?? (current.status as ItemStatus),
    );
  }

  const nextStatus = patch.status ?? (current.status as ItemStatus);
  const values = {
    ...patch,
    title: patch.title?.trim(),
    description: patch.description?.trim(),
    progress:
      nextStatus === "done" ? 100 : patch.progress === undefined ? undefined : clampProgress(patch.progress),
    updatedAt: new Date().toISOString(),
  };

  const [updated] = await getDb()
    .update(items)
    .set(values)
    .where(and(eq(items.ownerId, ownerId), eq(items.id, id)))
    .returning();

  await logActivity(ownerId, id, "updated", patch.source ?? "web", patch);
  return updated;
}

export async function listPropertyDefinitions(ownerId: string) {
  return getDb()
    .select()
    .from(propertyDefinitions)
    .where(eq(propertyDefinitions.ownerId, ownerId))
    .orderBy(asc(propertyDefinitions.sortOrder), asc(propertyDefinitions.createdAt));
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
  input: { name: string; type: PropertyType; options?: string[] },
) {
  const name = input.name.trim();
  if (!name) throw new Error("Property name is required");
  if (!PROPERTY_TYPES.includes(input.type)) throw new Error("Unsupported property type");

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
      sortOrder: (existing.at(-1)?.sortOrder ?? 0) + 10,
    })
    .returning();
  return created;
}

export async function deletePropertyDefinition(ownerId: string, id: string) {
  const property = await getPropertyDefinition(ownerId, id);
  if (!property) throw new Error("Property not found");

  await getDb()
    .delete(itemPropertyValues)
    .where(and(eq(itemPropertyValues.ownerId, ownerId), eq(itemPropertyValues.propertyId, id)));
  await getDb()
    .delete(propertyDefinitions)
    .where(and(eq(propertyDefinitions.ownerId, ownerId), eq(propertyDefinitions.id, id)));
  return property;
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

  const normalized = normalizePropertyValue(property, value);
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

export async function getItemPropertiesByName(ownerId: string) {
  const [definitions, values] = await Promise.all([
    listPropertyDefinitions(ownerId),
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
  const definitions = await listPropertyDefinitions(ownerId);
  const byName = new Map(definitions.map((property) => [property.name.toLocaleLowerCase(), property]));
  for (const [name, value] of Object.entries(values)) {
    const property = byName.get(name.toLocaleLowerCase());
    if (!property) throw new Error(`Property not found: ${name}`);
    await setPropertyValue(ownerId, itemId, property.id, value);
  }
}

export function serializePropertyDefinition(property: PropertyDefinition) {
  return {
    id: property.id,
    name: property.name,
    type: property.type,
    options: parseOptions(property.options),
    sortOrder: property.sortOrder,
  };
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
        or(eq(items.cadence, cadence), and(sql`${items.dueDate} IS NOT NULL`, lte(items.dueDate, boundary))),
      ),
    )
    .orderBy(asc(items.dueDate), asc(items.sortOrder))
    .limit(100);

  const completed = rows.filter((item) => item.status === "done").length;
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
  },
) {
  const title = input.title.trim();
  if (!title) throw new Error("Routine title is required");
  const cadence = input.cadence ?? "daily";
  if (!ROUTINE_CADENCES.includes(cadence)) throw new Error("Unsupported routine cadence");
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
  }>,
) {
  const current = await getRoutine(ownerId, id);
  if (!current) throw new Error("Routine not found");
  if (patch.title !== undefined && !patch.title.trim()) throw new Error("Routine title is required");
  if (patch.cadence !== undefined && !ROUTINE_CADENCES.includes(patch.cadence)) {
    throw new Error("Unsupported routine cadence");
  }
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
      updatedAt: new Date().toISOString(),
    })
    .where(and(eq(routines.ownerId, ownerId), eq(routines.id, id)))
    .returning();
  return updated;
}

export async function deleteRoutine(ownerId: string, id: string) {
  const current = await getRoutine(ownerId, id);
  if (!current) throw new Error("Routine not found");
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

export function serializeRoutine(
  routine: typeof routines.$inferSelect,
  date: string,
  completion?: typeof routineCompletions.$inferSelect,
) {
  return {
    id: routine.id,
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
  const activeTasks = tasks.filter((task) => task.status !== "inbox" && task.status !== "done");
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

export type RecommendationKind = "blocked" | "overdue" | "unlinked" | "due_soon" | "empty_project";
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

  const overdue = openTasks.filter((task) => task.status !== "inbox" && task.dueDate !== null && task.dueDate < date);
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

  const unlinked = openTasks.filter((task) => task.status === "inbox" || task.parentId === null);
  if (unlinked.length) {
    recommendations.push({
      id: "unlinked-tasks",
      kind: "unlinked",
      title: `미연결 Task ${unlinked.length}개의 Project를 정하세요`,
      detail: "인박스에서 Project에 연결하면 OKR 진행 상황과 데일리 계획에 함께 반영됩니다.",
      itemIds: unlinked.map((task) => task.id),
      score: 75,
    });
  }

  const urgent = openTasks.filter(
    (task) =>
      task.status !== "inbox" &&
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
  status: ItemStatus,
) {
  if (status === "inbox" && (kind !== "task" || parentId !== null)) {
    throw new Error("Only an unlinked Task can use inbox status");
  }
  const expected = parentKind[kind];
  if (!expected) {
    if (parentId) throw new Error("Objective cannot have a parent");
    return;
  }

  if (!parentId) {
    if (kind === "task" && status === "inbox") return;
    throw new Error(`${kind} requires a ${expected} parent`);
  }

  const parent = await getItem(ownerId, parentId);
  if (!parent) throw new Error("Parent item not found");
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
      SET kind = 'task', parent_id = NULL, status = 'inbox', source = 'migration',
        updated_at = CURRENT_TIMESTAMP
      WHERE owner_id = ? AND kind = 'action'`).bind(ownerId),
    d1.prepare(`INSERT OR IGNORE INTO items
      (id, owner_id, parent_id, kind, title, description, status, priority, cadence,
       progress, due_date, source, source_ref, sort_order, created_at, updated_at)
      SELECT 'legacy-project-' || initiative.id, initiative.owner_id, initiative.id,
        'project', initiative.title || ' 실행', '', 'in_progress', 'medium',
        initiative.cadence, 0, NULL, 'migration', NULL, initiative.sort_order + 1,
        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      FROM items AS initiative
      WHERE initiative.owner_id = ? AND initiative.kind = 'initiative'
        AND EXISTS (
          SELECT 1 FROM items AS child
          WHERE child.owner_id = initiative.owner_id
            AND child.parent_id = initiative.id AND child.kind = 'task'
        )`).bind(ownerId),
    d1.prepare(`UPDATE items
      SET parent_id = 'legacy-project-' || parent_id, updated_at = CURRENT_TIMESTAMP
      WHERE owner_id = ? AND kind = 'task'
        AND parent_id IN (
          SELECT id FROM items WHERE owner_id = ? AND kind = 'initiative'
        )`).bind(ownerId, ownerId),
  ]);
}

async function seedWorkspace(ownerId: string) {
  const [result] = await getDb()
    .select({ count: sql<number>`count(*)` })
    .from(items)
    .where(eq(items.ownerId, ownerId));
  if (Number(result?.count ?? 0) > 0) return;

  const objective = crypto.randomUUID();
  const keyResult = crypto.randomUUID();
  const initiative = crypto.randomUUID();
  const project = crypto.randomUUID();
  const firstTask = crypto.randomUUID();
  const due = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

  const seedRows = [
    { id: objective, ownerId, kind: "objective", title: "셀프 서브 도입으로 팀의 성장 속도를 높인다", status: "in_progress", cadence: "quarterly", progress: 68, sortOrder: 10 },
    { id: keyResult, ownerId, parentId: objective, kind: "key_result", title: "신규 사용자의 첫 주 활성화율 32% → 48%", status: "in_progress", cadence: "monthly", progress: 61, sortOrder: 20 },
    { id: initiative, ownerId, parentId: keyResult, kind: "initiative", title: "가입 후 10분 안에 첫 가치 경험 만들기", status: "in_progress", cadence: "monthly", progress: 54, sortOrder: 30 },
    { id: project, ownerId, parentId: initiative, kind: "project", title: "온보딩 활성화 개선", status: "in_progress", cadence: "monthly", progress: 52, sortOrder: 40 },
    { id: firstTask, ownerId, parentId: project, kind: "task", title: "온보딩 체크리스트 실험", status: "in_progress", cadence: "weekly", progress: 75, dueDate: due(5), priority: "high", sortOrder: 50 },
    { id: crypto.randomUUID(), ownerId, parentId: project, kind: "task", title: "결제 화면 카피 확정", status: "in_progress", cadence: "weekly", progress: 40, dueDate: due(0), priority: "high", sortOrder: 60 },
    { id: crypto.randomUUID(), ownerId, parentId: project, kind: "task", title: "활성화 이벤트 QA", status: "todo", cadence: "weekly", progress: 0, dueDate: due(2), sortOrder: 70 },
    { id: crypto.randomUUID(), ownerId, parentId: project, kind: "task", title: "신규 사용자 5명 인터뷰", status: "todo", cadence: "weekly", progress: 0, dueDate: due(4), sortOrder: 80 },
    { id: crypto.randomUUID(), ownerId, kind: "task", title: "가격 정책 페이지 개선 아이디어", status: "inbox", cadence: "weekly", source: "mcp", sortOrder: 90 },
    { id: crypto.randomUUID(), ownerId, kind: "task", title: "모바일 가입 이탈 구간 확인", status: "inbox", cadence: "weekly", source: "slack", sortOrder: 100 },
  ];
  await getDb().insert(items).values(seedRows.slice(0, 5));
  await getDb().insert(items).values(seedRows.slice(5));
  await getDb().insert(checklistItems).values([
    { id: crypto.randomUUID(), ownerId, taskId: firstTask, title: "A/B 테스트 이벤트 정의", completed: true, sortOrder: 10 },
    { id: crypto.randomUUID(), ownerId, taskId: firstTask, title: "실험군 이벤트 검증", completed: false, sortOrder: 20 },
  ]);
  await getDb().insert(routines).values([
    { id: crypto.randomUUID(), ownerId, title: "오늘의 최우선 Task 정리", cadence: "daily", sortOrder: 10 },
    { id: crypto.randomUUID(), ownerId, title: "주간 회고 작성", cadence: "weekly", sortOrder: 20 },
  ]);
}

async function seedProperties(ownerId: string) {
  const existing = await listPropertyDefinitions(ownerId);
  if (existing.length) return;

  const ownerProperty = crypto.randomUUID();
  const sprintProperty = crypto.randomUUID();
  const estimateProperty = crypto.randomUUID();
  await getDb().insert(propertyDefinitions).values([
    { id: ownerProperty, ownerId, name: "담당", type: "text", sortOrder: 10 },
    {
      id: sprintProperty,
      ownerId,
      name: "스프린트",
      type: "select",
      options: JSON.stringify(["Sprint 18", "Sprint 19", "Backlog"]),
      sortOrder: 20,
    },
    { id: estimateProperty, ownerId, name: "예상 시간", type: "number", sortOrder: 30 },
  ]);

  const tasks = await listItems(ownerId, { kind: "task", limit: 4 });
  const owners = ["태홍", "민지", "태홍", "유진"];
  const sprints = ["Sprint 18", "Sprint 18", "Sprint 18", "Sprint 19"];
  const estimates = [6, 3, 4, 5];
  const values = tasks.flatMap((task, index) => [
    {
      id: crypto.randomUUID(),
      ownerId,
      itemId: task.id,
      propertyId: ownerProperty,
      value: JSON.stringify(owners[index] ?? "태홍"),
    },
    {
      id: crypto.randomUUID(),
      ownerId,
      itemId: task.id,
      propertyId: sprintProperty,
      value: JSON.stringify(sprints[index] ?? "Backlog"),
    },
    {
      id: crypto.randomUUID(),
      ownerId,
      itemId: task.id,
      propertyId: estimateProperty,
      value: JSON.stringify(estimates[index] ?? 2),
    },
  ]);
  if (values.length) await getDb().insert(itemPropertyValues).values(values);
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
    return typeof parsed === "string" || typeof parsed === "number" || typeof parsed === "boolean" || parsed === null
      ? parsed
      : null;
  } catch {
    return value;
  }
}

function normalizePropertyValue(property: PropertyDefinition, value: PropertyValue): PropertyValue {
  if (value === null || value === "") return null;
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

export function serializeItem(item: PaceItem, properties: Record<string, PropertyValue> = {}) {
  return {
    id: item.id,
    parentId: item.parentId,
    kind: item.kind,
    title: item.title,
    description: item.description,
    status: item.status,
    priority: item.priority,
    cadence: item.cadence,
    progress: item.progress,
    dueDate: item.dueDate,
    source: item.source,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    properties,
  };
}
