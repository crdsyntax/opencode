export * as Device from "./device"

import { randomBytes, randomInt } from "crypto"
import { networkInterfaces } from "os"
import { desc, eq } from "drizzle-orm"
import { Cache, Context, Duration, Effect, Layer, Schema } from "effect"
import { Device } from "@opencode-ai/schema/device"
import { NonNegativeInt } from "@opencode-ai/schema/schema"
import { Database } from "./database/database"
import { DeviceTable } from "./device/sql"
import { makeGlobalNode } from "./effect/app-node"
import { Hash } from "./util/hash"

export const ID = Device.ID
export type ID = Device.ID

export class Info extends Schema.Class<Info>("Device.Info")({
  id: Device.ID,
  name: Schema.String,
  kind: Device.Kind,
  platform: Schema.optional(Schema.String),
  time_created: NonNegativeInt,
  time_updated: NonNegativeInt,
  time_last_seen: NonNegativeInt,
}) {}

export const Kind = Device.Kind
export type Kind = Device.Kind

const PAIRING_TTL = Duration.minutes(5)
const PAIRING_CAPACITY = 1_000
const PAIRING_CODE_LENGTH = 8
// Excludes look-alike characters so a code read off a phone screen can be retyped by hand.
const PAIRING_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"
// Last-seen is written at most this often, so an active mobile client does not issue a write per request.
const TOUCH_INTERVAL = 60_000

// Codes are written with Cache.set and consumed with invalidateWhen, which reaches the entry
// directly. The lookup is never invoked; it dies if it ever is, which would signal a misuse.
const noLookup = () => Effect.die("Device pairing cache must be used via set/invalidateWhen, never get")

export interface RedeemInput {
  readonly name: string
  readonly kind: Device.Kind
  readonly platform?: string
}

export interface Interface {
  /** Returns every paired device, most recently seen first. */
  readonly all: () => Effect.Effect<Info[]>
  readonly get: (id: ID) => Effect.Effect<Info | undefined>
  /** Issues a short-lived single-use code that a device trades for a long-lived token. */
  readonly offer: () => Effect.Effect<Device.Offer>
  /** Redeems a pairing code, returning the new device and its one-time token. Undefined when the code is invalid or expired. */
  readonly redeem: (code: string, input: RedeemInput) => Effect.Effect<Device.Paired | undefined>
  /** Resolves a bearer token to its device, refreshing last-seen at most once per interval. */
  readonly authenticate: (token: string) => Effect.Effect<Info | undefined>
  /** Removes a device, which also cascades to anything addressed to it. */
  readonly remove: (id: ID) => Effect.Effect<void>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/Device") {}

function pairingCode() {
  return Array.from(
    { length: PAIRING_CODE_LENGTH },
    () => PAIRING_ALPHABET[randomInt(PAIRING_ALPHABET.length)],
  ).join("")
}

// A phone cannot reach a server bound to 127.0.0.1, so a pairing QR has to carry an address the
// device can actually dial. The server sees the host interfaces directly, which avoids asking the
// sandboxed renderer for them. Private ranges are preferred because the pairing target is normally
// on the same network as the host.
function lanAddresses() {
  const found: string[] = []
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family !== "IPv4" || entry.internal) continue
      if (!found.includes(entry.address)) found.push(entry.address)
    }
  }
  const rank = (address: string) => (/^192\.168\./.test(address) ? 0 : /^10\./.test(address) ? 1 : 2)
  return found.sort((left, right) => rank(left) - rank(right))
}

// Decoding also re-checks the stored prefix, so a corrupt row fails loudly instead of
// producing an ID that the request router would then reject.
const decodeID = Schema.decodeUnknownSync(Device.ID)
const decodeKind = Schema.decodeUnknownSync(Device.Kind)

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const { db } = yield* Database.Service
    // Pairing codes live only in memory: they are short-lived, single-use, and never persisted.
    const codes = yield* Cache.make<string, boolean>({
      capacity: PAIRING_CAPACITY,
      lookup: noLookup,
      timeToLive: PAIRING_TTL,
    })
    const expiresIn = Math.max(1, Math.round(Duration.toSeconds(Duration.fromInputUnsafe(PAIRING_TTL))))

    const stored = (row: typeof DeviceTable.$inferSelect) =>
      new Info({
        id: decodeID(row.id),
        name: row.name,
        kind: decodeKind(row.kind),
        platform: row.platform ?? undefined,
        time_created: row.time_created,
        time_updated: row.time_updated,
        time_last_seen: row.time_last_seen,
      })

    return Service.of({
      all: Effect.fn("Device.all")(function* () {
        return (yield* db
          .select()
          .from(DeviceTable)
          .orderBy(desc(DeviceTable.time_last_seen))
          .all()
          .pipe(Effect.orDie)).map(stored)
      }),
      get: Effect.fn("Device.get")(function* (id) {
        const row = yield* db.select().from(DeviceTable).where(eq(DeviceTable.id, id)).get().pipe(Effect.orDie)
        return row ? stored(row) : undefined
      }),
      offer: Effect.fn("Device.offer")(function* () {
        const code = pairingCode()
        yield* Cache.set(codes, code, true)
        return { code, expires_in: expiresIn, addresses: lanAddresses() }
      }),
      redeem: Effect.fn("Device.redeem")(function* (code, input) {
        // invalidateWhen consumes the code atomically, so two racing redemptions cannot both win.
        if (!(yield* Cache.invalidateWhen(codes, code, () => true))) return undefined
        const id = ID.create()
        const token = randomBytes(32).toString("base64url")
        const now = Date.now()
        yield* db
          .insert(DeviceTable)
          .values({
            id,
            name: input.name,
            kind: input.kind,
            platform: input.platform ?? null,
            token_hash: Hash.sha256(token),
            time_last_seen: now,
            time_created: now,
            time_updated: now,
          })
          .run()
          .pipe(Effect.orDie)
        return {
          device: new Info({
            id,
            name: input.name,
            kind: input.kind,
            platform: input.platform,
            time_created: now,
            time_updated: now,
            time_last_seen: now,
          }),
          token,
        }
      }),
      authenticate: Effect.fn("Device.authenticate")(function* (token) {
        const row = yield* db
          .select()
          .from(DeviceTable)
          .where(eq(DeviceTable.token_hash, Hash.sha256(token)))
          .get()
          .pipe(Effect.orDie)
        if (!row) return undefined
        if (Date.now() - row.time_last_seen > TOUCH_INTERVAL) {
          yield* db
            .update(DeviceTable)
            .set({ time_last_seen: Date.now() })
            .where(eq(DeviceTable.id, row.id))
            .run()
            .pipe(Effect.orDie)
        }
        return stored(row)
      }),
      remove: Effect.fn("Device.remove")(function* (id) {
        yield* db.delete(DeviceTable).where(eq(DeviceTable.id, id)).run().pipe(Effect.orDie)
      }),
    })
  }),
)

export const node = makeGlobalNode({ service: Service, layer, deps: [Database.node] })
