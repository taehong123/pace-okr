CREATE TABLE `ai_usage_events` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`user_id` text NOT NULL,
	`model` text NOT NULL,
	`source` text DEFAULT 'web' NOT NULL,
	`input_chars` integer DEFAULT 0 NOT NULL,
	`input_tokens` integer DEFAULT 0 NOT NULL,
	`output_tokens` integer DEFAULT 0 NOT NULL,
	`estimated_cost_won_micros` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_ai_usage_owner_created` ON `ai_usage_events` (`owner_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_ai_usage_user_created` ON `ai_usage_events` (`user_id`,`created_at`);