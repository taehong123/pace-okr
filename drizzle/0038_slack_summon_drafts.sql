CREATE TABLE IF NOT EXISTS `slack_project_drafts` (
  `id` text PRIMARY KEY NOT NULL,
  `owner_id` text NOT NULL,
  `team_id` text NOT NULL,
  `slack_user_id` text NOT NULL,
  `user_id` text NOT NULL,
  `channel_id` text NOT NULL,
  `message_ts` text NOT NULL,
  `thread_ts` text,
  `source_ref` text NOT NULL,
  `seed_json` text NOT NULL,
  `form_json` text DEFAULT '{}' NOT NULL,
  `input_json` text DEFAULT '{}' NOT NULL,
  `status` text DEFAULT 'draft' NOT NULL,
  `view_id` text,
  `operation_id` text,
  `item_id` text,
  `last_error` text DEFAULT '' NOT NULL,
  `expires_at` text NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  FOREIGN KEY (`owner_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `idx_slack_project_drafts_source` ON `slack_project_drafts` (`owner_id`,`source_ref`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_slack_project_drafts_expiry` ON `slack_project_drafts` (`expires_at`);
--> statement-breakpoint
PRAGMA optimize;
