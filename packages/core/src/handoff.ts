export * as Handoff from "./handoff"

import { and, desc, eq } from "drizzle-orm"
import { Context, Effect, Layer, Schema } from "effect"
import { Device } from "@opencode-ai/schema/device"
import { Handoff } from "@opencode-ai/schema/handoff"
import { NonNegativeInt } from "@opencode-ai/schema/schema"
import { SessionID } from "@opencode-ai/schema/session-id"
import { Database } from "./database/database"
import { makeGlobalNode } from "./effect/app-node"
import { DeviceTable } from "./device/sql"
import { HandoffTable } from "./handoff/sql"

export const ID = Handoff.ID
export type ID = Handoff.ID

export class Info extends Schema.Class<Info>("Handoff.Info")({
  id: Handoff.ID,
  sessionID: SessionID,
  deviceID: Device.ID,
  deviceName: Schema.String,
  status: Handoff.Status,
  note: Schema.optional(Schema.String),
  time_created: NonNegativeInt,
  time_updated: NonNegativeInt,
}) {}

const Status = Handoff.Status
type Status = Handoff.Status

export interface SendInput {
  readonly sessionID: SessionID
  readonly deviceID: Device.ID
  readonly note?: string
}

export interface Interface {
  /** Addresses a session to a paired device. Undefined when the device is unknown. */
  readonly send: (input: SendInput) => Effect.Effect<Info | undefined>
  /** Returns the handoffs still awaiting a decision from one device, newest first. */
  readonly pending: (deviceID: Device.ID) => Effect.Effect<Info[]>
  /** Records the target device's decision. Undefined when the handoff is unknown or already answered. */
  readonly respond: (id: ID, status: Status) => Effect.Effect<Info | undefined>
  /** Drops a handoff entirely. Returns whether a row was actually removed. */
  readonly dismiss: (id: ID) => Effect.Effect<boolean>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/Handoff") {}

const selection = {
  id: HandoffTable.id,
  session_id: HandoffTable.session_id,
  device_id: HandoffTable.device_id,
  device_name: DeviceTable.name,
  status: HandoffTable.status,
  note: HandoffTable.note,
  time_created: HandoffTable.time_created,
  time_updated: HandoffTable.time_updated,
}

// Decoding re-checks the stored prefixes, so a corrupt row fails loudly instead of yielding an
// ID that the request router would reject.
const decodeID = Schema.decodeUnknownSync(Handoff.ID)
const decodeSessionID = Schema.decodeUnknownSync(SessionID)
const decodeDeviceID = Schema.decodeUnknownSync(Device.ID)
const decodeStatus = Schema.decodeUnknownSync(Handoff.Status)

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const { db } = yield* Database.Service

    const stored = (row: {
      id: string
      session_id: string
      device_id: string
      device_name: string
      status: string
      note: string | null
      time_created: number
      time_updated: number
    }) =>
      new Info({
        id: decodeID(row.id),
        sessionID: decodeSessionID(row.session_id),
        deviceID: decodeDeviceID(row.device_id),
        deviceName: row.device_name,
        status: decodeStatus(row.status),
        note: row.note ?? undefined,
        time_created: row.time_created,
        time_updated: row.time_updated,
      })

    const select = db
      .select(selection)
      .from(HandoffTable)
      .innerJoin(DeviceTable, eq(HandoffTable.device_id, DeviceTable.id))

    return Service.of({
      send: Effect.fn("Handoff.send")(function* (input) {
        const device = yield* db
          .select({ id: DeviceTable.id })
          .from(DeviceTable)
          .where(eq(DeviceTable.id, input.deviceID))
          .get()
          .pipe(Effect.orDie)
        if (!device) return undefined
        const id = ID.create()
        const now = Date.now()
        yield* db
          .insert(HandoffTable)
          .values({
            id,
            session_id: input.sessionID,
            device_id: input.deviceID,
            status: "pending",
            note: input.note ?? null,
            time_created: now,
            time_updated: now,
          })
          .run()
          .pipe(Effect.orDie)
        const row = yield* select.where(eq(HandoffTable.id, id)).get().pipe(Effect.orDie)
        if (!row) return undefined
        return stored(row)
      }),
      pending: Effect.fn("Handoff.pending")(function* (deviceID) {
        return (yield* select
          .where(and(eq(HandoffTable.device_id, deviceID), eq(HandoffTable.status, "pending")))
          .orderBy(desc(HandoffTable.time_created))
          .all()
          .pipe(Effect.orDie)).map(stored)
      }),
      respond: Effect.fn("Handoff.respond")(function* (id, status) {
        const result = yield* db
          .update(HandoffTable)
          .set({ status, time_updated: Date.now() })
          .where(and(eq(HandoffTable.id, id), eq(HandoffTable.status, "pending")))
          .returning()
          .pipe(Effect.orDie)
        if (result.length === 0) return undefined
        const row = yield* select.where(eq(HandoffTable.id, id)).get().pipe(Effect.orDie)
        if (!row) return undefined
        return stored(row)
      }),
      dismiss: Effect.fn("Handoff.dismiss")(function* (id) {
        const removed = yield* db.delete(HandoffTable).where(eq(HandoffTable.id, id)).returning().pipe(Effect.orDie)
        return removed.length > 0
      }),
    })
  }),
)

export const node = makeGlobalNode({ service: Service, layer, deps: [Database.node] })
