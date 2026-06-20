import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import DashboardNav from "@/components/dashboard-nav";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/sign-in");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .single();

  const displayName = profile?.full_name || user.email || "User";

  return (
    <>
      <DashboardNav displayName={displayName} />
      <div className="page-wide" style={{ paddingTop: 0 }}>
        {children}
      </div>
    </>
  );
}
