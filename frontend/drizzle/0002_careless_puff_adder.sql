CREATE TABLE `venue_inputs` (
	`place_key` text PRIMARY KEY NOT NULL,
	`place_name` text NOT NULL,
	`expected` integer NOT NULL,
	`current` integer NOT NULL,
	`capacity` integer NOT NULL,
	`updated_at` text NOT NULL,
	`updated_by` text NOT NULL
);
