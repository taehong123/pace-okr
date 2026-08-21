ALTER TABLE `items` ADD `routine_id` text REFERENCES routines(id);--> statement-breakpoint
CREATE INDEX `idx_items_owner_routine` ON `items` (`owner_id`,`routine_id`);
