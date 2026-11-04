import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Reviews · Melon" };

export default async function ReviewsPage() {
  const profile = await requireRole(["advisor", "coach", "admin"]);
  const supabase = await createClient();
  const [{ data: sessions, error: sessionsError }, { data: assigned, error: assignedError }] = await Promise.all([
    supabase
      .from("sessions")
      .select("id, created_at, student:profiles!sessions_student_id_fkey(full_name)")
      .eq("staff_id", profile.id)
      .eq("status", "ready_for_review")
      .order("created_at"),
    supabase
      .from("staff_assignments")
      .select("student:profiles!staff_assignments_student_id_fkey(id, full_name, roadmaps!roadmaps_student_id_fkey(status))")
      .eq("staff_id", profile.id)
      .eq("active", true),
  ]);
  if (sessionsError || assignedError) throw new Error("Couldn't load your reviews. Try again.");
  const sessionRows = (sessions ?? []) as unknown as Array<{ id: string; student: { full_name: string } | null }>;
  const drafts = ((assigned ?? []) as unknown as Array<{ student: { id: string; full_name: string; roadmaps: { status: string } | null } | null }>).filter((a) => a.student?.roadmaps?.status === "draft");

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-8 sm:px-6">
      <h1 className="text-3xl font-extrabold tracking-tight">Reviews</h1>
      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-extrabold">Roadmap drafts</h2>
        {drafts.length === 0 && <p className="text-sm text-muted">No drafts are waiting.</p>}
        {drafts.map((d) => (
          <Link key={d.student!.id} href={`/staff/students/${d.student!.id}`} className="rounded-2xl border border-line bg-white px-4 py-3 font-semibold hover:border-ink">
            {d.student!.full_name}&apos;s first roadmap
          </Link>
        ))}
      </section>
      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-extrabold">Session suggestions</h2>
        {sessionRows.length === 0 && <p className="text-sm text-muted">No sessions are waiting.</p>}
        {sessionRows.map((s) => (
          <Link key={s.id} href={`/staff/sessions/${s.id}`} className="rounded-2xl border border-line bg-white px-4 py-3 font-semibold hover:border-ink">
            Session with {s.student?.full_name}
          </Link>
        ))}
      </section>
    </main>
  );
}
