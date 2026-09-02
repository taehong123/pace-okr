CREATE TABLE `workspace_backup_guards` (
  `id` text PRIMARY KEY NOT NULL,
  `verified` integer NOT NULL,
  CONSTRAINT `workspace_backup_guard_verified` CHECK (`verified` = 1)
);
--> statement-breakpoint
CREATE TABLE `workspace_backup_state` (
  `owner_id` text PRIMARY KEY NOT NULL,
  `revision` integer DEFAULT 0 NOT NULL,
  `last_daily_date` text,
  `last_success_at` text,
  `last_attempt_at` text,
  `last_error` text,
  `lease_token` text,
  `lease_until` text
);
--> statement-breakpoint
CREATE TABLE `workspace_backups` (
  `id` text PRIMARY KEY NOT NULL,
  `owner_id` text NOT NULL,
  `object_key` text NOT NULL,
  `reason` text NOT NULL,
  `status` text DEFAULT 'pending' NOT NULL,
  `schema_version` integer DEFAULT 1 NOT NULL,
  `checksum` text NOT NULL,
  `byte_size` integer NOT NULL,
  `summary` text NOT NULL,
  `created_by_user_id` text,
  `created_at` text NOT NULL,
  `expires_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_workspace_backups_owner_created` ON `workspace_backups` (`owner_id`, `created_at`);
--> statement-breakpoint
CREATE INDEX `idx_workspace_backups_expires` ON `workspace_backups` (`expires_at`);

--> statement-breakpoint
CREATE TRIGGER backup_revision_google_connections_insert AFTER INSERT ON google_connections
BEGIN
  INSERT INTO workspace_backup_state (owner_id, revision) VALUES (NEW.owner_id, 1)
  ON CONFLICT(owner_id) DO UPDATE SET revision = revision + 1;
END;

--> statement-breakpoint
CREATE TRIGGER backup_revision_google_connections_update AFTER UPDATE ON google_connections
BEGIN
  INSERT INTO workspace_backup_state (owner_id, revision) VALUES (NEW.owner_id, 1)
  ON CONFLICT(owner_id) DO UPDATE SET revision = revision + 1;
END;

--> statement-breakpoint
CREATE TRIGGER backup_revision_google_connections_delete AFTER DELETE ON google_connections
BEGIN
  INSERT INTO workspace_backup_state (owner_id, revision) VALUES (OLD.owner_id, 1)
  ON CONFLICT(owner_id) DO UPDATE SET revision = revision + 1;
END;

--> statement-breakpoint
CREATE TRIGGER backup_revision_okr_cycles_insert AFTER INSERT ON okr_cycles
BEGIN
  INSERT INTO workspace_backup_state (owner_id, revision) VALUES (NEW.owner_id, 1)
  ON CONFLICT(owner_id) DO UPDATE SET revision = revision + 1;
END;

--> statement-breakpoint
CREATE TRIGGER backup_revision_okr_cycles_update AFTER UPDATE ON okr_cycles
BEGIN
  INSERT INTO workspace_backup_state (owner_id, revision) VALUES (NEW.owner_id, 1)
  ON CONFLICT(owner_id) DO UPDATE SET revision = revision + 1;
END;

--> statement-breakpoint
CREATE TRIGGER backup_revision_okr_cycles_delete AFTER DELETE ON okr_cycles
BEGIN
  INSERT INTO workspace_backup_state (owner_id, revision) VALUES (OLD.owner_id, 1)
  ON CONFLICT(owner_id) DO UPDATE SET revision = revision + 1;
END;

--> statement-breakpoint
CREATE TRIGGER backup_revision_routines_insert AFTER INSERT ON routines
BEGIN
  INSERT INTO workspace_backup_state (owner_id, revision) VALUES (NEW.owner_id, 1)
  ON CONFLICT(owner_id) DO UPDATE SET revision = revision + 1;
END;

--> statement-breakpoint
CREATE TRIGGER backup_revision_routines_update AFTER UPDATE ON routines
BEGIN
  INSERT INTO workspace_backup_state (owner_id, revision) VALUES (NEW.owner_id, 1)
  ON CONFLICT(owner_id) DO UPDATE SET revision = revision + 1;
END;

--> statement-breakpoint
CREATE TRIGGER backup_revision_routines_delete AFTER DELETE ON routines
BEGIN
  INSERT INTO workspace_backup_state (owner_id, revision) VALUES (OLD.owner_id, 1)
  ON CONFLICT(owner_id) DO UPDATE SET revision = revision + 1;
END;

--> statement-breakpoint
CREATE TRIGGER backup_revision_items_insert AFTER INSERT ON items
BEGIN
  INSERT INTO workspace_backup_state (owner_id, revision) VALUES (NEW.owner_id, 1)
  ON CONFLICT(owner_id) DO UPDATE SET revision = revision + 1;
END;

--> statement-breakpoint
CREATE TRIGGER backup_revision_items_update AFTER UPDATE ON items
BEGIN
  INSERT INTO workspace_backup_state (owner_id, revision) VALUES (NEW.owner_id, 1)
  ON CONFLICT(owner_id) DO UPDATE SET revision = revision + 1;
END;

--> statement-breakpoint
CREATE TRIGGER backup_revision_items_delete AFTER DELETE ON items
BEGIN
  INSERT INTO workspace_backup_state (owner_id, revision) VALUES (OLD.owner_id, 1)
  ON CONFLICT(owner_id) DO UPDATE SET revision = revision + 1;
END;

--> statement-breakpoint
CREATE TRIGGER backup_revision_property_definitions_insert AFTER INSERT ON property_definitions
BEGIN
  INSERT INTO workspace_backup_state (owner_id, revision) VALUES (NEW.owner_id, 1)
  ON CONFLICT(owner_id) DO UPDATE SET revision = revision + 1;
END;

--> statement-breakpoint
CREATE TRIGGER backup_revision_property_definitions_update AFTER UPDATE ON property_definitions
BEGIN
  INSERT INTO workspace_backup_state (owner_id, revision) VALUES (NEW.owner_id, 1)
  ON CONFLICT(owner_id) DO UPDATE SET revision = revision + 1;
END;

--> statement-breakpoint
CREATE TRIGGER backup_revision_property_definitions_delete AFTER DELETE ON property_definitions
BEGIN
  INSERT INTO workspace_backup_state (owner_id, revision) VALUES (OLD.owner_id, 1)
  ON CONFLICT(owner_id) DO UPDATE SET revision = revision + 1;
END;

--> statement-breakpoint
CREATE TRIGGER backup_revision_project_templates_insert AFTER INSERT ON project_templates
BEGIN
  INSERT INTO workspace_backup_state (owner_id, revision) VALUES (NEW.owner_id, 1)
  ON CONFLICT(owner_id) DO UPDATE SET revision = revision + 1;
END;

--> statement-breakpoint
CREATE TRIGGER backup_revision_project_templates_update AFTER UPDATE ON project_templates
BEGIN
  INSERT INTO workspace_backup_state (owner_id, revision) VALUES (NEW.owner_id, 1)
  ON CONFLICT(owner_id) DO UPDATE SET revision = revision + 1;
END;

--> statement-breakpoint
CREATE TRIGGER backup_revision_project_templates_delete AFTER DELETE ON project_templates
BEGIN
  INSERT INTO workspace_backup_state (owner_id, revision) VALUES (OLD.owner_id, 1)
  ON CONFLICT(owner_id) DO UPDATE SET revision = revision + 1;
END;

--> statement-breakpoint
CREATE TRIGGER backup_revision_project_documents_insert AFTER INSERT ON project_documents
BEGIN
  INSERT INTO workspace_backup_state (owner_id, revision) VALUES (NEW.owner_id, 1)
  ON CONFLICT(owner_id) DO UPDATE SET revision = revision + 1;
END;

--> statement-breakpoint
CREATE TRIGGER backup_revision_project_documents_update AFTER UPDATE ON project_documents
BEGIN
  INSERT INTO workspace_backup_state (owner_id, revision) VALUES (NEW.owner_id, 1)
  ON CONFLICT(owner_id) DO UPDATE SET revision = revision + 1;
END;

--> statement-breakpoint
CREATE TRIGGER backup_revision_project_documents_delete AFTER DELETE ON project_documents
BEGIN
  INSERT INTO workspace_backup_state (owner_id, revision) VALUES (OLD.owner_id, 1)
  ON CONFLICT(owner_id) DO UPDATE SET revision = revision + 1;
END;

--> statement-breakpoint
CREATE TRIGGER backup_revision_item_property_values_insert AFTER INSERT ON item_property_values
BEGIN
  INSERT INTO workspace_backup_state (owner_id, revision) VALUES (NEW.owner_id, 1)
  ON CONFLICT(owner_id) DO UPDATE SET revision = revision + 1;
END;

--> statement-breakpoint
CREATE TRIGGER backup_revision_item_property_values_update AFTER UPDATE ON item_property_values
BEGIN
  INSERT INTO workspace_backup_state (owner_id, revision) VALUES (NEW.owner_id, 1)
  ON CONFLICT(owner_id) DO UPDATE SET revision = revision + 1;
END;

--> statement-breakpoint
CREATE TRIGGER backup_revision_item_property_values_delete AFTER DELETE ON item_property_values
BEGIN
  INSERT INTO workspace_backup_state (owner_id, revision) VALUES (OLD.owner_id, 1)
  ON CONFLICT(owner_id) DO UPDATE SET revision = revision + 1;
END;

--> statement-breakpoint
CREATE TRIGGER backup_revision_project_hidden_properties_insert AFTER INSERT ON project_hidden_properties
BEGIN
  INSERT INTO workspace_backup_state (owner_id, revision) VALUES (NEW.owner_id, 1)
  ON CONFLICT(owner_id) DO UPDATE SET revision = revision + 1;
END;

--> statement-breakpoint
CREATE TRIGGER backup_revision_project_hidden_properties_update AFTER UPDATE ON project_hidden_properties
BEGIN
  INSERT INTO workspace_backup_state (owner_id, revision) VALUES (NEW.owner_id, 1)
  ON CONFLICT(owner_id) DO UPDATE SET revision = revision + 1;
END;

--> statement-breakpoint
CREATE TRIGGER backup_revision_project_hidden_properties_delete AFTER DELETE ON project_hidden_properties
BEGIN
  INSERT INTO workspace_backup_state (owner_id, revision) VALUES (OLD.owner_id, 1)
  ON CONFLICT(owner_id) DO UPDATE SET revision = revision + 1;
END;

--> statement-breakpoint
CREATE TRIGGER backup_revision_item_assignments_insert AFTER INSERT ON item_assignments
BEGIN
  INSERT INTO workspace_backup_state (owner_id, revision) VALUES (NEW.owner_id, 1)
  ON CONFLICT(owner_id) DO UPDATE SET revision = revision + 1;
END;

--> statement-breakpoint
CREATE TRIGGER backup_revision_item_assignments_update AFTER UPDATE ON item_assignments
BEGIN
  INSERT INTO workspace_backup_state (owner_id, revision) VALUES (NEW.owner_id, 1)
  ON CONFLICT(owner_id) DO UPDATE SET revision = revision + 1;
END;

--> statement-breakpoint
CREATE TRIGGER backup_revision_item_assignments_delete AFTER DELETE ON item_assignments
BEGIN
  INSERT INTO workspace_backup_state (owner_id, revision) VALUES (OLD.owner_id, 1)
  ON CONFLICT(owner_id) DO UPDATE SET revision = revision + 1;
END;

--> statement-breakpoint
CREATE TRIGGER backup_revision_checklist_items_insert AFTER INSERT ON checklist_items
BEGIN
  INSERT INTO workspace_backup_state (owner_id, revision) VALUES (NEW.owner_id, 1)
  ON CONFLICT(owner_id) DO UPDATE SET revision = revision + 1;
END;

--> statement-breakpoint
CREATE TRIGGER backup_revision_checklist_items_update AFTER UPDATE ON checklist_items
BEGIN
  INSERT INTO workspace_backup_state (owner_id, revision) VALUES (NEW.owner_id, 1)
  ON CONFLICT(owner_id) DO UPDATE SET revision = revision + 1;
END;

--> statement-breakpoint
CREATE TRIGGER backup_revision_checklist_items_delete AFTER DELETE ON checklist_items
BEGIN
  INSERT INTO workspace_backup_state (owner_id, revision) VALUES (OLD.owner_id, 1)
  ON CONFLICT(owner_id) DO UPDATE SET revision = revision + 1;
END;

--> statement-breakpoint
CREATE TRIGGER backup_revision_routine_completions_insert AFTER INSERT ON routine_completions
BEGIN
  INSERT INTO workspace_backup_state (owner_id, revision) VALUES (NEW.owner_id, 1)
  ON CONFLICT(owner_id) DO UPDATE SET revision = revision + 1;
END;

--> statement-breakpoint
CREATE TRIGGER backup_revision_routine_completions_update AFTER UPDATE ON routine_completions
BEGIN
  INSERT INTO workspace_backup_state (owner_id, revision) VALUES (NEW.owner_id, 1)
  ON CONFLICT(owner_id) DO UPDATE SET revision = revision + 1;
END;

--> statement-breakpoint
CREATE TRIGGER backup_revision_routine_completions_delete AFTER DELETE ON routine_completions
BEGIN
  INSERT INTO workspace_backup_state (owner_id, revision) VALUES (OLD.owner_id, 1)
  ON CONFLICT(owner_id) DO UPDATE SET revision = revision + 1;
END;

--> statement-breakpoint
CREATE TRIGGER backup_revision_daily_scrums_insert AFTER INSERT ON daily_scrums
BEGIN
  INSERT INTO workspace_backup_state (owner_id, revision) VALUES (NEW.owner_id, 1)
  ON CONFLICT(owner_id) DO UPDATE SET revision = revision + 1;
END;

--> statement-breakpoint
CREATE TRIGGER backup_revision_daily_scrums_update AFTER UPDATE ON daily_scrums
BEGIN
  INSERT INTO workspace_backup_state (owner_id, revision) VALUES (NEW.owner_id, 1)
  ON CONFLICT(owner_id) DO UPDATE SET revision = revision + 1;
END;

--> statement-breakpoint
CREATE TRIGGER backup_revision_daily_scrums_delete AFTER DELETE ON daily_scrums
BEGIN
  INSERT INTO workspace_backup_state (owner_id, revision) VALUES (OLD.owner_id, 1)
  ON CONFLICT(owner_id) DO UPDATE SET revision = revision + 1;
END;

--> statement-breakpoint
CREATE TRIGGER backup_revision_daily_scrum_task_selections_insert AFTER INSERT ON daily_scrum_task_selections
BEGIN
  INSERT INTO workspace_backup_state (owner_id, revision) VALUES (NEW.owner_id, 1)
  ON CONFLICT(owner_id) DO UPDATE SET revision = revision + 1;
END;

--> statement-breakpoint
CREATE TRIGGER backup_revision_daily_scrum_task_selections_update AFTER UPDATE ON daily_scrum_task_selections
BEGIN
  INSERT INTO workspace_backup_state (owner_id, revision) VALUES (NEW.owner_id, 1)
  ON CONFLICT(owner_id) DO UPDATE SET revision = revision + 1;
END;

--> statement-breakpoint
CREATE TRIGGER backup_revision_daily_scrum_task_selections_delete AFTER DELETE ON daily_scrum_task_selections
BEGIN
  INSERT INTO workspace_backup_state (owner_id, revision) VALUES (OLD.owner_id, 1)
  ON CONFLICT(owner_id) DO UPDATE SET revision = revision + 1;
END;

--> statement-breakpoint
CREATE TRIGGER backup_revision_daily_submissions_insert AFTER INSERT ON daily_submissions
BEGIN
  INSERT INTO workspace_backup_state (owner_id, revision) VALUES (NEW.owner_id, 1)
  ON CONFLICT(owner_id) DO UPDATE SET revision = revision + 1;
END;

--> statement-breakpoint
CREATE TRIGGER backup_revision_daily_submissions_update AFTER UPDATE ON daily_submissions
BEGIN
  INSERT INTO workspace_backup_state (owner_id, revision) VALUES (NEW.owner_id, 1)
  ON CONFLICT(owner_id) DO UPDATE SET revision = revision + 1;
END;

--> statement-breakpoint
CREATE TRIGGER backup_revision_daily_submissions_delete AFTER DELETE ON daily_submissions
BEGIN
  INSERT INTO workspace_backup_state (owner_id, revision) VALUES (OLD.owner_id, 1)
  ON CONFLICT(owner_id) DO UPDATE SET revision = revision + 1;
END;

--> statement-breakpoint
CREATE TRIGGER backup_revision_daily_task_snapshots_insert AFTER INSERT ON daily_task_snapshots
BEGIN
  INSERT INTO workspace_backup_state (owner_id, revision) VALUES (NEW.owner_id, 1)
  ON CONFLICT(owner_id) DO UPDATE SET revision = revision + 1;
END;

--> statement-breakpoint
CREATE TRIGGER backup_revision_daily_task_snapshots_update AFTER UPDATE ON daily_task_snapshots
BEGIN
  INSERT INTO workspace_backup_state (owner_id, revision) VALUES (NEW.owner_id, 1)
  ON CONFLICT(owner_id) DO UPDATE SET revision = revision + 1;
END;

--> statement-breakpoint
CREATE TRIGGER backup_revision_daily_task_snapshots_delete AFTER DELETE ON daily_task_snapshots
BEGIN
  INSERT INTO workspace_backup_state (owner_id, revision) VALUES (OLD.owner_id, 1)
  ON CONFLICT(owner_id) DO UPDATE SET revision = revision + 1;
END;

--> statement-breakpoint
CREATE TRIGGER backup_revision_google_calendar_events_insert AFTER INSERT ON google_calendar_events
BEGIN
  INSERT INTO workspace_backup_state (owner_id, revision) VALUES (NEW.owner_id, 1)
  ON CONFLICT(owner_id) DO UPDATE SET revision = revision + 1;
END;

--> statement-breakpoint
CREATE TRIGGER backup_revision_google_calendar_events_update AFTER UPDATE ON google_calendar_events
BEGIN
  INSERT INTO workspace_backup_state (owner_id, revision) VALUES (NEW.owner_id, 1)
  ON CONFLICT(owner_id) DO UPDATE SET revision = revision + 1;
END;

--> statement-breakpoint
CREATE TRIGGER backup_revision_google_calendar_events_delete AFTER DELETE ON google_calendar_events
BEGIN
  INSERT INTO workspace_backup_state (owner_id, revision) VALUES (OLD.owner_id, 1)
  ON CONFLICT(owner_id) DO UPDATE SET revision = revision + 1;
END;

--> statement-breakpoint
CREATE TRIGGER backup_revision_kr_data_connections_insert AFTER INSERT ON kr_data_connections
BEGIN
  INSERT INTO workspace_backup_state (owner_id, revision) VALUES (NEW.owner_id, 1)
  ON CONFLICT(owner_id) DO UPDATE SET revision = revision + 1;
END;

--> statement-breakpoint
CREATE TRIGGER backup_revision_kr_data_connections_update AFTER UPDATE ON kr_data_connections
BEGIN
  INSERT INTO workspace_backup_state (owner_id, revision) VALUES (NEW.owner_id, 1)
  ON CONFLICT(owner_id) DO UPDATE SET revision = revision + 1;
END;

--> statement-breakpoint
CREATE TRIGGER backup_revision_kr_data_connections_delete AFTER DELETE ON kr_data_connections
BEGIN
  INSERT INTO workspace_backup_state (owner_id, revision) VALUES (OLD.owner_id, 1)
  ON CONFLICT(owner_id) DO UPDATE SET revision = revision + 1;
END;

--> statement-breakpoint
CREATE TRIGGER backup_revision_slack_daily_publications_insert AFTER INSERT ON slack_daily_publications
BEGIN
  INSERT INTO workspace_backup_state (owner_id, revision) VALUES (NEW.owner_id, 1)
  ON CONFLICT(owner_id) DO UPDATE SET revision = revision + 1;
END;

--> statement-breakpoint
CREATE TRIGGER backup_revision_slack_daily_publications_update AFTER UPDATE ON slack_daily_publications
BEGIN
  INSERT INTO workspace_backup_state (owner_id, revision) VALUES (NEW.owner_id, 1)
  ON CONFLICT(owner_id) DO UPDATE SET revision = revision + 1;
END;

--> statement-breakpoint
CREATE TRIGGER backup_revision_slack_daily_publications_delete AFTER DELETE ON slack_daily_publications
BEGIN
  INSERT INTO workspace_backup_state (owner_id, revision) VALUES (OLD.owner_id, 1)
  ON CONFLICT(owner_id) DO UPDATE SET revision = revision + 1;
END;

--> statement-breakpoint
CREATE TRIGGER backup_revision_slack_automation_deliveries_insert AFTER INSERT ON slack_automation_deliveries
BEGIN
  INSERT INTO workspace_backup_state (owner_id, revision) VALUES (NEW.owner_id, 1)
  ON CONFLICT(owner_id) DO UPDATE SET revision = revision + 1;
END;

--> statement-breakpoint
CREATE TRIGGER backup_revision_slack_automation_deliveries_update AFTER UPDATE ON slack_automation_deliveries
BEGIN
  INSERT INTO workspace_backup_state (owner_id, revision) VALUES (NEW.owner_id, 1)
  ON CONFLICT(owner_id) DO UPDATE SET revision = revision + 1;
END;

--> statement-breakpoint
CREATE TRIGGER backup_revision_slack_automation_deliveries_delete AFTER DELETE ON slack_automation_deliveries
BEGIN
  INSERT INTO workspace_backup_state (owner_id, revision) VALUES (OLD.owner_id, 1)
  ON CONFLICT(owner_id) DO UPDATE SET revision = revision + 1;
END;

--> statement-breakpoint
CREATE TRIGGER backup_revision_workspace_members_insert AFTER INSERT ON workspace_members
BEGIN
  INSERT INTO workspace_backup_state (owner_id, revision) VALUES (NEW.workspace_id, 1)
  ON CONFLICT(owner_id) DO UPDATE SET revision = revision + 1;
END;

--> statement-breakpoint
CREATE TRIGGER backup_revision_workspace_members_update AFTER UPDATE ON workspace_members
BEGIN
  INSERT INTO workspace_backup_state (owner_id, revision) VALUES (NEW.workspace_id, 1)
  ON CONFLICT(owner_id) DO UPDATE SET revision = revision + 1;
END;

--> statement-breakpoint
CREATE TRIGGER backup_revision_workspace_members_delete AFTER DELETE ON workspace_members
BEGIN
  INSERT INTO workspace_backup_state (owner_id, revision) VALUES (OLD.workspace_id, 1)
  ON CONFLICT(owner_id) DO UPDATE SET revision = revision + 1;
END;

--> statement-breakpoint
CREATE TRIGGER backup_revision_workspaces_insert AFTER INSERT ON workspaces
BEGIN
  INSERT INTO workspace_backup_state (owner_id, revision) VALUES (NEW.id, 1)
  ON CONFLICT(owner_id) DO UPDATE SET revision = revision + 1;
END;

--> statement-breakpoint
CREATE TRIGGER backup_revision_workspaces_update AFTER UPDATE ON workspaces
BEGIN
  INSERT INTO workspace_backup_state (owner_id, revision) VALUES (NEW.id, 1)
  ON CONFLICT(owner_id) DO UPDATE SET revision = revision + 1;
END;

--> statement-breakpoint
CREATE TRIGGER backup_revision_workspaces_delete AFTER DELETE ON workspaces
BEGIN
  INSERT INTO workspace_backup_state (owner_id, revision) VALUES (OLD.id, 1)
  ON CONFLICT(owner_id) DO UPDATE SET revision = revision + 1;
END;
