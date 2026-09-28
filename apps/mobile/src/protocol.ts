

export type Protocol = "v1" | "v2"

export type ChatItem =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "reasoning"; readonly text: string }
  | { readonly kind: "tool"; readonly name: string; readonly status: string; readonly title?: string }

export type ChatMessage =
  | { readonly id: string; readonly role: "user"; readonly time: number; readonly text: string }
  | {
      readonly id: string
      readonly role: "assistant"
      readonly time: number
      
      readonly completed?: number
      readonly agent?: string
      readonly items: readonly ChatItem[]
      readonly error?: string
    }
  | { readonly id: string; readonly role: "system"; readonly time: number; readonly text: string }

type Json = Record<string, unknown>

const asArray = (value: unknown): readonly Json[] => (Array.isArray(value) ? (value as Json[]) : [])
const asString = (value: unknown) => (typeof value === "string" ? value : "")
const asNumber = (value: unknown) => (typeof value === "number" ? value : 0)

function createdAt(value: unknown): number {
  const time = (value as Json | undefined)?.time as Json | undefined
  return asNumber(time?.created)
}

function completedAt(value: unknown): number | undefined {
  const time = (value as Json | undefined)?.time as Json | undefined
  const completed = asNumber(time?.completed)
  return completed > 0 ? completed : undefined
}

function toolTitle(part: Json): string | undefined {
  const state = part.state as Json | undefined
  const title = asString(state?.title)
  return title.length > 0 ? title : undefined
}


export function fromV1(payload: readonly unknown[]): ChatMessage[] {
  const out: ChatMessage[] = []
  for (const entry of payload) {
    const message = entry as Json
    const info = (message.info ?? {}) as Json
    const role = asString(info.role)
    const id = asString(info.id)
    const time = createdAt(info)
    const parts = asArray(message.parts)

    if (role === "user") {
      
      const text = parts
        .filter((part) => part.type === "text")
        .map((part) => asString(part.text))
        .join("")
      out.push({ id, role: "user", time, text })
      continue
    }

    if (role !== "assistant") continue

    const items: ChatItem[] = []
    for (const part of parts) {
      const type = asString(part.type)
      if (type === "text") {
        const text = asString(part.text)
        if (text) items.push({ kind: "text", text })
      } else if (type === "reasoning") {
        const text = asString(part.text)
        if (text) items.push({ kind: "reasoning", text })
      } else if (type === "tool") {
        const state = (part.state ?? {}) as Json
        items.push({
          kind: "tool",
          name: asString(part.tool) || "tool",
          status: asString(state.status) || "pending",
          title: toolTitle(part),
        })
      }
    }
    const error = info.error as Json | undefined
    out.push({
      id,
      role: "assistant",
      time,
      completed: completedAt(info),
      agent: asString(info.agent) || undefined,
      items,
      error: error ? asString(error.message) || "error" : undefined,
    })
  }
  return out
}


export function fromV2(payload: readonly unknown[]): ChatMessage[] {
  const out: ChatMessage[] = []
  for (const raw of payload) {
    const message = raw as Json
    const type = asString(message.type)
    const id = asString(message.id)
    const time = createdAt(message)

    if (type === "user") {
      out.push({ id, role: "user", time, text: asString(message.text) })
      continue
    }
    if (type === "system" || type === "synthetic") {
      out.push({ id, role: "system", time, text: asString(message.text) })
      continue
    }
    if (type !== "assistant") continue

    const items: ChatItem[] = []
    for (const raw2 of asArray(message.content)) {
      const content = raw2 as Json
      const kind = asString(content.type)
      if (kind === "text") {
        const text = asString(content.text)
        if (text) items.push({ kind: "text", text })
      } else if (kind === "reasoning") {
        const text = asString(content.text)
        if (text) items.push({ kind: "reasoning", text })
      } else if (kind === "tool") {
        const state = (content.state ?? {}) as Json
        items.push({
          kind: "tool",
          name: asString(content.name) || "tool",
          status: asString(state.status) || "pending",
          title: toolTitle(content),
        })
      }
    }
    const error = message.error as Json | undefined
    out.push({
      id,
      role: "assistant",
      time,
      completed: completedAt(message),
      agent: asString(message.agent) || undefined,
      items,
      error: error ? asString(error.message) || "error" : undefined,
    })
  }
  return out
}
