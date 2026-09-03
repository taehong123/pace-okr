ALTER TABLE daily_scrums ADD COLUMN work_selection_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(work_selection_json) AND json_type(work_selection_json) = 'array');
--> statement-breakpoint
ALTER TABLE daily_submissions ADD COLUMN work_snapshot_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(work_snapshot_json) AND json_type(work_snapshot_json) = 'array');
