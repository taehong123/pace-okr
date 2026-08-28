ALTER TABLE `property_definitions` ADD `default_value` text DEFAULT 'null' NOT NULL;--> statement-breakpoint
ALTER TABLE `property_definitions` ADD `system_key` text;--> statement-breakpoint
ALTER TABLE `property_definitions` ADD `active` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `item_property_values` ADD `legacy_value` text;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_property_definitions_owner_system` ON `property_definitions` (`owner_id`,`system_key`) WHERE `system_key` IS NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_property_definitions_owner_active_sort` ON `property_definitions` (`owner_id`,`active`,`sort_order`);--> statement-breakpoint
CREATE TABLE `project_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`project_id` text NOT NULL,
	`content` text DEFAULT '[]' NOT NULL,
	`plain_text` text DEFAULT '' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`updated_by_user_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_project_documents_project` ON `project_documents` (`owner_id`,`project_id`);--> statement-breakpoint
CREATE INDEX `idx_project_documents_owner_updated` ON `project_documents` (`owner_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `project_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`content` text DEFAULT '[]' NOT NULL,
	`plain_text` text DEFAULT '' NOT NULL,
	`created_by_user_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_project_templates_owner_name` ON `project_templates` (`owner_id`,`name`);--> statement-breakpoint
CREATE INDEX `idx_project_templates_owner_updated` ON `project_templates` (`owner_id`,`updated_at`);
