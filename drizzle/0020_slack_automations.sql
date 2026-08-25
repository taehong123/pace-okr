CREATE TABLE `slack_automation_deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`automation_id` text NOT NULL,
	`item_id` text,
	`event_key` text NOT NULL,
	`trigger_type` text NOT NULL,
	`channel_id` text NOT NULL,
	`message` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`error` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`sent_at` text,
	FOREIGN KEY (`owner_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`automation_id`) REFERENCES `slack_automations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_slack_automation_deliveries_event` ON `slack_automation_deliveries` (`event_key`);--> statement-breakpoint
CREATE INDEX `idx_slack_automation_deliveries_owner_created` ON `slack_automation_deliveries` (`owner_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_slack_automation_deliveries_automation_created` ON `slack_automation_deliveries` (`automation_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `slack_automations` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`created_by_user_id` text NOT NULL,
	`name` text NOT NULL,
	`trigger_type` text NOT NULL,
	`trigger_status` text DEFAULT '' NOT NULL,
	`channel_id` text NOT NULL,
	`message_template` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`last_triggered_at` text,
	`last_delivery_status` text DEFAULT 'never' NOT NULL,
	`last_error` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_slack_automations_owner` ON `slack_automations` (`owner_id`);--> statement-breakpoint
CREATE INDEX `idx_slack_automations_owner_active_trigger` ON `slack_automations` (`owner_id`,`active`,`trigger_type`);
