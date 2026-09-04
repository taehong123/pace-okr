CREATE TABLE `slack_work_command_operations` (
	`request_id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`team_id` text NOT NULL,
	`slack_user_id` text NOT NULL,
	`command` text NOT NULL,
	`target_id` text,
	`status` text DEFAULT 'processing' NOT NULL,
	`result_json` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_slack_work_commands_owner_created` ON `slack_work_command_operations` (`owner_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_slack_work_commands_actor` ON `slack_work_command_operations` (`team_id`,`slack_user_id`,`created_at`);--> statement-breakpoint
UPDATE `slack_automations`
SET `active` = 0,
    `updated_at` = CURRENT_TIMESTAMP
WHERE `trigger_type` = 'task_status_changed'
  AND `trigger_status` NOT IN ('todo', 'done');
