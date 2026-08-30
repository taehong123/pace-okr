ALTER TABLE `daily_scrums` ADD `skip_reason` text;--> statement-breakpoint
ALTER TABLE `daily_scrums` ADD `skip_note` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `daily_submissions` ADD `skip_reason` text;--> statement-breakpoint
ALTER TABLE `daily_submissions` ADD `skip_note` text DEFAULT '' NOT NULL;
