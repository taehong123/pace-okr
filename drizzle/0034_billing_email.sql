CREATE TABLE IF NOT EXISTS `email_marketing_consents` (
  `user_id` text PRIMARY KEY NOT NULL REFERENCES `users`(`id`) ON DELETE cascade,
  `marketing_data_consent` integer DEFAULT 0 NOT NULL,
  `marketing_data_consent_at` text,
  `advertising_email_consent` integer DEFAULT 0 NOT NULL,
  `advertising_email_consent_at` text,
  `policy_version` text DEFAULT '2026-09-01' NOT NULL,
  `reaffirm_after` text,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_email_marketing_consents_eligibility` ON `email_marketing_consents` (`marketing_data_consent`,`advertising_email_consent`,`reaffirm_after`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `email_marketing_consent_events` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE cascade,
  `consent_type` text NOT NULL,
  `granted` integer NOT NULL,
  `policy_version` text NOT NULL,
  `source` text DEFAULT 'settings' NOT NULL,
  `occurred_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_email_marketing_consent_events_user_time` ON `email_marketing_consent_events` (`user_id`,`occurred_at`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `workspace_subscriptions` (
  `workspace_id` text PRIMARY KEY NOT NULL REFERENCES `workspaces`(`id`) ON DELETE cascade,
  `plan` text DEFAULT 'free' NOT NULL,
  `status` text DEFAULT 'free' NOT NULL,
  `billing_owner_user_id` text NOT NULL,
  `next_plan` text,
  `trial_started_at` text,
  `trial_ends_at` text,
  `current_period_started_at` text,
  `current_period_ends_at` text,
  `next_billing_at` text,
  `cancel_at_period_end` integer DEFAULT 0 NOT NULL,
  `grace_ends_at` text,
  `retry_count` integer DEFAULT 0 NOT NULL,
  `first_paid_at` text,
  `last_paid_at` text,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_workspace_subscriptions_billing_due` ON `workspace_subscriptions` (`status`,`next_billing_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_workspace_subscriptions_billing_owner` ON `workspace_subscriptions` (`billing_owner_user_id`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `billing_payment_methods` (
  `id` text PRIMARY KEY NOT NULL,
  `workspace_id` text NOT NULL REFERENCES `workspaces`(`id`) ON DELETE cascade,
  `encrypted_billing_key` text NOT NULL,
  `payer_hash` text NOT NULL,
  `card_company` text DEFAULT '' NOT NULL,
  `masked_card` text DEFAULT '' NOT NULL,
  `active` integer DEFAULT 1 NOT NULL,
  `revoked_at` text,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `idx_billing_payment_methods_active_workspace` ON `billing_payment_methods` (`workspace_id`) WHERE `active` = 1;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_billing_payment_methods_payer` ON `billing_payment_methods` (`payer_hash`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `billing_sessions` (
  `token_hash` text PRIMARY KEY NOT NULL,
  `workspace_id` text NOT NULL REFERENCES `workspaces`(`id`) ON DELETE cascade,
  `user_id` text NOT NULL,
  `plan` text NOT NULL,
  `price_won` integer NOT NULL,
  `consented_at` text NOT NULL,
  `expires_at` text NOT NULL,
  `used_at` text,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_billing_sessions_expiry` ON `billing_sessions` (`expires_at`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `billing_transactions` (
  `id` text PRIMARY KEY NOT NULL,
  `workspace_id` text NOT NULL,
  `order_id` text NOT NULL,
  `idempotency_key` text NOT NULL,
  `kind` text NOT NULL,
  `plan` text NOT NULL,
  `price_won` integer NOT NULL,
  `status` text NOT NULL,
  `payple_transaction_id` text,
  `receipt_url` text,
  `error_code` text,
  `period_started_at` text,
  `period_ends_at` text,
  `retained_until` text NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `idx_billing_transactions_order` ON `billing_transactions` (`order_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `idx_billing_transactions_idempotency` ON `billing_transactions` (`idempotency_key`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_billing_transactions_workspace_time` ON `billing_transactions` (`workspace_id`,`created_at`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `project_monthly_usage` (
  `workspace_id` text NOT NULL REFERENCES `workspaces`(`id`) ON DELETE cascade,
  `period_key` text NOT NULL,
  `created_count` integer DEFAULT 0 NOT NULL,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  UNIQUE(`workspace_id`,`period_key`)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_project_monthly_usage_period` ON `project_monthly_usage` (`period_key`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `workspace_editor_selections` (
  `workspace_id` text NOT NULL REFERENCES `workspaces`(`id`) ON DELETE cascade,
  `member_id` text NOT NULL REFERENCES `workspace_members`(`id`) ON DELETE cascade,
  `selected` integer DEFAULT 1 NOT NULL,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  UNIQUE(`workspace_id`,`member_id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `billing_trial_claims` (
  `id` text PRIMARY KEY NOT NULL,
  `billing_owner_user_id` text NOT NULL,
  `payer_hash` text NOT NULL,
  `workspace_id` text NOT NULL,
  `claimed_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `idx_billing_trial_claims_owner` ON `billing_trial_claims` (`billing_owner_user_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `idx_billing_trial_claims_payer` ON `billing_trial_claims` (`payer_hash`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `billing_leases` (`lease_key` text PRIMARY KEY NOT NULL, `holder_id` text NOT NULL, `expires_at` text NOT NULL, `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `billing_notifications` (
  `id` text PRIMARY KEY NOT NULL,
  `workspace_id` text NOT NULL REFERENCES `workspaces`(`id`) ON DELETE cascade,
  `user_id` text NOT NULL,
  `kind` text NOT NULL,
  `scheduled_for` text NOT NULL,
  `status` text DEFAULT 'pending' NOT NULL,
  `provider_message_id` text,
  `last_error` text,
  `sent_at` text,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  UNIQUE(`workspace_id`,`kind`,`scheduled_for`)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_billing_notifications_due` ON `billing_notifications` (`status`,`scheduled_for`);
--> statement-breakpoint
UPDATE `account_registrations` SET `encrypted_phone` = '', `phone_hash` = '', `phone_last_four` = '', `verification_provider` = '', `phone_verified_at` = NULL;
--> statement-breakpoint
DELETE FROM `phone_verification_requests`;
--> statement-breakpoint
INSERT OR IGNORE INTO `app_migrations` (`id`,`applied_at`) VALUES ('billing_email_v1', CURRENT_TIMESTAMP);
--> statement-breakpoint
PRAGMA optimize;
