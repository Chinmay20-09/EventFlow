CREATE TABLE `active_event` (
	`id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `operation_records` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`kind` text NOT NULL,
	`parent_id` text,
	`data` text NOT NULL,
	`created_at` text NOT NULL,
	`actor` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_operations_event` ON `operation_records` (`event_id`,`created_at`);