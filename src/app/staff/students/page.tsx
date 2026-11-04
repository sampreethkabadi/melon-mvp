import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { YEAR_LABEL, type ClassYear } from "@/lib/types";

export const metadata = { title: "Students · Melon" };

type Row = { student: { id: string; full_name: string; student_profiles: { class_year: ClassYear | null; majors: string[]; onboarding_step: string } | null; roadmaps: { status: string } | null } | null };

const ROADMAP = (status?: string) => (status === "draft" ? "Draft to review" : status === "awaiting_student" ? "Waiting for student to accept" : status === "published" ? "Roadmap published" : "No roadmap yet");

export default async function StudentsPage() {
  const profile = await requireRole(["advisor", "coach", "admin"]);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("staff_assignments")
    .select("student:profiles!staff_assignments_student_id_fkey(id, full_name, student_profiles(class_year, majors, onboarding_step), roadmaps!roadmaps_student_id_fkey(status))")
    .eq("staff_id", profile.id)
    .eq("active", true);
  if (error) throw new Error("Couldn't load your students. Try again.");
  const rows = ((data ?? []) as unknown as Row[]).filter((r) => r.student).sort((a, b) => a.student!.full_name.localeCompare(b.student!.full_name));

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-8 sm:px-6">
      <h1 className="text-3xl font-extrabold tracking-tight">Your students</h1>
      {rows.length === 0 && <p className="text-muted">No students are assigned to you yet.</p>}
      <ul className="flex flex-col gap-2">
        {rows.map(({ student }) => {
          const sp = student!.student_profiles;
          return (
            <li key={student!.id}>
              <Link href={`/staff/students/${student!.id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-line bg-white px-4 py-3 hover:border-ink">
                <span className="flex flex-col">
                  <b>{student!.full_name}</b>
                  <span className="text-sm text-muted">{[sp?.class_year ? YEAR_LABEL[sp.class_year] : null, sp?.majors?.[0]].filter(Boolean).join(" · ")}</span>
                </span>
                <span className="text-sm font-semibold text-ink-2">{ROADMAP(student!.roadmaps?.status)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
