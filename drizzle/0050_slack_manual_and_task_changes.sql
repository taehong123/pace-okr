CREATE TABLE slack_daily_manual_runs (
  id text PRIMARY KEY NOT NULL,
  owner_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  created_by_user_id text NOT NULL,
  targets_json text NOT NULL CHECK(json_valid(targets_json) AND json_type(targets_json) = 'array'),
  errors_json text NOT NULL DEFAULT '{}' CHECK(json_valid(errors_json) AND json_type(errors_json) = 'object'),
  status text NOT NULL DEFAULT 'pending',
  created_at text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  expires_at text NOT NULL
);
--> statement-breakpoint
CREATE INDEX idx_slack_manual_pending ON slack_daily_manual_runs(status, expires_at);
--> statement-breakpoint
CREATE TABLE slack_task_changes (
  id text PRIMARY KEY NOT NULL,
  owner_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  automation_id text NOT NULL REFERENCES slack_automations(id) ON DELETE CASCADE,
  task_id text NOT NULL,
  channel_id text NOT NULL,
  change_kind text NOT NULL,
  task_json text NOT NULL CHECK(json_valid(task_json)),
  before_json text NOT NULL CHECK(json_valid(before_json)),
  after_json text NOT NULL CHECK(json_valid(after_json)),
  created_at text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  processed_at text
);
--> statement-breakpoint
CREATE INDEX idx_slack_task_changes_pending ON slack_task_changes(processed_at, created_at);
--> statement-breakpoint
CREATE TRIGGER slack_task_created
AFTER INSERT ON items
WHEN NEW.kind = 'task' AND NEW.archived_at IS NULL
BEGIN
  INSERT INTO slack_task_changes (id, owner_id, automation_id, task_id, channel_id, change_kind, task_json, before_json, after_json)
  SELECT lower(hex(randomblob(16))), a.owner_id, a.id, NEW.id, a.channel_id, 'created',
    json_object('id', NEW.id, 'title', NEW.title, 'status', NEW.status, 'priority', NEW.priority, 'parent', COALESCE((SELECT title FROM items WHERE id = NEW.parent_id AND owner_id = NEW.owner_id), (SELECT title FROM routines WHERE id = NEW.routine_id AND owner_id = NEW.owner_id), 'General')),
    '{}',
    json_object('title', NEW.title, 'description', NEW.description, 'status', NEW.status, 'priority', NEW.priority, 'cadence', NEW.cadence, 'progress', NEW.progress, 'due_date', NEW.due_date, 'parent_id', NEW.parent_id, 'routine_id', NEW.routine_id, 'cycle_id', NEW.cycle_id, 'sort_order', NEW.sort_order, 'archived_at', NEW.archived_at, 'parent', COALESCE((SELECT title FROM items WHERE id = NEW.parent_id AND owner_id = NEW.owner_id), (SELECT title FROM routines WHERE id = NEW.routine_id AND owner_id = NEW.owner_id), 'General'))
  FROM slack_automations a JOIN workspaces w ON w.id = a.owner_id
  WHERE a.owner_id = NEW.owner_id AND a.active = 1 AND a.trigger_type = 'task_changed' AND w.scheduled_deletion_at IS NULL;
