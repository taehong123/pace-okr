CREATE TABLE `workspace_addresses` (
	`address` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`created_at` text NOT NULL,
	CONSTRAINT "workspace_addresses_lowercase" CHECK("workspace_addresses"."address" = lower("workspace_addresses"."address"))
);
--> statement-breakpoint
CREATE INDEX `idx_workspace_addresses_workspace` ON `workspace_addresses` (`workspace_id`);
--> statement-breakpoint
CREATE TABLE `workspace_identity_guards` (
	`id` text PRIMARY KEY NOT NULL,
	`valid` integer NOT NULL,
	CONSTRAINT "workspace_identity_guard_valid" CHECK("workspace_identity_guards"."valid" = 1)
);
--> statement-breakpoint
CREATE TABLE `workspace_identity_settings` (
	`workspace_id` text PRIMARY KEY NOT NULL,
	`address` text,
	`revision` integer DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
