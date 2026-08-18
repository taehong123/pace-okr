CREATE TABLE `trash_records` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`category` text NOT NULL,
	`title` text NOT NULL,
	`payload` text NOT NULL,
	`item_count` integer DEFAULT 0 NOT NULL,
	`routine_count` integer DEFAULT 0 NOT NULL,
	`cycle_count` integer DEFAULT 0 NOT NULL,
	`created_by_user_id` text,
	`archived_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_trash_records_owner_archived` ON `trash_records` (`owner_id`,`archived_at`);
