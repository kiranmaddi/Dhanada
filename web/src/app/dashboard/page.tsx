import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import DashboardClient from "./dashboard-client";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/sign-in");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, phone_number")
    .eq("id", user.id)
    .single();

  return (
    <DashboardClient
      userId={user.id}
      email={user.email ?? ""}
      initialFullName={profile?.full_name ?? ""}
      initialPhone={profile?.phone_number ?? ""}
    />
  );
}
