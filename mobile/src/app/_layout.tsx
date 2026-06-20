import { useEffect, useState } from "react";
import { Slot, useRouter, useSegments } from "expo-router";
import * as Linking from "expo-linking";
import { Session } from "@supabase/supabase-js";

import { AnimatedSplashOverlay } from "@/components/animated-icon";
import { supabase } from "@/lib/supabase";

export default function RootLayout() {
  const router = useRouter();
  const segments = useSegments();
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session ?? null);
      setIsLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    async function handleRecoveryUrl(url: string) {
      const parsedUrl = new URL(url);
      const queryParams = new URLSearchParams(parsedUrl.search);
      const hashText = parsedUrl.hash.startsWith("#")
        ? parsedUrl.hash.slice(1)
        : parsedUrl.hash;
      const hashParams = new URLSearchParams(hashText);
      const getParam = (key: string) =>
        queryParams.get(key) ?? hashParams.get(key);

      const code = getParam("code");
      const type = getParam("type");
      const tokenHash = getParam("token_hash");
      const accessToken = getParam("access_token");
      const refreshToken = getParam("refresh_token");
      const isRecoveryLink =
        type === "recovery" || url.toLowerCase().includes("reset-password");

      if (!isRecoveryLink) {
        return;
      }

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (!error && mounted) {
          router.replace("/(auth)/reset-password" as any);
        }
        return;
      }

      if (tokenHash && type === "recovery") {
        const { error } = await supabase.auth.verifyOtp({
          type: "recovery",
          token_hash: tokenHash,
        });
        if (!error && mounted) {
          router.replace("/(auth)/reset-password" as any);
        }
        return;
      }

      if (accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (!error && mounted) {
          router.replace("/(auth)/reset-password" as any);
        }
      }
    }

    Linking.getInitialURL().then((url) => {
      if (url) {
        void handleRecoveryUrl(url);
      }
    });

    const subscription = Linking.addEventListener("url", ({ url }) => {
      void handleRecoveryUrl(url);
    });

    return () => {
      mounted = false;
      subscription.remove();
    };
  }, [router]);

  useEffect(() => {
    if (isLoading) return;

    const currentSegment = String(segments[0] ?? "");
    const authScreen = String(segments[1] ?? "");
    const inAuthGroup = currentSegment === "(auth)";
    const onResetPasswordScreen =
      inAuthGroup && authScreen === "reset-password";

    if (!session && !inAuthGroup) {
      router.replace("/(auth)/sign-in" as any);
      return;
    }

    if (session && inAuthGroup && !onResetPasswordScreen) {
      router.replace("/(tabs)");
    }
  }, [isLoading, router, segments, session]);

  if (isLoading) {
    return <AnimatedSplashOverlay />;
  }

  return (
    <>
      <AnimatedSplashOverlay />
      <Slot />
    </>
  );
}
