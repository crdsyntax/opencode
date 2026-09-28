import { Handoff } from "@opencode-ai/schema/handoff"
import { UnauthorizedError } from "../errors"
import { DeviceNotFoundError } from "./device"
import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema, OpenApi } from "effect/unstable/httpapi"

const root = "/api/handoff"

export class HandoffNotFoundError extends Schema.TaggedErrorClass<HandoffNotFoundError>()(
  "HandoffNotFoundError",
  {
    handoffID: Handoff.ID,
    message: Schema.String,
  },
  { httpApiStatus: 404 },
) {}

const RespondPayload = Schema.Struct({
  status: Schema.Literals(["accepted", "declined"]),
}).annotate({ identifier: "Handoff.RespondPayload" })

export const HandoffGroup = HttpApiGroup.make("server.handoff")
  .add(
    HttpApiEndpoint.post("handoff.send", root, {
      payload: Handoff.Send,
      success: Handoff.Info,
      error: DeviceNotFoundError,
    }).annotateMerge(
      OpenApi.annotations({
        identifier: "v2.handoff.send",
        summary: "Send a session to a device",
        description: "Addresses a session to a paired device, which picks it up from its pending queue.",
      }),
    ),
  )
  .add(
    HttpApiEndpoint.get("handoff.pending", `${root}/pending`, {
      success: Schema.Array(Handoff.Info),
      error: [HandoffNotFoundError, UnauthorizedError],
    }).annotateMerge(
      OpenApi.annotations({
        identifier: "v2.handoff.pending",
        summary: "List handoffs awaiting this device",
        description: "Resolves the target device from the bearer token rather than a request parameter.",
      }),
    ),
  )
  .add(
    HttpApiEndpoint.post("handoff.respond", `${root}/:handoffID`, {
      params: { handoffID: Handoff.ID },
      payload: RespondPayload,
      success: Handoff.Info,
      error: [HandoffNotFoundError, UnauthorizedError],
    }).annotateMerge(
      OpenApi.annotations({
        identifier: "v2.handoff.respond",
        summary: "Accept or decline a handoff",
      }),
    ),
  )
  .add(
    HttpApiEndpoint.delete("handoff.dismiss", `${root}/:handoffID`, {
      params: { handoffID: Handoff.ID },
      success: HttpApiSchema.NoContent,
      error: HandoffNotFoundError,
    }).annotateMerge(
      OpenApi.annotations({
        identifier: "v2.handoff.dismiss",
        summary: "Dismiss a handoff",
      }),
    ),
  )
  .annotateMerge(OpenApi.annotations({ title: "handoff", description: "Session handoff between desktop and mobile." }))
