DELETE FROM `slack_connections`
WHERE EXISTS (
  SELECT 1
  FROM `slack_connections` AS `newer`
  WHERE `newer`.`owner_id` = `slack_connections`.`owner_id`
    AND (
      `newer`.`updated_at` > `slack_connections`.`updated_at`
      OR (`newer`.`updated_at` = `slack_connections`.`updated_at` AND `newer`.`id` > `slack_connections`.`id`)
    )
);--> statement-breakpoint
DROP INDEX IF EXISTS `idx_slack_connections_owner_user`;--> statement-breakpoint
DROP INDEX IF EXISTS `idx_slack_connections_owner`;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_slack_connections_owner` ON `slack_connections` (`owner_id`);
