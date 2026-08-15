INSERT OR IGNORE INTO checklist_items
  (id, owner_id, task_id, title, completed, sort_order, created_at, updated_at)
SELECT 'legacy-action-' || action_item.id, action_item.owner_id,
  action_item.parent_id, action_item.title,
  CASE WHEN action_item.status = 'done' THEN 1 ELSE 0 END,
  action_item.sort_order, action_item.created_at, action_item.updated_at
FROM items AS action_item
WHERE action_item.kind = 'action'
  AND EXISTS (
    SELECT 1 FROM items AS parent_task
    WHERE parent_task.owner_id = action_item.owner_id
      AND parent_task.id = action_item.parent_id
      AND parent_task.kind = 'task'
  );
--> statement-breakpoint
DELETE FROM items
WHERE kind = 'action'
  AND EXISTS (
    SELECT 1 FROM items AS parent_task
    WHERE parent_task.owner_id = items.owner_id
      AND parent_task.id = items.parent_id
      AND parent_task.kind = 'task'
  );
--> statement-breakpoint
UPDATE items
SET kind = 'task', parent_id = NULL, status = 'inbox', source = 'migration',
  updated_at = CURRENT_TIMESTAMP
WHERE kind = 'action';
--> statement-breakpoint
INSERT OR IGNORE INTO items
  (id, owner_id, parent_id, kind, title, description, status, priority, cadence,
   progress, due_date, source, source_ref, sort_order, created_at, updated_at)
SELECT 'legacy-project-' || initiative.id, initiative.owner_id, initiative.id,
  'project', initiative.title || ' 실행', '', 'in_progress', 'medium',
  initiative.cadence, 0, NULL, 'migration', NULL, initiative.sort_order + 1,
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM items AS initiative
WHERE initiative.kind = 'initiative'
  AND EXISTS (
    SELECT 1 FROM items AS child
    WHERE child.owner_id = initiative.owner_id
      AND child.parent_id = initiative.id
      AND child.kind = 'task'
  );
--> statement-breakpoint
UPDATE items
SET parent_id = 'legacy-project-' || parent_id,
  updated_at = CURRENT_TIMESTAMP
WHERE kind = 'task'
  AND EXISTS (
    SELECT 1 FROM items AS parent_initiative
    WHERE parent_initiative.owner_id = items.owner_id
      AND parent_initiative.id = items.parent_id
      AND parent_initiative.kind = 'initiative'
  );
