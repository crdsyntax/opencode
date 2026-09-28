import { Device } from "@opencode-ai/core/device"
import { Effect } from "effect"
import { HttpApiBuilder, HttpApiSchema } from "effect/unstable/httpapi"
import { Api } from "../api"
import { DeviceError, DeviceNotFoundError } from "@opencode-ai/protocol/groups/device"

export const DeviceHandler = HttpApiBuilder.group(Api, "server.device", (handlers) =>
  handlers
    .handle("device.list", () =>
      Effect.gen(function* () {
        const devices = yield* Device.Service
        return yield* devices.all()
      }),
    )
    .handle("device.offer", () =>
      Effect.gen(function* () {
        const devices = yield* Device.Service
        return yield* devices.offer()
      }),
    )
    .handle("device.pair", ({ payload }) =>
      Effect.gen(function* () {
        const devices = yield* Device.Service
        const paired = yield* devices.redeem(payload.code, {
          name: payload.name,
          kind: payload.kind,
          platform: payload.platform,
        })
        if (!paired) return yield* new DeviceError({ message: "Pairing code is invalid or has expired" })
        return paired
      }),
    )
    .handle("device.remove", ({ params }) =>
      Effect.gen(function* () {
        const devices = yield* Device.Service
        if (!(yield* devices.get(params.deviceID)))
          return yield* new DeviceNotFoundError({ deviceID: params.deviceID, message: "Device not found" })
        yield* devices.remove(params.deviceID)
        return HttpApiSchema.NoContent.make()
      }),
    ),
)
