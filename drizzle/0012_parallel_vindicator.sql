CREATE TABLE `slack_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`user_id` text NOT NULL,
	`team_id` text NOT NULL,
	`team_name` text DEFAULT '' NOT NULL,
	`bot_user_id` text DEFAULT '' NOT NULL,
	`app_id` text DEFAULT '' NOT NULL,
	`encrypted_bot_token` text NOT NULL,
	`scope` text DEFAULT '' NOT NULL,
	`connected_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_slack_connections_owner_user` ON `slack_connections` (`owner_id`,`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_slack_connections_team` ON `slack_connections` (`team_id`);--> statement-breakpoint
CREATE INDEX `idx_slack_connections_owner` ON `slack_connections` (`owner_id`);--> statement-breakpoint
CREATE TABLE `slack_oauth_states` (
	`state` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`user_id` text NOT NULL,
	`return_to` text DEFAULT '/' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`expires_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_slack_oauth_states_expires` ON `slack_oauth_states` (`expires_at`);