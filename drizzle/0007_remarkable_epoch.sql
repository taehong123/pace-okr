CREATE TABLE `user_workspace_preferences` (
	`user_id` text PRIMARY KEY NOT NULL,
	`active_workspace_id` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`active_workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_user_workspace_preferences_active` ON `user_workspace_preferences` (`active_workspace_id`);--> statement-breakpoint
DROP INDEX `idx_workspace_members_user`;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_workspace_members_workspace_user` ON `workspace_members` (`workspace_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `idx_workspace_members_user_lookup` ON `workspace_members` (`user_id`,`status`);--> statement-breakpoint
DROP INDEX `idx_workspaces_owner_user`;--> statement-breakpoint
CREATE INDEX `idx_workspaces_owner` ON `workspaces` (`owner_user_id`);