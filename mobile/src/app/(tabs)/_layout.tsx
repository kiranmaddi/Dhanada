import { Tabs } from "expo-router";
import { Image, StyleSheet, Text, useColorScheme } from "react-native";

import { Colors } from "@/constants/theme";

function TabIcon({
  source,
  color,
}: {
  source: ReturnType<typeof require>;
  color: string;
}) {
  return <Image source={source} style={[styles.icon, { tintColor: color }]} />;
}

function TabEmoji({ emoji, color }: { emoji: string; color: string }) {
  return (
    <Text
      style={{
        fontSize: 18,
        opacity: color === "#000000" || color === "#ffffff" ? 1 : 0.8,
      }}
    >
      {emoji}
    </Text>
  );
}

export default function TabsLayout() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === "dark" ? "dark" : "light"];

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: [
          styles.tabBar,
          { backgroundColor: colors.backgroundElement },
        ],
        tabBarActiveTintColor: colors.text,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarLabelStyle: styles.label,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color }) => (
            <TabIcon
              source={require("@/assets/images/tabIcons/home.png")}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="events"
        options={{
          title: "Events",
          tabBarIcon: ({ color }) => <TabEmoji emoji="📅" color={color} />,
        }}
      />
      <Tabs.Screen
        name="invitees"
        options={{
          title: "Invitees",
          tabBarIcon: ({ color }) => <TabEmoji emoji="👥" color={color} />,
        }}
      />
      <Tabs.Screen
        name="wishlist"
        options={{
          title: "Wish List",
          tabBarIcon: ({ color }) => <TabEmoji emoji="⭐" color={color} />,
        }}
      />
      <Tabs.Screen
        name="gifts"
        options={{
          title: "Gifts",
          tabBarIcon: ({ color }) => <TabEmoji emoji="🎁" color={color} />,
        }}
      />
      {/* Keep explore file routable but hidden from tab bar */}
      <Tabs.Screen name="explore" options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    paddingVertical: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    height: 64,
  },
  icon: {
    width: 20,
    height: 20,
  },
  label: {
    fontSize: 10,
  },
});