END;
--> statement-breakpoint
CREATE TRIGGER slack_task_updated
AFTER UPDATE ON items
WHEN NEW.kind = 'task' AND OLD.kind = 'task' AND (OLD.title IS NOT NEW.title OR OLD.description IS NOT NEW.description OR OLD.status IS NOT NEW.status OR OLD.priority IS NOT NEW.priority OR OLD.cadence IS NOT NEW.cadence OR OLD.progress IS NOT NEW.progress OR OLD.due_date IS NOT NEW.due_date OR OLD.parent_id IS NOT NEW.parent_id OR OLD.routine_id IS NOT NEW.routine_id OR OLD.cycle_id IS NOT NEW.cycle_id OR OLD.sort_order IS NOT NEW.sort_order OR OLD.archived_at IS NOT NEW.archived_at)
BEGIN
  INSERT INTO slack_task_changes (id, owner_id, automation_id, task_id, channel_id, change_kind, task_json, before_json, after_json)
  SELECT lower(hex(randomblob(16))), a.owner_id, a.id, NEW.id, a.channel_id, CASE WHEN OLD.archived_at IS NULL AND NEW.archived_at IS NOT NULL THEN 'deleted' WHEN OLD.archived_at IS NOT NULL AND NEW.archived_at IS NULL THEN 'restored' ELSE 'updated' END,
    json_object('id', NEW.id, 'title', NEW.title, 'status', NEW.status, 'priority', NEW.priority, 'parent', COALESCE((SELECT title FROM items WHERE id = NEW.parent_id AND owner_id = NEW.owner_id), (SELECT title FROM routines WHERE id = NEW.routine_id AND owner_id = NEW.owner_id), 'General')),
    json_object('title', OLD.title, 'description', OLD.description, 'status', OLD.status, 'priority', OLD.priority, 'cadence', OLD.cadence, 'progress', OLD.progress, 'due_date', OLD.due_date, 'parent_id', OLD.parent_id, 'routine_id', OLD.routine_id, 'cycle_id', OLD.cycle_id, 'sort_order', OLD.sort_order, 'archived_at', OLD.archived_at, 'parent', COALESCE((SELECT title FROM items WHERE id = OLD.parent_id AND owner_id = OLD.owner_id), (SELECT title FROM routines WHERE id = OLD.routine_id AND owner_id = OLD.owner_id), 'General')),
    json_object('title', NEW.title, 'description', NEW.description, 'status', NEW.status, 'priority', NEW.priority, 'cadence', NEW.cadence, 'progress', NEW.progress, 'due_date', NEW.due_date, 'parent_id', NEW.parent_id, 'routine_id', NEW.routine_id, 'cycle_id', NEW.cycle_id, 'sort_order', NEW.sort_order, 'archived_at', NEW.archived_at, 'parent', COALESCE((SELECT title FROM items WHERE id = NEW.parent_id AND owner_id = NEW.owner_id), (SELECT title FROM routines WHERE id = NEW.routine_id AND owner_id = NEW.owner_id), 'General'))
  FROM slack_automations a JOIN workspaces w ON w.id = a.owner_id
  WHERE a.owner_id = NEW.owner_id AND a.active = 1 AND a.trigger_type = 'task_changed' AND w.scheduled_deletion_at IS NULL;
END;
--> statement-breakpoint
CREATE TRIGGER slack_task_permanently_deleted
BEFORE DELETE ON items
WHEN OLD.kind = 'task'
BEGIN
  INSERT INTO slack_task_changes (id, owner_id, automation_id, task_id, channel_id, change_kind, task_json, before_json, after_json)
  SELECT lower(hex(randomblob(16))), a.owner_id, a.id, OLD.id, a.channel_id, 'permanently_deleted',
    json_object('id', OLD.id, 'title', OLD.title, 'status', OLD.status, 'priority', OLD.priority, 'parent', COALESCE((SELECT title FROM items WHERE id = OLD.parent_id AND owner_id = OLD.owner_id), (SELECT title FROM routines WHERE id = OLD.routine_id AND owner_id = OLD.owner_id), 'General')),
    json_object('title', OLD.title, 'description', OLD.description, 'status', OLD.status, 'priority', OLD.priority, 'cadence', OLD.cadence, 'progress', OLD.progress, 'due_date', OLD.due_date, 'parent_id', OLD.parent_id, 'routine_id', OLD.routine_id, 'cycle_id', OLD.cycle_id, 'sort_order', OLD.sort_order, 'archived_at', OLD.archived_at, 'parent', COALESCE((SELECT title FROM items WHERE id = OLD.parent_id AND owner_id = OLD.owner_id), (SELECT title FROM routines WHERE id = OLD.routine_id AND owner_id = OLD.owner_id), 'General')),
    '{}'
  FROM slack_automations a JOIN workspaces w ON w.id = a.owner_id
  WHERE a.owner_id = OLD.owner_id AND a.active = 1 AND a.trigger_type = 'task_changed' AND w.scheduled_deletion_at IS NULL;
