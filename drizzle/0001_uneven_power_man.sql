CREATE TABLE `song_configs` (
	`id` text PRIMARY KEY NOT NULL,
	`rep_name` text NOT NULL,
	`title` text NOT NULL,
	`artist` text NOT NULL,
	`video_id` text NOT NULL,
	`start_seconds` integer NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `song_configs_rep_name_unique` ON `song_configs` (`rep_name`);--> statement-breakpoint
CREATE INDEX `song_configs_rep_idx` ON `song_configs` (`rep_name`);