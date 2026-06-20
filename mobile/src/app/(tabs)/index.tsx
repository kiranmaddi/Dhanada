import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
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

function isValidOptionalPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.length === 0 || digits.length === 10;
}

export default function HomeScreen() {
  const [loading, setLoading] = useState(true);
  const [savingPhone, setSavingPhone] = useState(false);
  const [addingContact, setAddingContact] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string>("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contacts, setContacts] = useState<Contact[]>([]);

  const isReady = useMemo(() => Boolean(userId), [userId]);

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
        .select("phone_number")
        .eq("id", uid)
        .single();

      if (profile?.phone_number) {
        setPhoneNumber(profile.phone_number);
      }

      await fetchContacts(uid);
      setLoading(false);
    })();

    return () => {
      mounted = false;
    };
  }, [fetchContacts]);

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
        </CollapsibleSection>
      </View>

      <View style={styles.card}>
        <CollapsibleSection title="Contacts">
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
            style={styles.primaryButton}
            disabled={!isReady || addingContact}
            onPress={onAddContact}
          >
            <Text style={styles.primaryButtonText}>
              {addingContact ? "Adding..." : "Add Contact"}
            </Text>
          </Pressable>

          <FlatList
            data={contacts}
            keyExtractor={(item) => item.id}
            style={styles.list}
            ListEmptyComponent={
              <Text style={styles.emptyText}>
                No contacts yet. Add your first invitee.
              </Text>
            }
            renderItem={({ item }) => (
              <View style={styles.listItem}>
                <Text style={styles.listName}>{item.name}</Text>
                <Text style={styles.listPhone}>{item.phone || "No phone"}</Text>
              </View>
            )}
          />
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
    borderTopWidth: 1,
    borderTopColor: "#233251",
    paddingVertical: 10,
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
});
