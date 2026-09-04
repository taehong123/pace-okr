CREATE TABLE `routine_property_definitions` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`options` text DEFAULT '[]' NOT NULL,
	`default_value` text DEFAULT 'null' NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_routine_properties_owner_name` ON `routine_property_definitions` (`owner_id`,lower("name"));--> statement-breakpoint
ALTER TABLE `routines` ADD `properties_json` text DEFAULT '{}' NOT NULL;
--> statement-breakpoint
CREATE TRIGGER backup_revision_routine_properties_insert AFTER INSERT ON routine_property_definitions
BEGIN
  INSERT INTO workspace_backup_state (owner_id, revision) VALUES (NEW.owner_id, 1)
  ON CONFLICT(owner_id) DO UPDATE SET revision = revision + 1;
END;
--> statement-breakpoint
CREATE TRIGGER backup_revision_routine_properties_update AFTER UPDATE ON routine_property_definitions
BEGIN
  INSERT INTO workspace_backup_state (owner_id, revision) VALUES (NEW.owner_id, 1)
  ON CONFLICT(owner_id) DO UPDATE SET revision = revision + 1;
END;
--> statement-breakpoint
CREATE TRIGGER backup_revision_routine_properties_delete AFTER DELETE ON routine_property_definitions
BEGIN
  INSERT INTO workspace_backup_state (owner_id, revision) VALUES (OLD.owner_id, 1)
  ON CONFLICT(owner_id) DO UPDATE SET revision = revision + 1;
END;
