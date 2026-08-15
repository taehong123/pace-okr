CREATE TABLE `item_property_values` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`item_id` text NOT NULL,
	`property_id` text NOT NULL,
	`value` text DEFAULT 'null' NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`property_id`) REFERENCES `property_definitions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_item_property_values_unique` ON `item_property_values` (`owner_id`,`item_id`,`property_id`);--> statement-breakpoint
CREATE INDEX `idx_item_property_values_owner_item` ON `item_property_values` (`owner_id`,`item_id`);--> statement-breakpoint
CREATE INDEX `idx_item_property_values_owner_property` ON `item_property_values` (`owner_id`,`property_id`);--> statement-breakpoint
CREATE TABLE `property_definitions` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`options` text DEFAULT '[]' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_property_definitions_owner_name` ON `property_definitions` (`owner_id`,`name`);--> statement-breakpoint
CREATE INDEX `idx_property_definitions_owner_sort` ON `property_definitions` (`owner_id`,`sort_order`);