CREATE TABLE `demo_events` (
	`id` text PRIMARY KEY NOT NULL,
	`rep_name` text NOT NULL,
	`company` text NOT NULL,
	`product` text NOT NULL,
	`song_id` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `demo_events_created_at_idx` ON `demo_events` (`created_at`);