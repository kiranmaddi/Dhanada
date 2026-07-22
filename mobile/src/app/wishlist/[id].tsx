import { useCallback, useEffect, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useColorScheme } from "react-native";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { supabase } from "@/lib/supabase";
import { Colors } from "@/constants/theme";

type WishlistItem = {
  id: string;
  wishlist_id: string;
  item_name: string;
  image_url: string | null;
  is_active: boolean;
  created_at: string;
};

type WishlistDetail = {
  id: string;
  name: string;
  owner_id: string;
  is_active: boolean;
  created_at: string;
};

type EventInfo = {
  id: string;
  event_name: string;
  event_date: string;
  venue: string | null;
  description: string | null;
};

type ContactInfo = {
  id: string;
  name: string;
  phone: string | null;
};

export default function WishlistDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const scheme = useColorScheme();
  const colors = Colors[scheme === "dark" ? "dark" : "light"];

  const wishlistId = Array.isArray(params.id) ? params.id[0] : params.id;
  const contactId = Array.isArray(params.contactId)
    ? params.contactId[0]
    : params.contactId;
  const contactName = Array.isArray(params.contactName)
    ? decodeURIComponent(params.contactName[0])
    : decodeURIComponent(params.contactName || "");
  const ownerName = Array.isArray(params.ownerName)
    ? decodeURIComponent(params.ownerName[0])
    : decodeURIComponent(params.ownerName || "");

  const [loading, setLoading] = useState(true);
  const [wishlist, setWishlist] = useState<WishlistDetail | null>(null);
  const [items, setItems] = useState<WishlistItem[]>([]);
  const [eventInfo, setEventInfo] = useState<EventInfo | null>(null);
  const [contactInfo, setContactInfo] = useState<ContactInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchWishlist = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const { data, error: err } = await supabase
        .from("wishlists")
        .select("id,name,owner_id,is_active,created_at")
        .eq("id", wishlistId)
        .single();

      if (err) {
        setError(`Failed to load wishlist: ${err.message}`);
        setLoading(false);
        return;
      }

      setWishlist(data as WishlistDetail);

      // Fetch items
      const { data: itemsData, error: itemsErr } = await supabase
        .from("wishlist_items")
        .select("id,wishlist_id,item_name,image_url,is_active,created_at")
        .eq("wishlist_id", wishlistId)
        .order("is_active", { ascending: false })
        .order("created_at", { ascending: false });

      if (!itemsErr) {
        setItems((itemsData ?? []) as WishlistItem[]);
      }

      // Fetch event info from wishlist_shares
      const { data: sharesData } = await supabase
        .from("wishlist_shares")
        .select(
          `
          event_id,
          events!inner (id, event_name, event_date, venue, description)
        `,
        )
        .eq("wishlist_id", wishlistId)
        .limit(1)
        .single();

      if (sharesData && "events" in sharesData && sharesData.events) {
        setEventInfo({
          id: sharesData.events.id,
          event_name: sharesData.events.event_name,
          event_date: sharesData.events.event_date,
          venue: sharesData.events.venue,
          description: sharesData.events.description,
        });
      }

      // Fetch contact info if contactId is provided
      if (contactId) {
        const { data: contactData } = await supabase
          .from("contacts")
          .select("id,name,phone")
          .eq("id", contactId)
          .single();

        if (contactData) {
          setContactInfo(contactData as ContactInfo);
        }
      }
    } catch (err) {
      console.error("Error:", err);
      setError("An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  }, [wishlistId, contactId]);

  useEffect(() => {
    void fetchWishlist();
  }, [fetchWishlist]);

  if (loading) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: colors.background }]}
      >
        <ActivityIndicator size="large" color={colors.tint} />
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: colors.background }]}
      >
        <Text style={[styles.error, { color: colors.tabIconDefault }]}>
          {error}
        </Text>
        <Pressable
          onPress={() => router.back()}
          style={[styles.button, { backgroundColor: colors.tint }]}
        >
          <Text style={styles.buttonText}>Go Back</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  if (!wishlist) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: colors.background }]}
      >
        <Text style={[styles.error, { color: colors.tabIconDefault }]}>
          Wishlist not found
        </Text>
        <Pressable
          onPress={() => router.back()}
          style={[styles.button, { backgroundColor: colors.tint }]}
        >
          <Text style={styles.buttonText}>Go Back</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      <View style={styles.header}>
        <Pressable
          onPress={() => router.push("/", { relativeToIndex: -1 })}
          style={styles.backButton}
        >
          <Text style={[styles.backButtonText, { color: colors.tint }]}>
            ← Back to Contacts
          </Text>
        </Pressable>
      </View>

      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        {/* Contact Info Card */}
        {contactInfo && (
          <View
            style={[
              styles.infoCard,
              { backgroundColor: colors.backgroundElement },
            ]}
          >
            <Text style={[styles.infoCardTitle, { color: colors.text }]}>
              From: {contactInfo.name}
            </Text>
            {contactInfo.phone && (
              <Text
                style={[styles.infoCardText, { color: colors.tabIconDefault }]}
              >
                {contactInfo.phone}
              </Text>
            )}
          </View>
        )}

        {/* Event Info Card */}
        {eventInfo && (
          <View
            style={[
              styles.infoCard,
              {
                backgroundColor: colors.tabIconDefault + "20",
                borderLeftColor: colors.tint,
                borderLeftWidth: 3,
              },
            ]}
          >
            <Text style={[styles.infoCardTitle, { color: colors.text }]}>
              📅 {eventInfo.event_name}
            </Text>
            <Text
              style={[styles.infoCardText, { color: colors.tabIconDefault }]}
            >
              {new Date(eventInfo.event_date).toLocaleDateString()}
            </Text>
            {eventInfo.venue && (
              <Text
                style={[styles.infoCardText, { color: colors.tabIconDefault }]}
              >
                📍 {eventInfo.venue}
              </Text>
            )}
            {eventInfo.description && (
              <Text
                style={[styles.infoCardText, { color: colors.tabIconDefault }]}
              >
                {eventInfo.description}
              </Text>
            )}
          </View>
        )}

        {/* Wishlist Title */}
        <Text style={[styles.title, { color: colors.text }]}>
          {wishlist.name}
        </Text>

        {/* Items */}
        {items.length === 0 ? (
          <View style={styles.empty}>
            <Text style={[styles.emptyText, { color: colors.tabIconDefault }]}>
              No items in this wishlist yet.
            </Text>
          </View>
        ) : (
          <View
            style={{
              display: "flex",
              flexDirection: "row",
              flexWrap: "wrap",
              justifyContent: "space-between",
            }}
          >
            {items.map((item) => (
              <View
                key={item.id}
                style={{
                  width: "48%",
                  marginBottom: 16,
                  borderRadius: 8,
                  overflow: "hidden",
                  backgroundColor: colors.backgroundElement,
                }}
              >
                {item.image_url && (
                  <View style={styles.imageContainer}>
                    <Text style={styles.imagePlaceholder}>📸</Text>
                  </View>
                )}
                <View style={styles.itemInfo}>
                  <Text
                    style={[styles.itemName, { color: colors.text }]}
                    numberOfLines={2}
                  >
                    {item.item_name}
                  </Text>
                  <Text
                    style={[styles.itemDate, { color: colors.tabIconDefault }]}
                  >
                    {new Date(item.created_at).toLocaleDateString()}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 24,
  },
  backButton: {
    padding: 8,
    marginRight: 8,
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: "600",
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    flex: 1,
  },
  empty: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyText: {
    fontSize: 16,
  },
  listContainer: {
    paddingBottom: 16,
  },
  row: {
    gap: 12,
    marginBottom: 12,
  },
  itemCard: {
    flex: 1,
    borderRadius: 8,
    overflow: "hidden",
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  imageContainer: {
    aspectRatio: 1,
    backgroundColor: "#f3f4f6",
    justifyContent: "center",
    alignItems: "center",
  },
  imagePlaceholder: {
    fontSize: 32,
  },
  itemInfo: {
    padding: 12,
  },
  itemName: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 4,
  },
  itemDate: {
    fontSize: 12,
  },
  infoCard: {
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  infoCardTitle: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 8,
  },
  infoCardText: {
    fontSize: 13,
    marginBottom: 4,
  },
  button: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 12,
  },
  buttonText: {
    color: "#fff",
    fontWeight: "600",
  },
  error: {
    fontSize: 16,
    marginBottom: 12,
  },
});
