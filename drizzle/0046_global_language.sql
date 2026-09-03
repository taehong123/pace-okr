ALTER TABLE `slack_automations` ADD `message_template_kind` text DEFAULT 'custom' NOT NULL;--> statement-breakpoint
ALTER TABLE `slack_daily_reminders` ADD `message_language` text DEFAULT 'ko' NOT NULL;--> statement-breakpoint
ALTER TABLE `slack_daily_reminders` ADD `message_text` text DEFAULT '[데일리 봇] 오늘의 데일리를 작성해 주세요.' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `language_preference` text DEFAULT 'ko' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `resolved_language` text DEFAULT 'ko' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `language_revision` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `workspaces` ADD `message_language` text DEFAULT 'ko' NOT NULL;
