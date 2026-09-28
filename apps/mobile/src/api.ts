import { fetch } from "expo/fetch"
import type { Device, DevicePairing, Handoff, Session } from "./contracts"
import { fromV1, fromV2, type ChatMessage, type Protocol } from "./protocol"
import { openSse } from "./sse"




export type Message = ChatMessage
export type { Device, DevicePairing, Handoff, Protocol, Session }


export type ModelOption = {
  readonly providerID: string
  readonly modelID: string
  readonly name: string
}

export class ApiError extends Error {
  readonly status: number
  readonly tag: string | undefined
  constructor(status: number, message: string, tag?: string) {
    super(message)
    this.name = "ApiError"
    this.status = status
    this.tag = tag
  }
}

export type Credentials =
  | { readonly kind: "password"; readonly username: string; readonly password: string }
  | { readonly kind: "device"; readonly token: string }

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"



function base64(input: string) {
  const bytes = new TextEncoder().encode(input)
  let output = ""
  for (let index = 0; index < bytes.length; index += 3) {
    const b0 = bytes[index]
    const b1 = bytes[index + 1]
    const b2 = bytes[index + 2]
    output += B64[b0 >> 2]
    output += B64[((b0 & 3) << 4) | ((b1 ?? 0) >> 4)]
    output += b1 === undefined ? "=" : B64[((b1 & 15) << 2) | ((b2 ?? 0) >> 6)]
    output += b2 === undefined ? "=" : B64[b2 & 63]
  }
  return output
}

export class Opencode {
  readonly baseUrl: string
  readonly directory: string | undefined
  private readonly credentials: Credentials | undefined
  private protocol: Protocol | undefined

  constructor(baseUrl: string, credentials?: Credentials, directory?: string, protocol?: Protocol) {
    this.baseUrl = baseUrl.replace(/\/+$/, "")
    this.credentials = credentials
    
    this.directory = directory?.trim() || undefined
    this.protocol = protocol
  }

  
  async detectProtocol(): Promise<Protocol> {
    if (this.protocol) return this.protocol
    const probe = async (path: string) => {
      try {
        const res = await fetch(`${this.baseUrl}${path}`, { headers: this.headers() })
        const text = await res.text()
        if (!res.ok || !res.headers.get("content-type")?.includes("application/json")) return undefined
        return JSON.parse(text) as Record<string, unknown>
      } catch {
        return undefined
      }
    }
    const legacy = await probe("/global/health")
    if (legacy?.healthy === true) return (this.protocol = "v1")
    this.protocol = "v2"
    return "v2"
  }



  private headers(anonymous?: boolean) {
    return {
      "Content-Type": "application/json",
      ...(!anonymous && this.authorization() ? { Authorization: this.authorization() } : {}),
      ...(this.directory ? { "x-opencode-directory": this.directory } : {}),
    }
  }

  private authorization() {
    if (!this.credentials) return undefined
    if (this.credentials.kind === "device") return `Bearer ${this.credentials.token}`
    return `Basic ${base64(`${this.credentials.username}:${this.credentials.password}`)}`
  }

