import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

test("migrates Action rows into checklists and Project-linked Tasks", async () => {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE items (
      id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, parent_id TEXT, kind TEXT NOT NULL,
      title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'todo',
      priority TEXT NOT NULL DEFAULT 'medium', cadence TEXT NOT NULL DEFAULT 'weekly',
      progress INTEGER NOT NULL DEFAULT 0, due_date TEXT, source TEXT NOT NULL DEFAULT 'web',
      source_ref TEXT, sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE checklist_items (
      id TEXT PRIMARY KEY, owner_id TEXT NOT NULL,
      task_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
      title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    INSERT INTO items (id, owner_id, kind, title, status)
      VALUES ('ini', 'owner', 'initiative', 'Initiative', 'in_progress');
    INSERT INTO items (id, owner_id, parent_id, kind, title, status)
      VALUES ('task', 'owner', 'ini', 'task', 'Task', 'in_progress');
    INSERT INTO items (id, owner_id, parent_id, kind, title, status)
      VALUES ('action', 'owner', 'task', 'action', 'Checklist', 'done');
    INSERT INTO items (id, owner_id, kind, title, status)
      VALUES ('orphan', 'owner', 'action', 'Orphan', 'todo');
  `);

  const migration = await readFile(new URL("../drizzle/0003_migrate_execution_hierarchy.sql", import.meta.url), "utf8");
  db.exec(migration.replaceAll("--> statement-breakpoint", ""));

  const rows = db.prepare("SELECT id, parent_id, kind, status FROM items ORDER BY id").all();
  const checklist = db.prepare("SELECT task_id, title, completed FROM checklist_items").all();
  assert.equal(rows.some((row) => row.kind === "action"), false);
  assert.equal(rows.filter((row) => row.kind === "project").length, 1);
  assert.equal(rows.find((row) => row.id === "task")?.parent_id, "legacy-project-ini");
  assert.deepEqual({ ...rows.find((row) => row.id === "orphan") }, {
    id: "orphan",
    parent_id: null,
    kind: "task",
    status: "inbox",
  });
  assert.deepEqual(checklist.map((row) => ({ ...row })), [{ task_id: "task", title: "Checklist", completed: 1 }]);
  db.close();
});

test("creates relational workspaces and team memberships", async () => {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON;");
  const migration = await readFile(new URL("../drizzle/0005_wet_roland_deschain.sql", import.meta.url), "utf8");
  db.exec(migration.replaceAll("--> statement-breakpoint", ""));
  db.exec(`
    INSERT INTO workspaces (id, name, owner_user_id) VALUES ('workspace', 'Team', 'owner');
    INSERT INTO workspace_members (id, workspace_id, user_id, email, display_name, role, status)
      VALUES ('owner-member', 'workspace', 'owner', 'owner@example.com', 'Owner', 'owner', 'active');
    INSERT INTO workspace_members (id, workspace_id, email, display_name, role, status)
      VALUES ('invite', 'workspace', 'viewer@example.com', 'Viewer', 'viewer', 'invited');
  `);

  const rows = db.prepare("SELECT role, status FROM workspace_members ORDER BY role").all();
  assert.deepEqual(rows.map((row) => ({ ...row })), [
    { role: "owner", status: "active" },
    { role: "viewer", status: "invited" },
  ]);
  db.exec("DELETE FROM workspaces WHERE id = 'workspace'");
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM workspace_members").get().count, 0);
  db.close();
});

test("creates workspace-scoped Slack automations with deduplicated delivery history", async () => {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE workspaces (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, owner_user_id TEXT NOT NULL
    );
    CREATE TABLE items (
      id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, kind TEXT NOT NULL, title TEXT NOT NULL
    );
    INSERT INTO workspaces (id, name, owner_user_id) VALUES ('workspace', 'Team', 'owner');
    INSERT INTO items (id, owner_id, kind, title) VALUES ('task', 'workspace', 'task', 'Ship Slack automation');
  `);

  const migration = await readFile(new URL("../drizzle/0020_slack_automations.sql", import.meta.url), "utf8");
  db.exec(migration.replaceAll("--> statement-breakpoint", ""));
  db.exec(`
    INSERT INTO slack_automations (
      id, owner_id, created_by_user_id, name, trigger_type, channel_id, message_template
    ) VALUES (
      'automation', 'workspace', 'owner', 'New task alert', 'task_created', 'C0123456789', '*{{title}}*'
    );
    INSERT INTO slack_automation_deliveries (
      id, owner_id, automation_id, item_id, event_key, trigger_type, channel_id, message, status
    ) VALUES (
      'delivery', 'workspace', 'automation', 'task', 'event-1', 'task_created', 'C0123456789', '*Ship Slack automation*', 'sent'
    );
  `);

  assert.deepEqual({ ...db.prepare("SELECT trigger_type, active, last_delivery_status FROM slack_automations WHERE id = 'automation'").get() }, {
    trigger_type: "task_created",
    active: 1,
    last_delivery_status: "never",
  });
  assert.throws(() => db.exec(`
    INSERT INTO slack_automation_deliveries (
      id, owner_id, automation_id, event_key, trigger_type, channel_id, message
    ) VALUES ('duplicate', 'workspace', 'automation', 'event-1', 'task_created', 'C0123456789', 'duplicate');
  `), /UNIQUE constraint failed/);
  db.exec("DELETE FROM workspaces WHERE id = 'workspace'");
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM slack_automations").get().count, 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM slack_automation_deliveries").get().count, 0);
  db.close();
});

