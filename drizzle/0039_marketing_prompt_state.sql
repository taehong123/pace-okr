CREATE TABLE IF NOT EXISTS `email_marketing_prompt_state` (
  `user_id` text PRIMARY KEY NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `shown_at` text,
  `responded_at` text
);
--> statement-breakpoint
INSERT OR IGNORE INTO `email_marketing_prompt_state` (`user_id`, `shown_at`, `responded_at`)
SELECT c.`user_id`, c.`updated_at`, c.`updated_at`
FROM `email_marketing_consents` c
WHERE c.`marketing_data_consent` = 1 OR c.`advertising_email_consent` = 1
  OR EXISTS (SELECT 1 FROM `email_marketing_consent_events` e WHERE e.`user_id` = c.`user_id`)
  OR EXISTS (SELECT 1 FROM `account_consent_events` e WHERE e.`user_id` = c.`user_id`
    AND e.`consent_type` IN ('marketing_data', 'electronic_marketing'))
  OR EXISTS (SELECT 1 FROM `account_registrations` r WHERE r.`user_id` = c.`user_id`
    AND (r.`marketing_data_consent` = 1 OR r.`electronic_marketing_consent` = 1));
