import { useState } from "react";
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
import * as Linking from "expo-linking";
import { Link } from "expo-router";

import { supabase } from "../../lib/supabase";

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSendReset() {
    if (!email) {
      Alert.alert("Missing email", "Please enter your email address.");
      return;
    }

    setLoading(true);

    const redirectTo = Linking.createURL("/reset-password");
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo,
    });

    setLoading(false);

    if (error) {
      Alert.alert("Request failed", error.message);
      return;
    }

    Alert.alert(
      "Email sent",
      "If the account exists, reset instructions were sent.",
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.card}>
        <Text style={styles.logo}>Dhanada</Text>
        <Text style={styles.title}>Reset Password</Text>
        <Text style={styles.subtitle}>
          Enter your email to receive a reset link.
        </Text>

        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          placeholder="Email"
          placeholderTextColor="#6b7280"
          autoCapitalize="none"
          keyboardType="email-address"
        />

        <Pressable
          style={styles.button}
          onPress={onSendReset}
          disabled={loading}
        >
          <Text style={styles.buttonText}>
            {loading ? "Sending..." : "Send Reset Link"}
          </Text>
        </Pressable>

        <Link href={"/(auth)/sign-in" as any} style={styles.link}>
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
