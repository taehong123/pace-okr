CREATE TABLE `okr_cycles` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_okr_cycles_owner_status` ON `okr_cycles` (`owner_id`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_okr_cycles_owner_version` ON `okr_cycles` (`owner_id`,`version`);--> statement-breakpoint
ALTER TABLE `items` ADD `cycle_id` text REFERENCES okr_cycles(id) ON DELETE SET NULL;--> statement-breakpoint
CREATE INDEX `idx_items_owner_cycle` ON `items` (`owner_id`,`cycle_id`);
