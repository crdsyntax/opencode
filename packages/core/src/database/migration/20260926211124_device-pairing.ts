import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20260926211124_device-pairing",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`
        CREATE TABLE \`device\` (
          \`id\` text PRIMARY KEY,
          \`name\` text NOT NULL,
          \`kind\` text NOT NULL,
          \`platform\` text,
          \`token_hash\` text NOT NULL UNIQUE,
          \`time_last_seen\` integer NOT NULL,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`handoff\` (
          \`id\` text PRIMARY KEY,
          \`session_id\` text NOT NULL,
          \`device_id\` text NOT NULL,
          \`status\` text NOT NULL,
          \`note\` text,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL,
          CONSTRAINT \`fk_handoff_device_id_device_id_fk\` FOREIGN KEY (\`device_id\`) REFERENCES \`device\`(\`id\`) ON DELETE CASCADE
        );
      `)
    })
  },
} satisfies DatabaseMigration.Migration
