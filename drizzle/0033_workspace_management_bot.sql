CREATE TABLE `workspace_management_bot_settings` (
	`owner_id` text PRIMARY KEY NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`weekdays` text DEFAULT '[1,2,3,4,5]' NOT NULL,
	`report_time` text DEFAULT '09:00' NOT NULL,
	`timezone` text DEFAULT 'Asia/Seoul' NOT NULL,
	`channel_id` text DEFAULT '' NOT NULL,
	`channel_name` text DEFAULT '' NOT NULL,
	`signals` text DEFAULT '["missing_due_date","missing_owner","overdue","completed_yesterday","due_today"]' NOT NULL,
	`last_sent_date` text,
	`last_sent_at` text,
	`last_error` text DEFAULT '' NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_workspace_management_bot_due` ON `workspace_management_bot_settings` (`enabled`,`last_sent_date`);
