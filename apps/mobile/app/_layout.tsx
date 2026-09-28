import React from "react"
import { Stack } from "expo-router"
import { StatusBar } from "expo-status-bar"
import { ConnectionProvider } from "@/connection"
import { TurnWatcher } from "@/turn-watcher"
import { theme } from "@/theme"

export default function RootLayout() {
  return (
    <ConnectionProvider>
      <TurnWatcher />
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: theme.surface },
          headerTintColor: theme.text,
          headerTitleStyle: { fontWeight: "700" },
          contentStyle: { backgroundColor: theme.bg },
        }}
      >
        <Stack.Screen name="index" options={{ title: "Sesiones" }} />
        <Stack.Screen name="handoffs" options={{ title: "Recibidas", presentation: "modal" }} />
        <Stack.Screen name="connect" options={{ title: "Conexion", presentation: "modal" }} />
        <Stack.Screen name="session/[id]" options={{ title: "Chat" }} />
      </Stack>
    </ConnectionProvider>
  )
}
