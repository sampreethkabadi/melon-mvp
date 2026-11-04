import { SchoolTheme } from "@/components/SchoolTheme";
import { TopBar } from "@/components/TopBar";
import { requireRole } from "@/lib/auth";
import { ADMIN_NAV } from "@/lib/nav";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireRole(["admin"]);
  return (
    <SchoolTheme profile={profile}>
      <TopBar profile={profile} nav={ADMIN_NAV} />
      {children}
    </SchoolTheme>
  );
}
