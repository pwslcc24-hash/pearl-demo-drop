import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const demoEvents = sqliteTable("demo_events", {
  id: text("id").primaryKey(),
  repName: text("rep_name").notNull(),
  company: text("company").notNull(),
  product: text("product").notNull(),
  songId: text("song_id").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [index("demo_events_created_at_idx").on(table.createdAt)]);

export const songConfigs = sqliteTable("song_configs", {
  id: text("id").primaryKey(), repName: text("rep_name").notNull().unique(),
  title: text("title").notNull(), artist: text("artist").notNull(), videoId: text("video_id").notNull(),
  startSeconds: integer("start_seconds").notNull(), createdAt: text("created_at").notNull(),
}, (table) => [index("song_configs_rep_idx").on(table.repName)]);
