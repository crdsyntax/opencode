import { ButtonV2 } from "@opencode-ai/ui/v2/button-v2"
import { Dialog, DialogBody, DialogFooter, DialogHeader, DialogTitle } from "@opencode-ai/ui/v2/dialog-v2"
import { useMutation } from "@tanstack/solid-query"
import QRCode from "qrcode"
import { createEffect, createMemo, createSignal, For, onCleanup, Show } from "solid-js"
import { useCommand } from "@/context/command"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { useServer } from "@/context/server"
import { HandoffRequestError, pairingTargets, requestDeviceOffer } from "@/utils/device-handoff"

/**
 * Registers "pair a device" in the command palette.
 *
 * Both layouts need it, for the same reason the handoff inbox does: the legacy layout registers
 * its own command set from `pages/layout.tsx` and the new one does not, so the hook is shared to
 * keep a single definition instead of two that can drift.
 */
export function usePairDeviceCommand() {
  const language = useLanguage()
  const command = useCommand()
  const dialog = useDialog()
  command.register("pair-device", () => [
    {
      id: "device.pair.open",
      title: language.t("device.pair.title"),
      category: language.t("command.category.server"),
      onSelect: () => {
        void import("@/components/dialog-pair-device").then((x) => {
          void dialog.show(() => <x.DialogPairDevice />)
        })
      },
    },
  ])
}

/**
 * A phone needs two things to pair: where the server is and which code to redeem. Both go in one
 * deep link so a single scan is enough. The phone also still accepts the code typed by hand, so
 * the link is a convenience rather than the only path.
 */
function pairingLink(target: string, code: string) {
  return `opencode://pair?url=${encodeURIComponent(target)}&code=${encodeURIComponent(code)}`
}

export function DialogPairDevice() {
  const language = useLanguage()
  const platform = usePlatform()
  const server = useServer()
  const dialog = useDialog()
  const [remaining, setRemaining] = createSignal(0)

  const offer = useMutation(() => ({
    mutationFn: async () => {
      const http = server.current?.http
      if (!http) throw new Error(language.t("device.pair.failed"))
      return await requestDeviceOffer(http, platform.fetch)
    },
  }))

  // The code is single-use and short-lived (five minutes server side), so the dialog counts it
  // down and mints a fresh one when it lapses rather than leaving a dead QR on screen.
  createEffect(() => {
    const seconds = offer.data?.expires_in
    if (!seconds) return
    setRemaining(seconds)
    const timer = setInterval(() => setRemaining((value) => Math.max(0, value - 1)), 1000)
    onCleanup(() => clearInterval(timer))
  })

  const targets = createMemo(() => {
    const data = offer.data
    if (!data) return [] as string[]
    return pairingTargets(server.current!.http, data.addresses)
  })

  const links = createMemo(() => {
    const data = offer.data
    if (!data) return [] as { target: string; link: string }[]
    return targets().map((target) => ({ target, link: pairingLink(target, data.code) }))
  })

  // A stock server without the pairing routes answers 404, and one with a different password
  // answers 401. Pairing is an optional capability, so that reads as "not available" rather than
  // as a failure worth showing a stack trace for.
  const unavailable = createMemo(() => {
    const error = offer.error
    if (!error) return false
    return error instanceof HandoffRequestError && (error.status === 404 || error.status === 401)
  })

  const render = () => {
    offer.reset()
    offer.mutate()
  }
  render()

  return (
    <Dialog fit>
      <DialogHeader>
        <DialogTitle>{language.t("device.pair.title")}</DialogTitle>
      </DialogHeader>
      <DialogBody class="flex w-full flex-col gap-4 px-4 pt-4 pb-1">
        <Show when={unavailable()}>
          <p class="text-[13px] leading-5 text-v2-text-text-muted">{language.t("device.pair.unavailable")}</p>
        </Show>

        <Show when={!unavailable() && (offer.isPending || (!offer.data && !offer.error))}>
          <p class="text-[13px] leading-5 text-v2-text-text-muted">{language.t("device.pair.loading")}</p>
        </Show>

        <Show when={offer.error && !unavailable()}>
          <p role="alert" class="text-[13px] leading-5 text-v2-state-fg-danger">
            {offer.error instanceof Error ? offer.error.message : language.t("device.pair.failed")}
          </p>
        </Show>

        <Show when={offer.data && !unavailable()}>
          <p class="text-[13px] leading-5 text-v2-text-text-muted">{language.t("device.pair.instructions")}</p>

          <Show
            when={links().length > 0}
            fallback={
              <p role="alert" class="text-[13px] leading-5 text-v2-state-fg-danger">
                {language.t("device.pair.noAddress")}
              </p>
            }
          >
            <div class="flex flex-col items-center gap-4">
              <For each={links()}>
                {(entry) => (
                  <div class="flex flex-col items-center gap-2">
                    <div class="rounded-lg bg-white p-3">
                      <QRCodeCanvas value={entry.link} />
                    </div>
                    <p class="text-[12px] leading-5 text-v2-text-text-muted">
                      {links().length > 1
                        ? language.t("device.pair.target", { address: entry.target })
                        : language.t("device.pair.onlyTarget")}
                    </p>
                  </div>
                )}
              </For>
            </div>
          </Show>

          <div class="flex flex-col items-center gap-1 rounded-lg bg-v2-background-bg-weak px-4 py-3">
            <p class="text-[11px] leading-4 text-v2-text-text-faint">{language.t("device.pair.manual")}</p>
            <p class="font-mono text-[20px] leading-7 text-v2-text-text-base">{offer.data?.code}</p>
            <p class="text-[11px] leading-4 text-v2-text-text-faint">
              {remaining() > 0
                ? language.t("device.pair.expiresIn", { seconds: remaining() })
                : language.t("device.pair.expired")}
            </p>
          </div>
        </Show>
      </DialogBody>
      <DialogFooter>
        <ButtonV2 variant="neutral" onClick={() => dialog.close()}>
          {language.t("common.close")}
        </ButtonV2>
        <ButtonV2 variant="contrast" onClick={render} disabled={offer.isPending}>
          {offer.isPending ? language.t("device.pair.loading") : language.t("device.pair.newCode")}
        </ButtonV2>
      </DialogFooter>
    </Dialog>
  )
}

function QRCodeCanvas(props: { value: string }) {
  const [markup, setMarkup] = createSignal<string>()

  createEffect(() =>
    void QRCode.toString(props.value, {
      type: "svg",
      margin: 1,
      errorCorrectionLevel: "M",
      color: { dark: "#000000", light: "#ffffff" },
    }).then((result) => setMarkup(result)),
  )

  return (
    <Show when={markup()}>
      {(svg) => <div class="size-[220px]" innerHTML={svg()} />}
    </Show>
  )
}
