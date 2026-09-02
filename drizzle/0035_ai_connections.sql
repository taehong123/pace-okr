ALTER TABLE `integration_tokens` ADD `provider` text;
--> statement-breakpoint
ALTER TABLE `integration_tokens` ADD `scopes` text;
--> statement-breakpoint
CREATE TABLE `mcp_oauth_approvals` (
  `id` text PRIMARY KEY NOT NULL,
  `workspace_id` text NOT NULL REFERENCES `workspaces`(`id`) ON DELETE cascade,
  `user_id` text NOT NULL,
  `request_json` text NOT NULL,
  `csrf_hash` text NOT NULL,
  `created_at` text NOT NULL,
  `expires_at` text NOT NULL,
  `used_at` text
);
--> statement-breakpoint
CREATE INDEX `idx_mcp_oauth_approvals_expires` ON `mcp_oauth_approvals` (`expires_at`);
