import { SchoolTheme } from "@/components/SchoolTheme";
import { TopBar } from "@/components/TopBar";
import { requireRole } from "@/lib/auth";
import { STUDENT_NAV } from "@/lib/nav";


export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireRole(["student"]);
  return (
    <SchoolTheme profile={profile}>
      <TopBar profile={profile} nav={STUDENT_NAV} />
      {children}
    </SchoolTheme>
  );
}
