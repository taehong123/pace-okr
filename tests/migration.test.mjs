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
