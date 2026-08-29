CREATE TABLE `kr_data_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`kr_item_id` text NOT NULL,
	`name` text NOT NULL,
	`endpoint_url` text NOT NULL,
	`value_path` text DEFAULT '' NOT NULL,
	`baseline_value` real DEFAULT 0 NOT NULL,
	`target_value` real NOT NULL,
	`unit` text DEFAULT '' NOT NULL,
	`cadence` text DEFAULT 'daily' NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`last_value` real,
	`last_sync_status` text DEFAULT 'never' NOT NULL,
	`last_error` text DEFAULT '' NOT NULL,
	`last_synced_at` text,
	`next_sync_at` text,
	`created_by_user_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`kr_item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_kr_data_connections_owner_kr` ON `kr_data_connections` (`owner_id`,`kr_item_id`);
--> statement-breakpoint
CREATE INDEX `idx_kr_data_connections_due` ON `kr_data_connections` (`active`,`next_sync_at`);
--> statement-breakpoint
UPDATE `items` SET `progress` = 0 WHERE `kind` IN ('objective', 'initiative');
