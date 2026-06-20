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

import { supabase } from "@/lib/supabase";

type AppEvent = { id: string; event_name: string; event_date: string };
type Contact = { id: string; name: string; phone: string | null };
type GiftType = "cash" | "gift";

type GiftRow = {
  id: string;
  event_id: string;
  contact_id: string | null;
  contacts?: Contact | Contact[] | null;
  [key: string]: unknown;
};

function toDisplayDate(iso: string) {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString();
}

function giftName(gift: GiftRow): string {
  const candidates = [
    gift.item_description,
    gift.gift_name,
    gift.item_name,
    gift.name,
  ];
  const hit = candidates.find(
    (v) => typeof v === "string" && v.trim().length > 0,
  );
  if (typeof hit === "string") return hit;

  const giftType = gift.gift_type;
  if (giftType === "cash" || giftType === "monetary") return "Cash Gift";
  if (giftType === "gift" || giftType === "item") return "Gift Article";

  return "Unnamed gift";
}

function giftNotes(gift: GiftRow): string {
  const candidates = [gift.notes, gift.note, gift.description];
  const hit = candidates.find(
    (v) => typeof v === "string" && v.trim().length > 0,
  );
  return typeof hit === "string" ? hit : "";
}

function giftAmount(gift: GiftRow): string {
  const raw = gift.value_amount ?? gift.amount ?? gift.gift_value;
  if (raw == null) return "";
  const n = Number(raw);
  return Number.isFinite(n) ? `₹${n.toLocaleString()}` : "";
}

function contactForGift(gift: GiftRow): Contact | null {
  const c = gift.contacts;
  if (!c) return null;
  return Array.isArray(c) ? (c[0] ?? null) : c;
}

function normalizeGiftType(value: unknown): GiftType {
  if (value === "monetary" || value === "cash") return "cash";
  if (value === "item" || value === "gift" || value === "gift_article")
    return "gift";
  return "gift";
}

