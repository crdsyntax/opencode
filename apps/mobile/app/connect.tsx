import React, { useState } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { router } from "expo-router";
import { useConnection } from "@/connection";
import { ApiError } from "@/api";
import { theme } from "@/theme";

export default function ConnectScreen() {
  const { baseUrl, directory, setServer, signIn, pair, signOut, identity } = useConnection();
  const [url, setUrl] = useState(baseUrl);
  const [dir, setDir] = useState(directory);
  const [username, setUsername] = useState("opencode");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | undefined>();

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setStatus(undefined);
    try {
      await action();
    } catch (cause) {
      setStatus(cause instanceof ApiError ? `${cause.tag ?? "Error"}: ${cause.message}` : String(cause));
    } finally {
      setBusy(false);
    }
  };

  const saveUrl = () => run(async () => { await setServer(url.trim(), dir.trim()); setStatus("Servidor guardado"); });

  const doSignIn = () =>
    run(async () => {
      await signIn(url.trim(), dir.trim(), username, password);
      router.back();
    });

  const doPair = () =>
    run(async () => {
      await pair(url.trim(), dir.trim(), code, "Infinix");
      router.back();
    });

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.label}>Servidor</Text>
        <TextInput
          style={styles.input}
          value={url}
          onChangeText={setUrl}
          placeholder="http://127.0.0.1:4096"
          placeholderTextColor={theme.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
        />
        <TouchableOpacity style={styles.secondary} onPress={saveUrl} disabled={busy}>
          <Text style={styles.secondaryText}>Guardar servidor</Text>
        </TouchableOpacity>

        <Text style={styles.label}>Directorio de trabajo</Text>
        <Text style={styles.hint}>Las sesiones estan scopadas por directorio. Usa la misma ruta que en el escritorio, por ejemplo D:\</Text>
        <TextInput
          style={styles.input}
          value={dir}
          onChangeText={setDir}
          placeholder="D:\\"
          placeholderTextColor={theme.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
        />

        <Text style={styles.section}>Emparejar este dispositivo</Text>
        <Text style={styles.hint}>En el escritorio: ajustes, crear dispositivo, y escanea el codigo QR.</Text>
        <TextInput
          style={[styles.input, styles.code]}
          value={code}
          onChangeText={setCode}
          placeholder="ABCD1234"
          placeholderTextColor={theme.textMuted}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={12}
        />
        <TouchableOpacity style={styles.primary} onPress={doPair} disabled={busy || !code.trim()}>
          {busy ? <ActivityIndicator color={theme.onPrimary} /> : <Text style={styles.primaryText}>Emparejar</Text>}
        </TouchableOpacity>

        <Text style={styles.section}>Contrasena del servidor</Text>
        <TextInput
          style={styles.input}
          value={username}
          onChangeText={setUsername}
          placeholder="opencode"
          placeholderTextColor={theme.textMuted}
          autoCapitalize="none"
        />
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          placeholder="OPENCODE_SERVER_PASSWORD"
          placeholderTextColor={theme.textMuted}
          secureTextEntry
          autoCapitalize="none"
        />
        <TouchableOpacity style={styles.secondary} onPress={doSignIn} disabled={busy || !password}>
          <Text style={styles.secondaryText}>Entrar con contrasena</Text>
        </TouchableOpacity>

        {status ? <Text style={styles.status}>{status}</Text> : null}

        {identity.kind !== "none" ? (
          <TouchableOpacity
            style={styles.danger}
            onPress={() =>
              run(async () => {
                await signOut();
                router.back();
              })
            }
          >
            <Text style={styles.dangerText}>Desconectar</Text>
          </TouchableOpacity>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: theme.bg },
  content: { padding: 20, gap: 8 },
  label: { color: theme.textMuted, fontSize: 13, fontWeight: "600", marginBottom: 2 },
  section: { color: theme.text, fontSize: 16, fontWeight: "700", marginTop: 28, marginBottom: 4 },
  hint: { color: theme.textMuted, fontSize: 12, marginBottom: 8, lineHeight: 17 },
  input: {
    backgroundColor: theme.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: theme.text,
    fontSize: 15,
  },
  code: { letterSpacing: 4, fontSize: 18, textAlign: "center" },
  primary: { backgroundColor: theme.primary, borderRadius: 12, paddingVertical: 14, alignItems: "center", marginTop: 8 },
  primaryText: { color: theme.onPrimary, fontWeight: "700", fontSize: 15 },
  secondary: {
    backgroundColor: theme.surfaceAlt,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: "center",
    borderWidth: 1,
    borderColor: theme.border,
    marginTop: 8,
  },
  secondaryText: { color: theme.text, fontWeight: "700", fontSize: 14 },
  danger: { marginTop: 32, paddingVertical: 13, alignItems: "center" },
  dangerText: { color: theme.danger, fontWeight: "700" },
  status: { color: theme.warning, fontSize: 13, marginTop: 16 },
});
