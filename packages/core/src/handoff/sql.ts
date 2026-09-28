import { sqliteTable, text } from "drizzle-orm/sqlite-core"
import { Timestamps } from "../database/schema.sql"
import { DeviceTable } from "../device/sql"

export const HandoffTable = sqliteTable("handoff", {
  id: text().primaryKey(),
  session_id: text().notNull(),
  device_id: text()
    .notNull()
    .references(() => DeviceTable.id, { onDelete: "cascade" }),
  status: text().notNull(),
  note: text(),
  ...Timestamps,
})
