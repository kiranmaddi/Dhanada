import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { CollapsibleSection } from "@/components/ui/collapsible-section";
import { supabase } from "@/lib/supabase";

type Contact = {
  id: string;
  name: string;
  phone: string | null;
};

type MatchCandidate = {
  contact_id: string;
  contact_name: string;
  contact_phone: string | null;
  matched_user_id: string;
};

function isValidOptionalPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.length === 0 || digits.length === 10;
}

function hasValidPhone(value: string | null | undefined) {
  if (!value) return false;
  return value.replace(/\D/g, "").length === 10;
}

function generateInviteToken() {
  const rand = Math.random().toString(36).slice(2);
  const rand2 = Math.random().toString(36).slice(2);
  return `${Date.now().toString(36)}${rand}${rand2}`;
}

export default function HomeScreen() {
  const [loading, setLoading] = useState(true);
  const [savingPhone, setSavingPhone] = useState(false);
  const [addingContact, setAddingContact] = useState(false);
  const [updatingContact, setUpdatingContact] = useState(false);
  const [deletingContact, setDeletingContact] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string>("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [phoneVerifiedAt, setPhoneVerifiedAt] = useState<string | null>(null);
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [matchCandidates, setMatchCandidates] = useState<MatchCandidate[]>([]);
  const [loadingMatches, setLoadingMatches] = useState(false);
  const [connectingContactId, setConnectingContactId] = useState<string | null>(
    null,
  );
  const [editingContactId, setEditingContactId] = useState<string | null>(null);

  const isReady = useMemo(() => Boolean(userId), [userId]);

  const editingContact = useMemo(
    () => contacts.find((c) => c.id === editingContactId) ?? null,
    [contacts, editingContactId],
  );

  const candidateByContactId = useMemo(
    () =>
      new Map(
        matchCandidates.map((candidate) => [candidate.contact_id, candidate]),
      ),
    [matchCandidates],
  );

  const startEditContact = (contact: Contact) => {
    setContactName(contact.name);
    setContactPhone(contact.phone ?? "");
    setEditingContactId(contact.id);
  };

  const cancelEditContact = () => {
    setContactName("");
    setContactPhone("");
    setEditingContactId(null);
  };

  const fetchContacts = useCallback(async (ownerId: string) => {
    const { data, error } = await supabase
      .from("contacts")
      .select("id,name,phone")
      .eq("owner_id", ownerId)
      .order("created_at", { ascending: false });

    if (error) {
      Alert.alert("Contacts error", error.message);
      return;
    }

    setContacts((data ?? []) as Contact[]);
  }, []);

  const fetchMatchCandidates = useCallback(async () => {
    setLoadingMatches(true);
    const { data, error } = await supabase.rpc("get_contact_match_candidates", {
      max_rows: 25,
    });
    setLoadingMatches(false);

    if (error) {
      console.warn("Match candidates error", error.message);
      return;
    }

    setMatchCandidates((data ?? []) as MatchCandidate[]);
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
      setEmail(session.user.email ?? "");

      const { data: profile } = await supabase
        .from("profiles")
        .select("phone_number,phone_verified_at")
        .eq("id", uid)
        .single();

      if (profile?.phone_number) {
        setPhoneNumber(profile.phone_number);
      }
      setPhoneVerifiedAt(profile?.phone_verified_at ?? null);

      await fetchContacts(uid);
      await fetchMatchCandidates();
      setLoading(false);
    })();

    return () => {
      mounted = false;
    };
  }, [fetchContacts, fetchMatchCandidates]);

  async function onSavePhone() {
    if (!userId) return;

    if (!isValidOptionalPhone(phoneNumber)) {
      Alert.alert(
        "Validation",
        "Phone number must be exactly 10 digits if provided.",
      );
      return;
    }

    setSavingPhone(true);

    const { error } = await supabase.from("profiles").upsert({
      id: userId,
      phone_number: phoneNumber.trim() || null,
    });

    setSavingPhone(false);

    if (error) {
      Alert.alert("Profile update failed", error.message);
      return;
    }

    setPhoneVerifiedAt(null);
    await fetchMatchCandidates();

    Alert.alert("Saved", "Phone number updated.");
  }

  async function onAddContact() {
    if (!userId) return;

    const trimmedName = contactName.trim();
    if (!trimmedName) {
      Alert.alert("Validation", "Contact name is required.");
      return;
    }

    if (!isValidOptionalPhone(contactPhone)) {
      Alert.alert(
        "Validation",
        "Phone number must be exactly 10 digits if provided.",
      );
      return;
    }

    if (editingContactId) {
      setUpdatingContact(true);
      const { error } = await supabase
        .from("contacts")
        .update({
          name: trimmedName,
          phone: contactPhone.trim() || null,
        })
        .eq("id", editingContactId);
      setUpdatingContact(false);

      if (error) {
        Alert.alert("Update contact failed", error.message);
        return;
      }

      setContacts((cur) =>
        cur.map((c) =>
          c.id === editingContactId
            ? {
                ...c,
                name: trimmedName,
                phone: contactPhone.trim() || null,
              }
            : c,
        ),
      );
      cancelEditContact();
      await fetchMatchCandidates();
      return;
    }

    setAddingContact(true);

    const { error } = await supabase.from("contacts").insert({
      owner_id: userId,
      name: trimmedName,
      phone: contactPhone.trim() || null,
    });

    setAddingContact(false);

    if (error) {
      Alert.alert("Add contact failed", error.message);
      return;
    }

    setContactName("");
    setContactPhone("");
    await fetchContacts(userId);
    await fetchMatchCandidates();
  }

  async function onDeleteContact() {
    if (!editingContactId) {
      Alert.alert("Select contact", "Choose a contact to delete first.");
      return;
    }

    Alert.alert(
      "Delete Contact",
      "Delete this contact? This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            const targetId = editingContactId;
            setDeletingContact(true);
            const { error } = await supabase
              .from("contacts")
              .delete()
              .eq("id", targetId);
            setDeletingContact(false);

            if (error) {
              Alert.alert("Delete contact failed", error.message);
              return;
            }

            setContacts((cur) => cur.filter((c) => c.id !== targetId));
            cancelEditContact();
            await fetchMatchCandidates();
          },
        },
      ],
    );
  }

  async function onConnectCandidate(candidate: MatchCandidate) {
    if (!userId) return;

    setConnectingContactId(candidate.contact_id);

    const { error: linkError } = await supabase
      .from("contact_user_links")
      .upsert(
        {
          owner_user_id: userId,
          contact_id: candidate.contact_id,
          linked_user_id: candidate.matched_user_id,
          linked_via: "manual",
          verified_at: new Date().toISOString(),
        },
        { onConflict: "owner_user_id,contact_id" },
      );

    if (linkError) {
      setConnectingContactId(null);
      Alert.alert("Connect failed", linkError.message);
      return;
    }

    const { data: existing, error: existingError } = await supabase
      .from("user_connections")
      .select("id")
      .or(
        `and(requester_user_id.eq.${userId},addressee_user_id.eq.${candidate.matched_user_id}),and(requester_user_id.eq.${candidate.matched_user_id},addressee_user_id.eq.${userId})`,
      )
      .limit(1);

    if (!existingError && (!existing || existing.length === 0)) {
      await supabase.from("user_connections").insert({
        requester_user_id: userId,
        addressee_user_id: candidate.matched_user_id,
        status: "pending",
      });
    }

    setConnectingContactId(null);
    setMatchCandidates((cur) =>
      cur.filter((row) => row.contact_id !== candidate.contact_id),
    );
  }

  async function onInviteContact(contact: Contact) {
    if (!hasValidPhone(contact.phone)) {
      Alert.alert("Add phone", "This contact needs a valid phone number.");
      return;
    }

    if (!userId) return;

    setConnectingContactId(contact.id);

    let inviteToken: string | null = null;

    const { data, error } = await supabase.rpc("create_invite_for_contact", {
      p_contact_id: contact.id,
      p_expires_in_hours: 168,
    });

    if (!error) {
      const row = ((data ?? []) as { token: string }[])[0];
      inviteToken = row?.token ?? null;
    }

    if (!inviteToken) {
      const fallbackToken = generateInviteToken();
      const expiresAt = new Date(
        Date.now() + 168 * 60 * 60 * 1000,
      ).toISOString();

      const { error: fallbackError } = await supabase
        .from("app_invites")
        .insert({
          inviter_user_id: userId,
          target_contact_id: contact.id,
          token: fallbackToken,
          status: "sent",
          expires_at: expiresAt,
        });

      if (fallbackError) {
        setConnectingContactId(null);
        Alert.alert(
          "Invite failed",
          error?.message || fallbackError.message || "Unable to create invite.",
        );
        return;
      }

      inviteToken = fallbackToken;
    }

    setConnectingContactId(null);

    const baseUrl =
      process.env.EXPO_PUBLIC_WEB_URL?.replace(/\/$/, "") ||
      "https://dhanada.app";
    const signupUrl = `${baseUrl}/auth/sign-up?invite=${encodeURIComponent(inviteToken)}`;
    const message = `Join me on Dhanada, ${contact.name}! Sign up here: ${signupUrl}`;

    await Share.share({ message });
  }

  async function onSignOut() {
    const { error } = await supabase.auth.signOut();
    if (error) {
      Alert.alert("Sign out failed", error.message);
    }
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
      <View style={styles.header}>
        <Text style={styles.logo}>Dhanada</Text>
        <Text style={styles.subtitle}>{email || "Authenticated user"}</Text>
      </View>

      <View style={styles.card}>
        <CollapsibleSection title="Profile">
          <TextInput
            style={styles.input}
            value={phoneNumber}
            onChangeText={(text) => {
              const digits = text.replace(/\D/g, "").slice(0, 10);
              setPhoneNumber(digits);
            }}
            placeholder="Phone number"
            placeholderTextColor="#6b7280"
            keyboardType="phone-pad"
            maxLength={10}
          />
          <Pressable
            style={styles.primaryButton}
            disabled={!isReady || savingPhone}
            onPress={onSavePhone}
          >
            <Text style={styles.primaryButtonText}>
              {savingPhone ? "Saving..." : "Save Phone"}
            </Text>
          </Pressable>
          <Text style={styles.statusHelper}>
            {phoneVerifiedAt
              ? `Phone verified on ${new Date(phoneVerifiedAt).toLocaleDateString()}.`
              : phoneNumber.trim()
                ? "Phone not verified yet. Contact matching will use only verified phones."
                : "Add your phone number to enable contact match suggestions."}
          </Text>
        </CollapsibleSection>
      </View>

      <View style={styles.card}>
        <CollapsibleSection
          title={editingContact ? "Edit Contact" : "New Contact"}
        >
          <TextInput
            style={styles.input}
            value={contactName}
            onChangeText={setContactName}
            placeholder="Contact name"
            placeholderTextColor="#6b7280"
          />
          <TextInput
            style={styles.input}
            value={contactPhone}
            onChangeText={(text) => {
              const digits = text.replace(/\D/g, "").slice(0, 10);
              setContactPhone(digits);
            }}
            placeholder="Contact phone"
            placeholderTextColor="#6b7280"
            keyboardType="phone-pad"
            maxLength={10}
          />
          <Pressable
            style={[
              styles.primaryButton,
              (addingContact || updatingContact) && styles.buttonDisabled,
            ]}
            disabled={!isReady || addingContact || updatingContact}
            onPress={onAddContact}
          >
            <Text style={styles.primaryButtonText}>
              {editingContactId
                ? updatingContact
                  ? "Updating..."
                  : "Update Contact"
                : addingContact
                  ? "Adding..."
                  : "Add Contact"}
            </Text>
          </Pressable>

          {editingContactId && (
            <>
              <Pressable
                style={[
                  styles.removeButton,
                  deletingContact && styles.buttonDisabled,
                ]}
                disabled={deletingContact}
                onPress={onDeleteContact}
              >
                <Text style={styles.removeButtonText}>
                  {deletingContact ? "Deleting..." : "Delete Contact"}
                </Text>
              </Pressable>

              <Pressable
                style={styles.secondaryActionButton}
                onPress={cancelEditContact}
              >
                <Text style={styles.secondaryActionButtonText}>Cancel</Text>
              </Pressable>
            </>
          )}
        </CollapsibleSection>
      </View>

      <View style={styles.card}>
        <CollapsibleSection title={`Contacts (${contacts.length})`}>
          <FlatList
            data={contacts}
            keyExtractor={(item) => item.id}
            style={styles.list}
            ListEmptyComponent={
              <Text style={styles.emptyText}>
                No contacts yet. Add your first contact.
              </Text>
            }
            renderItem={({ item }) => (
              <View style={styles.listItem}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.listName}>{item.name}</Text>
                  <Text style={styles.listPhone}>
                    {item.phone || "No phone"}
                  </Text>
                </View>
                <View style={styles.rowActions}>
                  {hasValidPhone(item.phone) && (
                    <Pressable
                      style={styles.editButton}
                      onPress={() => {
                        const candidate = candidateByContactId.get(item.id);
                        if (candidate) {
                          void onConnectCandidate(candidate);
                        } else {
                          void onInviteContact(item);
                        }
                      }}
                      disabled={connectingContactId === item.id}
                    >
                      <Text style={styles.editButtonText}>
                        {connectingContactId === item.id
                          ? "Connecting..."
                          : "Connect"}
                      </Text>
                    </Pressable>
                  )}
                  <Pressable
                    style={styles.editButton}
                    onPress={() => startEditContact(item)}
                  >
                    <Text style={styles.editButtonText}>Edit</Text>
                  </Pressable>
                </View>
              </View>
            )}
          />
        </CollapsibleSection>
      </View>

      <View style={styles.card}>
        <CollapsibleSection title="People You May Know on Dhanada">
          {loadingMatches ? (
            <Text style={styles.emptyText}>Finding matches...</Text>
          ) : matchCandidates.length === 0 ? (
            <Text style={styles.emptyText}>
              No match suggestions right now.
            </Text>
          ) : (
            <FlatList
              data={matchCandidates}
              keyExtractor={(item) => item.contact_id}
              style={styles.list}
              renderItem={({ item }) => (
                <View style={styles.listItem}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.listName}>{item.contact_name}</Text>
                    <Text style={styles.listPhone}>
                      {item.contact_phone || "No phone"}
                    </Text>
                  </View>
                  <Pressable
                    style={styles.editButton}
                    onPress={() => void onConnectCandidate(item)}
                    disabled={connectingContactId === item.contact_id}
                  >
                    <Text style={styles.editButtonText}>
                      {connectingContactId === item.contact_id
                        ? "Connecting..."
                        : "Connect"}
                    </Text>
                  </Pressable>
                </View>
              )}
            />
          )}
        </CollapsibleSection>
      </View>

      <Pressable style={styles.secondaryButton} onPress={onSignOut}>
        <Text style={styles.secondaryButtonText}>Sign Out</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#0a1128",
    paddingHorizontal: 16,
    paddingTop: 12,
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
  input: {
    backgroundColor: "#0d1732",
    borderColor: "#2a3b5c",
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#ffffff",
  },
  statusHelper: {
    color: "#9aa5c5",
    fontSize: 12,
    marginTop: 6,
    lineHeight: 18,
  },
  primaryButton: {
    backgroundColor: "#00d2ff",
    borderRadius: 10,
    paddingVertical: 10,
  },
  buttonDisabled: { opacity: 0.6 },
  primaryButtonText: {
    color: "#0a1128",
    textAlign: "center",
    fontWeight: "800",
  },
  list: {
    maxHeight: 220,
    marginTop: 6,
  },
  emptyText: {
    color: "#94a3b8",
    textAlign: "center",
    marginVertical: 10,
  },
  listItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: "#233251",
    paddingVertical: 10,
  },
  rowActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  listName: {
    color: "#ffffff",
    fontWeight: "700",
  },
  listPhone: {
    color: "#94a3b8",
    marginTop: 2,
  },
  secondaryButton: {
    backgroundColor: "#1f2a44",
    borderRadius: 10,
    paddingVertical: 11,
    marginTop: "auto",
    marginBottom: 8,
  },
  secondaryButtonText: {
    color: "#c7d2fe",
    textAlign: "center",
    fontWeight: "700",
  },
  secondaryActionButton: {
    backgroundColor: "#0d1732",
    borderColor: "#2a3b5c",
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    marginTop: 8,
  },
  secondaryActionButtonText: {
    color: "#9aa5c5",
    textAlign: "center",
    fontWeight: "600",
  },
  removeButton: {
    backgroundColor: "#dc2626",
    borderRadius: 10,
    paddingVertical: 10,
    marginTop: 8,
  },
  removeButtonText: {
    color: "#ffffff",
    textAlign: "center",
    fontWeight: "700",
  },
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
});
