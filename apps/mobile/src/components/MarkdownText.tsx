import React, { useMemo } from "react";
import { Linking, StyleSheet, Text, View } from "react-native";
import Markdown from "react-native-markdown-display";


export function MarkdownText({ children }: { children: string }) {
  const rules = useMemo(() => buildRules(), []);
  return (
    <Markdown
      style={rules}
      onLinkPress={(url) => {
        void Linking.openURL(url);
        return true;
      }}
    >
      {children}
    </Markdown>
  );
}

const code = {
  fontFamily: "monospace",
  fontSize: 13,
  color: "#E6E6F0",
};

function buildRules() {
  return {
    body: { color: "#F2F2F7", fontSize: 15, lineHeight: 22 },
    paragraph: { marginTop: 0, marginBottom: 10 },

    heading1: { fontSize: 21, fontWeight: "700" as const, marginTop: 14, marginBottom: 8, color: "#F2F2F7" },
    heading2: { fontSize: 18, fontWeight: "700" as const, marginTop: 12, marginBottom: 6, color: "#F2F2F7" },
    heading3: { fontSize: 16, fontWeight: "700" as const, marginTop: 10, marginBottom: 6, color: "#F2F2F7" },
    heading4: { fontSize: 15, fontWeight: "700" as const, marginTop: 10, marginBottom: 4 },
    heading5: code,
    heading6: code,

    strong: { fontWeight: "700" as const, color: "#FFFFFF" },
    em: { fontStyle: "italic" as const },
    del: { textDecorationLine: "line-through" as const },
    link: { color: "#7C5CFF", textDecorationLine: "underline" as const },
    blocklink: { color: "#7C5CFF" },

    code_inline: { ...code, backgroundColor: "#1E1E28", paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4 },
    code_block: {
      ...code,
      backgroundColor: "#0D0D13",
      borderColor: "#2A2A36",
      borderWidth: 1,
      borderRadius: 10,
      padding: 12,
      marginTop: 8,
      marginBottom: 10,
    },
    fence: {
      ...code,
      backgroundColor: "#0D0D13",
      borderColor: "#2A2A36",
      borderWidth: 1,
      borderRadius: 10,
      padding: 12,
      marginTop: 8,
      marginBottom: 10,
    },
    blockquote: {
      backgroundColor: "#15151C",
      borderLeftColor: "#7C5CFF",
      borderLeftWidth: 3,
      paddingLeft: 12,
      marginLeft: 0,
      marginTop: 6,
      marginBottom: 6,
    },

    bullet_list: { marginTop: 4, marginBottom: 8 },
    ordered_list: { marginTop: 4, marginBottom: 8 },
    list_item: { marginTop: 2, marginBottom: 2, flexDirection: "row" as const },
    bullet_list_icon: { marginLeft: 4, marginRight: 8, color: "#8E8E9A" },
    bullet_list_content: { flex: 1 },
    ordered_list_icon: { marginLeft: 4, marginRight: 8, color: "#8E8E9A" },
    ordered_list_content: { flex: 1 },

    table: { borderColor: "#2A2A36", borderWidth: 1, borderRadius: 8, marginTop: 8, marginBottom: 10 },
    th: { backgroundColor: "#1E1E28", padding: 8, fontWeight: "700" as const, color: "#F2F2F7" },
    td: { padding: 8, borderColor: "#2A2A36", borderWidth: 1, color: "#F2F2F7" },
    tr: { borderColor: "#2A2A36" },

    hr: { backgroundColor: "#2A2A36", height: 1, marginTop: 12, marginBottom: 12 },
    image: { width: 200, height: 120 },
  };
}

export const markdownStyles = StyleSheet.create({
  wrapper: { marginVertical: 0 },
});
