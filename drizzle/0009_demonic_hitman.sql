CREATE TABLE `workspace_rules` (
	`workspace_id` text PRIMARY KEY NOT NULL,
	`capture_instruction` text DEFAULT '' NOT NULL,
	`structure_instruction` text DEFAULT '' NOT NULL,
	`routine_instruction` text DEFAULT '' NOT NULL,
	`default_priority` text DEFAULT 'medium' NOT NULL,
	`default_cadence` text DEFAULT 'weekly' NOT NULL,
	`review_before_create` integer DEFAULT true NOT NULL,
	`configured` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