END;
--> statement-breakpoint
CREATE TRIGGER slack_task_assignee_added
AFTER INSERT ON item_assignments
WHEN NEW.role = 'task_assignee'
BEGIN
  INSERT INTO slack_task_changes (id, owner_id, automation_id, task_id, channel_id, change_kind, task_json, before_json, after_json)
  SELECT lower(hex(randomblob(16))), a.owner_id, a.id, task.id, a.channel_id, 'assignee',
    json_object('id', task.id, 'title', task.title, 'status', task.status, 'priority', task.priority, 'parent', COALESCE((SELECT title FROM items WHERE id = task.parent_id AND owner_id = task.owner_id), (SELECT title FROM routines WHERE id = task.routine_id AND owner_id = task.owner_id), 'General')),
    '{}',
    json_object('assignee', COALESCE((SELECT COALESCE(NULLIF(display_name, ''), email, id) FROM workspace_members WHERE id = NEW.member_id AND workspace_id = NEW.owner_id), NEW.member_id))
  FROM slack_automations a JOIN workspaces w ON w.id = a.owner_id JOIN items task ON task.owner_id = a.owner_id AND task.id = NEW.item_id AND task.kind = 'task' AND task.archived_at IS NULL
  WHERE a.owner_id = NEW.owner_id AND a.active = 1 AND a.trigger_type = 'task_changed' AND w.scheduled_deletion_at IS NULL;
END;
--> statement-breakpoint
CREATE TRIGGER slack_task_assignee_removed
AFTER DELETE ON item_assignments
WHEN OLD.role = 'task_assignee'
BEGIN
  INSERT INTO slack_task_changes (id, owner_id, automation_id, task_id, channel_id, change_kind, task_json, before_json, after_json)
  SELECT lower(hex(randomblob(16))), a.owner_id, a.id, task.id, a.channel_id, 'assignee',
    json_object('id', task.id, 'title', task.title, 'status', task.status, 'priority', task.priority, 'parent', COALESCE((SELECT title FROM items WHERE id = task.parent_id AND owner_id = task.owner_id), (SELECT title FROM routines WHERE id = task.routine_id AND owner_id = task.owner_id), 'General')),
    json_object('assignee', COALESCE((SELECT COALESCE(NULLIF(display_name, ''), email, id) FROM workspace_members WHERE id = OLD.member_id AND workspace_id = OLD.owner_id), OLD.member_id)),
    '{}'
  FROM slack_automations a JOIN workspaces w ON w.id = a.owner_id JOIN items task ON task.owner_id = a.owner_id AND task.id = OLD.item_id AND task.kind = 'task' AND task.archived_at IS NULL
  WHERE a.owner_id = OLD.owner_id AND a.active = 1 AND a.trigger_type = 'task_changed' AND w.scheduled_deletion_at IS NULL;
END;
--> statement-breakpoint
CREATE TRIGGER slack_task_assignee_updated
AFTER UPDATE ON item_assignments
WHEN NEW.role = 'task_assignee' AND OLD.member_id IS NOT NEW.member_id
BEGIN
  INSERT INTO slack_task_changes (id, owner_id, automation_id, task_id, channel_id, change_kind, task_json, before_json, after_json)
  SELECT lower(hex(randomblob(16))), a.owner_id, a.id, task.id, a.channel_id, 'assignee',
    json_object('id', task.id, 'title', task.title, 'status', task.status, 'priority', task.priority, 'parent', COALESCE((SELECT title FROM items WHERE id = task.parent_id AND owner_id = task.owner_id), (SELECT title FROM routines WHERE id = task.routine_id AND owner_id = task.owner_id), 'General')),
    json_object('assignee', COALESCE((SELECT COALESCE(NULLIF(display_name, ''), email, id) FROM workspace_members WHERE id = OLD.member_id AND workspace_id = OLD.owner_id), OLD.member_id)),
    json_object('assignee', COALESCE((SELECT COALESCE(NULLIF(display_name, ''), email, id) FROM workspace_members WHERE id = NEW.member_id AND workspace_id = NEW.owner_id), NEW.member_id))
  FROM slack_automations a JOIN workspaces w ON w.id = a.owner_id JOIN items task ON task.owner_id = a.owner_id AND task.id = NEW.item_id AND task.kind = 'task' AND task.archived_at IS NULL
  WHERE a.owner_id = NEW.owner_id AND a.active = 1 AND a.trigger_type = 'task_changed' AND w.scheduled_deletion_at IS NULL;
