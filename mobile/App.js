import React, { useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
} from "react-native";

export default function App() {
  // State to manage which screen is visible: 'login', 'signup', or 'forgot'
  const [currentScreen, setCurrentScreen] = useState("login");

  // Common Header with the 'Dhanada' Logo
  const HeaderLogo = () => (
    <View style={styles.logoContainer}>
      <Text style={styles.logoText}>Dhanada</Text>
    </View>
  );

  // 1. LOGIN SCREEN
  const LoginScreen = () => (
    <View style={styles.screenContainer}>
      <HeaderLogo />
      <Text style={styles.title}>Welcome Back!</Text>
      <Text style={styles.subtitle}>
        Sign in to manage your events and track gifts seamlessly.
      </Text>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>Email address*</Text>
        <TextInput
          style={styles.input}
          placeholder="example@gmail.com"
          placeholderTextColor="#64748B"
        />
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>Password*</Text>
        <TextInput
          style={styles.input}
          placeholder="••••••••"
          placeholderTextColor="#64748B"
          secureTextEntry
        />
      </View>

      <View style={styles.rowBetween}>
        <TouchableOpacity style={styles.checkboxContainer}>
          <View style={styles.checkbox} />
          <Text style={styles.checkboxLabel}>Remember me</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setCurrentScreen("forgot")}>
          <Text style={styles.linkText}>Forgot Password?</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.primaryButton}>
        <Text style={styles.primaryButtonText}>Sign In</Text>
      </TouchableOpacity>

      <View style={styles.dividerContainer}>
        <View style={styles.divider} />
        <Text style={styles.dividerText}>Or continue with</Text>
        <View style={styles.divider} />
      </View>

      <View style={styles.socialContainer}>
        <TouchableOpacity style={styles.socialButton}>
          <Text style={styles.socialButtonText}>G Google</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.socialButton}>
          <Text style={styles.socialButtonText}> Apple</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={styles.footerLink}
        onPress={() => setCurrentScreen("signup")}
      >
        <Text style={styles.footerText}>
          Don't have an account?{" "}
          <Text style={styles.linkTextHighlight}>Sign up</Text>
        </Text>
      </TouchableOpacity>
    </View>
  );

  // 2. SIGNUP SCREEN
  const SignupScreen = () => (
    <View style={styles.screenContainer}>
      <TouchableOpacity
        style={styles.backButton}
        onPress={() => setCurrentScreen("login")}
      >
        <Text style={styles.backButtonText}>←</Text>
      </TouchableOpacity>
      <HeaderLogo />
      <Text style={styles.title}>Create Your Account</Text>
      <Text style={styles.subtitle}>
        Join Dhanada to manage gifts and events perfectly.
      </Text>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>Full Name*</Text>
        <TextInput
          style={styles.input}
          placeholder="Alex Smith"
          placeholderTextColor="#64748B"
        />
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>Email address*</Text>
        <TextInput
          style={styles.input}
          placeholder="example@gmail.com"
          placeholderTextColor="#64748B"
        />
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>Password*</Text>
        <TextInput
          style={styles.input}
          placeholder="••••••••"
          placeholderTextColor="#64748B"
          secureTextEntry
        />
      </View>

      <TouchableOpacity style={styles.primaryButton}>
        <Text style={styles.primaryButtonText}>Register</Text>
      </TouchableOpacity>

      <View style={styles.dividerContainer}>
        <View style={styles.divider} />
        <Text style={styles.dividerText}>Or continue with</Text>
        <View style={styles.divider} />
      </View>

      <View style={styles.socialContainer}>
        <TouchableOpacity style={styles.socialButton}>
          <Text style={styles.socialButtonText}>G Google</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.socialButton}>
          <Text style={styles.socialButtonText}> Apple</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={styles.footerLink}
        onPress={() => setCurrentScreen("login")}
      >
        <Text style={styles.footerText}>
          Already have an account?{" "}
          <Text style={styles.linkTextHighlight}>Sign in</Text>
        </Text>
      </TouchableOpacity>
    </View>
  );

  // 3. FORGOT PASSWORD SCREEN
  const ForgotPasswordScreen = () => (
    <View style={styles.screenContainer}>
      <TouchableOpacity
        style={styles.backButton}
        onPress={() => setCurrentScreen("login")}
      >
        <Text style={styles.backButtonText}>←</Text>
      </TouchableOpacity>
      <HeaderLogo />
      <Text style={styles.title}>Forgot Password?</Text>
      <Text style={styles.subtitle}>
        Enter your email and we'll send a 6-digit verification code instantly.
      </Text>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>Email address*</Text>
        <TextInput
          style={styles.input}
          placeholder="example@gmail.com"
          placeholderTextColor="#64748B"
        />
      </View>

      <TouchableOpacity style={styles.primaryButton}>
        <Text style={styles.primaryButtonText}>Send Code</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.footerLink, { marginTop: "auto" }]}
        onPress={() => setCurrentScreen("login")}
      >
        <Text style={styles.footerText}>
          Already have an account?{" "}
          <Text style={styles.linkTextHighlight}>Sign in</Text>
        </Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" />
      {currentScreen === "login" && <LoginScreen />}
      {currentScreen === "signup" && <SignupScreen />}
      {currentScreen === "forgot" && <ForgotPasswordScreen />}
    </SafeAreaView>
  );
}

