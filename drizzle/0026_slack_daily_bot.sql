ALTER TABLE `daily_scrums` ADD `member_id` text REFERENCES `workspace_members`(`id`) ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE `daily_scrums` ADD `no_planned_tasks` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `daily_scrums` ADD `source` text DEFAULT 'web' NOT NULL;--> statement-breakpoint
DROP INDEX IF EXISTS `idx_daily_scrums_owner_date`;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_daily_scrums_owner_member_date` ON `daily_scrums` (`owner_id`,`member_id`,`scrum_date`) WHERE `member_id` IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_daily_scrums_legacy_owner_date` ON `daily_scrums` (`owner_id`,`scrum_date`) WHERE `member_id` IS NULL;--> statement-breakpoint
CREATE INDEX `idx_daily_scrums_owner_date` ON `daily_scrums` (`owner_id`,`scrum_date`);--> statement-breakpoint
CREATE TABLE `daily_scrum_task_selections` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`daily_scrum_id` text NOT NULL,
	`member_id` text NOT NULL,
	`task_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`daily_scrum_id`) REFERENCES `daily_scrums`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`member_id`) REFERENCES `workspace_members`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`task_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_daily_scrum_task_selections_unique` ON `daily_scrum_task_selections` (`daily_scrum_id`,`task_id`);--> statement-breakpoint
CREATE INDEX `idx_daily_scrum_task_selections_member` ON `daily_scrum_task_selections` (`owner_id`,`member_id`);--> statement-breakpoint
CREATE TABLE `daily_submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`member_id` text,
	`member_name` text DEFAULT '' NOT NULL,
	`member_email` text DEFAULT '' NOT NULL,
	`scrum_date` text NOT NULL,
	`version` integer NOT NULL,
	`yesterday_note` text DEFAULT '' NOT NULL,
	`today_note` text DEFAULT '' NOT NULL,
	`blockers_note` text DEFAULT '' NOT NULL,
	`no_planned_tasks` integer DEFAULT false NOT NULL,
	`source` text DEFAULT 'web' NOT NULL,
	`submitted_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`member_id`) REFERENCES `workspace_members`(`id`) ON UPDATE no action ON DELETE set null
);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_daily_submissions_owner_member_date_version` ON `daily_submissions` (`owner_id`,`member_id`,`scrum_date`,`version`);--> statement-breakpoint
CREATE INDEX `idx_daily_submissions_owner_date` ON `daily_submissions` (`owner_id`,`scrum_date`,`submitted_at`);--> statement-breakpoint
CREATE TABLE `daily_task_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`submission_id` text NOT NULL,
	`task_id` text,
	`task_title` text NOT NULL,
	`parent_kind` text DEFAULT 'general' NOT NULL,
	`parent_id` text,
	`parent_title` text DEFAULT 'General' NOT NULL,
	`status` text DEFAULT 'todo' NOT NULL,
	`is_new` integer DEFAULT false NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`submission_id`) REFERENCES `daily_submissions`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE INDEX `idx_daily_task_snapshots_submission` ON `daily_task_snapshots` (`submission_id`,`sort_order`);--> statement-breakpoint
CREATE TABLE `slack_member_links` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`member_id` text NOT NULL,
	`team_id` text NOT NULL,
	`slack_user_id` text NOT NULL,
	`slack_email` text DEFAULT '' NOT NULL,
	`slack_display_name` text DEFAULT '' NOT NULL,
	`dm_channel_id` text DEFAULT '' NOT NULL,
	`matched_by` text DEFAULT 'email' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`member_id`) REFERENCES `workspace_members`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_slack_member_links_owner_member` ON `slack_member_links` (`owner_id`,`member_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_slack_member_links_team_user` ON `slack_member_links` (`team_id`,`slack_user_id`);--> statement-breakpoint
CREATE INDEX `idx_slack_member_links_owner` ON `slack_member_links` (`owner_id`);--> statement-breakpoint
CREATE TABLE `slack_daily_settings` (
	`owner_id` text PRIMARY KEY NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`weekdays` text DEFAULT '[1,2,3,4,5]' NOT NULL,
	`reminder_time` text DEFAULT '09:00' NOT NULL,
	`timezone` text DEFAULT 'Asia/Seoul' NOT NULL,
	`install_status` text DEFAULT 'not_connected' NOT NULL,
	`required_scopes` text DEFAULT '' NOT NULL,
	`last_synced_at` text,
	`last_error` text DEFAULT '' NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE TABLE `slack_daily_preferences` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`member_id` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`reminder_time` text,
	`timezone` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`member_id`) REFERENCES `workspace_members`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_slack_daily_preferences_owner_member` ON `slack_daily_preferences` (`owner_id`,`member_id`);--> statement-breakpoint
CREATE TABLE `slack_daily_channels` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`channel_id` text NOT NULL,
	`channel_name` text DEFAULT '' NOT NULL,
	`is_private` integer DEFAULT false NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_slack_daily_channels_owner_channel` ON `slack_daily_channels` (`owner_id`,`channel_id`);--> statement-breakpoint
CREATE INDEX `idx_slack_daily_channels_owner` ON `slack_daily_channels` (`owner_id`);--> statement-breakpoint
CREATE TABLE `slack_daily_reminders` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`member_id` text NOT NULL,
	`slack_user_id` text NOT NULL,
	`dm_channel_id` text NOT NULL,
	`scheduled_message_id` text NOT NULL,
	`post_at` integer NOT NULL,
	`block_id` text NOT NULL,
	`bot_user_id` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'scheduled' NOT NULL,
	`last_error` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`member_id`) REFERENCES `workspace_members`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_slack_daily_reminders_owner_member` ON `slack_daily_reminders` (`owner_id`,`member_id`);--> statement-breakpoint
CREATE INDEX `idx_slack_daily_reminders_post_at` ON `slack_daily_reminders` (`status`,`post_at`);--> statement-breakpoint
CREATE TABLE `slack_daily_publications` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`member_id` text,
	`submission_id` text NOT NULL,
	`scrum_date` text NOT NULL,
	`channel_id` text NOT NULL,
	`slack_message_ts` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`error` text DEFAULT '' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`member_id`) REFERENCES `workspace_members`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`submission_id`) REFERENCES `daily_submissions`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_slack_daily_publications_submission_channel` ON `slack_daily_publications` (`submission_id`,`channel_id`);--> statement-breakpoint
CREATE INDEX `idx_slack_daily_publications_owner_status` ON `slack_daily_publications` (`owner_id`,`status`,`updated_at`);--> statement-breakpoint
CREATE TABLE `slack_event_receipts` (
	`event_id` text PRIMARY KEY NOT NULL,
	`team_id` text NOT NULL,
	`event_type` text DEFAULT '' NOT NULL,
	`received_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);--> statement-breakpoint
CREATE INDEX `idx_slack_event_receipts_received` ON `slack_event_receipts` (`received_at`);--> statement-breakpoint
CREATE TABLE `slack_link_tokens` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`team_id` text NOT NULL,
	`slack_user_id` text NOT NULL,
	`slack_email` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`expires_at` text NOT NULL,
	`used_at` text,
	FOREIGN KEY (`owner_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE INDEX `idx_slack_link_tokens_expires` ON `slack_link_tokens` (`expires_at`);--> statement-breakpoint
PRAGMA optimize;
