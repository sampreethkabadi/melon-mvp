import Link from "next/link";
import { SubmitButton } from "@/components/SubmitButton";
import { requireRole } from "@/lib/auth";
import { shortDate } from "@/lib/format";
import { approveSession } from "../sessions/actions";
import { ReviewGroups, type ReviewInsight } from "../sessions/ReviewGroups";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Reviews · Melon" };

type WaitingSession = { id: string; created_at: string; session_type: string | null; student_id: string; student: { full_name: string } | null };

export default async function ReviewsPage() {
  const profile = await requireRole(["advisor", "coach", "admin"]);
  const supabase = await createClient();
  const [{ data: sessions, error: sessionsError }, { data: assigned, error: assignedError }, { data: flagRows }] = await Promise.all([
    supabase
      .from("sessions")
      .select("id, created_at, session_type, student_id, student:profiles!sessions_student_id_fkey(full_name)")
      .eq("staff_id", profile.id)
      .eq("status", "ready_for_review")
      .order("created_at"),
    supabase
      .from("staff_assignments")
      .select("student:profiles!staff_assignments_student_id_fkey(id, full_name, roadmaps!roadmaps_student_id_fkey(status))")
      .eq("staff_id", profile.id)
      .eq("active", true),
    supabase.from("insight_flags").select("id, session_id, note, session:sessions!inner(staff_id, student:profiles!sessions_student_id_fkey(full_name))").eq("status", "open"),
  ]);
  if (sessionsError || assignedError) throw new Error("Couldn't load your reviews. Try again.");
  const waiting = (sessions ?? []) as unknown as WaitingSession[];
  const ids = waiting.map((s) => s.id);
  const [{ data: insightRows }, { data: segmentRows }] = ids.length
    ? await Promise.all([
        supabase.from("insights").select("id, session_id, kind, status, payload, insight_evidence(segment_id)").in("session_id", ids).order("created_at"),
        supabase.from("transcript_segments").select("id, session_id, idx, speaker, text").in("session_id", ids).order("idx"),
      ])
    : [{ data: [] }, { data: [] }];
  const insights = (insightRows ?? []) as unknown as Array<ReviewInsight & { session_id: string }>;
  const segments = (segmentRows ?? []) as Array<{ id: string; session_id: string; idx: number; speaker: string; text: string }>;
  const drafts = ((assigned ?? []) as unknown as Array<{ student: { id: string; full_name: string; roadmaps: { status: string } | null } | null }>).filter((a) => a.student?.roadmaps?.status === "draft");
  const flags = ((flagRows ?? []) as unknown as Array<{ id: string; session_id: string; note: string | null; session: { staff_id: string; student: { full_name: string } | null } | null }>).filter((f) => f.session?.staff_id === profile.id);

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Reviews</h1>
        <p className="mt-1 text-ink-2">Nothing from a session reaches a student until you approve it here.</p>
      </div>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-extrabold">Action items and key points to approve</h2>
        {waiting.length === 0 && <p className="rounded-2xl border border-line bg-white p-4 text-sm text-muted">No sessions are waiting. You&apos;re all caught up.</p>}
        {waiting.map((s) => {
          const first = s.student?.full_name.split(" ")[0] ?? "the student";
          const own = insights.filter((i) => i.session_id === s.id);
          const undecided = own.filter((i) => i.status === "proposed").length;
          return (
            <article key={s.id} className="flex flex-col gap-3 rounded-3xl border-2 bg-white/95 p-5" style={{ borderColor: "var(--school)" }}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-lg font-extrabold">
                  <Link href={`/staff/students/${s.student_id}`} className="hover:underline">
                    {s.student?.full_name}
                  </Link>
                  <span className="font-normal text-muted"> · {s.session_type ?? "Session"} · {shortDate(s.created_at)}</span>
                </h3>
                <Link href={`/staff/sessions/${s.id}`} className="text-sm font-semibold text-link">
                  Open full transcript
                </Link>
              </div>
              {own.length === 0 && <p className="text-sm text-muted">Melon found nothing to suggest from this transcript.</p>}
              <ReviewGroups sessionId={s.id} insights={own} segments={segments.filter((x) => x.session_id === s.id)} editable linkLines={`/staff/sessions/${s.id}#line-`} />
              <form action={approveSession.bind(null, s.id)} className="flex flex-col gap-1.5">
                <SubmitButton label={undecided ? `Approve the other ${undecided} · send to ${first}` : `Send to ${first}`} />
                <span className="text-xs text-muted">Whatever you haven&apos;t decided on is approved with this click. Removed items are left out.</span>
              </form>
            </article>
          );
        })}
      </section>

      {flags.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-extrabold">Highlights students flagged</h2>
          {flags.map((f) => (
            <Link key={f.id} href={`/staff/sessions/${f.session_id}`} className="rounded-2xl border border-line bg-white px-4 py-3 hover:border-ink">
              <b>{f.session?.student?.full_name}</b>
              {f.note ? <span className="text-ink-2"> says: &ldquo;{f.note}&rdquo;</span> : <span className="text-ink-2"> flagged a highlight as wrong.</span>}
            </Link>
          ))}
        </section>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-extrabold">Roadmap drafts to approve</h2>
        {drafts.length === 0 && <p className="text-sm text-muted">No drafts are waiting.</p>}
        {drafts.map((d) => (
          <Link key={d.student!.id} href={`/staff/students/${d.student!.id}`} className="rounded-2xl border border-line bg-white px-4 py-3 font-semibold hover:border-ink">
            {d.student!.full_name}&apos;s roadmap
          </Link>
        ))}
      </section>
    </main>
  );
}
