import React, { useCallback, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Stack, router, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useConnection } from "@/connection"
import { Session } from "@/api";
import { theme } from "@/theme";

function when(timestamp: number) {
  const minutes = Math.floor((Date.now() - timestamp) / 60000);
  if (minutes < 1) return "ahora";
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  return `hace ${Math.floor(hours / 24)} d`;
}

export default function SessionsScreen() {
  const { client, identity, error, ready } = useConnection();
  const [sessions, setSessions] = useState<readonly Session[]>([]);
  const [pending, setPending] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async (isRefresh = false) => {
      if (!client) {
        setLoading(false);
        return;
      }
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      try {
        setSessions(await client.sessions());
        
        if (identity.kind === "device") setPending((await client.pendingHandoffs()).length);
      } catch {
        
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [client, identity.kind],
  );

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const create = useCallback(async () => {
    if (!client) return;
    const session = await client.createSession();
    router.push(`/session/${session.id}`);
  }, [client]);

  if (!ready || loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.primary} />
      </View>
    );
  }

  if (identity.kind === "none") {
    return (
      <View style={styles.center}>
        <Ionicons name="server-outline" size={48} color={theme.textMuted} />
        <Text style={styles.title}>Conecta un servidor</Text>
        <Text style={styles.body}>Empareja este movil o entra con la contrasena del servidor.</Text>
        <TouchableOpacity style={styles.primary} onPress={() => router.push("/connect")}>
          <Text style={styles.primaryText}>Conectar</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.flex}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <View style={styles.headerActions}>
              {identity.kind === "device" ? (
                <TouchableOpacity onPress={() => router.push("/handoffs")} hitSlop={10}>
                  <View>
                    <Ionicons name="download-outline" size={22} color={theme.text} />
                    {pending > 0 ? (
                      <View style={styles.badge}>
                        <Text style={styles.badgeText}>{pending}</Text>
                      </View>
                    ) : null}
                  </View>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity onPress={() => router.push("/connect")} hitSlop={10}>
                <Ionicons name="settings-outline" size={22} color={theme.text} />
              </TouchableOpacity>
            </View>
          ),
        }}
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {identity.kind === "device" ? (
        <Text style={styles.identity}>Emparejado como {identity.name}</Text>
      ) : (
        <Text style={styles.identity}>Sesion con contrasena</Text>
      )}

      <FlatList
        data={sessions}
        keyExtractor={(item) => item.id}
        contentContainerStyle={sessions.length === 0 ? styles.center : styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={theme.text} />}
        ListEmptyComponent={
          <Text style={styles.body}>Sin sesiones. Crea una para empezar.</Text>
        }
        renderItem={({ item }) => (
          <Pressable style={styles.item} onPress={() => router.push(`/session/${item.id}`)}>
            <View style={{ flex: 1 }}>
              <Text style={styles.itemTitle} numberOfLines={1}>
                {item.title || "Sesion sin titulo"}
              </Text>
              <Text style={styles.itemMeta}>{when(item.time.updated)}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
          </Pressable>
        )}
      />

      <TouchableOpacity style={styles.fab} onPress={create}>
        <Ionicons name="add" size={28} color={theme.onPrimary} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: theme.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 10 },
  list: { paddingVertical: 8, paddingBottom: 96 },
  headerActions: { flexDirection: "row", gap: 18, alignItems: "center" },
  badge: {
    position: "absolute",
    top: -6,
    right: -8,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: theme.danger,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  badgeText: { color: theme.onPrimary, fontSize: 10, fontWeight: "800" },
  error: { color: theme.danger, fontSize: 12, paddingHorizontal: 16, paddingTop: 8 },
  identity: { color: theme.textMuted, fontSize: 12, paddingHorizontal: 16, paddingVertical: 6 },
  item: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.surface,
    marginHorizontal: 16,
    marginVertical: 5,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.border,
  },
  itemTitle: { color: theme.text, fontSize: 16, fontWeight: "600" },
  itemMeta: { color: theme.textMuted, fontSize: 12, marginTop: 3 },
  title: { color: theme.text, fontSize: 18, fontWeight: "700" },
  body: { color: theme.textMuted, fontSize: 14, textAlign: "center" },
  primary: { backgroundColor: theme.primary, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12, marginTop: 12 },
  primaryText: { color: theme.onPrimary, fontWeight: "700" },
  fab: {
    position: "absolute",
    right: 20,
    bottom: 28,
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: theme.primary,
    alignItems: "center",
    justifyContent: "center",
    elevation: 6,
  },
});
