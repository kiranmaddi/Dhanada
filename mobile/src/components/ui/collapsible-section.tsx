import { PropsWithChildren, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

type Props = PropsWithChildren<{
  title: string;
  defaultOpen?: boolean;
}>;

export function CollapsibleSection({
  title,
  children,
  defaultOpen = true,
}: Props) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <View style={styles.root}>
      <Pressable style={styles.header} onPress={() => setIsOpen((v) => !v)}>
        <Text style={styles.chevron}>{isOpen ? "▼" : "▶"}</Text>
        <Text style={styles.title}>{title}</Text>
      </Pressable>

      {isOpen ? <View style={styles.content}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: 8,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  chevron: {
    color: "#9aa5c5",
    fontSize: 12,
    width: 14,
    textAlign: "center",
  },
  title: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
  },
  content: {
    gap: 8,
  },
});