END;
--> statement-breakpoint
CREATE TRIGGER slack_task_property_added
AFTER INSERT ON item_property_values
WHEN NEW.value <> 'null'
BEGIN
  INSERT INTO slack_task_changes (id, owner_id, automation_id, task_id, channel_id, change_kind, task_json, before_json, after_json)
  SELECT lower(hex(randomblob(16))), a.owner_id, a.id, task.id, a.channel_id, 'property',
    json_object('id', task.id, 'title', task.title, 'status', task.status, 'priority', task.priority, 'parent', COALESCE((SELECT title FROM items WHERE id = task.parent_id AND owner_id = task.owner_id), (SELECT title FROM routines WHERE id = task.routine_id AND owner_id = task.owner_id), 'General')),
    '{}',
    json_object('property_id', NEW.property_id, 'property_name', COALESCE((SELECT name FROM property_definitions WHERE owner_id = NEW.owner_id AND id = NEW.property_id), NEW.property_id), 'value', NEW.value)
  FROM slack_automations a JOIN workspaces w ON w.id = a.owner_id JOIN items task ON task.owner_id = a.owner_id AND task.id = NEW.item_id AND task.kind = 'task' AND task.archived_at IS NULL
  WHERE a.owner_id = NEW.owner_id AND a.active = 1 AND a.trigger_type = 'task_changed' AND w.scheduled_deletion_at IS NULL;
END;
--> statement-breakpoint
CREATE TRIGGER slack_task_property_removed
AFTER DELETE ON item_property_values
WHEN OLD.value <> 'null'
BEGIN
  INSERT INTO slack_task_changes (id, owner_id, automation_id, task_id, channel_id, change_kind, task_json, before_json, after_json)
  SELECT lower(hex(randomblob(16))), a.owner_id, a.id, task.id, a.channel_id, 'property',
    json_object('id', task.id, 'title', task.title, 'status', task.status, 'priority', task.priority, 'parent', COALESCE((SELECT title FROM items WHERE id = task.parent_id AND owner_id = task.owner_id), (SELECT title FROM routines WHERE id = task.routine_id AND owner_id = task.owner_id), 'General')),
    json_object('property_id', OLD.property_id, 'property_name', COALESCE((SELECT name FROM property_definitions WHERE owner_id = OLD.owner_id AND id = OLD.property_id), OLD.property_id), 'value', OLD.value),
    '{}'
  FROM slack_automations a JOIN workspaces w ON w.id = a.owner_id JOIN items task ON task.owner_id = a.owner_id AND task.id = OLD.item_id AND task.kind = 'task' AND task.archived_at IS NULL
  WHERE a.owner_id = OLD.owner_id AND a.active = 1 AND a.trigger_type = 'task_changed' AND w.scheduled_deletion_at IS NULL;
END;
--> statement-breakpoint
CREATE TRIGGER slack_task_property_updated
AFTER UPDATE ON item_property_values
WHEN OLD.value IS NOT NEW.value
BEGIN
  INSERT INTO slack_task_changes (id, owner_id, automation_id, task_id, channel_id, change_kind, task_json, before_json, after_json)
  SELECT lower(hex(randomblob(16))), a.owner_id, a.id, task.id, a.channel_id, 'property',
    json_object('id', task.id, 'title', task.title, 'status', task.status, 'priority', task.priority, 'parent', COALESCE((SELECT title FROM items WHERE id = task.parent_id AND owner_id = task.owner_id), (SELECT title FROM routines WHERE id = task.routine_id AND owner_id = task.owner_id), 'General')),
    json_object('property_id', OLD.property_id, 'property_name', COALESCE((SELECT name FROM property_definitions WHERE owner_id = OLD.owner_id AND id = OLD.property_id), OLD.property_id), 'value', OLD.value),
    json_object('property_id', NEW.property_id, 'property_name', COALESCE((SELECT name FROM property_definitions WHERE owner_id = NEW.owner_id AND id = NEW.property_id), NEW.property_id), 'value', NEW.value)
  FROM slack_automations a JOIN workspaces w ON w.id = a.owner_id JOIN items task ON task.owner_id = a.owner_id AND task.id = NEW.item_id AND task.kind = 'task' AND task.archived_at IS NULL
  WHERE a.owner_id = NEW.owner_id AND a.active = 1 AND a.trigger_type = 'task_changed' AND w.scheduled_deletion_at IS NULL;
