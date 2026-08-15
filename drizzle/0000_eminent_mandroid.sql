CREATE TABLE `activity_log` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`item_id` text NOT NULL,
	`action` text NOT NULL,
	`source` text DEFAULT 'web' NOT NULL,
	`payload` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_activity_owner_created` ON `activity_log` (`owner_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_activity_item` ON `activity_log` (`item_id`);--> statement-breakpoint
CREATE TABLE `items` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`parent_id` text,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'todo' NOT NULL,
	`priority` text DEFAULT 'medium' NOT NULL,
	`cadence` text DEFAULT 'weekly' NOT NULL,
	`progress` integer DEFAULT 0 NOT NULL,
	`due_date` text,
	`source` text DEFAULT 'web' NOT NULL,
	`source_ref` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_items_owner_status` ON `items` (`owner_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_items_owner_parent` ON `items` (`owner_id`,`parent_id`);--> statement-breakpoint
CREATE INDEX `idx_items_owner_cadence` ON `items` (`owner_id`,`cadence`);