export * as Device from "./device"

import { Schema } from "effect"
import { ascending } from "./identifier"
import { NonNegativeInt, PositiveInt, optional, statics } from "./schema"

export const ID = Schema.String.check(Schema.isStartsWith("dev_")).pipe(
  Schema.brand("Device.ID"),
  statics((schema) => ({ create: () => schema.make("dev_" + ascending()) })),
)
export type ID = typeof ID.Type

export const Kind = Schema.Literals(["mobile", "desktop"])
export type Kind = typeof Kind.Type

export interface Info extends Schema.Schema.Type<typeof Info> {}
export const Info = Schema.Struct({
  id: ID,
  name: Schema.String,
  kind: Kind,
  platform: optional(Schema.String),
  time_created: NonNegativeInt,
  time_updated: NonNegativeInt,
  time_last_seen: NonNegativeInt,
}).annotate({ identifier: "Device.Info" })

// A pairing code is short-lived, single-use and only ever held in memory. It trades a
// short human-typable string for a long-lived device token, so it never reaches storage.
export interface Offer extends Schema.Schema.Type<typeof Offer> {}
export const Offer = Schema.Struct({
  code: Schema.String,
  expires_in: PositiveInt,
  addresses: optional(Schema.Array(Schema.String)),
}).annotate({ identifier: "Device.Offer" })

// The raw device token is returned exactly once, by the endpoint that redeems a pairing code.
// Only its hash is persisted, so a leaked database cannot be replayed against the server.
export interface Paired extends Schema.Schema.Type<typeof Paired> {}
export const Paired = Schema.Struct({
  device: Info,
  token: Schema.String,
}).annotate({ identifier: "Device.Paired" })
