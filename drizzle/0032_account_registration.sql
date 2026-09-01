CREATE TABLE IF NOT EXISTS `account_registrations` (
	`user_id` text PRIMARY KEY NOT NULL,
	`encrypted_phone` text DEFAULT '' NOT NULL,
	`phone_hash` text DEFAULT '' NOT NULL,
	`phone_last_four` text DEFAULT '' NOT NULL,
	`verification_provider` text DEFAULT '' NOT NULL,
	`phone_verified_at` text,
	`required_privacy_consent_at` text,
	`age_14_confirmed_at` text,
	`marketing_data_consent` integer DEFAULT 0 NOT NULL,
	`marketing_data_consent_at` text,
	`electronic_marketing_consent` integer DEFAULT 0 NOT NULL,
	`electronic_marketing_consent_at` text,
	`consent_version` text DEFAULT '2026-09-01' NOT NULL,
	`completed_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_account_registrations_phone_hash` ON `account_registrations` (`phone_hash`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `account_consent_events` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`consent_type` text NOT NULL,
	`granted` integer NOT NULL,
	`policy_version` text NOT NULL,
	`source` text DEFAULT 'signup' NOT NULL,
	`occurred_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_account_consent_events_user_type` ON `account_consent_events` (`user_id`,`consent_type`,`occurred_at`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `phone_verification_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`encrypted_phone` text NOT NULL,
	`phone_hash` text NOT NULL,
	`phone_last_four` text NOT NULL,
	`provider_sid` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`requested_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`expires_at` text NOT NULL,
	`verified_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_phone_verification_requests_user_time` ON `phone_verification_requests` (`user_id`,`requested_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_phone_verification_requests_phone_time` ON `phone_verification_requests` (`phone_hash`,`requested_at`);
--> statement-breakpoint
INSERT OR IGNORE INTO `account_registrations` (
	`user_id`, `verification_provider`, `consent_version`, `completed_at`, `created_at`, `updated_at`
)
SELECT `id`, 'legacy', 'legacy-2026-09-01', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM `users`;
--> statement-breakpoint
INSERT OR IGNORE INTO `app_migrations` (`id`, `applied_at`) VALUES ('account_registration_legacy_v1', CURRENT_TIMESTAMP);
