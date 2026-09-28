

export type Session = {
  readonly id: string
  readonly title: string
  readonly time: { readonly created: number; readonly updated: number }
}

export type Device = {
  readonly id: string
  readonly name: string
  readonly kind: "mobile" | "desktop"
  readonly platform?: string
  readonly time_created: number
  readonly time_updated: number
  readonly time_last_seen: number
}

export type DevicePairing = {
  readonly device: Device
  
  readonly token: string
}

export type Handoff = {
  readonly id: string
  readonly sessionID: string
  readonly deviceID: string
  readonly deviceName: string
  readonly status: "pending" | "accepted" | "declined"
  readonly note?: string
  readonly time_created: number
  readonly time_updated: number
}
