import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useConnection } from "@/connection";
import { Device } from "@/api";
import { theme } from "@/theme";

export function DevicePicker({
  visible,
  sessionID,
  onClose,
}: {
  visible: boolean;
  sessionID: string;
  onClose: () => void;
}) {
  const { client, identity } = useConnection();
  const [devices, setDevices] = useState<readonly Device[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState<string | undefined>();
  const [result, setResult] = useState<string | undefined>();

  const load = useCallback(async () => {
    if (!client) return;
    setLoading(true);
    try {
      setDevices(await client.devices());
    } catch (cause) {
      setResult(cause instanceof Error ? cause.message : "No se pudieron cargar los dispositivos");
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    if (visible) {
      setResult(undefined);
      void load();
    }
  }, [visible, load]);

  const send = async (device: Device) => {
    if (!client || sending) return;
    setSending(device.id);
    try {
      await client.sendHandoff(sessionID, device.id, "Enviado desde el movil")
      setResult(`Enviada a ${device.name}`)
    } catch (cause) {
      setResult(cause instanceof Error ? cause.message : "No se pudo enviar")
    } finally {
      setSending(undefined)
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>Enviar sesion a</Text>
            <TouchableOpacity onPress={onClose} hitSlop={12}>
              <Ionicons name="close" size={22} color={theme.text} />
            </TouchableOpacity>
          </View>
          {result ? <Text style={styles.result}>{result}</Text> : null}
          {loading ? (
            <ActivityIndicator color={theme.primary} style={{ marginVertical: 24 }} />
          ) : (
            <FlatList
              data={devices}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => {
                const self = identity.kind === "device" && item.id === identity.id
                return (
                  <Pressable
                    style={styles.row}
                    disabled={Boolean(sending)}
                    onPress={() => send(item)}
                  >
                    <Ionicons
                      name={item.kind === "mobile" ? "phone-portrait-outline" : "desktop-outline"}
                      size={20}
                      color={theme.textMuted}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowName}>{item.name}</Text>
                      <Text style={styles.rowMeta}>
                        {item.kind}
                        {item.platform ? ` · ${item.platform}` : ""}
                      </Text>
                    </View>
                    {sending === item.id ? (
                      <ActivityIndicator color={theme.primary} size="small" />
                    ) : self ? (
                      <Text style={styles.self}>este dispositivo</Text>
                    ) : (
                      <Ionicons name="send" size={18} color={theme.primary} />
                    )}
                  </Pressable>
                )
              }}
            />
          )}
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: theme.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "75%",
    paddingBottom: 24,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 18,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  title: { color: theme.text, fontSize: 17, fontWeight: "700" },
  result: { color: theme.warning, fontSize: 13, padding: 14 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16 },
  rowName: { color: theme.text, fontSize: 15, fontWeight: "600" },
  rowMeta: { color: theme.textMuted, fontSize: 12, marginTop: 2 },
  self: { color: theme.textMuted, fontSize: 11 },
});
