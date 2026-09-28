import { Device } from "@opencode-ai/schema/device"
import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema, OpenApi } from "effect/unstable/httpapi"

const root = "/api/device"

export class DeviceError extends Schema.TaggedErrorClass<DeviceError>()(
  "DeviceError",
  {
    message: Schema.String,
  },
  { httpApiStatus: 400 },
) {}

export class DeviceNotFoundError extends Schema.TaggedErrorClass<DeviceNotFoundError>()(
  "DeviceNotFoundError",
  {
    deviceID: Device.ID,
    message: Schema.String,
  },
  { httpApiStatus: 404 },
) {}

const PairPayload = Schema.Struct({
  code: Schema.String,
  name: Schema.String,
  kind: Device.Kind,
  platform: Schema.optional(Schema.String),
}).annotate({ identifier: "Device.PairPayload" })

export const DeviceGroup = HttpApiGroup.make("server.device")
  .add(
    HttpApiEndpoint.get("device.list", root, {
      success: Schema.Array(Device.Info),
      error: DeviceError,
    }).annotateMerge(
      OpenApi.annotations({
        identifier: "v2.device.list",
        summary: "List paired devices",
        description: "Returns every device that has redeemed a pairing code, most recently seen first.",
      }),
    ),
  )
  .add(
    HttpApiEndpoint.post("device.offer", `${root}/offer`, {
      success: Device.Offer,
      error: DeviceError,
    }).annotateMerge(
      OpenApi.annotations({
        identifier: "v2.device.offer",
        summary: "Create a pairing code",
        description:
          "Issues a short-lived single-use code. Render it as a QR code and scan it from the device that should be paired.",
      }),
    ),
  )
  .add(
    // Intentionally reachable without credentials: redeeming a pairing code is the trust
    // bootstrap. The code is short-lived, single-use, and only obtainable by a caller that
    // already has server access.
    HttpApiEndpoint.post("device.pair", `${root}/pair`, {
      payload: PairPayload,
      success: Device.Paired,
      error: DeviceError,
    }).annotateMerge(
      OpenApi.annotations({
        identifier: "v2.device.pair",
        summary: "Redeem a pairing code",
        description: "Exchanges a pairing code for a persisted device and its one-time bearer token.",
      }),
    ),
  )
  .add(
    HttpApiEndpoint.delete("device.remove", `${root}/:deviceID`, {
      params: { deviceID: Device.ID },
      success: HttpApiSchema.NoContent,
      error: DeviceNotFoundError,
    }).annotateMerge(
      OpenApi.annotations({
        identifier: "v2.device.remove",
        summary: "Remove a paired device",
        description: "Removes a device and cascades to handoffs addressed to it.",
      }),
    ),
  )
  .annotateMerge(OpenApi.annotations({ title: "device", description: "Paired device registry and pairing routes." }))
