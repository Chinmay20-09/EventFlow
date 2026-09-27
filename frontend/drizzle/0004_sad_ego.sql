CREATE TABLE `event_keys` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`route_id` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `event_keys_route_id_unique` ON `event_keys` (`route_id`);--> statement-breakpoint
CREATE TABLE `nodes` (
	`node_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_id` integer NOT NULL,
	`external_id` text(80),
	`name` text(120) NOT NULL,
	`type` text(40) NOT NULL,
	`latitude` real NOT NULL,
	`longitude` real NOT NULL,
	`capacity` integer NOT NULL,
	`status` text(30) NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `event_keys`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT OR IGNORE INTO event_keys (route_id) SELECT DISTINCT event_id FROM operation_records;
--> statement-breakpoint
INSERT OR IGNORE INTO nodes (node_id,event_id,external_id,name,type,latitude,longitude,capacity,status,created_at)
SELECT r.rowid,k.id,NULL,json_extract(r.data,'$.name'),json_extract(r.data,'$.type'),json_extract(r.data,'$.lat'),json_extract(r.data,'$.lng'),json_extract(r.data,'$.capacity'),'active',r.created_at
FROM operation_records r JOIN event_keys k ON k.route_id=r.event_id WHERE r.kind='node';
--> statement-breakpoint
UPDATE operation_records AS edge SET data=json_set(edge.data,'$.from',COALESCE((SELECT n.rowid FROM operation_records n WHERE n.id=json_extract(edge.data,'$.from') AND n.kind='node' AND n.event_id=edge.event_id),json_extract(edge.data,'$.from')),'$.to',COALESCE((SELECT n.rowid FROM operation_records n WHERE n.id=json_extract(edge.data,'$.to') AND n.kind='node' AND n.event_id=edge.event_id),json_extract(edge.data,'$.to'))) WHERE edge.kind='edge';