  private async request<T>(path: string, init?: RequestInit & { anonymous?: boolean }): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: { ...this.headers(init?.anonymous), ...init?.headers },
    })
    if (!response.ok) {
      let message = response.statusText
      let tag: string | undefined
      try {
        const body = (await response.json()) as { _tag?: string; message?: string }
        if (body.message) message = body.message
        tag = body._tag
      } catch {
        
      }
      throw new ApiError(response.status, message, tag)
    }
    if (response.status === 204) return undefined as T
    return (await response.json()) as T
  }

  health() {
    return this.request<{ data: { healthy: boolean; version?: string } }>("/api/health")
  }

  async sessions(): Promise<readonly Session[]> {
    if ((await this.detectProtocol()) === "v1") {
      
      
      const legacy = await this.request<readonly unknown[]>("/session")
      return legacy.map((entry) => {
        const value = entry as Record<string, unknown>
        const time = (value.time ?? {}) as Record<string, unknown>
        return {
          id: String(value.id ?? ""),
          projectID: String(value.projectID ?? ""),
          title: String(value.title ?? ""),
          time: {
            created: typeof time.created === "number" ? time.created : 0,
            updated: typeof time.updated === "number" ? time.updated : 0,
          },
        }
      }) as unknown as readonly Session[]
    }
    return (await this.request<{ data: readonly Session[] }>("/api/session")).data
  }

  async createSession(): Promise<Session> {
    if ((await this.detectProtocol()) === "v1") {
      return (await this.request<Session>("/session", { method: "POST", body: JSON.stringify({}) })) as Session
    }
    return (await this.request<{ data: Session }>("/api/session", { method: "POST", body: JSON.stringify({}) }))
      .data
  }

  async messages(sessionID: string): Promise<ChatMessage[]> {
    const id = encodeURIComponent(sessionID)
    if ((await this.detectProtocol()) === "v1") {
      return fromV1(await this.request<unknown[]>(`/session/${id}/message`))
    }
    const response = await this.request<{ data: unknown[] }>(`/api/session/${id}/message?order=asc`)
    return fromV2(response.data)
  }

  async prompt(sessionID: string, text: string, model?: ModelOption) {
    const id = encodeURIComponent(sessionID)
    if ((await this.detectProtocol()) === "v1") {
      
      
      await this.request(`/session/${id}/message`, {
        method: "POST",
        body: JSON.stringify({
          parts: [{ type: "text", text }],
          ...(model ? { model: { providerID: model.providerID, modelID: model.modelID } } : {}),
        }),
      })
      return
    }
    await this.request(`/api/session/${id}/prompt`, {
      method: "POST",
      body: JSON.stringify({ prompt: { text } }),
    })
  }

  
  async models(): Promise<{ models: readonly ModelOption[]; fallback: ModelOption | undefined }> {
    const path = (await this.detectProtocol()) === "v1" ? "/config/providers" : "/api/config/providers"
    const body = await this.request<Record<string, unknown>>(path)
    const payload = (body.data && typeof body.data === "object" ? body.data : body) as Record<string, unknown>
    const providers = Array.isArray(payload.providers) ? (payload.providers as readonly Record<string, unknown>[]) : []
    const models: ModelOption[] = []
    for (const provider of providers) {
      const providerID = typeof provider.id === "string" ? provider.id : undefined
      if (!providerID) continue
      const catalog = provider.models
      
      const entries =
        Array.isArray(catalog)
          ? (catalog as readonly Record<string, unknown>[]).map((value) => [undefined, value] as const)
          : catalog && typeof catalog === "object"
            ? Object.entries(catalog as Record<string, unknown>)
            : []
      for (const [key, value] of entries) {
        if (!value || typeof value !== "object") continue
        const record = value as Record<string, unknown>
        const modelID = typeof record.id === "string" ? record.id : typeof key === "string" ? key : undefined
        if (!modelID) continue
        models.push({
          providerID,
          modelID,
          name: typeof record.name === "string" && record.name ? record.name : modelID,
        })
      }
    }
    models.sort((left, right) => left.providerID.localeCompare(right.providerID) || left.modelID.localeCompare(right.modelID))
    const defaults = (payload.default ?? {}) as Record<string, unknown>
    const [fallbackProvider, fallbackModel] = Object.entries(defaults)[0] ?? []
    const fallback =
      typeof fallbackProvider === "string" && typeof fallbackModel === "string"
        ? { providerID: fallbackProvider, modelID: fallbackModel, name: fallbackModel }
        : undefined
    return { models, fallback }
  }

  async interrupt(sessionID: string) {
    const id = encodeURIComponent(sessionID)
    if ((await this.detectProtocol()) === "v1") {
      await this.request(`/session/${id}/abort`, { method: "POST" })
      return
    }
    await this.request(`/api/session/${id}/interrupt`, { method: "POST" })
  }

  
  
  async pair(input: { code: string; name: string; kind: "mobile" | "desktop"; platform?: string }) {
    return await this.request<DevicePairing>("/api/device/pair", {
      method: "POST",
      body: JSON.stringify(input),
      anonymous: true,
    })
  }

  async pendingHandoffs() {
    return await this.request<readonly Handoff[]>("/api/handoff/pending")
  }

  
  
  async devices() {
    return await this.request<readonly Device[]>("/api/device")
  }

  async respondToHandoff(handoffID: string, status: "accepted" | "declined") {
    return await this.request<Handoff>(`/api/handoff/${encodeURIComponent(handoffID)}`, {
      method: "POST",
      body: JSON.stringify({ status }),
    })
  }

  async sendHandoff(sessionID: string, deviceID: string, note?: string) {
    return await this.request<Handoff>("/api/handoff", {
      method: "POST",
      body: JSON.stringify({ sessionID, deviceID, note }),
    })
  }

  async sessionStatus(): Promise<Record<string, string>> {
    if ((await this.detectProtocol()) === "v1") {
      return (await this.request<Record<string, string>>("/session/status")) as Record<string, string>
    }
    const response = await this.request<{ data?: Record<string, string> }>("/api/session/status")
    return response.data ?? {}
  }

  
  private streamHeaders() {
    return {
      ...(this.authorization() ? { Authorization: this.authorization() } : {}),
      ...(this.directory ? { "x-opencode-directory": this.directory } : {}),
    }
  }

  
  async subscribeEvents(
    signal: AbortSignal,
    onEvent: (event: { type: string; properties: Record<string, unknown> }) => void,
  ): Promise<void> {
    const protocol = await this.detectProtocol()
    const path = protocol === "v1" ? "/event" : "/api/event"
    return new Promise<void>((resolve, reject) => {
      openSse({
        url: `${this.baseUrl}${path}`,
        headers: this.streamHeaders(),
        signal,
        onFrame: (raw) => {
          let parsed: Record<string, unknown>
          try {
            parsed = JSON.parse(raw) as Record<string, unknown>
          } catch {
            return
          }
          
          const inner = (parsed.payload ?? parsed) as Record<string, unknown>
          const type = inner.type
          if (typeof type !== "string" || type === "sync") return
          const properties =
            protocol === "v1"
              ? ((inner.properties as Record<string, unknown>) ?? {})
              : ((inner.data as Record<string, unknown>) ?? {})
          onEvent({ type, properties })
        },
        onError: (cause) => reject(cause instanceof ApiError ? cause : new ApiError(0, String(cause))),
      })
      
      signal.addEventListener("abort", () => resolve(), { once: true })
    })
  }

  
  
  
  async subscribeSession(sessionID: string, signal: AbortSignal, onEvent: () => void): Promise<void> {
    const protocol = await this.detectProtocol()
    const path = protocol === "v1" ? "/event" : `/api/session/${encodeURIComponent(sessionID)}/event`
    return new Promise<void>((resolve, reject) => {
      openSse({
        url: `${this.baseUrl}${path}`,
        headers: this.streamHeaders(),
        signal,
        onFrame: () => onEvent(),
        onError: (cause) => reject(cause instanceof ApiError ? cause : new ApiError(0, String(cause))),
      })
      signal.addEventListener("abort", () => resolve(), { once: true })
    })
  }
}