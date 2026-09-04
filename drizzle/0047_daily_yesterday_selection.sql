ALTER TABLE `daily_scrums` ADD `yesterday_work_selection_json` text DEFAULT '[]' NOT NULL CHECK(json_valid(yesterday_work_selection_json) AND json_type(yesterday_work_selection_json) = 'array');--> statement-breakpoint
ALTER TABLE `daily_submissions` ADD `yesterday_work_snapshot_json` text DEFAULT '[]' NOT NULL CHECK(json_valid(yesterday_work_snapshot_json) AND json_type(yesterday_work_snapshot_json) = 'array');--> statement-breakpoint
ALTER TABLE `daily_submissions` ADD `request_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_daily_submissions_owner_member_request` ON `daily_submissions` (`owner_id`,`member_id`,`request_id`) WHERE "daily_submissions"."request_id" IS NOT NULL;
