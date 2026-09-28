import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useConnection } from "@/connection";
import type { ModelOption } from "@/api";
import { useKeyboardHeight } from "@/use-keyboard-height";
import { theme } from "@/theme";

export function ModelPicker({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { client, model, setModel } = useConnection();
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboardHeight();
  const [models, setModels] = useState<readonly ModelOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    if (!client) return;
    setLoading(true);
    try {
      const catalog = await client.models();
      setModels(catalog.models);
      setError(catalog.models.length ? undefined : "El servidor no devolvio ningun modelo");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudieron cargar los modelos");
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    if (visible) {
      setError(undefined);
      void load();
    }
  }, [visible, load]);

  
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return models;
    return models.filter(
      (item) =>
        item.name.toLowerCase().includes(needle) ||
        item.modelID.toLowerCase().includes(needle) ||
        item.providerID.toLowerCase().includes(needle),
    );
  }, [models, query]);

  const choose = async (value: ModelOption | undefined) => {
    await setModel(value);
    onClose();
  };

  const keyOf = (item: ModelOption) => `${item.providerID}/${item.modelID}`;
  const selected = model ? keyOf(model) : undefined;
  
  const bottomPad = Platform.OS === "ios" ? insets.bottom : keyboard > 0 ? keyboard : insets.bottom;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}>
          <View style={[styles.sheet, { paddingBottom: bottomPad + 12 }]}>
            <View style={styles.header}>
              <Text style={styles.title}>Modelo</Text>
              <TouchableOpacity onPress={onClose} hitSlop={12}>
                <Ionicons name="close" size={22} color={theme.text} />
              </TouchableOpacity>
            </View>

            <View style={styles.searchRow}>
              <Ionicons name="search" size={16} color={theme.textMuted} />
              <TextInput
                style={styles.search}
                value={query}
                onChangeText={setQuery}
                placeholder="Buscar modelo"
                placeholderTextColor={theme.textMuted}
                autoCorrect={false}
                autoCapitalize="none"
              />
              {query ? (
                <TouchableOpacity onPress={() => setQuery("")} hitSlop={10}>
                  <Ionicons name="close-circle" size={16} color={theme.textMuted} />
                </TouchableOpacity>
              ) : null}
            </View>

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <Pressable style={styles.row} onPress={() => void choose(undefined)}>
              <Ionicons name="server-outline" size={20} color={theme.textMuted} />
              <View style={{ flex: 1 }}>
                <Text style={styles.rowName}>Predeterminado del servidor</Text>
                <Text style={styles.rowMeta}>usar el que tenga configurado opencode</Text>
              </View>
              {!selected ? <Ionicons name="checkmark" size={19} color={theme.primary} /> : null}
            </Pressable>

            {loading ? (
              <ActivityIndicator color={theme.primary} style={{ marginVertical: 24 }} />
            ) : (
              <FlatList
                data={filtered}
                keyExtractor={keyOf}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }) => {
                  const active = selected === keyOf(item);
                  return (
                    <Pressable style={styles.row} onPress={() => void choose(item)}>
                      <Ionicons name="cube-outline" size={20} color={active ? theme.primary : theme.textMuted} />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.rowName, active && { color: theme.primary }]}>{item.name}</Text>
                        <Text style={styles.rowMeta}>{item.providerID}</Text>
                      </View>
                      {active ? <Ionicons name="checkmark" size={19} color={theme.primary} /> : null}
                    </Pressable>
                  );
                }}
                ListEmptyComponent={
                  <Text style={[styles.rowMeta, { padding: 16 }]}>
                    {loading ? "Cargando..." : "Ningun modelo coincide"}
                  </Text>
                }
              />
            )}
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, justifyContent: "flex-end" },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)" },
  sheet: {
    backgroundColor: theme.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "80%",
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
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    margin: 14,
    marginBottom: 4,
    paddingHorizontal: 12,
    backgroundColor: theme.surfaceAlt,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: theme.border,
  },
  search: { flex: 1, paddingVertical: 10, color: theme.text, fontSize: 15 },
  error: { color: theme.danger, fontSize: 13, paddingHorizontal: 18, paddingVertical: 8 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 18, paddingVertical: 13 },
  rowName: { color: theme.text, fontSize: 15, fontWeight: "600" },
  rowMeta: { color: theme.textMuted, fontSize: 12, marginTop: 2 },
});