END;
--> statement-breakpoint
CREATE TRIGGER slack_task_checklist_added
AFTER INSERT ON checklist_items
WHEN 1
BEGIN
  INSERT INTO slack_task_changes (id, owner_id, automation_id, task_id, channel_id, change_kind, task_json, before_json, after_json)
  SELECT lower(hex(randomblob(16))), a.owner_id, a.id, task.id, a.channel_id, 'checklist',
    json_object('id', task.id, 'title', task.title, 'status', task.status, 'priority', task.priority, 'parent', COALESCE((SELECT title FROM items WHERE id = task.parent_id AND owner_id = task.owner_id), (SELECT title FROM routines WHERE id = task.routine_id AND owner_id = task.owner_id), 'General')),
    '{}',
    json_object('checklist_title', NEW.title, 'completed', NEW.completed, 'sort_order', NEW.sort_order)
  FROM slack_automations a JOIN workspaces w ON w.id = a.owner_id JOIN items task ON task.owner_id = a.owner_id AND task.id = NEW.task_id AND task.kind = 'task' AND task.archived_at IS NULL
  WHERE a.owner_id = NEW.owner_id AND a.active = 1 AND a.trigger_type = 'task_changed' AND w.scheduled_deletion_at IS NULL;
END;
--> statement-breakpoint
CREATE TRIGGER slack_task_checklist_removed
AFTER DELETE ON checklist_items
WHEN 1
BEGIN
  INSERT INTO slack_task_changes (id, owner_id, automation_id, task_id, channel_id, change_kind, task_json, before_json, after_json)
  SELECT lower(hex(randomblob(16))), a.owner_id, a.id, task.id, a.channel_id, 'checklist',
    json_object('id', task.id, 'title', task.title, 'status', task.status, 'priority', task.priority, 'parent', COALESCE((SELECT title FROM items WHERE id = task.parent_id AND owner_id = task.owner_id), (SELECT title FROM routines WHERE id = task.routine_id AND owner_id = task.owner_id), 'General')),
    json_object('checklist_title', OLD.title, 'completed', OLD.completed, 'sort_order', OLD.sort_order),
    '{}'
  FROM slack_automations a JOIN workspaces w ON w.id = a.owner_id JOIN items task ON task.owner_id = a.owner_id AND task.id = OLD.task_id AND task.kind = 'task' AND task.archived_at IS NULL
  WHERE a.owner_id = OLD.owner_id AND a.active = 1 AND a.trigger_type = 'task_changed' AND w.scheduled_deletion_at IS NULL;
END;
--> statement-breakpoint
CREATE TRIGGER slack_task_checklist_updated
AFTER UPDATE ON checklist_items
WHEN OLD.title IS NOT NEW.title OR OLD.completed IS NOT NEW.completed OR OLD.sort_order IS NOT NEW.sort_order
BEGIN
  INSERT INTO slack_task_changes (id, owner_id, automation_id, task_id, channel_id, change_kind, task_json, before_json, after_json)
  SELECT lower(hex(randomblob(16))), a.owner_id, a.id, task.id, a.channel_id, 'checklist',
    json_object('id', task.id, 'title', task.title, 'status', task.status, 'priority', task.priority, 'parent', COALESCE((SELECT title FROM items WHERE id = task.parent_id AND owner_id = task.owner_id), (SELECT title FROM routines WHERE id = task.routine_id AND owner_id = task.owner_id), 'General')),
    json_object('checklist_title', OLD.title, 'completed', OLD.completed, 'sort_order', OLD.sort_order),
    json_object('checklist_title', NEW.title, 'completed', NEW.completed, 'sort_order', NEW.sort_order)
  FROM slack_automations a JOIN workspaces w ON w.id = a.owner_id JOIN items task ON task.owner_id = a.owner_id AND task.id = NEW.task_id AND task.kind = 'task' AND task.archived_at IS NULL
  WHERE a.owner_id = NEW.owner_id AND a.active = 1 AND a.trigger_type = 'task_changed' AND w.scheduled_deletion_at IS NULL;
END;
