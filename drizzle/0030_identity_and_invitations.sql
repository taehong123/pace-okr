ALTER TABLE `workspaces` ADD `kind` text DEFAULT 'team' NOT NULL;--> statement-breakpoint
UPDATE `workspaces`
SET `kind` = CASE WHEN `id` = `owner_user_id` THEN 'personal' ELSE 'team' END;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_workspaces_personal_owner`
ON `workspaces` (`owner_user_id`) WHERE `kind` = 'personal';--> statement-breakpoint

CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email_normalized` text NOT NULL,
	`display_name` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_users_email_normalized` ON `users` (`email_normalized`);--> statement-breakpoint

CREATE TABLE `auth_identities` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`provider` text NOT NULL,
	`provider_subject` text NOT NULL,
	`email` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`last_used_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_auth_identities_provider_subject` ON `auth_identities` (`provider`,`provider_subject`);--> statement-breakpoint
CREATE INDEX `idx_auth_identities_user` ON `auth_identities` (`user_id`);--> statement-breakpoint

CREATE TABLE `workspace_invitations` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`email` text NOT NULL,
	`display_name` text DEFAULT '' NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`token_hash` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`delivery_status` text DEFAULT 'not_sent' NOT NULL,
	`provider_message_id` text,
	`invited_by_user_id` text NOT NULL,
	`accepted_by_user_id` text,
	`expires_at` text NOT NULL,
	`last_sent_at` text,
	`accepted_at` text,
	`revoked_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_workspace_invitations_pending_email`
ON `workspace_invitations` (`workspace_id`,`email`) WHERE `status` = 'pending';--> statement-breakpoint
CREATE UNIQUE INDEX `idx_workspace_invitations_token`
ON `workspace_invitations` (`token_hash`) WHERE `token_hash` <> '';--> statement-breakpoint
CREATE INDEX `idx_workspace_invitations_workspace_status` ON `workspace_invitations` (`workspace_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_workspace_invitations_email_status` ON `workspace_invitations` (`email`,`status`);--> statement-breakpoint

CREATE TABLE `app_migrations` (
	`id` text PRIMARY KEY NOT NULL,
	`applied_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
