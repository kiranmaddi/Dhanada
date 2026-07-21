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
import { Link, useRouter } from "expo-router";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";

import { supabase } from "../../lib/supabase";

WebBrowser.maybeCompleteAuthSession();

export default function SignInScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  async function onSignIn() {
    if (!email || !password) {
      Alert.alert("Missing fields", "Please enter email and password.");
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    setLoading(false);

    if (error) {
      Alert.alert("Sign in failed", error.message);
      return;
    }

    router.replace("/(tabs)");
  }

  async function onGoogleSignIn() {
    setGoogleLoading(true);

    const redirectTo = Linking.createURL("/auth/callback");
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
        skipBrowserRedirect: true,
      },
    });

    if (error || !data?.url) {
      setGoogleLoading(false);
      Alert.alert(
        "Google sign in failed",
        error?.message || "Unable to start OAuth flow.",
      );
      return;
    }

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);

    if (result.type === "cancel") {
      setGoogleLoading(false);
      Alert.alert("Google sign in cancelled", "You cancelled Google sign in.");
      return;
    }

    if (result.type !== "success" || !result.url) {
      setGoogleLoading(false);
      Alert.alert(
        "Google sign in failed",
        "Could not complete Google sign in. Please try again.",
      );
      return;
    }

    const callbackUrl = new URL(result.url);
    const code = callbackUrl.searchParams.get("code");

    if (!code) {
      setGoogleLoading(false);
      Alert.alert(
        "Google sign in failed",
        "Missing authorization code in callback.",
      );
      return;
    }

    const { error: exchangeError } =
      await supabase.auth.exchangeCodeForSession(code);
    setGoogleLoading(false);

    if (exchangeError) {
      Alert.alert("Google sign in failed", exchangeError.message);
      return;
    }

    router.replace("/(tabs)");
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.card}>
        <Text style={styles.logo}>Dhanada</Text>
        <Text style={styles.title}>Welcome Back</Text>
        <Text style={styles.subtitle}>Sign in to continue.</Text>

        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          placeholder="Email"
          placeholderTextColor="#6b7280"
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          placeholder="Password"
          placeholderTextColor="#6b7280"
          secureTextEntry
        />

        <Pressable
          style={styles.button}
          onPress={onSignIn}
          disabled={loading || googleLoading}
        >
          <Text style={styles.buttonText}>
            {loading ? "Signing in..." : "Sign In"}
          </Text>
        </Pressable>

        <Pressable
          style={styles.secondaryButton}
          onPress={onGoogleSignIn}
          disabled={googleLoading || loading}
        >
          <Text style={styles.secondaryButtonText}>
            {googleLoading ? "Opening Google..." : "Continue with Google"}
          </Text>
        </Pressable>

        <View style={styles.row}>
          <Link href={"/(auth)/forgot-password" as any} style={styles.link}>
            Forgot password?
          </Link>
          <Link href={"/(auth)/sign-up" as any} style={styles.link}>
            Create account
          </Link>
        </View>
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
    marginBottom: 10,
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
    fontWeight: "700",
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
  },
  link: {
    color: "#8fdcff",
    fontWeight: "600",
  },
});
