import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { CollapsibleSection } from "@/components/ui/collapsible-section";
import { supabase } from "@/lib/supabase";

type AppEvent = { id: string; event_name: string; event_date: string };
type Contact = { id: string; name: string; phone: string | null };
type Invitee = { id: string; contacts: Contact | Contact[] | null };

function toDisplayDate(iso: string) {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString();
}

export default function InviteesScreen() {
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  const [events, setEvents] = useState<AppEvent[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [invitees, setInvitees] = useState<Contact[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  const selectedEvent = events.find((e) => e.id === selectedEventId) ?? null;

  const fetchInvitees = useCallback(async (eventId: string) => {
    const { data, error } = await supabase
      .from("event_invitees")
      .select("id, contacts(id,name,phone)")
      .eq("event_id", eventId);

    if (error) {
      Alert.alert("Invitees error", error.message);
      return;
    }

    const normalized = (data ?? []).flatMap((row) => {
      const c = (row as Invitee).contacts;
      if (!c) return [];
      return Array.isArray(c) ? c : [c];
    });

    setInvitees(normalized as Contact[]);
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

      const [eventsRes, contactsRes] = await Promise.all([
        supabase
          .from("events")
          .select("id,event_name,event_date")
          .eq("owner_id", uid)
          .order("event_date", { ascending: true }),
        supabase
          .from("contacts")
          .select("id,name,phone")
          .eq("owner_id", uid)
          .order("name", { ascending: true }),
      ]);

      if (!mounted) return;

      if (eventsRes.error) {
        Alert.alert("Events error", eventsRes.error.message);
      } else {
        const evList = (eventsRes.data ?? []) as AppEvent[];
        setEvents(evList);
        if (evList.length > 0) setSelectedEventId(evList[0].id);
      }

      if (contactsRes.error) {
        Alert.alert("Contacts error", contactsRes.error.message);
      } else {
        setContacts((contactsRes.data ?? []) as Contact[]);
      }

      setLoading(false);
    })();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedEventId) {
      setInvitees([]);
      return;
    }
    void fetchInvitees(selectedEventId);
  }, [fetchInvitees, selectedEventId]);

  async function onAddInvitee(contactId: string) {
    if (!selectedEventId) return;

    if (invitees.some((i) => i.id === contactId)) {
      Alert.alert("Already added", "This contact is already an invitee.");
      return;
    }

    setAdding(true);
    const { error } = await supabase.from("event_invitees").insert({
      event_id: selectedEventId,
      contact_id: contactId,
    });
    setAdding(false);

    if (error) {
      const msg =
        error.code === "23505"
          ? "Already an invitee for this event."
          : error.code === "42501"
            ? "Permission denied — check RLS policy for event_invitees."
            : error.message;
      Alert.alert("Add failed", msg);
      return;
    }

    await fetchInvitees(selectedEventId);
  }

  async function onRemoveInvitee(contactId: string) {
    if (!selectedEventId) return;

    const { error } = await supabase
      .from("event_invitees")
      .delete()
      .eq("event_id", selectedEventId)
      .eq("contact_id", contactId);

    if (error) {
      Alert.alert("Remove failed", error.message);
      return;
    }

    setInvitees((curr) => curr.filter((i) => i.id !== contactId));
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

        {/* ── Event Selector ── */}
        <View style={styles.card}>
          <CollapsibleSection title="Select Event">
            {events.length === 0 ? (
              <Text style={styles.emptyText}>
                No events yet — create one in the Events tab.
              </Text>
            ) : (
              <FlatList
                data={events}
                keyExtractor={(item) => item.id}
                scrollEnabled={false}
                renderItem={({ item }) => {
                  const active = item.id === selectedEventId;
                  return (
                    <Pressable
                      style={[
                        styles.eventChip,
                        active && styles.eventChipActive,
                      ]}
                      onPress={() => setSelectedEventId(item.id)}
                    >
                      <Text
                        style={[
                          styles.eventChipText,
                          active && styles.eventChipTextActive,
                        ]}
                      >
                        {item.event_name}
                      </Text>
                      <Text
                        style={[
                          styles.eventChipDate,
                          active && styles.eventChipTextActive,
                        ]}
                      >
                        {toDisplayDate(item.event_date)}
                      </Text>
                    </Pressable>
                  );
                }}
              />
            )}
          </CollapsibleSection>
        </View>

        {/* ── Invitees for selected event ── */}
        {selectedEvent && (
          <View style={styles.card}>
            <CollapsibleSection
              title={`Invitees — ${selectedEvent.event_name}`}
            >
              {invitees.length === 0 ? (
                <Text style={styles.emptyText}>
                  No invitees yet. Add from contacts below.
                </Text>
              ) : (
                <FlatList
                  data={invitees}
                  keyExtractor={(item) => item.id}
                  scrollEnabled={false}
                  renderItem={({ item }) => (
                    <View style={styles.inviteeRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.name}>{item.name}</Text>
                        <Text style={styles.meta}>
                          {item.phone ?? "No phone"}
                        </Text>
                      </View>
                      <Pressable
                        style={styles.removeButton}
                        onPress={() => onRemoveInvitee(item.id)}
                      >
                        <Text style={styles.removeText}>Remove</Text>
                      </Pressable>
                    </View>
                  )}
                />
              )}
            </CollapsibleSection>
          </View>
        )}

        {/* ── All Contacts — add to event ── */}
        {selectedEvent && (
          <View style={styles.card}>
            <CollapsibleSection title="Add from Contacts">
              {contacts.length === 0 ? (
                <Text style={styles.emptyText}>
                  No contacts — add them in the Home tab.
                </Text>
              ) : (
                <FlatList
                  data={contacts}
                  keyExtractor={(item) => item.id}
                  scrollEnabled={false}
                  renderItem={({ item }) => {
                    const alreadyAdded = invitees.some((i) => i.id === item.id);
                    return (
                      <View style={styles.contactRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.name}>{item.name}</Text>
                          <Text style={styles.meta}>
                            {item.phone ?? "No phone"}
                          </Text>
                        </View>
                        <Pressable
                          style={[
                            styles.addButton,
                            (alreadyAdded || adding) &&
                              styles.addButtonDisabled,
                          ]}
                          disabled={alreadyAdded || adding}
                          onPress={() => onAddInvitee(item.id)}
                        >
                          <Text style={styles.addButtonText}>
                            {alreadyAdded ? "Added" : "Add"}
                          </Text>
                        </Pressable>
                      </View>
                    );
                  }}
                />
              )}
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
    gap: 8,
  },
  cardTitle: { color: "#ffffff", fontSize: 16, fontWeight: "700" },
  emptyText: { color: "#6b7280", textAlign: "center", paddingVertical: 8 },
  eventChip: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#0d1732",
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: "#2a3b5c",
    marginBottom: 6,
  },
  eventChipActive: { backgroundColor: "#00d2ff", borderColor: "#00d2ff" },
  eventChipText: { color: "#ffffff", fontWeight: "600" },
  eventChipDate: { color: "#9aa5c5", fontSize: 12 },
  eventChipTextActive: { color: "#0a1128" },
  inviteeRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderColor: "#1a2c54",
  },
  contactRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderColor: "#1a2c54",
  },
  name: { color: "#ffffff", fontWeight: "600" },
  meta: { color: "#9aa5c5", fontSize: 12 },
  addButton: {
    backgroundColor: "#00d2ff",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  addButtonDisabled: { backgroundColor: "#1a2c54" },
  addButtonText: { color: "#0a1128", fontWeight: "700", fontSize: 13 },
  removeButton: {
    backgroundColor: "#3b1f2b",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  removeText: { color: "#f87171", fontWeight: "700", fontSize: 13 },
});
