CREATE TABLE IF NOT EXISTS `assistant_drafts` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`user_id` text NOT NULL,
	`draft_key` text NOT NULL,
	`payload_json` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `idx_assistant_drafts_owner_user_key` ON `assistant_drafts` (`owner_id`,`user_id`,`draft_key`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_assistant_drafts_owner_user_updated` ON `assistant_drafts` (`owner_id`,`user_id`,`updated_at`);
