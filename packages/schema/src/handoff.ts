export * as Handoff from "./handoff"

import { Schema } from "effect"
import { Device } from "./device"
import { ascending } from "./identifier"
import { NonNegativeInt, optional, statics } from "./schema"
import { SessionID } from "./session-id"

export const ID = Schema.String.check(Schema.isStartsWith("hnd_")).pipe(
  Schema.brand("Handoff.ID"),
  statics((schema) => ({ create: () => schema.make("hnd_" + ascending()) })),
)
export type ID = typeof ID.Type

export const Status = Schema.Literals(["pending", "accepted", "declined"])
export type Status = typeof Status.Type

export interface Send extends Schema.Schema.Type<typeof Send> {}
export const Send = Schema.Struct({
  sessionID: SessionID,
  deviceID: Device.ID,
  note: optional(Schema.String),
}).annotate({ identifier: "Handoff.Send" })

export interface Info extends Schema.Schema.Type<typeof Info> {}
export const Info = Schema.Struct({
  id: ID,
  sessionID: SessionID,
  deviceID: Device.ID,
  deviceName: Schema.String,
  status: Status,
  note: optional(Schema.String),
  time_created: NonNegativeInt,
  time_updated: NonNegativeInt,
}).annotate({ identifier: "Handoff.Info" })
