ALTER TABLE `items` ADD `created_by_user_id` text;--> statement-breakpoint
UPDATE `items`
SET `created_by_user_id` = (
  SELECT `owner_user_id`
  FROM `workspaces`
  WHERE `workspaces`.`id` = `items`.`owner_id`
    AND `workspaces`.`id` = `workspaces`.`owner_user_id`
)
WHERE `created_by_user_id` IS NULL
  AND EXISTS (
    SELECT 1
    FROM `workspaces`
    WHERE `workspaces`.`id` = `items`.`owner_id`
      AND `workspaces`.`id` = `workspaces`.`owner_user_id`
  );
