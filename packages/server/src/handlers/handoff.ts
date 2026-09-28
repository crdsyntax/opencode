import { Device } from "@opencode-ai/core/device"
import { Handoff } from "@opencode-ai/core/handoff"
import { UnauthorizedError } from "@opencode-ai/protocol/errors"
import { HandoffNotFoundError } from "@opencode-ai/protocol/groups/handoff"
import { DeviceNotFoundError } from "@opencode-ai/protocol/groups/device"
import { Effect } from "effect"
import { HttpServerRequest } from "effect/unstable/http"
import { HttpApiBuilder, HttpApiSchema } from "effect/unstable/httpapi"
import { Api } from "../api"
import { bearerToken } from "../middleware/authorization"

// The device-scoped routes take no device parameter: the target is resolved from the bearer
// token, so a paired device cannot read or answer another device's queue.
const caller = Effect.gen(function* () {
  const devices = yield* Device.Service
  const request = yield* HttpServerRequest.HttpServerRequest
  const token = bearerToken(request)
  if (!token) return yield* new UnauthorizedError({ message: "A device token is required" })
  const device = yield* devices.authenticate(token)
  if (!device) return yield* new UnauthorizedError({ message: "Device token is not recognized" })
  return device
})

export const HandoffHandler = HttpApiBuilder.group(Api, "server.handoff", (handlers) =>
  handlers
    .handle("handoff.send", ({ payload }) =>
      Effect.gen(function* () {
        const handoffs = yield* Handoff.Service
        const sent = yield* handoffs.send({
          sessionID: payload.sessionID,
          deviceID: payload.deviceID,
          note: payload.note,
        })
        if (!sent) return yield* new DeviceNotFoundError({ deviceID: payload.deviceID, message: "Device not found" })
        return sent
      }),
    )
    .handle("handoff.pending", () =>
      Effect.gen(function* () {
        const handoffs = yield* Handoff.Service
        return yield* handoffs.pending((yield* caller).id)
      }),
    )
    .handle("handoff.respond", ({ params, payload }) =>
      Effect.gen(function* () {
        const handoffs = yield* Handoff.Service
        const device = yield* caller
        const responded = yield* handoffs.respond(params.handoffID, payload.status)
        if (!responded || responded.deviceID !== device.id)
          return yield* new HandoffNotFoundError({ handoffID: params.handoffID, message: "Handoff not found" })
        return responded
      }),
    )
    .handle("handoff.dismiss", ({ params }) =>
      Effect.gen(function* () {
        const handoffs = yield* Handoff.Service
        if (!(yield* handoffs.dismiss(params.handoffID)))
          return yield* new HandoffNotFoundError({ handoffID: params.handoffID, message: "Handoff not found" })
        return HttpApiSchema.NoContent.make()
      }),
    ),
)
