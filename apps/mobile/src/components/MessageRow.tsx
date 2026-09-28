import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { ChatItem, ChatMessage } from "@/protocol";
import { MarkdownText } from "./MarkdownText";
import { theme } from "@/theme";

function ToolRow({ item }: { item: ChatItem & { kind: "tool" } }) {
  const [open, setOpen] = useState(false);
  const color = item.status === "error" ? theme.danger : item.status === "completed" ? theme.success : theme.warning;
  return (
    <View style={styles.tool}>
      <Text style={styles.toolTitle} onPress={() => setOpen((value) => !value)} numberOfLines={1}>
        {item.title ?? item.name}
      </Text>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={styles.toolStatus}>{item.status}</Text>
    </View>
  );
}

function Reasoning({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Pressable onPress={() => setOpen((value) => !value)}>
      <Text style={styles.reasoningToggle}>{open ? "▾ Razonamiento" : "▸ Razonamiento"}</Text>
      {open ? <MarkdownText>{text}</MarkdownText> : null}
    </Pressable>
  );
}

export function MessageRow({ message }: { message: ChatMessage }) {
  if (message.role === "user") {
    return (
      <View style={[styles.bubble, styles.userBubble]}>
        <Text style={styles.role}>Tu</Text>
        <MarkdownText>{message.text}</MarkdownText>
      </View>
    );
  }

  if (message.role === "system") {
    return (
      <View style={[styles.bubble, styles.systemBubble]}>
        <MarkdownText>{message.text}</MarkdownText>
      </View>
    );
  }

  return (
    <View style={[styles.bubble, styles.assistantBubble]}>
      <Text style={styles.role}>opencode{message.agent ? ` · ${message.agent}` : ""}</Text>
      {message.items.map((item, index) => {
        const key = `${message.id}-${index}`;
        if (item.kind === "text") return <MarkdownText key={key}>{item.text}</MarkdownText>;
        if (item.kind === "reasoning") return <Reasoning key={key} text={item.text} />;
        return <ToolRow key={key} item={item} />;
      })}
      {message.error ? <Text style={styles.error}>{message.error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bubble: { borderRadius: 16, padding: 14, marginHorizontal: 16, marginVertical: 6, gap: 8, borderWidth: 1, borderColor: theme.border },
  userBubble: { backgroundColor: theme.user, alignSelf: "flex-end", maxWidth: "88%" },
  assistantBubble: { backgroundColor: theme.surface, alignSelf: "flex-start", maxWidth: "94%" },
  systemBubble: { backgroundColor: theme.surfaceAlt, alignSelf: "stretch" },
  role: { color: theme.textMuted, fontSize: 11, fontWeight: "700" },
  reasoningToggle: { color: theme.textMuted, fontSize: 12, fontWeight: "600" },
  tool: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: theme.surfaceAlt, borderRadius: 10, padding: 10 },
  toolTitle: { color: theme.text, fontSize: 13, fontWeight: "600", flex: 1 },
  toolStatus: { color: theme.textMuted, fontSize: 11 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  error: { color: theme.danger, fontSize: 13 },
});