export default function GiftsScreen() {
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  const [events, setEvents] = useState<AppEvent[]>([]);
  const [invitees, setInvitees] = useState<Contact[]>([]);
  const [gifts, setGifts] = useState<GiftRow[]>([]);

  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [selectedContactId, setSelectedContactId] = useState<string | null>(
    null,
  );
  const [giftNameInput, setGiftNameInput] = useState("");
  const [giftAmountInput, setGiftAmountInput] = useState("");
  const [giftNotesInput, setGiftNotesInput] = useState("");
  const [giftType, setGiftType] = useState<GiftType>("cash");
  const [editingGiftId, setEditingGiftId] = useState<string | null>(null);

  // Search & inline add
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [newContactName, setNewContactName] = useState("");
  const [newContactPhone, setNewContactPhone] = useState("");
  const [addingNewContact, setAddingNewContact] = useState(false);

  const selectedEvent = useMemo(
    () => events.find((e) => e.id === selectedEventId) ?? null,
    [events, selectedEventId],
  );

  const selectedContact = useMemo(
    () => invitees.find((c) => c.id === selectedContactId) ?? null,
    [invitees, selectedContactId],
  );

  const editingGift = useMemo(
    () => gifts.find((g) => g.id === editingGiftId) ?? null,
    [gifts, editingGiftId],
  );

  const filteredInvitees = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.trim().toLowerCase();
    const qDigits = q.replace(/\D/g, "");
    return invitees
      .filter(
        (inv) =>
          inv.name.toLowerCase().includes(q) ||
          (inv.phone ? inv.phone.replace(/\D/g, "").includes(qDigits) : false),
      )
      .slice(0, 10);
  }, [searchQuery, invitees]);

  const startEditGift = (gift: GiftRow) => {
    setSelectedContactId(gift.contact_id);
    setGiftType(normalizeGiftType(gift.gift_type));
    const amount = gift.value_amount ?? gift.amount ?? gift.gift_value;
    const itemDesc = gift.item_description ?? "";
    setGiftNameInput(itemDesc);
    setGiftAmountInput(amount ? String(amount) : "");
    setGiftNotesInput("");
    setEditingGiftId(gift.id);
  };

  const cancelEditGift = () => {
    setSelectedContactId(null);
    setGiftNameInput("");
    setGiftAmountInput("");
    setGiftNotesInput("");
    setGiftType("cash");
    setEditingGiftId(null);
  };

  const fetchInvitees = useCallback(
    async (eventId: string) => {
      const { data, error } = await supabase
        .from("event_invitees")
        .select("id, contacts(id,name,phone)")
        .eq("event_id", eventId);

      if (error) {
        Alert.alert("Invitees error", error.message);
        return;
      }

      const normalized = (data ?? []).flatMap((row: { contacts?: unknown }) => {
        const c = row.contacts as Contact | Contact[] | null;
        if (!c) return [];
        return Array.isArray(c) ? c : [c];
      });

      setInvitees(normalized as Contact[]);
      if (normalized.length > 0 && !selectedContactId) {
        setSelectedContactId((normalized[0] as Contact).id);
      }
    },
    [selectedContactId],
  );

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

      const { data, error } = await supabase
        .from("events")
        .select("id,event_name,event_date")
        .eq("owner_id", uid)
        .order("event_date", { ascending: true });

      if (!mounted) return;

      if (error) {
        Alert.alert("Events error", error.message);
      } else {
        const evList = (data ?? []) as AppEvent[];
        setEvents(evList);
        if (evList.length > 0) setSelectedEventId(evList[0].id);
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
      setGifts([]);
      setSelectedContactId(null);
      return;
    }

    void fetchInvitees(selectedEventId);
    void fetchGifts(selectedEventId);
  }, [fetchGifts, fetchInvitees, selectedEventId]);

  // keep contact selection valid when invitees change
  useEffect(() => {
    if (!invitees.length) {
      setSelectedContactId(null);
      return;
    }
    if (
      !selectedContactId ||
      !invitees.some((i) => i.id === selectedContactId)
    ) {
      setSelectedContactId(invitees[0].id);
    }
  }, [invitees, selectedContactId]);

  async function onAddNewContact() {
    if (!userId || !selectedEventId) return;
    if (!newContactName.trim()) {
      Alert.alert("Validation", "Contact name is required.");
      return;
    }

    setAddingNewContact(true);

    try {
      const { data: contactData, error: contactError } = await supabase
        .from("contacts")
        .insert({
          owner_id: userId,
          name: newContactName.trim(),
          phone: newContactPhone.trim() || null,
        })
        .select("id,name,phone")
        .single();

      if (contactError || !contactData) {
        throw new Error(contactError?.message || "Failed to create contact");
      }

      const { error: inviteeError } = await supabase
        .from("event_invitees")
        .insert({
          event_id: selectedEventId,
          contact_id: contactData.id,
        });

      if (inviteeError) {
        throw new Error(inviteeError.message);
      }

      await fetchInvitees(selectedEventId);
      setSelectedContactId(contactData.id);
      setNewContactName("");
      setNewContactPhone("");
      setSearchQuery("");
      setShowSearchDropdown(false);
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : "Failed to add contact";
      Alert.alert("Error", msg);
    } finally {
      setAddingNewContact(false);
    }
  }

  async function onCreateGift() {
    if (!selectedEventId) {
      Alert.alert("Select event", "Choose an event first.");
      return;
    }
    if (!selectedContactId) {
      Alert.alert("Select invitee", "Choose an invitee to link the gift.");
      return;
    }
    if (giftType === "cash" && !giftAmountInput.trim()) {
      Alert.alert("Validation", "Amount is required for Cash gifts.");
      return;
    }

    if (giftType === "gift" && !giftNameInput.trim()) {
      Alert.alert("Validation", "Gift name is required for Gift Article.");
      return;
    }

    const trimmedAmount = giftAmountInput.trim();
    const parsedAmount = trimmedAmount ? Number(trimmedAmount) : null;
    if (trimmedAmount && !Number.isFinite(parsedAmount)) {
      Alert.alert("Validation", "Amount must be a number.");
      return;
    }

    setCreating(true);

    const base = {
      event_id: selectedEventId,
      contact_id: selectedContactId,
      gift_type: giftType,
      owner_id: userId,
    };

    // Store gift name or notes in item_description; amount in value_amount
    const itemDesc =
      giftType === "gift"
        ? giftNameInput.trim() || "Gift"
        : giftNotesInput.trim() || null;

    const payloads = [
      {
        ...base,
        value_amount: giftType === "cash" ? parsedAmount : null,
        item_description: itemDesc,
      },
    ];

    let inserted: GiftRow | null = null;
    let lastError: { code?: string; message?: string } | null = null;

    for (const payload of payloads) {
      const { data, error } = await supabase
        .from("gifts")
        .insert(payload)
        .select("*, contacts(id,name,phone)")
        .single();

      if (!error) {
        inserted = data as GiftRow;
        break;
      }

      lastError = { code: error.code, message: error.message };
      if (error.code === "42501") break;

      const lower = error.message?.toLowerCase() ?? "";
      if (
        !(
          error.code === "42703" ||
          error.code === "PGRST204" ||
          lower.includes("column") ||
          lower.includes("schema cache")
        )
      ) {
        break;
      }
    }

    setCreating(false);

    if (!inserted) {
      const msg =
        lastError?.code === "42501"
          ? "Permission denied — check RLS policy for gifts."
          : (lastError?.message ?? "Unable to create gift.");
      Alert.alert("Create failed", msg);
      return;
    }

    setGiftNameInput("");
    setGiftAmountInput("");
    setGiftNotesInput("");
    setGiftType("cash");
    setGifts((curr) => [inserted as GiftRow, ...curr]);
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

        {/* ── Event selector ── */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Select Event</Text>
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
                    style={[styles.eventChip, active && styles.eventChipActive]}
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
        </View>

        {/* ── Add Gift Form ── */}
        {selectedEvent && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>
              Add Gift — {selectedEvent.event_name}
            </Text>

            {invitees.length === 0 ? (
              <Text style={styles.emptyText}>
                Add invitees in the Invitees tab before adding gifts.
              </Text>
            ) : (
              <>
                <Text style={styles.label}>
                  Search Invitee by Name or Phone
                </Text>
                <TextInput
                  style={styles.input}
                  placeholder="Type name or phone number..."
                  value={searchQuery}
                  onChangeText={(text) => {
                    setSearchQuery(text);
                    setShowSearchDropdown(true);
                  }}
                  onFocus={() => setShowSearchDropdown(true)}
                  placeholderTextColor="#6b7280"
                />

                {showSearchDropdown && searchQuery.trim() && (
                  <View style={styles.dropdown}>
                    {filteredInvitees.length > 0 ? (
                      filteredInvitees.map((inv) => (
                        <Pressable
                          key={inv.id}
                          style={styles.dropdownItem}
                          onPress={() => {
                            setSelectedContactId(inv.id);
                            setSearchQuery("");
                            setShowSearchDropdown(false);
                          }}
                        >
                          <Text style={styles.dropdownItemName}>
                            {inv.name}
                          </Text>
                          {inv.phone && (
                            <Text style={styles.dropdownItemPhone}>
                              {inv.phone}
                            </Text>
                          )}
                        </Pressable>
                      ))
                    ) : (
                      <View style={styles.noMatch}>
                        <Text style={styles.noMatchText}>No invitee found</Text>
                        <TextInput
                          style={[styles.input, styles.mt8]}
                          placeholder="New contact name *"
                          value={newContactName}
                          onChangeText={setNewContactName}
                          placeholderTextColor="#6b7280"
                        />
                        <TextInput
                          style={[styles.input, styles.mt8]}
                          placeholder="Phone (optional - 10 digits)"
                          value={newContactPhone}
                          onChangeText={(text) => {
                            const digits = text.replace(/\D/g, "").slice(0, 10);
                            setNewContactPhone(digits);
                          }}
                          placeholderTextColor="#6b7280"
                          keyboardType="phone-pad"
                          maxLength={10}
                        />
                        <Pressable
                          style={[
                            styles.addBtn,
                            addingNewContact && styles.disabled,
                          ]}
                          onPress={onAddNewContact}
                          disabled={addingNewContact}
                        >
                          <Text style={styles.addBtnText}>
                            {addingNewContact ? "Adding..." : "Add & Invite"}
                          </Text>
                        </Pressable>
                      </View>
                    )}
                  </View>
                )}

                {selectedContact && (
                  <Text style={styles.helper}>
                    Selected:{" "}
                    <Text style={{ fontWeight: "600" }}>
                      {selectedContact.name}
                    </Text>
                    {selectedContact.phone && ` • ${selectedContact.phone}`}
                  </Text>
                )}

                <Text style={styles.label}>Gift Type</Text>
                <View style={styles.toggleRow}>
                  <Pressable
                    style={[
                      styles.toggleOption,
                      giftType === "cash" && styles.toggleOptionActive,
                    ]}
                    onPress={() => setGiftType("cash")}
                  >
                    <Text
                      style={[
                        styles.toggleOptionText,
                        giftType === "cash" && styles.toggleOptionTextActive,
                      ]}
                    >
                      Cash
                    </Text>
                  </Pressable>
                  <Pressable
                    style={[
                      styles.toggleOption,
                      giftType === "gift" && styles.toggleOptionActive,
                    ]}
                    onPress={() => setGiftType("gift")}
                  >
                    <Text
                      style={[
                        styles.toggleOptionText,
                        giftType === "gift" && styles.toggleOptionTextActive,
                      ]}
                    >
                      Gift Article
                    </Text>
                  </Pressable>
                </View>

                {giftType === "gift" ? (
                  <TextInput
                    style={styles.input}
                    value={giftNameInput}
                    onChangeText={setGiftNameInput}
                    placeholder="Gift name *"
                    placeholderTextColor="#6b7280"
                  />
                ) : (
                  <TextInput
                    style={styles.input}
                    value={giftAmountInput}
                    onChangeText={setGiftAmountInput}
                    placeholder="Amount *"
                    placeholderTextColor="#6b7280"
                    keyboardType="decimal-pad"
                  />
                )}
                <TextInput
                  style={[styles.input, styles.multiline]}
                  value={giftNotesInput}
                  onChangeText={setGiftNotesInput}
                  placeholder="Notes (optional)"
                  placeholderTextColor="#6b7280"
                  multiline
                  numberOfLines={3}
                />

                <Pressable
                  style={[
                    styles.primaryButton,
                    creating && styles.buttonDisabled,
                  ]}
                  disabled={creating}
                  onPress={onCreateGift}
                >
                  <Text style={styles.primaryButtonText}>
                    {creating ? "Adding..." : "Add Gift"}
                  </Text>
                </Pressable>
              </>
            )}
          </View>
        )}

        {/* ── Gifts list ── */}
        {selectedEvent && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>
              Gifts ({gifts.length}) — {selectedEvent.event_name}
            </Text>
            {gifts.length === 0 ? (
              <Text style={styles.emptyText}>No gifts recorded yet.</Text>
            ) : (
              <FlatList
                data={gifts}
                keyExtractor={(item) => item.id}
                scrollEnabled={false}
                renderItem={({ item }) => {
                  const contact = contactForGift(item);
                  const amount = giftAmount(item);
                  const notes = giftNotes(item);
                  return (
                    <View style={styles.giftRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.giftName}>{giftName(item)}</Text>
                        {Boolean(contact) && (
                          <Text style={styles.giftMeta}>
                            From: {contact!.name}
                          </Text>
                        )}
                        {Boolean(amount) && (
                          <Text style={styles.giftAmount}>{amount}</Text>
                        )}
                        {Boolean(notes) && (
                          <Text style={styles.giftNotes}>{notes}</Text>
                        )}
                      </View>
                    </View>
                  );
                }}
              />
            )}
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
  label: { color: "#9aa5c5", fontSize: 13, marginBottom: -4 },
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
  chipRow: { flexDirection: "row", gap: 8, paddingVertical: 4 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "#0d1732",
    borderWidth: 1,
    borderColor: "#2a3b5c",
  },
  chipActive: { backgroundColor: "#00d2ff", borderColor: "#00d2ff" },
  chipText: { color: "#9aa5c5", fontWeight: "600" },
  chipTextActive: { color: "#0a1128" },
  toggleRow: { flexDirection: "row", gap: 8 },
  toggleOption: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#2a3b5c",
    alignItems: "center",
    backgroundColor: "#0d1732",
  },
  toggleOptionActive: {
    backgroundColor: "#00d2ff",
    borderColor: "#00d2ff",
  },
  toggleOptionText: { color: "#9aa5c5", fontWeight: "600", fontSize: 13 },
  toggleOptionTextActive: { color: "#0a1128" },
  input: {
    backgroundColor: "#0d1732",
    borderColor: "#2a3b5c",
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: "#ffffff",
  },
  multiline: { minHeight: 80, textAlignVertical: "top" },
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
  giftRow: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderColor: "#1a2c54",
  },
  giftName: { color: "#ffffff", fontWeight: "700" },
  giftMeta: { color: "#9aa5c5", fontSize: 12, marginTop: 2 },
  giftAmount: {
    color: "#00d2ff",
    fontSize: 13,
    marginTop: 2,
    fontWeight: "600",
  },
  giftNotes: { color: "#6b7280", fontSize: 12, marginTop: 2 },
  dropdown: {
    backgroundColor: "#1a2c54",
    borderRadius: 8,
    marginTop: 8,
    maxHeight: 250,
  },
  dropdownItem: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderColor: "#2a3b5c",
  },
  dropdownItemName: { color: "#ffffff", fontWeight: "600" },
  dropdownItemPhone: { color: "#9aa5c5", fontSize: 12, marginTop: 4 },
  noMatch: {
    paddingVertical: 16,
    paddingHorizontal: 14,
  },
  noMatchText: { color: "#9aa5c5", fontSize: 13, marginBottom: 8 },
  helper: { color: "#00d2ff", fontSize: 13, marginVertical: 8 },
  addBtn: {
    backgroundColor: "#00d2ff",
    borderRadius: 8,
    paddingVertical: 10,
    marginTop: 8,
  },
  addBtnText: { color: "#0a1128", fontWeight: "600", textAlign: "center" },
  disabled: { opacity: 0.6 },
  mt8: { marginTop: 8 },
});
