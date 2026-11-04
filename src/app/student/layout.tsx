import { SchoolTheme } from "@/components/SchoolTheme";
import { TopBar } from "@/components/TopBar";
import { requireRole } from "@/lib/auth";
import { STUDENT_NAV } from "@/lib/nav";
import { createClient } from "@/lib/supabase/server";

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireRole(["student"]);
  const supabase = await createClient();
  const { count } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", profile.id)
    .is("read_at", null);
  return (
    <SchoolTheme profile={profile}>
      <TopBar profile={profile} nav={STUDENT_NAV} bell={{ href: "/student/notifications", unread: count ?? 0 }} />
      {children}
    </SchoolTheme>
  );
}
