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

import { CollapsibleSection } from "@/components/ui/collapsible-section";
import { supabase } from "@/lib/supabase";

type AppEvent = {
  id: string;
  event_name: string;
  event_date: string;
  created_at: string;
};

type Contact = {
  id: string;
  name: string;
  phone: string | null;
};

type Invitee = {
  id: string;
  contacts: Contact | Contact[] | null;
};

type GiftRow = {
  id: string;
  event_id: string;
  contact_id: string | null;
  created_at?: string | null;
  contacts?: Contact | Contact[] | null;
  [key: string]: unknown;
};

function formatDate(value: string) {
  if (!value) return "No date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString();
}

function parseAmount(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizePhone(value: string | null | undefined) {
  return (value ?? "").replace(/\D/g, "");
}

function getGiftName(gift: GiftRow) {
  const candidates = [
    gift.gift_name,
    gift.item_name,
    gift.gift_title,
    gift.name,
  ];
  const first = candidates.find(
    (value) => typeof value === "string" && value.trim().length > 0,
  );
  return typeof first === "string" ? first : "Unnamed gift";
}

function getGiftNote(gift: GiftRow) {
  const candidates = [gift.notes, gift.note, gift.description];
  const first = candidates.find(
    (value) => typeof value === "string" && value.trim().length > 0,
  );
  return typeof first === "string" ? first : "";
}

function getGiftContact(gift: GiftRow) {
  const contactData = gift.contacts;
  if (!contactData) return null;
  return Array.isArray(contactData) ? (contactData[0] ?? null) : contactData;
}

export default function ExploreScreen() {
  const [loading, setLoading] = useState(true);
  const [creatingEvent, setCreatingEvent] = useState(false);
  const [addingInvitee, setAddingInvitee] = useState(false);
  const [creatingGift, setCreatingGift] = useState(false);

  const [userId, setUserId] = useState<string | null>(null);
  const [eventName, setEventName] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [selectedGiftContactId, setSelectedGiftContactId] = useState<
    string | null
  >(null);
  const [contactSearch, setContactSearch] = useState("");
  const [giftName, setGiftName] = useState("");
  const [giftAmount, setGiftAmount] = useState("");
  const [giftNotes, setGiftNotes] = useState("");

  const [events, setEvents] = useState<AppEvent[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [invitees, setInvitees] = useState<Contact[]>([]);
  const [gifts, setGifts] = useState<GiftRow[]>([]);

  const selectedEvent = useMemo(
    () => events.find((event) => event.id === selectedEventId) ?? null,
    [events, selectedEventId],
  );

  const selectedGiftContact = useMemo(
    () =>
      invitees.find((invitee) => invitee.id === selectedGiftContactId) ?? null,
    [invitees, selectedGiftContactId],
  );

  const filteredContacts = useMemo(() => {
    const q = contactSearch.trim().toLowerCase();
    const qDigits = q.replace(/\D/g, "");

    const matched = !q
      ? contacts
      : contacts.filter((contact) => {
          const nameMatch = contact.name.toLowerCase().includes(q);
          const phoneDigits = normalizePhone(contact.phone);
          const phoneMatch =
            qDigits.length > 0 && phoneDigits.includes(qDigits);
          return nameMatch || phoneMatch;
        });

    if (!q) return matched;

    // Collapse repeated rows representing the same person during search.
    return Array.from(
      new Map(
        matched.map((contact) => {
          const key = `${contact.name.trim().toLowerCase()}|${normalizePhone(contact.phone)}`;
          return [key || contact.id, contact] as const;
        }),
      ).values(),
    );
  }, [contacts, contactSearch]);

  const fetchEvents = useCallback(
    async (ownerId: string) => {
      const { data, error } = await supabase
        .from("events")
        .select("id,event_name,event_date,created_at")
        .eq("owner_id", ownerId)
        .order("created_at", { ascending: false });

      if (error) {
        Alert.alert("Events error", error.message);
        return;
      }

      setEvents((data ?? []) as AppEvent[]);

      if (!selectedEventId && data && data.length > 0) {
        setSelectedEventId(data[0].id);
      }
    },
    [selectedEventId],
  );

  const fetchContacts = useCallback(async (ownerId: string) => {
    const { data, error } = await supabase
      .from("contacts")
      .select("id,name,phone")
      .eq("owner_id", ownerId)
      .order("name", { ascending: true });

    if (error) {
      Alert.alert("Contacts error", error.message);
      return;
    }

    setContacts((data ?? []) as Contact[]);
  }, []);

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
      const contactData = (row as Invitee).contacts;
      if (!contactData) return [];
      return Array.isArray(contactData) ? contactData : [contactData];
    });

    const deduped = Array.from(
      new Map(
        (normalized as Contact[]).map((contact) => [contact.id, contact]),
      ).values(),
    );

    setInvitees(deduped);
  }, []);

  const fetchGifts = useCallback(async (eventId: string) => {
    const { data, error } = await supabase
      .from("gifts")
      .select("*, contacts(id,name,phone)")
      .eq("event_id", eventId)
      .order("created_at", { ascending: false });

    if (error) {
      Alert.alert("Gifts error", error.message);
      return;
    }

    setGifts((data ?? []) as GiftRow[]);
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

      await Promise.all([fetchEvents(uid), fetchContacts(uid)]);
      setLoading(false);
    })();

    return () => {
      mounted = false;
    };
  }, [fetchContacts, fetchEvents]);

  useEffect(() => {
    if (!selectedEventId) {
      setInvitees([]);
      setGifts([]);
      setSelectedGiftContactId(null);
      return;
    }

    fetchInvitees(selectedEventId);
    fetchGifts(selectedEventId);
  }, [fetchGifts, fetchInvitees, selectedEventId]);

  useEffect(() => {
    if (!invitees.length) {
      setSelectedGiftContactId(null);
      return;
    }

    if (!selectedGiftContactId) {
      setSelectedGiftContactId(invitees[0].id);
      return;
    }

    const stillPresent = invitees.some(
      (invitee) => invitee.id === selectedGiftContactId,
    );
    if (!stillPresent) {
      setSelectedGiftContactId(invitees[0].id);
    }
  }, [invitees, selectedGiftContactId]);

  async function onCreateEvent() {
    if (!userId) return;

    const trimmedName = eventName.trim();
    if (!trimmedName || !eventDate.trim()) {
      Alert.alert("Validation", "Event name and date are required.");
      return;
    }

    setCreatingEvent(true);

    const { data, error } = await supabase
      .from("events")
      .insert({
        owner_id: userId,
        event_name: trimmedName,
        event_date: eventDate.trim(),
      })
      .select("id,event_name,event_date,created_at")
      .single();

    setCreatingEvent(false);

    if (error) {
      Alert.alert("Create event failed", error.message);
      return;
    }

    setEventName("");
    setEventDate("");

    if (data) {
      setEvents((current) => [data as AppEvent, ...current]);
      setSelectedEventId(data.id);
      return;
    }

    await fetchEvents(userId);
  }

  async function onAddInvitee(contactId: string) {
    if (!selectedEventId) {
      Alert.alert("Select event", "Choose an event first.");
      return;
    }

    const selectedContact = contacts.find(
      (contact) => contact.id === contactId,
    );
    const selectedPhone = normalizePhone(selectedContact?.phone);

    const alreadyLinked = invitees.some((invitee) => {
      if (invitee.id === contactId) return true;
      if (!selectedPhone) return false;
      return normalizePhone(invitee.phone) === selectedPhone;
    });

    if (alreadyLinked) {
      Alert.alert("Already added", "This invitee is already linked.");
      return;
    }

    setAddingInvitee(true);

    const { error } = await supabase.from("event_invitees").insert({
      event_id: selectedEventId,
      contact_id: contactId,
    });

    setAddingInvitee(false);

    if (error) {
      const message =
        error.code === "23505"
          ? "This invitee is already linked to the event."
          : error.code === "42501"
            ? "Permission denied by database policy. Please add RLS policy for event_invitees in Supabase."
            : error.message;
      Alert.alert("Add invitee failed", message);
      return;
    }

    await fetchInvitees(selectedEventId);
  }

  async function onCreateGift() {
    if (!selectedEventId) {
      Alert.alert("Select event", "Choose an event first.");
      return;
    }

    if (!selectedGiftContactId) {
      Alert.alert("Select invitee", "Choose an invitee to link the gift.");
      return;
    }

    const trimmedGiftName = giftName.trim();
    if (!trimmedGiftName) {
      Alert.alert("Validation", "Gift name is required.");
      return;
    }

    const trimmedAmount = giftAmount.trim();
    const parsedAmount = trimmedAmount ? Number(trimmedAmount) : null;
    if (trimmedAmount && !Number.isFinite(parsedAmount)) {
      Alert.alert("Validation", "Gift amount must be a valid number.");
      return;
    }

    const basePayload = {
      event_id: selectedEventId,
      contact_id: selectedGiftContactId,
      owner_id: userId,
      gift_type: "gift",
    };

    const payloads: Record<string, unknown>[] = [
      {
        ...basePayload,
        item_description: trimmedGiftName,
        value_amount: parsedAmount,
      },
    ];

    setCreatingGift(true);

    let insertedGift: GiftRow | null = null;
    let lastError: { code?: string; message?: string } | null = null;

    for (const payload of payloads) {
      const { data, error } = await supabase
        .from("gifts")
        .insert(payload)
        .select("*, contacts(id,name,phone)")
        .single();

      if (!error) {
        insertedGift = data as GiftRow;
        break;
      }

      lastError = { code: error.code, message: error.message };

      if (error.code === "42501") {
        break;
      }

      const lower = (error.message ?? "").toLowerCase();
      const isColumnMismatch =
        error.code === "42703" ||
        error.code === "PGRST204" ||
        lower.includes("column") ||
        lower.includes("schema cache");

      if (!isColumnMismatch) {
        break;
      }
    }

    setCreatingGift(false);

    if (!insertedGift) {
      const message =
        lastError?.code === "42501"
          ? "Permission denied by database policy. Please add RLS policy for gifts in Supabase."
          : lastError?.message || "Unable to create gift.";
      Alert.alert("Create gift failed", message);
      return;
    }

    setGiftName("");
    setGiftAmount("");
    setGiftNotes("");
    setGifts((current) => [insertedGift as GiftRow, ...current]);
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
        <View style={styles.header}>
          <Text style={styles.logo}>Dhanada</Text>
          <Text style={styles.subtitle}>Events and invitees</Text>
        </View>

        <View style={styles.card}>
          <CollapsibleSection title="Create Event">
            <TextInput
              style={styles.input}
              value={eventName}
              onChangeText={setEventName}
              placeholder="Event name"
              placeholderTextColor="#6b7280"
            />
            <TextInput
              style={styles.input}
              value={eventDate}
              onChangeText={setEventDate}
              placeholder="Event date (YYYY-MM-DD)"
              placeholderTextColor="#6b7280"
            />
            <Pressable
              style={styles.primaryButton}
              disabled={creatingEvent}
              onPress={onCreateEvent}
            >
              <Text style={styles.primaryButtonText}>
                {creatingEvent ? "Creating..." : "Create Event"}
              </Text>
            </Pressable>
          </CollapsibleSection>
        </View>

        <View style={styles.card}>
          <CollapsibleSection title="Your Events">
            <FlatList
              data={events}
              keyExtractor={(item) => item.id}
              scrollEnabled={false}
              ListEmptyComponent={
                <Text style={styles.emptyText}>No events yet.</Text>
              }
              renderItem={({ item }) => {
                const active = item.id === selectedEventId;
                return (
                  <Pressable
                    onPress={() => setSelectedEventId(item.id)}
                    style={[styles.listItem, active && styles.listItemActive]}
                  >
                    <Text style={styles.listName}>{item.event_name}</Text>
                    <Text style={styles.listMeta}>
                      {formatDate(item.event_date)}
                    </Text>
                  </Pressable>
                );
              }}
            />
          </CollapsibleSection>
        </View>

        <View style={styles.card}>
          <CollapsibleSection title="Invitees">
            <Text style={styles.helperText}>
              {selectedEvent
                ? `Selected: ${selectedEvent.event_name}`
                : "Select an event to add invitees."}
            </Text>

            <TextInput
              style={styles.input}
              value={contactSearch}
              onChangeText={setContactSearch}
              placeholder="Search contacts by name or phone"
              placeholderTextColor="#6b7280"
            />

            <FlatList
              data={filteredContacts}
              keyExtractor={(item) => item.id}
              scrollEnabled={false}
              ListEmptyComponent={
                <Text style={styles.emptyText}>
                  {contactSearch.trim()
                    ? "No contacts match your search."
                    : "No contacts available."}
                </Text>
              }
              renderItem={({ item }) => (
                <View style={styles.contactRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.listName}>{item.name}</Text>
                    <Text style={styles.listMeta}>
                      {item.phone || "No phone"}
                    </Text>
                  </View>
                  <Pressable
                    style={styles.addButton}
                    disabled={!selectedEventId || addingInvitee}
                    onPress={() => onAddInvitee(item.id)}
                  >
                    <Text style={styles.addButtonText}>Add</Text>
                  </Pressable>
                </View>
              )}
            />
          </CollapsibleSection>
        </View>

        <View style={styles.card}>
          <CollapsibleSection title="Linked Invitees">
            <FlatList
              data={invitees}
              keyExtractor={(item) => item.id}
              scrollEnabled={false}
              ListEmptyComponent={
                <Text style={styles.emptyText}>No invitees linked yet.</Text>
              }
              renderItem={({ item }) => (
                <View style={styles.listItem}>
                  <Text style={styles.listName}>{item.name}</Text>
                  <Text style={styles.listMeta}>
                    {item.phone || "No phone"}
                  </Text>
                </View>
              )}
            />
          </CollapsibleSection>
        </View>

        <View style={styles.card}>
          <CollapsibleSection title="Add Gift">
            <Text style={styles.helperText}>
              {selectedEvent
                ? `Event: ${selectedEvent.event_name}`
                : "Select an event first."}
            </Text>

            {invitees.length > 0 ? (
              <View style={styles.chipWrap}>
                {invitees.map((invitee) => {
                  const active = invitee.id === selectedGiftContactId;
                  return (
                    <Pressable
                      key={invitee.id}
                      onPress={() => setSelectedGiftContactId(invitee.id)}
                      style={[styles.chip, active && styles.chipActive]}
                    >
                      <Text style={styles.chipText}>{invitee.name}</Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : (
              <Text style={styles.emptyText}>
                Add invitees before adding gifts.
              </Text>
            )}

            <TextInput
              style={styles.input}
              value={giftName}
              onChangeText={setGiftName}
              placeholder="Gift name"
              placeholderTextColor="#6b7280"
            />
            <TextInput
              style={styles.input}
              value={giftAmount}
              onChangeText={setGiftAmount}
              placeholder="Amount (optional)"
              placeholderTextColor="#6b7280"
              keyboardType="decimal-pad"
            />
            <TextInput
              style={[styles.input, styles.multilineInput]}
              value={giftNotes}
              onChangeText={setGiftNotes}
              placeholder="Notes (optional)"
              placeholderTextColor="#6b7280"
              multiline
              textAlignVertical="top"
            />
            <Pressable
              style={styles.primaryButton}
              disabled={
                creatingGift || !selectedEventId || !selectedGiftContact
              }
              onPress={onCreateGift}
            >
              <Text style={styles.primaryButtonText}>
                {creatingGift ? "Saving..." : "Add Gift"}
              </Text>
            </Pressable>
          </CollapsibleSection>
        </View>

        <View style={styles.card}>
          <CollapsibleSection title="Gifts For Event">
            <FlatList
              data={gifts}
              keyExtractor={(item) => item.id}
              scrollEnabled={false}
              ListEmptyComponent={
                <Text style={styles.emptyText}>No gifts recorded yet.</Text>
              }
              renderItem={({ item }) => {
                const amount = parseAmount(
                  item.amount ?? item.gift_value ?? null,
                );
                const note = getGiftNote(item);
                const linkedContact = getGiftContact(item);

                return (
                  <View style={styles.listItem}>
                    <Text style={styles.listName}>{getGiftName(item)}</Text>
                    <Text style={styles.listMeta}>
                      {linkedContact?.name
                        ? `For ${linkedContact.name}`
                        : "No invitee"}
                      {amount !== null ? ` • Rs. ${amount}` : ""}
                    </Text>
                    <Text style={styles.listMeta}>
                      {typeof item.created_at === "string"
                        ? `Added ${formatDate(item.created_at)}`
                        : ""}
                    </Text>
                    {note ? <Text style={styles.noteText}>{note}</Text> : null}
                  </View>
                );
              }}
            />
          </CollapsibleSection>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#0a1128",
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 24,
    gap: 12,
  },
  header: {
    paddingTop: 8,
  },
  logo: {
    color: "#00d2ff",
    fontSize: 30,
    fontWeight: "800",
  },
  subtitle: {
    color: "#94a3b8",
    marginTop: 4,
  },
  card: {
    backgroundColor: "#131d3a",
    borderRadius: 14,
    borderColor: "#223157",
    borderWidth: 1,
    padding: 12,
    gap: 8,
  },
  cardTitle: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 16,
  },
  helperText: {
    color: "#94a3b8",
  },
  chipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    backgroundColor: "#1f2a44",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#2e4068",
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  chipActive: {
    backgroundColor: "#2a3f66",
    borderColor: "#4d6ea8",
  },
  chipText: {
    color: "#c7d2fe",
    fontWeight: "700",
  },
  input: {
    backgroundColor: "#0d1732",
    borderColor: "#2a3b5c",
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#ffffff",
  },
  multilineInput: {
    minHeight: 70,
  },
  primaryButton: {
    backgroundColor: "#00d2ff",
    borderRadius: 10,
    paddingVertical: 10,
  },
  primaryButtonText: {
    color: "#0a1128",
    textAlign: "center",
    fontWeight: "800",
  },
  emptyText: {
    color: "#94a3b8",
    textAlign: "center",
    marginVertical: 10,
  },
  listItem: {
    borderTopWidth: 1,
    borderTopColor: "#233251",
    paddingVertical: 10,
  },
  listItemActive: {
    backgroundColor: "#1c2b4b",
    borderRadius: 8,
    paddingHorizontal: 8,
  },
  listName: {
    color: "#ffffff",
    fontWeight: "700",
  },
  listMeta: {
    color: "#94a3b8",
    marginTop: 2,
  },
  noteText: {
    color: "#cbd5e1",
    marginTop: 6,
  },
  contactRow: {
    borderTopWidth: 1,
    borderTopColor: "#233251",
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  addButton: {
    backgroundColor: "#1f2a44",
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#2e4068",
  },
  addButtonText: {
    color: "#c7d2fe",
    fontWeight: "700",
  },
});