// THE STYLESHEET (Cool Blue Theme)
const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#0A1128", // Deep Cool Navy Background
  },
  screenContainer: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 40,
    paddingBottom: 20,
  },
  logoContainer: {
    alignItems: "center",
    marginBottom: 30,
  },
  logoText: {
    fontSize: 32,
    fontWeight: "800",
    color: "#00D2FF", // Bright Cyan/Blue Accent
    letterSpacing: 2,
    textShadowColor: "rgba(0, 210, 255, 0.4)",
    textShadowOffset: { width: 0, height: 4 },
    textShadowRadius: 10,
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#FFFFFF",
    textAlign: "center",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: "#94A3B8",
    textAlign: "center",
    marginBottom: 30,
    paddingHorizontal: 20,
    lineHeight: 20,
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    color: "#E2E8F0",
    fontSize: 13,
    marginBottom: 8,
    fontWeight: "600",
  },
  input: {
    backgroundColor: "#1C2541", // Slightly lighter navy for inputs
    borderWidth: 1,
    borderColor: "#2A3B5C",
    borderRadius: 12,
    padding: 16,
    color: "#FFFFFF",
    fontSize: 15,
  },
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 30,
  },
  checkboxContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  checkbox: {
    width: 18,
    height: 18,
    borderWidth: 1,
    borderColor: "#00D2FF",
    borderRadius: 4,
    marginRight: 8,
    backgroundColor: "rgba(0, 210, 255, 0.1)",
  },
  checkboxLabel: {
    color: "#CBD5E1",
    fontSize: 13,
  },
  linkText: {
    color: "#CBD5E1",
    fontSize: 13,
  },
  primaryButton: {
    backgroundColor: "#00D2FF", // Main Blue Action Color
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    marginBottom: 24,
    shadowColor: "#00D2FF",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  primaryButtonText: {
    color: "#0A1128", // Dark text on light button for contrast
    fontSize: 16,
    fontWeight: "bold",
  },
  dividerContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 24,
  },
  divider: {
    flex: 1,
    height: 1,
    backgroundColor: "#2A3B5C",
  },
  dividerText: {
    color: "#64748B",
    paddingHorizontal: 10,
    fontSize: 12,
  },
  socialContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 30,
  },
  socialButton: {
    flex: 1,
    backgroundColor: "#1C2541",
    borderWidth: 1,
    borderColor: "#2A3B5C",
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
    marginHorizontal: 5,
  },
  socialButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },
  footerLink: {
    alignItems: "center",
    marginTop: 10,
  },
  footerText: {
    color: "#94A3B8",
    fontSize: 14,
  },
  linkTextHighlight: {
    color: "#00D2FF",
    fontWeight: "bold",
  },
  backButton: {
    position: "absolute",
    top: 45,
    left: 20,
    zIndex: 10,
    padding: 10,
  },
  backButtonText: {
    color: "#FFFFFF",
    fontSize: 24,
  },
});