test("adds a 30-day workspace deletion grace period", async () => {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON;");
  const [workspaceMigration, deletionMigration] = await Promise.all([
    readFile(new URL("../drizzle/0005_wet_roland_deschain.sql", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0021_workspace_deletion_grace.sql", import.meta.url), "utf8"),
  ]);
  db.exec(workspaceMigration.replaceAll("--> statement-breakpoint", ""));
  db.exec("INSERT INTO workspaces (id, name, owner_user_id) VALUES ('workspace', 'Team', 'owner')");
  db.exec(deletionMigration.replaceAll("--> statement-breakpoint", ""));
  db.exec(`
    UPDATE workspaces
    SET deletion_requested_at = '2026-08-25T00:00:00.000Z',
        scheduled_deletion_at = '2026-09-24T00:00:00.000Z',
        deletion_requested_by_user_id = 'owner'
    WHERE id = 'workspace'
  `);

  assert.deepEqual({ ...db.prepare("SELECT deletion_requested_at, scheduled_deletion_at, deletion_requested_by_user_id FROM workspaces WHERE id = 'workspace'").get() }, {
    deletion_requested_at: "2026-08-25T00:00:00.000Z",
    scheduled_deletion_at: "2026-09-24T00:00:00.000Z",
    deletion_requested_by_user_id: "owner",
  });
  assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_workspaces_scheduled_deletion'").get().name, "idx_workspaces_scheduled_deletion");
  db.exec("UPDATE workspaces SET deletion_requested_at = NULL, scheduled_deletion_at = NULL, deletion_requested_by_user_id = NULL WHERE id = 'workspace'");
  assert.equal(db.prepare("SELECT scheduled_deletion_at FROM workspaces WHERE id = 'workspace'").get().scheduled_deletion_at, null);
  db.close();
});

test("archives Projects with Tasks and preserves structured assignments and hidden properties", async () => {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE workspace_members (
      id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, display_name TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active'
    );
    CREATE TABLE property_definitions (
      id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, name TEXT NOT NULL, type TEXT NOT NULL,
      options TEXT NOT NULL DEFAULT '[]', sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE items (
      id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, parent_id TEXT, kind TEXT NOT NULL,
      title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'todo',
      priority TEXT NOT NULL DEFAULT 'medium', cadence TEXT NOT NULL DEFAULT 'weekly',
      progress INTEGER NOT NULL DEFAULT 0, due_date TEXT, source TEXT NOT NULL DEFAULT 'web',
      source_ref TEXT, sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE item_property_values (
      id TEXT PRIMARY KEY, owner_id TEXT NOT NULL,
      item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
      property_id TEXT NOT NULL REFERENCES property_definitions(id) ON DELETE CASCADE,
      value TEXT NOT NULL DEFAULT 'null', updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    INSERT INTO workspace_members (id, workspace_id, display_name) VALUES
      ('lead', 'workspace', '김태홍'), ('worker', 'workspace', '이실무'), ('second', 'workspace', '박지원');
    INSERT INTO property_definitions (id, owner_id, name, type) VALUES
      ('risk', 'workspace', '리스크', 'text');
    INSERT INTO items (id, owner_id, kind, title, status) VALUES
      ('project', 'workspace', 'project', '출시 프로젝트', 'in_progress'),
      ('other-project', 'workspace', 'project', '다른 프로젝트', 'backlog');
    INSERT INTO items (id, owner_id, parent_id, kind, title, status) VALUES
      ('task-a', 'workspace', 'project', 'task', '설계', 'blocked'),
      ('task-b', 'workspace', 'project', 'task', '개발', 'done');
    INSERT INTO item_property_values (id, owner_id, item_id, property_id, value) VALUES
      ('risk-value', 'workspace', 'project', 'risk', '"높음"');
  `);

  const migration = await readFile(new URL("../drizzle/0019_magenta_shooting_star.sql", import.meta.url), "utf8");
  db.exec(migration.replaceAll("--> statement-breakpoint", ""));
  db.exec(`
    INSERT INTO item_assignments (id, owner_id, item_id, member_id, role) VALUES
      ('dri', 'workspace', 'project', 'lead', 'project_dri'),
      ('worker-a', 'workspace', 'project', 'worker', 'project_worker'),
      ('worker-b', 'workspace', 'project', 'second', 'project_worker'),
      ('assignee', 'workspace', 'task-a', 'worker', 'task_assignee');
    INSERT INTO project_hidden_properties (id, owner_id, project_id, property_id)
      VALUES ('hidden', 'workspace', 'project', 'risk');
  `);

  assert.throws(() => db.exec(`INSERT INTO item_assignments (id, owner_id, item_id, member_id, role)
    VALUES ('second-dri', 'workspace', 'project', 'second', 'project_dri')`));
  assert.throws(() => db.exec(`INSERT INTO item_assignments (id, owner_id, item_id, member_id, role)
    VALUES ('second-assignee', 'workspace', 'task-a', 'second', 'task_assignee')`));
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM item_assignments WHERE item_id = 'project' AND role = 'project_worker'").get().count, 2);
  assert.equal(db.prepare("SELECT value FROM item_property_values WHERE id = 'risk-value'").get().value, '"높음"');
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM project_hidden_properties WHERE project_id = 'other-project'").get().count, 0);

  db.prepare(`UPDATE items
    SET archived_from_status = status, status = 'archived', archived_at = ?, archive_root_id = ?, updated_at = ?
    WHERE owner_id = ? AND archived_at IS NULL AND (id = ? OR (parent_id = ? AND kind = 'task'))`)
    .run("2026-08-24T00:00:00.000Z", "project", "2026-08-24T00:00:00.000Z", "workspace", "project", "project");
  assert.deepEqual(db.prepare("SELECT id, status FROM items WHERE archived_at IS NULL ORDER BY id").all().map((row) => ({ ...row })), [
    { id: "other-project", status: "backlog" },
  ]);

  db.prepare(`UPDATE items
    SET status = CASE WHEN archived_from_status IS NULL OR archived_from_status = 'archived'
      THEN CASE kind WHEN 'project' THEN 'backlog' ELSE 'todo' END ELSE archived_from_status END,
      archived_at = NULL, archived_from_status = NULL, archive_root_id = NULL, updated_at = ?
    WHERE owner_id = ? AND (id = ? OR archive_root_id = ?)`)
    .run("2026-08-24T01:00:00.000Z", "workspace", "project", "project");
  assert.deepEqual(db.prepare("SELECT id, status FROM items WHERE id IN ('project', 'task-a', 'task-b') ORDER BY id").all().map((row) => ({ ...row })), [
    { id: "project", status: "in_progress" },
    { id: "task-a", status: "blocked" },
    { id: "task-b", status: "done" },
  ]);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM item_assignments").get().count, 4);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM project_hidden_properties").get().count, 1);

  db.prepare(`UPDATE items
    SET archived_from_status = status, status = 'archived', archived_at = ?, archive_root_id = ?, updated_at = ?
    WHERE owner_id = ? AND archived_at IS NULL AND (id = ? OR (parent_id = ? AND kind = 'task'))`)
    .run("2026-08-24T02:00:00.000Z", "project", "2026-08-24T02:00:00.000Z", "workspace", "project", "project");
  db.exec("DELETE FROM items WHERE owner_id = 'workspace' AND (id = 'project' OR archive_root_id = 'project')");
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM items WHERE id IN ('project', 'task-a', 'task-b')").get().count, 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM item_assignments").get().count, 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM item_property_values").get().count, 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM project_hidden_properties").get().count, 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM items WHERE id = 'other-project'").get().count, 1);
  db.close();
});

test("creates groups with unique handles and cascading memberships", async () => {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON;");
  const [teamMigration, groupMigration] = await Promise.all([
    readFile(new URL("../drizzle/0005_wet_roland_deschain.sql", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0006_rich_spitfire.sql", import.meta.url), "utf8"),
  ]);
  db.exec(teamMigration.replaceAll("--> statement-breakpoint", ""));
  db.exec(groupMigration.replaceAll("--> statement-breakpoint", ""));
  db.exec(`
    INSERT INTO workspaces (id, name, owner_user_id) VALUES ('workspace', 'Team', 'owner');
    INSERT INTO workspace_members (id, workspace_id, user_id, display_name, role, status)
      VALUES ('owner-member', 'workspace', 'owner', 'Owner', 'owner', 'active');
    INSERT INTO workspace_members (id, workspace_id, email, display_name, role, status)
      VALUES ('invite', 'workspace', 'pending@example.com', 'Pending', 'member', 'invited');
    INSERT INTO workspace_groups (id, workspace_id, name, handle, color, visibility)
      VALUES ('group', 'workspace', '제품 팀', '제품-팀', 'blue', 'private');
    INSERT INTO workspace_group_members (id, group_id, member_id, role)
      VALUES ('lead', 'group', 'owner-member', 'lead');
    INSERT INTO workspace_group_members (id, group_id, member_id, role)
      VALUES ('pending-member', 'group', 'invite', 'member');
  `);

  assert.throws(() => db.exec("INSERT INTO workspace_groups (id, workspace_id, name, handle) VALUES ('duplicate', 'workspace', 'Duplicate', '제품-팀')"), /UNIQUE/i);
  assert.deepEqual({ ...db.prepare("SELECT visibility, archived FROM workspace_groups WHERE id = 'group'").get() }, { visibility: "private", archived: 0 });
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM workspace_group_members WHERE group_id = 'group'").get().count, 2);

  db.exec("DELETE FROM workspace_members WHERE id = 'invite'");
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM workspace_group_members WHERE group_id = 'group'").get().count, 1);
  db.exec("DELETE FROM workspace_groups WHERE id = 'group'");
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM workspace_group_members").get().count, 0);
  db.close();
});

test("allows one user to join and switch between multiple workspaces", async () => {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON;");
  const [teamMigration, workspaceMigration] = await Promise.all([
    readFile(new URL("../drizzle/0005_wet_roland_deschain.sql", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0007_remarkable_epoch.sql", import.meta.url), "utf8"),
  ]);
  db.exec(teamMigration.replaceAll("--> statement-breakpoint", ""));
  db.exec(workspaceMigration.replaceAll("--> statement-breakpoint", ""));
  db.exec(`
    INSERT INTO workspaces (id, name, owner_user_id) VALUES ('user', '개인 워크스페이스', 'user');
    INSERT INTO workspaces (id, name, owner_user_id) VALUES ('team', '제품 팀', 'user');
    INSERT INTO workspace_members (id, workspace_id, user_id, display_name, role, status)
      VALUES ('personal-member', 'user', 'user', 'User', 'owner', 'active');
    INSERT INTO workspace_members (id, workspace_id, user_id, display_name, role, status)
      VALUES ('team-member', 'team', 'user', 'User', 'owner', 'active');
    INSERT INTO user_workspace_preferences (user_id, active_workspace_id)
      VALUES ('user', 'team');
  `);

  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM workspace_members WHERE user_id = 'user'").get().count, 2);
  assert.equal(db.prepare("SELECT active_workspace_id FROM user_workspace_preferences WHERE user_id = 'user'").get().active_workspace_id, "team");
  assert.throws(
    () => db.exec("INSERT INTO workspace_members (id, workspace_id, user_id, display_name, role, status) VALUES ('duplicate', 'team', 'user', 'User', 'member', 'active')"),
    /UNIQUE/i,
  );
  db.close();
});

test("adds routine execution guide fields", async () => {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON;");
  const [routineMigration, guideMigration] = await Promise.all([
    readFile(new URL("../drizzle/0004_good_scarlet_witch.sql", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0008_zippy_dormammu.sql", import.meta.url), "utf8"),
  ]);
  db.exec(routineMigration.replaceAll("--> statement-breakpoint", ""));
  db.exec("INSERT INTO routines (id, owner_id, title, cadence) VALUES ('routine', 'owner', 'Daily planning', 'daily')");
  db.exec(guideMigration.replaceAll("--> statement-breakpoint", ""));
  db.exec(`
    UPDATE routines
    SET trigger_point = '오전 9시',
        action_place = 'OKRPTR 작업 탭',
        action_steps = '인박스를 비우고 오늘 집중할 Task를 고른다'
    WHERE id = 'routine'
  `);

  assert.deepEqual({ ...db.prepare("SELECT trigger_point, action_place, action_steps FROM routines WHERE id = 'routine'").get() }, {
    trigger_point: "오전 9시",
    action_place: "OKRPTR 작업 탭",
    action_steps: "인박스를 비우고 오늘 집중할 Task를 고른다",
  });
  db.close();
});

test("creates workspace rules that follow workspace ownership", async () => {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON;");
  const [teamMigration, rulesMigration] = await Promise.all([
    readFile(new URL("../drizzle/0005_wet_roland_deschain.sql", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0009_demonic_hitman.sql", import.meta.url), "utf8"),
  ]);
  db.exec(teamMigration.replaceAll("--> statement-breakpoint", ""));
  db.exec(rulesMigration.replaceAll("--> statement-breakpoint", ""));
  db.exec(`
    INSERT INTO workspaces (id, name, owner_user_id) VALUES ('workspace', 'Team', 'owner');
    INSERT INTO workspace_rules (
      workspace_id, capture_instruction, structure_instruction, routine_instruction,
      default_priority, default_cadence, review_before_create, configured
    ) VALUES (
      'workspace', '인박스 우선', 'Project가 명확하면 연결', '트리거와 방법을 묻기',
      'high', 'daily', 1, 1
    );
  `);

  assert.deepEqual({ ...db.prepare("SELECT default_priority, default_cadence, configured FROM workspace_rules WHERE workspace_id = 'workspace'").get() }, {
    default_priority: "high",
    default_cadence: "daily",
    configured: 1,
  });
  db.exec("DELETE FROM workspaces WHERE id = 'workspace'");
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM workspace_rules").get().count, 0);
  db.close();
});

test("records AI usage events for cost limits", async () => {
  const db = new DatabaseSync(":memory:");
  const migration = await readFile(new URL("../drizzle/0010_sturdy_firelord.sql", import.meta.url), "utf8");
  db.exec(migration.replaceAll("--> statement-breakpoint", ""));
  db.exec(`
    INSERT INTO ai_usage_events (
      id, owner_id, user_id, model, source, input_chars, input_tokens,
      output_tokens, estimated_cost_won_micros
    ) VALUES (
      'usage-1', 'workspace', 'user', 'gpt-5.6-luna', 'web', 120,
      60, 200, 25000000
    );
  `);

  assert.deepEqual({ ...db.prepare("SELECT COUNT(*) AS count, SUM(estimated_cost_won_micros) AS spent FROM ai_usage_events WHERE owner_id = 'workspace' AND user_id = 'user'").get() }, {
    count: 1,
    spent: 25000000,
  });
  db.close();
});

test("creates Google OAuth and Calendar sync tables", async () => {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON;");
  const [itemsMigration, googleMigration] = await Promise.all([
    readFile(new URL("../drizzle/0000_eminent_mandroid.sql", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0011_little_leo.sql", import.meta.url), "utf8"),
  ]);
  db.exec(itemsMigration.replaceAll("--> statement-breakpoint", ""));
  db.exec(googleMigration.replaceAll("--> statement-breakpoint", ""));
  db.exec(`
    INSERT INTO items (id, owner_id, kind, title, status)
      VALUES ('task', 'workspace', 'task', 'Prepare launch review', 'todo');
    INSERT INTO google_connections (
      id, owner_id, user_id, google_account_id, email, display_name, encrypted_refresh_token, scope
    ) VALUES (
      'connection', 'workspace', 'user', 'google-user', 'user@example.com', 'User', 'encrypted', 'calendar.events'
    );
    INSERT INTO google_oauth_states (state, owner_id, user_id, expires_at)
      VALUES ('state', 'workspace', 'user', '2099-01-01T00:00:00.000Z');
    INSERT INTO google_calendar_events (
      id, owner_id, user_id, item_id, google_event_id, html_link
    ) VALUES (
      'event', 'workspace', 'user', 'task', 'google-event', 'https://calendar.google.com/event'
    );
  `);

  assert.equal(db.prepare("SELECT email FROM google_connections WHERE owner_id = 'workspace'").get().email, "user@example.com");
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM google_oauth_states").get().count, 1);
  assert.throws(
    () => db.exec("INSERT INTO google_calendar_events (id, owner_id, user_id, item_id, google_event_id) VALUES ('duplicate', 'workspace', 'user', 'task', 'other')"),
    /UNIQUE/i,
  );
  db.exec("DELETE FROM items WHERE id = 'task'");
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM google_calendar_events").get().count, 0);
  db.close();
});

test("creates Slack bot connection and OAuth state tables", async () => {
  const db = new DatabaseSync(":memory:");
  const migration = await readFile(new URL("../drizzle/0012_parallel_vindicator.sql", import.meta.url), "utf8");
  db.exec(migration.replaceAll("--> statement-breakpoint", ""));
  db.exec(`
    INSERT INTO slack_connections (
      id, owner_id, user_id, team_id, team_name, bot_user_id, app_id, encrypted_bot_token, scope
    ) VALUES (
      'connection', 'workspace', 'user', 'T123', 'Acme', 'Ubot', 'A123', 'encrypted', 'commands,chat:write'
    );
    INSERT INTO slack_oauth_states (state, owner_id, user_id, return_to, expires_at)
      VALUES ('state', 'workspace', 'user', '/', '2099-01-01T00:00:00.000Z');
  `);

  assert.deepEqual({ ...db.prepare("SELECT team_name, scope FROM slack_connections WHERE team_id = 'T123'").get() }, {
    team_name: "Acme",
    scope: "commands,chat:write",
  });
  assert.equal(db.prepare("SELECT return_to FROM slack_oauth_states WHERE state = 'state'").get().return_to, "/");
  assert.throws(
    () => db.exec("INSERT INTO slack_connections (id, owner_id, user_id, team_id, encrypted_bot_token) VALUES ('duplicate-user', 'workspace', 'user', 'T456', 'encrypted')"),
    /UNIQUE/i,
  );
  assert.throws(
    () => db.exec("INSERT INTO slack_connections (id, owner_id, user_id, team_id, encrypted_bot_token) VALUES ('duplicate-team', 'other', 'other-user', 'T123', 'encrypted')"),
    /UNIQUE/i,
  );
  db.close();
});

test("creates revocable workspace-scoped integration tokens", async () => {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON;");
  const [workspaceMigration, tokenMigration, tokenUsageMigration] = await Promise.all([
    readFile(new URL("../drizzle/0005_wet_roland_deschain.sql", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0016_windy_flatman.sql", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0017_equal_doctor_octopus.sql", import.meta.url), "utf8"),
  ]);
  db.exec(workspaceMigration.replaceAll("--> statement-breakpoint", ""));
  db.exec(tokenMigration.replaceAll("--> statement-breakpoint", ""));
  db.exec(tokenUsageMigration.replaceAll("--> statement-breakpoint", ""));
  db.exec(`
    INSERT INTO workspaces (id, name, owner_user_id) VALUES ('workspace', 'Team', 'owner');
    INSERT INTO integration_tokens (id, workspace_id, user_id, name, token_hash, token_prefix)
      VALUES ('token', 'workspace', 'owner', 'Codex conversation', 'hash', 'okrptr_123...');
  `);

  assert.deepEqual({ ...db.prepare("SELECT workspace_id, user_id, last_used_at, revoked_at FROM integration_tokens WHERE id = 'token'").get() }, {
    workspace_id: "workspace",
    user_id: "owner",
    last_used_at: null,
    revoked_at: null,
  });
  assert.throws(
    () => db.exec("INSERT INTO integration_tokens (id, workspace_id, user_id, token_hash, token_prefix) VALUES ('duplicate', 'workspace', 'owner', 'hash', 'okrptr_456...')"),
    /UNIQUE/i,
  );
  db.exec("UPDATE integration_tokens SET revoked_at = CURRENT_TIMESTAMP WHERE id = 'token'");
  assert.notEqual(db.prepare("SELECT revoked_at FROM integration_tokens WHERE id = 'token'").get().revoked_at, null);
  db.exec("DELETE FROM workspaces WHERE id = 'workspace'");
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM integration_tokens").get().count, 0);
  db.close();
});

test("creates OKR cycles and links OKR items to a cycle", async () => {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON;");
  const [itemsMigration, workspaceMigration, cycleMigration] = await Promise.all([
    readFile(new URL("../drizzle/0000_eminent_mandroid.sql", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0005_wet_roland_deschain.sql", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0013_calm_james_howlett.sql", import.meta.url), "utf8"),
  ]);
  db.exec(itemsMigration.replaceAll("--> statement-breakpoint", ""));
  db.exec(workspaceMigration.replaceAll("--> statement-breakpoint", ""));
  db.exec(cycleMigration.replaceAll("--> statement-breakpoint", ""));
  db.exec(`
    INSERT INTO workspaces (id, name, owner_user_id) VALUES ('workspace', 'Team', 'owner');
    INSERT INTO okr_cycles (id, owner_id, name, version, start_date, end_date, status)
      VALUES ('cycle', 'workspace', '2026 Q3 OKR v1', 1, '2026-07-01', '2026-09-30', 'active');
    INSERT INTO items (id, owner_id, cycle_id, kind, title, status)
      VALUES ('objective', 'workspace', 'cycle', 'objective', 'Grow retention', 'in_progress');
    INSERT INTO items (id, owner_id, kind, title, status)
      VALUES ('project', 'workspace', 'project', 'Billing policy rollout', 'policy_discussion');
  `);

  assert.deepEqual({ ...db.prepare("SELECT version, status FROM okr_cycles WHERE owner_id = 'workspace'").get() }, {
    version: 1,
    status: "active",
  });
  assert.equal(db.prepare("SELECT cycle_id FROM items WHERE id = 'objective'").get().cycle_id, "cycle");
  assert.equal(db.prepare("SELECT cycle_id FROM items WHERE id = 'project'").get().cycle_id, null);
  db.exec("DELETE FROM okr_cycles WHERE id = 'cycle'");
  assert.equal(db.prepare("SELECT cycle_id FROM items WHERE id = 'objective'").get().cycle_id, null);
  db.close();
});

test("cleanup removes execution data while preserving workspace groups", async () => {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON;");
  const migrations = await Promise.all([
    "0000_eminent_mandroid.sql",
    "0001_groovy_annihilus.sql",
    "0002_charming_prodigy.sql",
    "0004_good_scarlet_witch.sql",
    "0005_wet_roland_deschain.sql",
    "0006_rich_spitfire.sql",
    "0007_remarkable_epoch.sql",
    "0008_zippy_dormammu.sql",
    "0009_demonic_hitman.sql",
    "0010_sturdy_firelord.sql",
    "0011_little_leo.sql",
    "0012_parallel_vindicator.sql",
    "0013_calm_james_howlett.sql",
    "0014_clean_starlord.sql",
  ].map((file) => readFile(new URL(`../drizzle/${file}`, import.meta.url), "utf8")));
  for (const migration of migrations) {
    db.exec(migration.replaceAll("--> statement-breakpoint", ""));
  }

  db.exec(`
    INSERT INTO workspaces (id, name, owner_user_id) VALUES ('workspace', 'Team', 'owner');
    INSERT INTO workspace_members (id, workspace_id, user_id, display_name, role, status)
      VALUES ('owner-member', 'workspace', 'owner', 'Owner', 'owner', 'active');
    INSERT INTO workspace_groups (id, workspace_id, name, handle, color, visibility)
      VALUES ('group', 'workspace', 'Product', 'product', 'blue', 'open');
    INSERT INTO workspace_group_members (id, group_id, member_id, role)
      VALUES ('group-member', 'group', 'owner-member', 'lead');
    INSERT INTO property_definitions (id, owner_id, name, type)
      VALUES ('property', 'workspace', 'Owner', 'text');
    INSERT INTO okr_cycles (id, owner_id, name, version, start_date, end_date, status)
      VALUES ('cycle', 'workspace', '2026 Q3 OKR v1', 1, '2026-07-01', '2026-09-30', 'active');
    INSERT INTO items (id, owner_id, cycle_id, kind, title, status)
      VALUES ('task', 'workspace', 'cycle', 'task', 'Ship cleanup', 'todo');
    INSERT INTO item_property_values (id, owner_id, item_id, property_id, value)
      VALUES ('property-value', 'workspace', 'task', 'property', '"owner"');
    INSERT INTO checklist_items (id, owner_id, task_id, title)
      VALUES ('checklist', 'workspace', 'task', 'Confirm cleanup');
    INSERT INTO activity_log (id, owner_id, item_id, action)
      VALUES ('activity', 'workspace', 'task', 'created');
    INSERT INTO daily_scrums (id, owner_id, scrum_date, today_note)
      VALUES ('scrum', 'workspace', '2026-08-18', 'Cleanup');
    INSERT INTO routines (id, owner_id, title, cadence)
      VALUES ('routine', 'workspace', 'Daily review', 'daily');
    INSERT INTO routine_completions (id, owner_id, routine_id, completion_date)
      VALUES ('routine-completion', 'workspace', 'routine', '2026-08-18');
    INSERT INTO google_connections (id, owner_id, user_id, google_account_id, email, encrypted_refresh_token)
      VALUES ('google', 'workspace', 'owner', 'google-owner', 'owner@example.com', 'encrypted');
    INSERT INTO google_calendar_events (id, owner_id, user_id, item_id, google_event_id)
      VALUES ('event', 'workspace', 'owner', 'task', 'google-event');
    INSERT INTO slack_connections (id, owner_id, user_id, team_id, encrypted_bot_token)
      VALUES ('slack', 'workspace', 'owner', 'T123', 'encrypted');
    INSERT INTO trash_records (
      id, owner_id, category, title, payload, item_count, routine_count, cycle_count, created_by_user_id
    ) VALUES (
      'trash', 'workspace', 'workspace_cleanup', 'OKR cleanup 2026-08-18',
      '{"items":[{"id":"task"}],"routines":[{"id":"routine"}],"okrCycles":[{"id":"cycle"}]}',
      1, 1, 1, 'owner'
    );
  `);

  db.exec(`
    DELETE FROM checklist_items WHERE owner_id = 'workspace';
    DELETE FROM item_property_values WHERE owner_id = 'workspace';
    DELETE FROM google_calendar_events WHERE owner_id = 'workspace';
    DELETE FROM activity_log WHERE owner_id = 'workspace';
    DELETE FROM daily_scrums WHERE owner_id = 'workspace';
    DELETE FROM routine_completions WHERE owner_id = 'workspace';
    DELETE FROM routines WHERE owner_id = 'workspace';
    DELETE FROM items WHERE owner_id = 'workspace';
    DELETE FROM okr_cycles WHERE owner_id = 'workspace';
  `);

  assert.deepEqual({
    workspaces: db.prepare("SELECT COUNT(*) AS count FROM workspaces WHERE id = 'workspace'").get().count,
    members: db.prepare("SELECT COUNT(*) AS count FROM workspace_members WHERE workspace_id = 'workspace'").get().count,
    groups: db.prepare("SELECT COUNT(*) AS count FROM workspace_groups WHERE workspace_id = 'workspace'").get().count,
    groupMembers: db.prepare("SELECT COUNT(*) AS count FROM workspace_group_members WHERE group_id = 'group'").get().count,
    properties: db.prepare("SELECT COUNT(*) AS count FROM property_definitions WHERE owner_id = 'workspace'").get().count,
    googleConnections: db.prepare("SELECT COUNT(*) AS count FROM google_connections WHERE owner_id = 'workspace'").get().count,
    slackConnections: db.prepare("SELECT COUNT(*) AS count FROM slack_connections WHERE owner_id = 'workspace'").get().count,
    trashRecords: db.prepare("SELECT COUNT(*) AS count FROM trash_records WHERE owner_id = 'workspace'").get().count,
  }, {
    workspaces: 1,
    members: 1,
    groups: 1,
    groupMembers: 1,
    properties: 1,
    googleConnections: 1,
    slackConnections: 1,
    trashRecords: 1,
  });
  assert.deepEqual({
    items: db.prepare("SELECT COUNT(*) AS count FROM items WHERE owner_id = 'workspace'").get().count,
    cycles: db.prepare("SELECT COUNT(*) AS count FROM okr_cycles WHERE owner_id = 'workspace'").get().count,
    routines: db.prepare("SELECT COUNT(*) AS count FROM routines WHERE owner_id = 'workspace'").get().count,
    scrums: db.prepare("SELECT COUNT(*) AS count FROM daily_scrums WHERE owner_id = 'workspace'").get().count,
  }, {
    items: 0,
    cycles: 0,
    routines: 0,
    scrums: 0,
  });
  db.close();
});
