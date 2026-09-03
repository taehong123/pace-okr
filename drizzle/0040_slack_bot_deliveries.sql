CREATE TABLE `slack_bot_deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`bot_kind` text NOT NULL,
	`subject_id` text NOT NULL,
	`event_key` text NOT NULL,
	`connection_key` text NOT NULL,
	`policy` text NOT NULL,
	`payload` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`retry_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`message_ts` text,
	`last_error` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_slack_bot_deliveries_event` ON `slack_bot_deliveries` (`owner_id`,`bot_kind`,`event_key`);--> statement-breakpoint
CREATE INDEX `idx_slack_bot_deliveries_due` ON `slack_bot_deliveries` (`status`,`retry_at`);--> statement-breakpoint
CREATE INDEX `idx_slack_bot_deliveries_owner` ON `slack_bot_deliveries` (`owner_id`,`created_at`);
