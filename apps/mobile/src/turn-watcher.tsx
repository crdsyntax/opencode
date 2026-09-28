import { useEffect } from "react";
import { useConnection } from "./connection";
import type { ChatMessage } from "./protocol";
import { configureNotifications, notifyTurnFinished } from "./notifications";

let activeSession: string | undefined;

export function setActiveSession(sessionID: string | undefined) {
  activeSession = sessionID;
}

const SETTLE_MS = 1500;

function lastText(message: ChatMessage) {
  if (message.role !== "assistant") return undefined;
  for (let index = message.items.length - 1; index >= 0; index--) {
    const item = message.items[index];
    if (item.kind === "text" && item.text.trim()) return item.text;
  }
  return undefined;
}

export function TurnWatcher() {
  const { client } = useConnection();

  useEffect(() => {
    void configureNotifications();
  }, []);

  useEffect(() => {
    if (!client) return;
    const controller = new AbortController();
    const notified = new Set<string>();
    const timers = new Map<string, ReturnType<typeof setTimeout>>();
    const titles = new Map<string, string>();

    const titleFor = async (sessionID: string) => {
      const known = titles.get(sessionID);
      if (known) return known;
      try {
        const list = await client.sessions();
        for (const session of list) titles.set(session.id, session.title || session.id.slice(0, 8));
      } catch {
        return "Sesion";
      }
      return titles.get(sessionID) ?? "Sesion";
    };

    const settle = async (sessionID: string) => {
      try {
        const messages = await client.messages(sessionID);
        for (let index = messages.length - 1; index >= 0; index--) {
          const message = messages[index];
          if (message.role !== "assistant" || !message.completed) break;
          if (notified.has(message.id)) return;
          notified.add(message.id);
          if (/abort/i.test(message.error ?? "")) return;
          await notifyTurnFinished({
            sessionTitle: await titleFor(sessionID),
            outcome: message.error ? "failure" : "success",
            preview: lastText(message),
            errorText: message.error,
          });
          return;
        }
      } catch {
        return;
      }
    };

    const touch = (sessionID: string | undefined) => {
      if (!sessionID) return;
      const existing = timers.get(sessionID);
      if (existing) clearTimeout(existing);
      timers.set(
        sessionID,
        setTimeout(() => {
          timers.delete(sessionID);
          if (sessionID === activeSession) return;
          void settle(sessionID);
        }, SETTLE_MS),
      );
    };

    const sessionIDOf = (properties: Record<string, unknown>) => {
      const direct = properties.sessionID ?? properties.sessionId;
      if (typeof direct === "string") return direct;
      const info = properties.info as Record<string, unknown> | undefined;
      return typeof info?.sessionID === "string" ? (info.sessionID as string) : undefined;
    };

    void client
      .subscribeEvents(controller.signal, (event) => {
        if (!event.type.startsWith("message.")) return;
        touch(sessionIDOf(event.properties));
      })
      .catch(() => undefined);

    return () => {
      controller.abort();
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
    };
  }, [client]);

  return null;
}
