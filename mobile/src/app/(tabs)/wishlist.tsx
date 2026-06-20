/**
 * Wish List 2.0 (profile-level multi-wishlist)
 *
 * Required Supabase schema:
 *
 * create table if not exists wishlists (
 *   id uuid primary key default gen_random_uuid(),
 *   owner_id uuid references auth.users(id) on delete cascade not null,
 *   name text not null,
 *   is_active boolean not null default true,
 *   created_at timestamptz not null default now()
 * );
 *
 * create table if not exists wishlist_items (
 *   id uuid primary key default gen_random_uuid(),
 *   owner_id uuid references auth.users(id) on delete cascade not null,
 *   wishlist_id uuid references wishlists(id) on delete cascade not null,
 *   item_name text not null,
 *   image_url text,
 *   is_active boolean not null default true,
 *   created_at timestamptz not null default now()
 * );
 *
 * create table if not exists event_wishlists (
 *   id uuid primary key default gen_random_uuid(),
 *   owner_id uuid references auth.users(id) on delete cascade not null,
 *   event_id uuid references events(id) on delete cascade not null,
 *   wishlist_id uuid references wishlists(id) on delete cascade not null,
 *   is_active boolean not null default true,
 *   created_at timestamptz not null default now(),
 *   unique (event_id, wishlist_id)
 * );
 *
 * -- Storage bucket for images:
 * -- create bucket wishlist-images (public)
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";

import { CollapsibleSection } from "@/components/ui/collapsible-section";
import { supabase } from "@/lib/supabase";

type Wishlist = {
  id: string;
  name: string;
  is_active: boolean;
  created_at: string;
};

type WishlistItem = {
  id: string;
  wishlist_id: string;
  item_name: string;
  image_url: string | null;
  is_active: boolean;
  created_at: string;
};

type EventRow = {
  id: string;
  event_name: string;
  event_date: string;
};

type EventLink = {
  id: string;
  wishlist_id: string;
  event_id: string;
  is_active: boolean;
};

type SelectedImage = {
  uri: string;
  mimeType?: string | null;
};

function activeFirst<T extends { is_active: boolean; created_at: string }>(
  rows: T[],
) {
  return [...rows].sort((a, b) => {
    if (a.is_active !== b.is_active) return a.is_active ? -1 : 1;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}

function formatDate(value: string) {
  if (!value) return "";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString();
}

export default function WishListScreen() {
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  const [wishlists, setWishlists] = useState<Wishlist[]>([]);
  const [selectedWishlistId, setSelectedWishlistId] = useState<string | null>(
    null,
  );
  const [items, setItems] = useState<WishlistItem[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [links, setLinks] = useState<EventLink[]>([]);

  const [wishlistName, setWishlistName] = useState("");
  const [itemName, setItemName] = useState("");
  const [selectedImage, setSelectedImage] = useState<SelectedImage | null>(
    null,
  );

  const [creatingList, setCreatingList] = useState(false);
  const [creatingItem, setCreatingItem] = useState(false);

  const selectedWishlist = useMemo(
    () => wishlists.find((w) => w.id === selectedWishlistId) ?? null,
    [wishlists, selectedWishlistId],
  );

  const fetchWishlists = useCallback(
    async (ownerId: string) => {
      const { data, error } = await supabase
        .from("wishlists")
        .select("id,name,is_active,created_at")
        .eq("owner_id", ownerId)
        .order("is_active", { ascending: false })
        .order("created_at", { ascending: false });

      if (error) {
        Alert.alert("Wishlists error", error.message);
        return;
      }

      const rows = activeFirst((data ?? []) as Wishlist[]);
      setWishlists(rows);
      if (!selectedWishlistId && rows.length > 0) {
        setSelectedWishlistId(rows[0].id);
      }
    },
    [selectedWishlistId],
  );

  const fetchItems = useCallback(async (wishlistId: string) => {
    const { data, error } = await supabase
      .from("wishlist_items")
      .select("id,wishlist_id,item_name,image_url,is_active,created_at")
      .eq("wishlist_id", wishlistId)
      .order("is_active", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      Alert.alert("Wishlist items error", error.message);
      return;
    }

    setItems(activeFirst((data ?? []) as WishlistItem[]));
  }, []);

  const fetchEvents = useCallback(async (ownerId: string) => {
    const { data, error } = await supabase
      .from("events")
      .select("id,event_name,event_date")
      .eq("owner_id", ownerId)
      .order("event_date", { ascending: true });

    if (error) {
      Alert.alert("Events error", error.message);
      return;
    }

    setEvents((data ?? []) as EventRow[]);
  }, []);

  const fetchLinks = useCallback(async (wishlistId: string) => {
    const { data, error } = await supabase
      .from("event_wishlists")
      .select("id,wishlist_id,event_id,is_active")
      .eq("wishlist_id", wishlistId);

    if (error) {
      Alert.alert("Wishlist-event link error", error.message);
      return;
    }

    setLinks((data ?? []) as EventLink[]);
  }, []);

  useEffect(() => {
    let mounted = true;

    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!mounted || !session?.user) {
        setLoading(false);
        return;
      }

      const uid = session.user.id;
      setUserId(uid);
      await Promise.all([fetchWishlists(uid), fetchEvents(uid)]);
      setLoading(false);
    })();

    return () => {
      mounted = false;
    };
  }, [fetchEvents, fetchWishlists]);

  useEffect(() => {
    if (!selectedWishlistId) {
      setItems([]);
      setLinks([]);
      return;
    }

    void fetchItems(selectedWishlistId);
    void fetchLinks(selectedWishlistId);
  }, [fetchItems, fetchLinks, selectedWishlistId]);

  async function uploadImage(ownerId: string, image: SelectedImage) {
    const ext = (image.mimeType ?? "image/jpeg").includes("png")
      ? "png"
      : "jpg";
    const path = `${ownerId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    const response = await fetch(image.uri);
    const arrayBuffer = await response.arrayBuffer();

    const { error } = await supabase.storage
      .from("wishlist-images")
      .upload(path, arrayBuffer, {
        contentType: image.mimeType ?? "image/jpeg",
        upsert: false,
      });

    if (error) {
      throw error;
    }

    const { data } = supabase.storage
      .from("wishlist-images")
      .getPublicUrl(path);
    return data.publicUrl;
  }

  async function onPickImage() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.7,
      allowsEditing: true,
    });

    if (result.canceled) return;

    const asset = result.assets[0];
    setSelectedImage({
      uri: asset.uri,
      mimeType: asset.mimeType,
    });
  }

  async function onTakePhoto() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();

    if (!permission.granted) {
      Alert.alert("Permission needed", "Camera permission is required.");
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      quality: 0.7,
      allowsEditing: true,
    });

    if (result.canceled) return;

    const asset = result.assets[0];
    setSelectedImage({
      uri: asset.uri,
      mimeType: asset.mimeType,
    });
  }

  async function onCreateWishlist() {
    if (!userId || !wishlistName.trim()) {
      Alert.alert("Validation", "Wishlist name is required.");
      return;
    }

    setCreatingList(true);

    const { data, error } = await supabase
      .from("wishlists")
      .insert({
        owner_id: userId,
        name: wishlistName.trim(),
        is_active: true,
      })
      .select("id,name,is_active,created_at")
      .single();

    setCreatingList(false);

    if (error) {
      Alert.alert("Create wishlist failed", error.message);
      return;
    }

    setWishlistName("");

    if (data) {
      const next = activeFirst([data as Wishlist, ...wishlists]);
      setWishlists(next);
      setSelectedWishlistId(data.id);
    }
  }

  async function onToggleWishlistActive(wishlist: Wishlist) {
    const { error } = await supabase
      .from("wishlists")
      .update({ is_active: !wishlist.is_active })
      .eq("id", wishlist.id);

    if (error) {
      Alert.alert("Update wishlist failed", error.message);
      return;
    }

    setWishlists((curr) =>
      activeFirst(
        curr.map((w) =>
          w.id === wishlist.id ? { ...w, is_active: !w.is_active } : w,
        ),
      ),
    );
  }

  async function onCreateItem() {
    if (!userId || !selectedWishlistId || !itemName.trim()) {
      Alert.alert("Validation", "Select a wishlist and enter item name.");
      return;
    }

    setCreatingItem(true);

    let imageUrl: string | null = null;
    if (selectedImage) {
      try {
        imageUrl = await uploadImage(userId, selectedImage);
      } catch (error) {
        setCreatingItem(false);
        const message =
          error instanceof Error ? error.message : "Image upload failed.";
        Alert.alert("Upload failed", message);
        return;
      }
    }

    const { data, error } = await supabase
      .from("wishlist_items")
      .insert({
        owner_id: userId,
        wishlist_id: selectedWishlistId,
        item_name: itemName.trim(),
        image_url: imageUrl,
        is_active: true,
      })
      .select("id,wishlist_id,item_name,image_url,is_active,created_at")
      .single();

    setCreatingItem(false);

    if (error) {
      Alert.alert("Create item failed", error.message);
      return;
    }

    setItemName("");
    setSelectedImage(null);

    if (data) {
      setItems((curr) => activeFirst([data as WishlistItem, ...curr]));
    }
  }

  async function onToggleItemActive(item: WishlistItem) {
    const { error } = await supabase
      .from("wishlist_items")
      .update({ is_active: !item.is_active })
      .eq("id", item.id);

    if (error) {
      Alert.alert("Update item failed", error.message);
      return;
    }

    setItems((curr) =>
      activeFirst(
        curr.map((i) =>
          i.id === item.id ? { ...i, is_active: !i.is_active } : i,
        ),
      ),
    );
  }

  async function onToggleEventShare(eventId: string) {
    if (!selectedWishlistId || !userId) return;

    const existing =
      links.find(
        (l) => l.event_id === eventId && l.wishlist_id === selectedWishlistId,
      ) ?? null;

    if (!existing) {
      const { data, error } = await supabase
        .from("event_wishlists")
        .insert({
          owner_id: userId,
          wishlist_id: selectedWishlistId,
          event_id: eventId,
          is_active: true,
        })
        .select("id,wishlist_id,event_id,is_active")
        .single();

      if (error) {
        Alert.alert("Share link failed", error.message);
        return;
      }

      if (data) {
        setLinks((curr) => [...curr, data as EventLink]);
      }
      return;
    }

    const { error } = await supabase
      .from("event_wishlists")
      .update({ is_active: !existing.is_active })
      .eq("id", existing.id);

    if (error) {
      Alert.alert("Update share link failed", error.message);
      return;
    }

    setLinks((curr) =>
      curr.map((l) =>
        l.id === existing.id ? { ...l, is_active: !l.is_active } : l,
      ),
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.screen}>
        <ActivityIndicator color="#00d2ff" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.logo}>Dhanada</Text>

        <View style={styles.card}>
          <CollapsibleSection title="Create Wish List">
            <TextInput
              style={styles.input}
              value={wishlistName}
              onChangeText={setWishlistName}
              placeholder="Wishlist name"
              placeholderTextColor="#6b7280"
            />
            <Pressable
              style={[
                styles.primaryButton,
                creatingList && styles.buttonDisabled,
              ]}
              disabled={creatingList}
              onPress={onCreateWishlist}
            >
              <Text style={styles.primaryButtonText}>
                {creatingList ? "Creating..." : "Create Wishlist"}
              </Text>
            </Pressable>
          </CollapsibleSection>
        </View>

        <View style={styles.card}>
          <CollapsibleSection title={`Wish Lists (${wishlists.length})`}>
            {wishlists.length === 0 ? (
              <Text style={styles.emptyText}>No wishlists yet.</Text>
            ) : (
              <FlatList
                data={wishlists}
                keyExtractor={(item) => item.id}
                scrollEnabled={false}
                renderItem={({ item }) => {
                  const selected = item.id === selectedWishlistId;
                  return (
                    <Pressable
                      style={[
                        styles.listRow,
                        selected && styles.listRowSelected,
                      ]}
                      onPress={() => setSelectedWishlistId(item.id)}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.listName}>{item.name}</Text>
                        <Text style={styles.listMeta}>
                          {item.is_active ? "Active" : "Inactive"}
                        </Text>
                      </View>
                      <Pressable
                        style={styles.pillButton}
                        onPress={() => onToggleWishlistActive(item)}
                      >
                        <Text style={styles.pillButtonText}>
                          Make {item.is_active ? "Inactive" : "Active"}
                        </Text>
                      </Pressable>
                    </Pressable>
                  );
                }}
              />
            )}
          </CollapsibleSection>
        </View>

        {selectedWishlist ? (
          <>
            <View style={styles.card}>
              <CollapsibleSection
                title={`Add Item to ${selectedWishlist.name}`}
              >
                <TextInput
                  style={styles.input}
                  value={itemName}
                  onChangeText={setItemName}
                  placeholder="Item name"
                  placeholderTextColor="#6b7280"
                />

                <View style={styles.rowButtons}>
                  <Pressable
                    style={styles.secondaryButton}
                    onPress={onPickImage}
                  >
                    <Text style={styles.secondaryButtonText}>Pick Image</Text>
                  </Pressable>
                  <Pressable
                    style={styles.secondaryButton}
                    onPress={onTakePhoto}
                  >
                    <Text style={styles.secondaryButtonText}>Take Photo</Text>
                  </Pressable>
                </View>

                {selectedImage && (
                  <Image
                    source={{ uri: selectedImage.uri }}
                    style={styles.previewImage}
                    contentFit="cover"
                  />
                )}

                <Pressable
                  style={[
                    styles.primaryButton,
                    creatingItem && styles.buttonDisabled,
                  ]}
                  disabled={creatingItem}
                  onPress={onCreateItem}
                >
                  <Text style={styles.primaryButtonText}>
                    {creatingItem ? "Saving..." : "Add Item"}
                  </Text>
                </Pressable>
              </CollapsibleSection>
            </View>

            <View style={styles.card}>
              <CollapsibleSection title={`Items (${items.length})`}>
                {items.length === 0 ? (
                  <Text style={styles.emptyText}>No items yet.</Text>
                ) : (
                  <FlatList
                    data={items}
                    keyExtractor={(item) => item.id}
                    scrollEnabled={false}
                    renderItem={({ item }) => (
                      <View style={styles.itemRow}>
                        {item.image_url ? (
                          <Image
                            source={{ uri: item.image_url }}
                            style={styles.thumb}
                            contentFit="cover"
                          />
                        ) : (
                          <View style={[styles.thumb, styles.thumbEmpty]}>
                            <Text style={styles.thumbEmptyText}>No Image</Text>
                          </View>
                        )}
                        <View style={{ flex: 1 }}>
                          <Text style={styles.listName}>{item.item_name}</Text>
                          <Text style={styles.listMeta}>
                            {item.is_active ? "Active" : "Inactive"}
                          </Text>
                        </View>
                        <Pressable
                          style={styles.pillButton}
                          onPress={() => onToggleItemActive(item)}
                        >
                          <Text style={styles.pillButtonText}>
                            Make {item.is_active ? "Inactive" : "Active"}
                          </Text>
                        </Pressable>
                      </View>
                    )}
                  />
                )}
              </CollapsibleSection>
            </View>

            <View style={styles.card}>
              <CollapsibleSection title="Share with Event Invitees">
                <Text style={styles.helperText}>
                  Provision only for now. Active wishlists/items should be
                  shared.
                </Text>

                {events.length === 0 ? (
                  <Text style={styles.emptyText}>No events found.</Text>
                ) : (
                  <FlatList
                    data={events}
                    keyExtractor={(item) => item.id}
                    scrollEnabled={false}
                    renderItem={({ item }) => {
                      const linked =
                        links.find(
                          (l) =>
                            l.event_id === item.id &&
                            l.wishlist_id === selectedWishlist.id &&
                            l.is_active,
                        ) != null;

                      return (
                        <View style={styles.listRow}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.listName}>
                              {item.event_name}
                            </Text>
                            <Text style={styles.listMeta}>
                              {formatDate(item.event_date)}
                            </Text>
                          </View>
                          <Pressable
                            style={styles.pillButton}
                            onPress={() => onToggleEventShare(item.id)}
                          >
                            <Text style={styles.pillButtonText}>
                              {linked ? "Shared" : "Share"}
                            </Text>
                          </Pressable>
                        </View>
                      );
                    }}
                  />
                )}
              </CollapsibleSection>
            </View>
          </>
        ) : (
          <View style={styles.card}>
            <CollapsibleSection title="Wishlist">
              <Text style={styles.emptyText}>Select or create a wishlist.</Text>
            </CollapsibleSection>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#0a1128" },
  content: { padding: 16, paddingBottom: 40 },
  logo: {
    color: "#00d2ff",
    fontSize: 26,
    fontWeight: "800",
    textAlign: "center",
    marginBottom: 16,
  },
  card: {
    backgroundColor: "#131d3a",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#223157",
    marginBottom: 16,
    gap: 10,
  },
  cardTitle: { color: "#ffffff", fontSize: 16, fontWeight: "700" },
  helperText: { color: "#9aa5c5", fontSize: 12 },
  input: {
    backgroundColor: "#0d1732",
    borderColor: "#2a3b5c",
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: "#ffffff",
  },
  primaryButton: {
    backgroundColor: "#00d2ff",
    borderRadius: 10,
    paddingVertical: 12,
    marginTop: 4,
  },
  buttonDisabled: { opacity: 0.6 },
  primaryButtonText: {
    textAlign: "center",
    color: "#0a1128",
    fontWeight: "800",
  },
  rowButtons: { flexDirection: "row", gap: 8 },
  secondaryButton: {
    flex: 1,
    backgroundColor: "#1f2a44",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#2e4068",
    paddingVertical: 10,
  },
  secondaryButtonText: {
    textAlign: "center",
    color: "#c7d2fe",
    fontWeight: "700",
  },
  previewImage: {
    width: "100%",
    height: 180,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#2a3b5c",
  },
  listRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderTopWidth: 1,
    borderColor: "#1a2c54",
    paddingVertical: 10,
  },
  listRowSelected: {
    backgroundColor: "#00d2ff14",
    borderRadius: 10,
    paddingHorizontal: 8,
  },
  listName: { color: "#ffffff", fontWeight: "700" },
  listMeta: { color: "#9aa5c5", fontSize: 12 },
  emptyText: { color: "#6b7280", textAlign: "center", paddingVertical: 8 },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderTopWidth: 1,
    borderColor: "#1a2c54",
    paddingVertical: 10,
  },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#2a3b5c",
  },
  thumbEmpty: {
    backgroundColor: "#1b2846",
    alignItems: "center",
    justifyContent: "center",
  },
  thumbEmptyText: { color: "#9aa5c5", fontSize: 10 },
  pillButton: {
    backgroundColor: "#1f2a44",
    borderWidth: 1,
    borderColor: "#2e4068",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  pillButtonText: {
    color: "#c7d2fe",
    fontWeight: "700",
    fontSize: 12,
  },
});
