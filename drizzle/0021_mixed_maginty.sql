ALTER TABLE `routines` ADD `system_key` text;--> statement-breakpoint
ALTER TABLE `routines` ADD `assignee_member_id` text REFERENCES workspace_members(id) ON DELETE SET NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_routines_owner_system_key` ON `routines` (`owner_id`,`system_key`) WHERE "routines"."system_key" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_routines_assignee` ON `routines` (`assignee_member_id`);--> statement-breakpoint
INSERT OR IGNORE INTO `routines` (
  `id`, `owner_id`, `system_key`, `title`, `description`, `cadence`, `active`, `sort_order`
)
SELECT
  'general-' || `id`, `id`, 'general', 'General',
  'Project나 개별 Routine에 속하지 않는 일반 업무', 'daily', 1, -1000
FROM `workspaces`;--> statement-breakpoint
UPDATE `items`
SET `routine_id` = (
      SELECT `routines`.`id` FROM `routines`
      WHERE `routines`.`owner_id` = `items`.`owner_id`
        AND `routines`.`system_key` = 'general'
    ),
    `cycle_id` = NULL,
    `status` = 'todo',
    `updated_at` = CURRENT_TIMESTAMP
WHERE `kind` = 'task' AND `parent_id` IS NULL AND `routine_id` IS NULL;--> statement-breakpoint
UPDATE `items` SET `status` = 'todo', `updated_at` = CURRENT_TIMESTAMP
WHERE `status` = 'inbox';--> statement-breakpoint
UPDATE `items` SET `archived_from_status` = 'todo', `updated_at` = CURRENT_TIMESTAMP
WHERE `archived_from_status` = 'inbox';--> statement-breakpoint
UPDATE `slack_automations` SET `trigger_status` = 'todo', `updated_at` = CURRENT_TIMESTAMP
WHERE `trigger_status` = 'inbox';--> statement-breakpoint
INSERT OR IGNORE INTO `item_assignments` (
  `id`, `owner_id`, `item_id`, `member_id`, `role`, `created_at`, `updated_at`
)
SELECT
  lower(hex(randomblob(16))), `items`.`owner_id`, `items`.`id`, `workspace_members`.`id`,
  CASE `items`.`kind` WHEN 'project' THEN 'project_dri' ELSE 'task_assignee' END,
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM `items`
JOIN `workspaces` ON `workspaces`.`id` = `items`.`owner_id`
JOIN `workspace_members` ON `workspace_members`.`workspace_id` = `workspaces`.`id`
  AND `workspace_members`.`status` = 'active'
WHERE `workspaces`.`owner_user_id` = `workspaces`.`id`
  AND `items`.`kind` IN ('project', 'task')
  AND `items`.`archived_at` IS NULL
  AND (SELECT COUNT(*) FROM `workspace_members` AS `member_count`
    WHERE `member_count`.`workspace_id` = `workspaces`.`id`
      AND `member_count`.`status` = 'active') = 1
  AND NOT EXISTS (
    SELECT 1 FROM `item_assignments` AS `assignment`
    WHERE `assignment`.`owner_id` = `items`.`owner_id`
      AND `assignment`.`item_id` = `items`.`id`
      AND `assignment`.`role` = CASE `items`.`kind` WHEN 'project' THEN 'project_dri' ELSE 'task_assignee' END
  );--> statement-breakpoint
UPDATE `routines`
SET `assignee_member_id` = (
      SELECT `workspace_members`.`id` FROM `workspace_members`
      WHERE `workspace_members`.`workspace_id` = `routines`.`owner_id`
        AND `workspace_members`.`status` = 'active'
      LIMIT 1
    ),
    `updated_at` = CURRENT_TIMESTAMP
WHERE `system_key` IS NULL AND `assignee_member_id` IS NULL
  AND EXISTS (
    SELECT 1 FROM `workspaces`
    WHERE `workspaces`.`id` = `routines`.`owner_id`
      AND `workspaces`.`owner_user_id` = `workspaces`.`id`
  )
  AND (SELECT COUNT(*) FROM `workspace_members`
    WHERE `workspace_members`.`workspace_id` = `routines`.`owner_id`
      AND `workspace_members`.`status` = 'active') = 1;--> statement-breakpoint
PRAGMA optimize;
