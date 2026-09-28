import { Button } from "@opencode-ai/ui/button"
import { Dialog } from "@opencode-ai/ui/dialog"
import { useMutation } from "@tanstack/solid-query"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { createResource, For, Show } from "solid-js"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { useServer } from "@/context/server"
import { HandoffRequestError, listDevices, sendHandoff, type PairedDevice } from "@/utils/device-handoff"
import { ensureDeviceIdentity } from "@/utils/device-registration"
import { showToast } from "@/utils/toast"

/**
 * Offers the paired devices a session can be handed to.
 *
 * The device list is server-scoped and reachable with the shared password, so this works even
 * before this client has registered itself. The local device is filtered out because handing a
 * session to the machine it already runs on is a no-op.
 */
export function DialogSendSession(props: { sessionID: string }) {
  const language = useLanguage()
  const platform = usePlatform()
  const server = useServer()
  const dialog = useDialog()

  const [devices] = createResource(
    () => server.current?.http,
    async (http) => {
      const own = await ensureDeviceIdentity(http, platform.fetch, language.t("handoff.device.desktop")).catch(
        () => undefined,
      )
      return await listDevices(http, platform.fetch).then((list) =>
        own ? list.filter((device) => device.id !== own.id) : list,
      )
    },
  )

  const send = useMutation(() => ({
    mutationFn: async (device: PairedDevice) => {
      const http = server.current?.http
      if (!http) throw new Error(language.t("handoff.action.sendFailed"))
      await sendHandoff(http, platform.fetch, { sessionID: props.sessionID, deviceID: device.id })
      return device
    },
    onSuccess: (device) => {
      showToast({
        variant: "success",
        icon: "circle-check",
        title: language.t("handoff.action.send"),
        description: device.name,
      })
      dialog.close()
    },
    onError: (cause: Error) => {
      showToast({ title: language.t("handoff.action.sendFailed"), description: cause.message })
    },
  }))

  const unavailable = (cause: unknown) =>
    cause instanceof HandoffRequestError && (cause.status === 404 || cause.status === 401)

  return (
    <Dialog title={language.t("handoff.action.send")}>
      <Show when={!unavailable(devices.error)} fallback={<Message text={language.t("handoff.inbox.unavailable")} />}>
        <Show when={devices()} fallback={<Message text={language.t("common.loading")} />}>
          {(items) => (
            <div class="flex flex-col gap-2 px-1 py-1">
              <Show when={items().length > 0} fallback={<Message text={language.t("palette.empty")} />}>
                <For each={items()}>
                  {(device) => (
                    <div class="flex items-center justify-between gap-4 rounded-md border border-border-base px-4 py-3">
                      <div class="flex min-w-0 flex-col gap-0.5">
                        <div class="truncate text-text-strong">{device.name}</div>
                      </div>
                      <Button size="small" disabled={send.isPending} onClick={() => send.mutate(device)}>
                        {language.t("handoff.action.send")}
                      </Button>
                    </div>
                  )}
                </For>
              </Show>
            </div>
          )}
        </Show>
      </Show>
    </Dialog>
  )
}

function Message(props: { text: string }) {
  return <div class="px-4 py-8 text-center text-text-weak">{props.text}</div>
}
