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
