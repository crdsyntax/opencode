import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core"
import { Timestamps } from "../database/schema.sql"

export const DeviceTable = sqliteTable("device", {
  id: text().primaryKey(),
  name: text().notNull(),
  kind: text().notNull(),
  platform: text(),
  token_hash: text().notNull().unique(),
  time_last_seen: integer().notNull(),
  ...Timestamps,
})
