CREATE TABLE `workspace_restore_links` (
	`owner_id` text NOT NULL,
	`table_name` text NOT NULL,
	`row_id` text NOT NULL,
	`payload` text NOT NULL,
	`expires_at` text NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_workspace_restore_links_unique` ON `workspace_restore_links` (`owner_id`,`table_name`,`row_id`);
