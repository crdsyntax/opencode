import { ServerConnection } from "@/context/server"
import { pairDevice, requestDeviceOffer } from "@/utils/device-handoff"

export type DeviceIdentity = {
  readonly id: string
  readonly token: string
}

const STORAGE_PREFIX = "opencode.handoff.device."

// A paired device token is issued once and then reused, so a desktop that restarts does not
// register a new device row on every launch. The key is a stable identity rather than the URL
// because a local sidecar is assigned a fresh port on each start.
function cacheKey(server: ServerConnection.HttpBase) {
  let host: string
  try {
    host = new URL(server.url).hostname
  } catch {
    return server.url
  }
  if (host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]") return "local"
  return server.url.replace(/\/+$/, "")
}

export function loadDeviceIdentity(server: ServerConnection.HttpBase): DeviceIdentity | undefined {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_PREFIX + cacheKey(server))
    if (!raw) return undefined
    const parsed = JSON.parse(raw) as Partial<DeviceIdentity>
    if (typeof parsed.id !== "string" || typeof parsed.token !== "string") return undefined
    return { id: parsed.id, token: parsed.token }
  } catch {
    return undefined
  }
}

function storeDeviceIdentity(server: ServerConnection.HttpBase, identity: DeviceIdentity) {
  try {
    globalThis.localStorage?.setItem(STORAGE_PREFIX + cacheKey(server), JSON.stringify(identity))
  } catch {
    // A storage failure only costs an extra registration next time.
  }
}

export function forgetDeviceIdentity(server: ServerConnection.HttpBase) {
  try {
    globalThis.localStorage?.removeItem(STORAGE_PREFIX + cacheKey(server))
  } catch {
    // Nothing to do.
  }
}

/**
 * Registers this client as a paired device the first time it needs a device-scoped capability.
 *
 * The desktop already holds the server password, so it can mint a pairing code and redeem it
 * exactly like a phone would. That is what gives it a `deviceID`, which is the only way a handoff
 * can be addressed to it.
 */
export async function ensureDeviceIdentity(
  server: ServerConnection.HttpBase,
  platformFetch: typeof fetch | undefined,
  name: string,
): Promise<DeviceIdentity | undefined> {
  const cached = loadDeviceIdentity(server)
  if (cached) return cached
  const offer = await requestDeviceOffer(server, platformFetch)
  const paired = await pairDevice(server, platformFetch, {
    code: offer.code,
    name,
    kind: "desktop",
    platform: "windows",
  })
  const identity = { id: paired.device.id, token: paired.token }
  storeDeviceIdentity(server, identity)
  return identity
}
