import React, { useCallback, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useConnection } from "@/connection";
import { Handoff } from "@/api";
import { theme } from "@/theme";

export default function HandoffsScreen() {
  const { client, identity } = useConnection();
  const [items, setItems] = useState<readonly Handoff[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!client || identity.kind !== "device") {
      setLoading(false);
      return;
    }
    try {
      setItems(await client.pendingHandoffs());
    } finally {
      setLoading(false);
    }
  }, [client, identity.kind]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const respond = async (id: string, status: "accepted" | "declined") => {
    if (!client) return;
    await client.respondToHandoff(id, status);
    if (status === "accepted") {
      const item = items.find((entry) => entry.id === id);
      setItems((previous) => previous.filter((entry) => entry.id !== id));
      if (item) router.replace(`/session/${item.sessionID}`);
      return;
    }
    setItems((previous) => previous.filter((entry) => entry.id !== id));
  };

  if (identity.kind !== "device") {
    return (
      <View style={styles.center}>
        <Text style={styles.body}>Solo los dispositivos emparejados reciben sesiones.</Text>
      </View>
    );
  }

  return (
    <View style={styles.flex}>
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.primary} />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={items.length === 0 ? styles.center : styles.list}
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons name="download-outline" size={44} color={theme.textMuted} />
              <Text style={styles.body}>Ninguna sesion pendiente de aceptar.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.item}>
              <Text style={styles.itemTitle} numberOfLines={1}>
                Sesion {item.sessionID.slice(0, 12)}
              </Text>
              {item.note ? <Text style={styles.itemNote}>{item.note}</Text> : null}
              <View style={styles.actions}>
                <TouchableOpacity style={styles.accept} onPress={() => respond(item.id, "accepted")}>
                  <Text style={styles.acceptText}>Tomar</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.decline} onPress={() => respond(item.id, "declined")}>
                  <Text style={styles.declineText}>Rechazar</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: theme.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 10 },
  list: { padding: 16, gap: 12 },
  item: { backgroundColor: theme.surface, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: theme.border, gap: 8 },
  itemTitle: { color: theme.text, fontSize: 15, fontWeight: "700" },
  itemNote: { color: theme.textMuted, fontSize: 13 },
  actions: { flexDirection: "row", gap: 10, marginTop: 4 },
  accept: { backgroundColor: theme.primary, borderRadius: 10, paddingVertical: 10, flex: 1, alignItems: "center" },
  acceptText: { color: theme.onPrimary, fontWeight: "700" },
  decline: {
    backgroundColor: theme.surfaceAlt,
    borderRadius: 10,
    paddingVertical: 10,
    flex: 1,
    alignItems: "center",
    borderWidth: 1,
    borderColor: theme.border,
  },
  declineText: { color: theme.text, fontWeight: "700" },
  body: { color: theme.textMuted, fontSize: 14, textAlign: "center" },
});
