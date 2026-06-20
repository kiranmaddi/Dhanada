/**
 * Events screen
 *
 * Supabase — run this migration if columns don't exist yet:
 *
 *   ALTER TABLE events
 *     ADD COLUMN IF NOT EXISTS venue            text,
 *     ADD COLUMN IF NOT EXISTS description      text,
 *     ADD COLUMN IF NOT EXISTS invitation_text  text,
 *     ADD COLUMN IF NOT EXISTS is_repetitive    boolean NOT NULL DEFAULT false;
 */

import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import DateTimePicker, {
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { SafeAreaView } from "react-native-safe-area-context";

import { CollapsibleSection } from "@/components/ui/collapsible-section";
import { supabase } from "@/lib/supabase";

type AppEvent = {
  id: string;
  event_name: string;
  event_date: string;
  venue: string | null;
  description: string | null;
  invitation_text: string | null;
  is_repetitive: boolean;
  created_at: string;
};

function toDisplayDate(iso: string) {
  if (!iso) return "No date";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString();
}

export default function EventsScreen() {
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [events, setEvents] = useState<AppEvent[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Form state
  const [eventName, setEventName] = useState("");
  const [venue, setVenue] = useState("");
  const [description, setDescription] = useState("");
  const [invitationText, setInvitationText] = useState("");
  const [isRepetitive, setIsRepetitive] = useState(false);
  const [date, setDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);

  const editingEvent = events.find((e) => e.id === editingId);

  const startEdit = (ev: AppEvent) => {
    setEventName(ev.event_name);
    setVenue(ev.venue || "");
    setDescription(ev.description || "");
    setInvitationText(ev.invitation_text || "");
    setIsRepetitive(ev.is_repetitive);
    setDate(new Date(ev.event_date));
    setEditingId(ev.id);
    setExpandedId(null);
  };

  const cancelEdit = () => {
    setEventName("");
    setVenue("");
    setDescription("");
    setInvitationText("");
    setIsRepetitive(false);
    setDate(new Date());
    setEditingId(null);
  };

  const fetchEvents = useCallback(async (ownerId: string) => {
    const { data, error } = await supabase
      .from("events")
      .select(
        "id,event_name,event_date,venue,description,invitation_text,is_repetitive,created_at",
      )
      .eq("owner_id", ownerId)
      .order("event_date", { ascending: true });

    if (error) {
      Alert.alert("Events error", error.message);
      return;
    }

    setEvents((data ?? []) as AppEvent[]);
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

      setUserId(session.user.id);
      await fetchEvents(session.user.id);
      setLoading(false);
    })();

    return () => {
      mounted = false;
    };
  }, [fetchEvents]);

  function onDateChange(_: DateTimePickerEvent, selected?: Date) {
    if (Platform.OS === "android") setShowDatePicker(false);
    if (selected) setDate(selected);
  }

  async function onCreate() {
    if (!userId) return;

    if (!eventName.trim()) {
      Alert.alert("Validation", "Event name is required.");
      return;
    }

    if (editingId) {
      // Update mode
      setUpdating(true);

      const { error } = await supabase
        .from("events")
        .update({
          event_name: eventName.trim(),
          event_date: date.toISOString().split("T")[0],
          venue: venue.trim() || null,
          description: description.trim() || null,
          invitation_text: invitationText.trim() || null,
          is_repetitive: isRepetitive,
        })
        .eq("id", editingId);

      setUpdating(false);

      if (error) {
        Alert.alert("Update failed", error.message);
        return;
      }

      setEvents((cur) =>
        cur.map((ev) =>
          ev.id === editingId
            ? {
                ...ev,
                event_name: eventName.trim(),
                event_date: date.toISOString().split("T")[0],
                venue: venue.trim() || null,
                description: description.trim() || null,
                invitation_text: invitationText.trim() || null,
                is_repetitive: isRepetitive,
              }
            : ev,
        ),
      );

      cancelEdit();
    } else {
      // Create mode
      setCreating(true);

      const { data, error } = await supabase
        .from("events")
        .insert({
          owner_id: userId,
          event_name: eventName.trim(),
          event_date: date.toISOString().split("T")[0],
          venue: venue.trim() || null,
          description: description.trim() || null,
          invitation_text: invitationText.trim() || null,
          is_repetitive: isRepetitive,
        })
        .select(
          "id,event_name,event_date,venue,description,invitation_text,is_repetitive,created_at",
        )
        .single();

      setCreating(false);

      if (error) {
        Alert.alert("Create failed", error.message);
        return;
      }

      setEventName("");
      setVenue("");
      setDescription("");
      setInvitationText("");
      setIsRepetitive(false);
      setDate(new Date());

      if (data) {
        setEvents((cur) =>
          [...cur, data as AppEvent].sort(
            (a, b) =>
              new Date(a.event_date).getTime() -
              new Date(b.event_date).getTime(),
          ),
        );
      }
    }
  }

  async function onDelete() {
    if (!editingId) {
      return;
    }

    Alert.alert("Delete Event", "Delete this event? This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          const targetId = editingId;
          setDeleting(true);
          const { error } = await supabase
            .from("events")
            .delete()
            .eq("id", targetId);
          setDeleting(false);

          if (error) {
            Alert.alert("Delete failed", error.message);
            return;
          }

          setEvents((cur) => cur.filter((ev) => ev.id !== targetId));
          cancelEdit();
        },
      },
    ]);
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

        {/* ── Create/Edit Event Form ── */}
        <View style={styles.card}>
          <CollapsibleSection title={editingEvent ? "Edit Event" : "New Event"}>
            <TextInput
              style={styles.input}
              value={eventName}
              onChangeText={setEventName}
              placeholder="Event name *"
              placeholderTextColor="#6b7280"
            />
            <TextInput
              style={styles.input}
              value={venue}
              onChangeText={setVenue}
              placeholder="Venue"
              placeholderTextColor="#6b7280"
            />
            <TextInput
              style={[styles.input, styles.multiline]}
              value={description}
              onChangeText={setDescription}
              placeholder="Description"
              placeholderTextColor="#6b7280"
              multiline
              numberOfLines={3}
            />
            <TextInput
              style={[styles.input, styles.multiline]}
              value={invitationText}
              onChangeText={setInvitationText}
              placeholder="Invitation text"
              placeholderTextColor="#6b7280"
              multiline
              numberOfLines={3}
            />

            <Text style={styles.label}>Date</Text>
            <Pressable
              style={styles.dateButton}
              onPress={() => setShowDatePicker(true)}
            >
              <Text style={styles.dateText}>{date.toLocaleDateString()}</Text>
              <Text style={styles.dateHint}>Tap to change</Text>
            </Pressable>
            {showDatePicker && (
              <View>
                <DateTimePicker
                  value={date}
                  mode="date"
                  display={Platform.OS === "ios" ? "spinner" : "default"}
                  onChange={onDateChange}
                />
                {Platform.OS === "ios" && (
                  <Pressable
                    style={styles.doneButton}
                    onPress={() => setShowDatePicker(false)}
                  >
                    <Text style={styles.doneText}>Done</Text>
                  </Pressable>
                )}
              </View>
            )}

            <Text style={styles.label}>Frequency</Text>
            <View style={styles.toggleRow}>
              <Pressable
                style={[
                  styles.toggleOption,
                  !isRepetitive && styles.toggleActive,
                ]}
                onPress={() => setIsRepetitive(false)}
              >
                <Text
                  style={[
                    styles.toggleText,
                    !isRepetitive && styles.toggleTextActive,
                  ]}
                >
                  Once
                </Text>
              </Pressable>
              <Pressable
                style={[
                  styles.toggleOption,
                  isRepetitive && styles.toggleActive,
                ]}
                onPress={() => setIsRepetitive(true)}
              >
                <Text
                  style={[
                    styles.toggleText,
                    isRepetitive && styles.toggleTextActive,
                  ]}
                >
                  Repetitive
                </Text>
              </Pressable>
            </View>

            <Pressable
              style={[
                styles.primaryButton,
                (creating || updating) && styles.buttonDisabled,
              ]}
              disabled={creating || updating}
              onPress={onCreate}
            >
              <Text style={styles.primaryButtonText}>
                {editingId
                  ? updating
                    ? "Updating..."
                    : "Update Event"
                  : creating
                    ? "Creating..."
                    : "Create Event"}
              </Text>
            </Pressable>

            {editingId && (
              <>
                <Pressable
                  style={[
                    styles.removeButton,
                    deleting && styles.buttonDisabled,
                  ]}
                  disabled={deleting}
                  onPress={onDelete}
                >
                  <Text style={styles.removeButtonText}>
                    {deleting ? "Deleting..." : "Delete Event"}
                  </Text>
                </Pressable>

                <Pressable style={styles.secondaryButton} onPress={cancelEdit}>
                  <Text style={styles.secondaryButtonText}>Cancel</Text>
                </Pressable>
              </>
            )}
          </CollapsibleSection>
        </View>

        {/* ── Events List ── */}
        <View style={styles.card}>
          <CollapsibleSection title={`Events (${events.length})`}>
            {events.length === 0 && (
              <Text style={styles.emptyText}>No events yet.</Text>
            )}

            {events.map((event) => (
              <View key={event.id} style={styles.eventItem}>
                <Pressable
                  style={styles.eventHeader}
                  onPress={() =>
                    setExpandedId(expandedId === event.id ? null : event.id)
                  }
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.eventName}>{event.event_name}</Text>
                    <View style={styles.badgeRow}>
                      <Text style={styles.dateBadge}>
                        {toDisplayDate(event.event_date)}
                      </Text>
                      {event.is_repetitive && (
                        <Text style={styles.repBadge}>Recurring</Text>
                      )}
                    </View>
                  </View>
                  <Pressable
                    style={styles.editButton}
                    onPress={() => startEdit(event)}
                  >
                    <Text style={styles.editButtonText}>Edit</Text>
                  </Pressable>
                </Pressable>

                {expandedId === event.id && (
                  <View style={styles.eventDetail}>
                    {Boolean(event.venue) && (
                      <Text style={styles.detailText}>📍 {event.venue}</Text>
                    )}
                    {Boolean(event.description) && (
                      <Text style={styles.detailText}>
                        📝 {event.description}
                      </Text>
                    )}
                    {Boolean(event.invitation_text) && (
                      <Text style={styles.detailText}>
                        ✉️ {event.invitation_text}
                      </Text>
                    )}
                  </View>
                )}
              </View>
            ))}
          </CollapsibleSection>
        </View>
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
  cardTitle: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 4,
  },
  label: { color: "#9aa5c5", fontSize: 13, marginBottom: -4 },
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
  dateButton: {
    backgroundColor: "#0d1732",
    borderColor: "#2a3b5c",
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  dateText: { color: "#ffffff", fontSize: 15 },
  dateHint: { color: "#6b7280", fontSize: 12 },
  doneButton: {
    alignSelf: "flex-end",
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  doneText: { color: "#00d2ff", fontWeight: "700" },
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
  toggleActive: { backgroundColor: "#00d2ff", borderColor: "#00d2ff" },
  toggleText: { color: "#9aa5c5", fontWeight: "600" },
  toggleTextActive: { color: "#0a1128" },
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
  emptyText: { color: "#6b7280", textAlign: "center", paddingVertical: 8 },
  eventItem: {
    backgroundColor: "#0d1732",
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: "#2a3b5c",
    marginBottom: 8,
  },
  eventHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  eventName: { color: "#ffffff", fontWeight: "700" },
  badgeRow: { flexDirection: "row", gap: 6, flexWrap: "wrap", marginTop: 2 },
  dateBadge: {
    color: "#9aa5c5",
    fontSize: 12,
    backgroundColor: "#1a2c54",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  repBadge: {
    color: "#00d2ff",
    fontSize: 12,
    backgroundColor: "#0d2540",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  eventDetail: { marginTop: 10, gap: 4 },
  detailText: { color: "#9aa5c5", fontSize: 13 },
  editButton: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: "#374151",
    borderRadius: 6,
  },
  editButtonText: {
    color: "#e5e7eb",
    fontSize: 12,
    fontWeight: "600",
  },
  removeButton: {
    backgroundColor: "#dc2626",
    borderRadius: 10,
    paddingVertical: 12,
    marginTop: 8,
  },
  removeButtonText: {
    textAlign: "center",
    color: "#ffffff",
    fontWeight: "700",
  },
  secondaryButton: {
    backgroundColor: "#0d1732",
    borderColor: "#2a3b5c",
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 12,
    marginTop: 8,
  },
  secondaryButtonText: {
    textAlign: "center",
    color: "#9aa5c5",
    fontWeight: "600",
  },
});
