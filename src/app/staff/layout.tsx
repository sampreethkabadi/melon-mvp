import { SchoolTheme } from "@/components/SchoolTheme";
import { TopBar } from "@/components/TopBar";
import { requireRole } from "@/lib/auth";
import { STAFF_NAV } from "@/lib/nav";


export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireRole(["advisor", "coach", "admin"]);
  return (
    <SchoolTheme profile={profile}>
      <TopBar profile={profile} nav={STAFF_NAV} />
      {children}
    </SchoolTheme>
  );
}
