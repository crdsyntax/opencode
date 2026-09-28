import { ServerConnection } from "@/context/server"

// These mirror the wire shapes declared by `server.device` and `server.handoff` in the HttpApi.
// They are declared locally because the app pins an older vendored client tarball that predates
// those groups; once the vendored client is regenerated these should be imported from
// `@opencode-ai/client` instead. See docs/device-pairing-handoff.md.
export type PairedDevice = {
  readonly id: string
  readonly name: string
  readonly kind: "mobile" | "desktop"
  readonly platform?: string
  readonly time_created: number
  readonly time_updated: number
  readonly time_last_seen: number
}

export type SessionHandoff = {
  readonly id: string
  readonly sessionID: string
  readonly deviceID: string
  readonly deviceName: string
  readonly status: "pending" | "accepted" | "declined"
  readonly note?: string
  readonly time_created: number
  readonly time_updated: number
}

export class HandoffRequestError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = "HandoffRequestError"
    this.status = status
  }
}

function fetcher(platformFetch?: typeof fetch) {
  return platformFetch ?? globalThis.fetch
}

async function request<T>(
  server: ServerConnection.HttpBase,
  platformFetch: typeof fetch | undefined,
  path: string,
  init?: RequestInit,
  bearer?: string,
) {
  const base = server.url.replace(/\/+$/, "")
  // Device-scoped routes resolve the caller from a bearer token, so those calls must not fall
  // back to the shared password even when one is configured.
  const credentials = bearer ? `Bearer ${bearer}` : server.password ? basicHeader(server) : undefined
  const response = await fetcher(platformFetch)(`${base}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(credentials ? { Authorization: credentials } : {}),
      ...init?.headers,
    },
  })
  if (!response.ok) {
    let message = response.statusText
    try {
      const body = (await response.json()) as { message?: string }
      if (body.message) message = body.message
    } catch {
      // Non-JSON error body; the status text is the best detail available.
    }
    throw new HandoffRequestError(response.status, message)
  }
  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

function basicHeader(server: ServerConnection.HttpBase) {
  return `Basic ${btoa(`${server.username ?? "opencode"}:${server.password}`)}`
}

export function listDevices(server: ServerConnection.HttpBase, platformFetch?: typeof fetch) {
  return request<readonly PairedDevice[]>(server, platformFetch, "/api/device")
}

/**
 * A pairing offer as returned by `POST /api/device/offer`.
 *
 * `addresses` are the host's own non-internal IPv4 addresses with no port and no scheme, and it
 * may legitimately be empty (a machine with only a VPN or WSL interface). A phone cannot dial the
 * loopback address the desktop uses for itself, so a pairing target has to be composed by pairing
 * one of these addresses with the port from the server URL.
 */
export type DeviceOffer = {
  code: string
  expires_in: number
  addresses?: readonly string[]
}

export function requestDeviceOffer(server: ServerConnection.HttpBase, platformFetch?: typeof fetch) {
  return request<DeviceOffer>(server, platformFetch, "/api/device/offer", { method: "POST" })
}

/**
 * Builds the addresses a paired device can actually dial for `server`.
 *
 * Each candidate keeps the scheme and port of the server URL and swaps only the host, so the
 * ephemeral sidecar port survives. Loopback URLs are excluded because they resolve to the phone
 * itself, not to this machine.
 */
export function pairingTargets(server: ServerConnection.HttpBase, addresses: readonly string[] | undefined) {
  const base = server.url.replace(/\/+$/, "")
  let port: string | undefined
  let scheme = "http"
  try {
    const parsed = new URL(base)
    scheme = parsed.protocol.replace(/:$/, "")
    port = parsed.port || (scheme === "https" ? "443" : "80")
  } catch {
    port = undefined
  }
  if (!port) return [] as string[]
  return (addresses ?? [])
    .filter((address) => address && address !== "127.0.0.1" && address !== "localhost" && address !== "::1")
    .map((address) => `${scheme}://${address}:${port}`)
}

export function pairDevice(
  server: ServerConnection.HttpBase,
  platformFetch: typeof fetch | undefined,
  input: { code: string; name: string; kind: "mobile" | "desktop"; platform?: string },
) {
  return request<{ device: PairedDevice; token: string }>(server, platformFetch, "/api/device/pair", {
    method: "POST",
    body: JSON.stringify(input),
  })
}

export function sendHandoff(
  server: ServerConnection.HttpBase,
  platformFetch: typeof fetch | undefined,
  input: { sessionID: string; deviceID: string; note?: string },
) {
  return request<SessionHandoff>(server, platformFetch, "/api/handoff", {
    method: "POST",
    body: JSON.stringify(input),
  })
}

export function listPendingHandoffs(server: ServerConnection.HttpBase, platformFetch: typeof fetch | undefined, token: string) {
  return request<readonly SessionHandoff[]>(server, platformFetch, "/api/handoff/pending", undefined, token)
}

export function respondToHandoff(
  server: ServerConnection.HttpBase,
  platformFetch: typeof fetch | undefined,
  handoffID: string,
  status: "accepted" | "declined",
  token: string,
) {
  return request<SessionHandoff>(
    server,
    platformFetch,
    `/api/handoff/${encodeURIComponent(handoffID)}`,
    { method: "POST", body: JSON.stringify({ status }) },
    token,
  )
}

export function dismissHandoff(server: ServerConnection.HttpBase, platformFetch: typeof fetch | undefined, handoffID: string) {
  return request<void>(server, platformFetch, `/api/handoff/${encodeURIComponent(handoffID)}`, { method: "DELETE" })
}
