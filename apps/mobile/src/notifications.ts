import { Platform } from "react-native";
import * as Notifications from "expo-notifications";

const SUCCESS_CHANNEL = "opencode-turn-success";
const FAILURE_CHANNEL = "opencode-turn-failure";

export type TurnOutcome = "success" | "failure";

let configured: Promise<void> | undefined;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export function configureNotifications() {
  configured ??= (async () => {
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync(SUCCESS_CHANNEL, {
        name: "Respuesta del agente",
        importance: Notifications.AndroidImportance.HIGH,
        sound: "success",
        vibrationPattern: [0, 180, 120, 180],
        lightColor: "#7C5CFF",
      });
      await Notifications.setNotificationChannelAsync(FAILURE_CHANNEL, {
        name: "Fallo del agente",
        importance: Notifications.AndroidImportance.HIGH,
        sound: "error",
        vibrationPattern: [0, 450, 150, 450],
        lightColor: "#FF4D4F",
      });
    }
    const current = await Notifications.getPermissionsAsync();
    if (current.status !== "granted") await Notifications.requestPermissionsAsync();
  })().catch(() => undefined);
  return configured;
}

function previewOf(text: string | undefined) {
  const clean = (text ?? "").replace(/\s+/g, " ").trim();
  if (!clean) return undefined;
  return clean.length > 140 ? `${clean.slice(0, 139)}…` : clean;
}

export async function notifyTurnFinished(input: {
  sessionTitle: string;
  outcome: TurnOutcome;
  preview?: string;
  errorText?: string;
}) {
  await configureNotifications();
  const failure = input.outcome === "failure";
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: failure ? `Fallo · ${input.sessionTitle}` : input.sessionTitle,
        body: failure
          ? previewOf(input.errorText) ?? "La ejecucion del agente termino con un error"
          : previewOf(input.preview) ?? "Respuesta lista",
        data: { sessionTitle: input.sessionTitle, outcome: input.outcome },
        ...(Platform.OS === "android" ? { channelId: failure ? FAILURE_CHANNEL : SUCCESS_CHANNEL } : {}),
      },
      trigger: null,
    });
  } catch {
    return;
  }
}
