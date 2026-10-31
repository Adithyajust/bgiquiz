import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
export const quizRooms = sqliteTable("quiz_rooms", {
  id: text("id").primaryKey(), document: text("document").notNull(),
  revision: integer("revision").notNull().default(0), updatedAt: integer("updated_at").notNull(),
});
export const quizEvents = sqliteTable("quiz_events", {
  id: text("id").primaryKey(), revision: integer("revision").notNull(), kind: text("kind").notNull(),
  payload: text("payload").notNull(), createdAt: integer("created_at").notNull(),
});
export const quizOwners = sqliteTable("quiz_owners", {
  id: text("id").primaryKey(), userId: text("user_id").notNull(), createdAt: integer("created_at").notNull(),
});
