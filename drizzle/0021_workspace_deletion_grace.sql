ALTER TABLE `workspaces` ADD `deletion_requested_at` text;--> statement-breakpoint
ALTER TABLE `workspaces` ADD `scheduled_deletion_at` text;--> statement-breakpoint
ALTER TABLE `workspaces` ADD `deletion_requested_by_user_id` text;--> statement-breakpoint
CREATE INDEX `idx_workspaces_scheduled_deletion` ON `workspaces` (`scheduled_deletion_at`);