CREATE TABLE `google_calendar_events` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`user_id` text NOT NULL,
	`item_id` text NOT NULL,
	`calendar_id` text DEFAULT 'primary' NOT NULL,
	`google_event_id` text NOT NULL,
	`html_link` text DEFAULT '' NOT NULL,
	`synced_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_google_calendar_events_item` ON `google_calendar_events` (`owner_id`,`user_id`,`item_id`);--> statement-breakpoint
CREATE INDEX `idx_google_calendar_events_owner` ON `google_calendar_events` (`owner_id`);--> statement-breakpoint
CREATE TABLE `google_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`user_id` text NOT NULL,
	`google_account_id` text DEFAULT '' NOT NULL,
	`email` text DEFAULT '' NOT NULL,
	`display_name` text DEFAULT '' NOT NULL,
	`encrypted_refresh_token` text NOT NULL,
	`scope` text DEFAULT '' NOT NULL,
	`connected_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_google_connections_owner_user` ON `google_connections` (`owner_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `idx_google_connections_user` ON `google_connections` (`user_id`);--> statement-breakpoint
CREATE TABLE `google_oauth_states` (
	`state` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`user_id` text NOT NULL,
	`return_to` text DEFAULT '/' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`expires_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_google_oauth_states_expires` ON `google_oauth_states` (`expires_at`);