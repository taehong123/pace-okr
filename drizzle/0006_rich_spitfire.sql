CREATE TABLE `workspace_group_members` (
	`id` text PRIMARY KEY NOT NULL,
	`group_id` text NOT NULL,
	`member_id` text NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `workspace_groups`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`member_id`) REFERENCES `workspace_members`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_workspace_group_members_unique` ON `workspace_group_members` (`group_id`,`member_id`);--> statement-breakpoint
CREATE INDEX `idx_workspace_group_members_member` ON `workspace_group_members` (`member_id`);--> statement-breakpoint
CREATE INDEX `idx_workspace_group_members_group_role` ON `workspace_group_members` (`group_id`,`role`);--> statement-breakpoint
CREATE TABLE `workspace_groups` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`name` text NOT NULL,
	`handle` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`color` text DEFAULT 'gray' NOT NULL,
	`visibility` text DEFAULT 'open' NOT NULL,
	`archived` integer DEFAULT false NOT NULL,
	`created_by_user_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_workspace_groups_workspace_handle` ON `workspace_groups` (`workspace_id`,`handle`);--> statement-breakpoint
CREATE INDEX `idx_workspace_groups_workspace_archived` ON `workspace_groups` (`workspace_id`,`archived`);