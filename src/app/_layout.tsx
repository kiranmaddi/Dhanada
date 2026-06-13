import { useEffect, useState } from "react";
import { Slot, useRouter, useSegments } from "expo-router";
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
    if (isLoading) return;

    const currentSegment = String(segments[0] ?? "");
    const inAuthGroup = currentSegment === "(auth)";

    if (!session && !inAuthGroup) {
      router.replace("/(auth)/sign-in" as any);
      return;
    }

    if (session && inAuthGroup) {
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
