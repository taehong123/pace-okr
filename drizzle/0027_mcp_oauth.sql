CREATE TABLE `mcp_oauth_clients` (
	`client_id` text PRIMARY KEY NOT NULL,
	`redirect_uris` text NOT NULL,
	`client_name` text DEFAULT 'ChatGPT' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `mcp_oauth_codes` (
	`code_hash` text PRIMARY KEY NOT NULL,
	`authorization_json` text NOT NULL,
	`client_id` text NOT NULL,
	`redirect_uri` text NOT NULL,
	`code_challenge` text NOT NULL,
	`resource` text NOT NULL,
	`scope` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`expires_at` text NOT NULL,
	`used_at` text
);
--> statement-breakpoint
CREATE INDEX `idx_mcp_oauth_codes_expires` ON `mcp_oauth_codes` (`expires_at`);
