CREATE TABLE `checklist_items` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`task_id` text NOT NULL,
	`title` text NOT NULL,
	`completed` integer DEFAULT false NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_checklist_owner_task` ON `checklist_items` (`owner_id`,`task_id`);--> statement-breakpoint
CREATE TABLE `daily_scrums` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`scrum_date` text NOT NULL,
	`yesterday_note` text DEFAULT '' NOT NULL,
	`today_note` text DEFAULT '' NOT NULL,
	`blockers_note` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_daily_scrums_owner_date` ON `daily_scrums` (`owner_id`,`scrum_date`);