import { ServerAuth } from "../auth"
import { UnauthorizedError } from "@opencode-ai/protocol/errors"
import { Authorization } from "@opencode-ai/protocol/middleware/authorization"
export { Authorization } from "@opencode-ai/protocol/middleware/authorization"
import { hasPtyConnectTicketURL } from "@opencode-ai/protocol/groups/pty"
import { Device } from "@opencode-ai/core/device"
import { Effect, Encoding, Layer, Redacted } from "effect"
import { HttpEffect, HttpServerRequest, HttpServerResponse } from "effect/unstable/http"

const AUTH_TOKEN_QUERY = "auth_token"
const WWW_AUTHENTICATE = 'Basic realm="Secure Area"'
// Redeeming a pairing code is the trust bootstrap: an unpaired device has no credentials yet, so
// this route stays reachable. The code itself is short-lived, single-use, and can only be minted
// by a caller that already passes authorization.
const PAIR_PATH = "/api/device/pair"

function emptyCredential() {
  return { username: "", password: Redacted.make("") }
}

function decodeCredential(input: string) {
  return Effect.fromResult(Encoding.decodeBase64String(input)).pipe(
    Effect.match({
      onFailure: emptyCredential,
      onSuccess: (header) => {
        const separator = header.indexOf(":")
        if (separator === -1) return emptyCredential()
        return { username: header.slice(0, separator), password: Redacted.make(header.slice(separator + 1)) }
      },
    }),
  )
}

function credentialFromRequest(request: HttpServerRequest.HttpServerRequest) {
  const url = new URL(request.url, "http://localhost")
  const token = url.searchParams.get(AUTH_TOKEN_QUERY)
  if (token) return decodeCredential(token)
  const match = /^Basic\s+(.+)$/i.exec(request.headers.authorization ?? "")
  if (match) return decodeCredential(match[1])
  return Effect.succeed(emptyCredential())
}

export function bearerToken(request: HttpServerRequest.HttpServerRequest) {
  const match = /^Bearer\s+(.+)$/i.exec(request.headers.authorization ?? "")
  return match ? match[1] : undefined
}

export const authorizationLayer = Layer.effect(
  Authorization,
  Effect.gen(function* () {
    const config = yield* ServerAuth.Config
    const devices = yield* Device.Service
    if (!ServerAuth.required(config)) return Authorization.of((effect) => effect)
    return Authorization.of((effect) =>
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest
        const url = new URL(request.url, "http://localhost")
        // Browsers cannot set headers on WebSocket upgrades, so a ticketed PTY connect skips
        // credential checks here; the connect handler consumes and validates the ticket.
        if (hasPtyConnectTicketURL(url)) return yield* effect
        if (url.pathname === PAIR_PATH) return yield* effect
        const credential = yield* credentialFromRequest(request)
        if (ServerAuth.authorized(credential, config)) return yield* effect
        // A paired device authenticates with its own long-lived token, so the shared password
        // never has to leave the machine that owns the server.
        const token = bearerToken(request)
        if (token && (yield* devices.authenticate(token))) return yield* effect
        yield* HttpEffect.appendPreResponseHandler((_request, response) =>
          Effect.succeed(HttpServerResponse.setHeader(response, "www-authenticate", WWW_AUTHENTICATE)),
        )
        return yield* new UnauthorizedError({ message: "Authentication required" })
      }),
    )
  }),
)
