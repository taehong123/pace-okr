CREATE TABLE `routine_completions` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`routine_id` text NOT NULL,
	`completion_date` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`routine_id`) REFERENCES `routines`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_routine_completions_unique` ON `routine_completions` (`owner_id`,`routine_id`,`completion_date`);--> statement-breakpoint
CREATE INDEX `idx_routine_completions_owner_date` ON `routine_completions` (`owner_id`,`completion_date`);--> statement-breakpoint
CREATE TABLE `routines` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`cadence` text DEFAULT 'daily' NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_routines_owner_active` ON `routines` (`owner_id`,`active`);--> statement-breakpoint
CREATE INDEX `idx_routines_owner_sort` ON `routines` (`owner_id`,`sort_order`);