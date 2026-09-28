import { Button } from "@opencode-ai/ui/button"
import { Dialog } from "@opencode-ai/ui/dialog"
import { useMutation } from "@tanstack/solid-query"
import { useNavigate } from "@solidjs/router"
import { createResource, For, Show } from "solid-js"
import { useCommand } from "@/context/command"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { useServer } from "@/context/server"
import { dismissHandoff, HandoffRequestError, listPendingHandoffs, respondToHandoff } from "@/utils/device-handoff"
import { ensureDeviceIdentity, forgetDeviceIdentity } from "@/utils/device-registration"
import { showToast } from "@/utils/toast"

/**
 * Registers the handoff inbox in the command palette.
 *
 * Both layouts need it: the legacy layout registers its own command set from `pages/layout.tsx`,
 * while the new one (`pages/layout-new.tsx`, the default since `newLayoutDesignsDefault = true`)
 * does not. Sharing the hook keeps a single definition instead of two that can drift.
 */
export function useHandoffCommand() {
  const language = useLanguage()
  const command = useCommand()
  const dialog = useDialog()
  command.register("handoff", () => [
    {
      id: "handoff.open",
      title: language.t("handoff.inbox.title"),
      category: language.t("command.category.server"),
      onSelect: () => {
        void import("@/components/dialog-handoffs").then((x) => {
          void dialog.show(() => <x.DialogHandoffs />)
        })
      },
    },
  ])
}

export function DialogHandoffs() {
  const language = useLanguage()
  const platform = usePlatform()
  const server = useServer()
  const navigate = useNavigate()

  // These routes only exist on servers built from this fork. A stock server answers 404 or 401,
  // which is reported as an empty inbox because handoff is an optional capability. Pairing happens
  // on demand, because a handoff cannot be addressed to this client until it has a device id.
  const [handoffs, { refetch }] = createResource(
    () => server.current?.http,
    async (http) => {
      try {
        const identity = await ensureDeviceIdentity(http, platform.fetch, language.t("handoff.device.desktop"))
        if (!identity) return []
        return await listPendingHandoffs(http, platform.fetch, identity.token)
      } catch (cause) {
        if (cause instanceof HandoffRequestError && (cause.status === 404 || cause.status === 401)) {
          forgetDeviceIdentity(http)
          return []
        }
        throw cause
      }
    },
  )

  const respond = useMutation(() => ({
    mutationFn: async (input: { id: string; status: "accepted" | "declined"; sessionID: string }) => {
      const http = server.current?.http
      if (!http) return
      const identity = await ensureDeviceIdentity(http, platform.fetch, language.t("handoff.device.desktop"))
      if (!identity) return
      await respondToHandoff(http, platform.fetch, input.id, input.status, identity.token)
      if (input.status === "declined") return
      await dismissHandoff(http, platform.fetch, input.id).catch(() => undefined)
      navigate(`/session/${input.sessionID}`)
    },
    onError: (cause: Error) => {
      showToast({ title: language.t("handoff.inbox.failed"), description: cause.message })
    },
    onSuccess: () => void refetch(),
  }))

  return (
    <Dialog title={language.t("handoff.inbox.title")}>
      <Show
        when={handoffs()}
        fallback={<div class="flex justify-center py-8 text-text-weak">{language.t("common.loading")}</div>}
      >
        {(items) => (
          <div class="flex flex-col gap-2 px-1 py-1">
            <Show
              when={items().length > 0}
              fallback={
                <div class="px-4 py-8 text-center text-text-weak">{language.t("handoff.inbox.empty")}</div>
              }
            >
              <For each={items()}>
                {(handoff) => (
                  <div class="flex items-center justify-between gap-4 rounded-md border border-border-base px-4 py-3">
                    <div class="flex min-w-0 flex-col gap-0.5">
                      <div class="truncate text-text-strong">{handoff.deviceName}</div>
                      <Show when={handoff.note}>{(note) => <div class="truncate text-text-weak">{note()}</div>}</Show>
                    </div>
                    <div class="flex shrink-0 items-center gap-2">
                      <Button
                        size="small"
                        onClick={() => respond.mutate({ id: handoff.id, status: "accepted", sessionID: handoff.sessionID })}
                      >
                        {language.t("handoff.inbox.accept")}
                      </Button>
                      <Button
                        size="small"
                        variant="ghost"
                        onClick={() => respond.mutate({ id: handoff.id, status: "declined", sessionID: handoff.sessionID })}
                      >
                        {language.t("handoff.inbox.decline")}
                      </Button>
                    </div>
                  </div>
                )}
              </For>
            </Show>
          </div>
        )}
      </Show>
    </Dialog>
  )
}
