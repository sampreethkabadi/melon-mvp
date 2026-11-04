import { redirect } from "next/navigation";
import Link from "next/link";
import { Backdrop } from "@/components/Backdrop";
import { firstName, requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ConsentCard } from "./ConsentCard";
import { ROLE_LABEL, YEAR_LABEL, type ClassYear, type Role } from "@/lib/types";

export const metadata = { title: "Home · Melon" };

export default async function StudentHome() {
  const profile = await requireRole(["student"]);
  const supabase = await createClient();
  const [{ data: sp }, { data: team }, { data: roadmap }] = await Promise.all([
    supabase
      .from("student_profiles")
      .select("class_year, majors, interests, onboarding_step")
      .eq("user_id", profile.id)
      .single(),
    supabase
      .from("staff_assignments")
      .select("kind, staff:profiles!staff_assignments_staff_id_fkey(full_name, role)")
      .eq("student_id", profile.id)
      .eq("active", true),
    supabase.from("roadmaps").select("status").eq("student_id", profile.id).maybeSingle(),
  ]);
  if (sp && sp.onboarding_step !== "done") redirect("/student/onboarding");

  const year = sp?.class_year ? YEAR_LABEL[sp.class_year as ClassYear] : null;
  const major = sp?.majors?.[0];
  const staff = (team ?? []) as unknown as Array<{ kind: string; staff: { full_name: string; role: Role } | null }>;

  return (
    <main className="relative mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6">
      <Backdrop interests={sp?.interests ?? []} />
      <div>
        <p className="text-xs font-extrabold uppercase tracking-widest" style={{ color: "var(--school)" }}>
          {[year, major].filter(Boolean).join(" · ") || "Welcome"}
        </p>
        <h1 className="mt-1 text-3xl font-extrabold tracking-tight">Hi {firstName(profile.full_name)}, welcome to Melon.</h1>
      </div>

      <ConsentCard studentId={profile.id} />

      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-3xl border-2 bg-white/95 p-6 shadow-sm" style={{ borderColor: "var(--school)" }}>
          <h2 className="text-lg font-extrabold">Your first roadmap</h2>
          <p className="mt-2 text-ink-2">{roadmapMessage(roadmap?.status, staff.length > 0)}</p>
          {roadmap?.status === "published" && (
            <Link href="/student/roadmap" className="mt-3 inline-block rounded-full bg-ink px-5 py-2.5 font-extrabold text-white">
              Open my roadmap
            </Link>
          )}
        </section>
        <section className="rounded-3xl border border-line bg-white/95 p-6">
          <h2 className="text-lg font-extrabold">Your team</h2>
          {staff.length ? (
            <ul className="mt-3 flex flex-col gap-2">
              {staff.map((s, i) => (
                <li key={i} className="flex items-center justify-between rounded-xl border border-line px-3 py-2">
                  <b>{s.staff?.full_name}</b>
                  <span className="text-sm text-muted">{s.staff ? ROLE_LABEL[s.staff.role] : s.kind}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-muted">No advisor or coach yet. The career center assigns one.</p>
          )}
        </section>
      </div>
    </main>
  );
}

function roadmapMessage(status: string | undefined, hasTeam: boolean) {
  if (status === "published") return "Your advisor or coach has approved it.";
  if (status === "draft") {
    return hasTeam
      ? "We've drafted it from your answers. Your advisor or coach reviews every roadmap first, and it'll appear here once they've approved it."
      : "We've drafted it from your answers. It'll appear here once the career center assigns your advisor or coach and they approve it.";
  }
  return "Your advisor or coach will set this up with you.";
}
