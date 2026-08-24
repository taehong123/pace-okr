CREATE TABLE `item_assignments` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`item_id` text NOT NULL,
	`member_id` text NOT NULL,
	`role` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`member_id`) REFERENCES `workspace_members`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_item_assignments_unique` ON `item_assignments` (`owner_id`,`item_id`,`member_id`,`role`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_item_assignments_single_role` ON `item_assignments` (`owner_id`,`item_id`,`role`) WHERE "item_assignments"."role" IN ('project_dri', 'task_assignee');--> statement-breakpoint
CREATE INDEX `idx_item_assignments_owner_item` ON `item_assignments` (`owner_id`,`item_id`);--> statement-breakpoint
CREATE INDEX `idx_item_assignments_member` ON `item_assignments` (`member_id`);--> statement-breakpoint
CREATE TABLE `project_hidden_properties` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`project_id` text NOT NULL,
	`property_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`property_id`) REFERENCES `property_definitions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_project_hidden_properties_unique` ON `project_hidden_properties` (`owner_id`,`project_id`,`property_id`);--> statement-breakpoint
CREATE INDEX `idx_project_hidden_properties_project` ON `project_hidden_properties` (`owner_id`,`project_id`);--> statement-breakpoint
CREATE INDEX `idx_project_hidden_properties_property` ON `project_hidden_properties` (`owner_id`,`property_id`);--> statement-breakpoint
ALTER TABLE `items` ADD `archived_at` text;--> statement-breakpoint
ALTER TABLE `items` ADD `archived_from_status` text;--> statement-breakpoint
ALTER TABLE `items` ADD `archive_root_id` text;--> statement-breakpoint
CREATE INDEX `idx_items_owner_archived` ON `items` (`owner_id`,`archived_at`);--> statement-breakpoint
CREATE INDEX `idx_items_owner_archive_root` ON `items` (`owner_id`,`archive_root_id`);--> statement-breakpoint
UPDATE `items`
SET `archived_at` = COALESCE(`updated_at`, CURRENT_TIMESTAMP),
    `archived_from_status` = CASE `kind` WHEN 'project' THEN 'backlog' ELSE 'todo' END,
    `archive_root_id` = CASE `kind` WHEN 'project' THEN `id` ELSE `parent_id` END
WHERE `status` = 'archived' AND `archived_at` IS NULL;--> statement-breakpoint
PRAGMA optimize;
