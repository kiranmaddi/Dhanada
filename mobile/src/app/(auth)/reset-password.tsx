import { useEffect, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Link, useRouter } from "expo-router";

import { supabase } from "../../lib/supabase";

export default function ResetPasswordScreen() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data, error }) => {
      if (!mounted) return;

      if (error) {
        Alert.alert("Session error", error.message);
        return;
      }

      if (!data.session) {
        Alert.alert(
          "Invalid reset link",
          "This reset link is invalid or expired. Please request a new one.",
        );
        return;
      }

      setReady(true);
    });

    return () => {
      mounted = false;
    };
  }, []);

  async function onUpdatePassword() {
    if (!ready) {
      Alert.alert("Please wait", "Reset session is still loading.");
      return;
    }

    if (password.length < 6) {
      Alert.alert("Weak password", "Password must be at least 6 characters.");
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert("Mismatch", "Passwords do not match.");
      return;
    }

    setLoading(true);

    const { error } = await supabase.auth.updateUser({ password });

    setLoading(false);

    if (error) {
      Alert.alert("Update failed", error.message);
      return;
    }

    await supabase.auth.signOut();
    Alert.alert("Success", "Password updated. Please sign in.");
    router.replace("/(auth)/sign-in" as any);
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.card}>
        <Text style={styles.logo}>Dhanada</Text>
        <Text style={styles.title}>Set New Password</Text>
        <Text style={styles.subtitle}>
          Enter and confirm your new password.
        </Text>

        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          placeholder="New password"
          placeholderTextColor="#6b7280"
          secureTextEntry
          editable={!loading && ready}
        />

        <TextInput
          style={styles.input}
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          placeholder="Confirm new password"
          placeholderTextColor="#6b7280"
          secureTextEntry
          editable={!loading && ready}
        />

        <Pressable
          style={[styles.button, (!ready || loading) && styles.buttonDisabled]}
          onPress={onUpdatePassword}
          disabled={!ready || loading}
        >
          <Text style={styles.buttonText}>
            {loading ? "Updating..." : "Update Password"}
          </Text>
        </Pressable>

        <Link href="/(auth)/sign-in" style={styles.link}>
          Back to sign in
        </Link>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    justifyContent: "center",
    backgroundColor: "#0a1128",
    padding: 20,
  },
  card: {
    backgroundColor: "#131d3a",
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: "#223157",
    gap: 10,
  },
  logo: {
    color: "#00d2ff",
    fontSize: 28,
    fontWeight: "800",
    textAlign: "center",
  },
  title: {
    color: "#ffffff",
    fontSize: 22,
    fontWeight: "700",
    textAlign: "center",
  },
  subtitle: {
    color: "#9aa5c5",
    textAlign: "center",
    marginBottom: 8,
  },
  input: {
    backgroundColor: "#0d1732",
    borderColor: "#2a3b5c",
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: "#ffffff",
  },
  button: {
    backgroundColor: "#00d2ff",
    borderRadius: 10,
    paddingVertical: 12,
    marginTop: 6,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    textAlign: "center",
    color: "#0a1128",
    fontWeight: "800",
  },
  link: {
    color: "#8fdcff",
    fontWeight: "700",
    textAlign: "center",
    marginTop: 10,
  },
});
