CREATE TABLE `integration_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`user_id` text NOT NULL,
	`name` text DEFAULT 'Codex' NOT NULL,
	`token_hash` text NOT NULL,
	`token_prefix` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`revoked_at` text,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_integration_tokens_hash` ON `integration_tokens` (`token_hash`);--> statement-breakpoint
CREATE INDEX `idx_integration_tokens_workspace_user` ON `integration_tokens` (`workspace_id`,`user_id`,`revoked_at`);