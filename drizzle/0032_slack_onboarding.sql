ALTER TABLE `slack_daily_settings` ADD `onboarding_completed_at` text;
--> statement-breakpoint
UPDATE `slack_daily_settings`
SET `onboarding_completed_at` = COALESCE(`last_synced_at`, `updated_at`)
WHERE `install_status` = 'connected'
  AND `onboarding_completed_at` IS NULL;
