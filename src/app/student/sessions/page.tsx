import { Backdrop } from "@/components/Backdrop";
import { requireRole } from "@/lib/auth";
import { longDate, plural, timeOf } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { ROLE_LABEL, type Role } from "@/lib/types";

export const metadata = { title: "Sessions · Melon" };

type Appointment = { id: string; starts_at: string; duration_min: number; type: string; modality: string; location: string | null; staff: { full_name: string; role: Role } | null };
type Session = { id: string; created_at: string; mode: string; staff: { full_name: string; role: Role } | null };
type Insight = { session_id: string; kind: string; payload: { text?: string } };
type Advice = { id: string; session_id: string | null; text: string; status: string };

const MODALITY: Record<string, string> = { in_person: "In person", teams: "Teams", melon_call: "Melon call" };
const KIND_HEADING: Record<string, string> = {
  goal: "Goals you talked about",
  skill: "Skills that came up",
  interest: "Interests",
  course_change: "Course ideas",
};

export default async function SessionsPage() {
  const profile = await requireRole(["student"]);
  const supabase = await createClient();
  const [{ data: sp }, { data: apptRows }, { data: sessionRows }, { data: insightRows }, { data: adviceRows }] = await Promise.all([
    supabase.from("student_profiles").select("interests").eq("user_id", profile.id).maybeSingle(),
    supabase
      .from("appointments")
      .select("id, starts_at, duration_min, type, modality, location, staff:profiles!appointments_staff_id_fkey(full_name, role)")
      .eq("student_id", profile.id)
      .eq("status", "scheduled")
      .gte("starts_at", new Date(Date.now() - 3600_000).toISOString())
      .order("starts_at")
      .limit(5),
    supabase
      .from("sessions")
      .select("id, created_at, mode, staff:profiles!sessions_staff_id_fkey(full_name, role)")
      .eq("student_id", profile.id)
      .in("status", ["reviewed", "closed"])
      .order("created_at", { ascending: false }),
    // Students only ever see suggestions their advisor or coach accepted (enforced in the database).
    supabase.from("insights").select("session_id, kind, payload").eq("student_id", profile.id).in("status", ["accepted", "edited"]),
    supabase.from("advice_items").select("id, session_id, text, status").eq("student_id", profile.id).neq("status", "dismissed"),
  ]);

  const appts = (apptRows ?? []) as unknown as Appointment[];
  const sessions = (sessionRows ?? []) as unknown as Session[];
  const insights = (insightRows ?? []) as Insight[];
  const advice = (adviceRows ?? []) as Advice[];

  return (
    <main className="relative mx-auto flex max-w-4xl flex-col gap-6 px-4 py-8 sm:px-6">
      <Backdrop interests={sp?.interests ?? []} />
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Sessions</h1>
        <p className="mt-1 text-ink-2">
          {sessions.length
            ? `${plural(sessions.length, "session")} so far. Each one is a checked summary, so nothing you said gets lost.`
            : "After your first session, a checked summary shows up here."}
        </p>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-extrabold">Coming up</h2>
        {appts.length ? (
          appts.map((a) => (
            <div key={a.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border-2 bg-white/95 p-4" style={{ borderColor: "var(--school)" }}>
              <div>
                <b>{a.type}</b> with {a.staff?.full_name ?? "your advisor"}
                <p className="text-sm text-muted">
                  {longDate(a.starts_at)} · {timeOf(a.starts_at)} · {a.duration_min} min · {MODALITY[a.modality] ?? a.modality}
                  {a.location ? ` · ${a.location}` : ""}
                </p>
              </div>
              <span className="rounded-full bg-soft px-3 py-1 text-xs font-bold text-ink-2">They&apos;ll ask before recording</span>
            </div>
          ))
        ) : (
          <p className="rounded-2xl border border-line bg-white/90 px-4 py-3 text-sm text-muted">
            Nothing booked. Book through your career center as usual, and it shows up here.
          </p>
        )}
      </section>

      {sessions.length > 0 && (
        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-extrabold">Past sessions</h2>
          {sessions.map((s, idx) => {
            const mine = insights.filter((i) => i.session_id === s.id);
            const summary = mine.find((i) => i.kind === "summary")?.payload.text;
            const steps = advice.filter((a) => a.session_id === s.id);
            const groups = Object.keys(KIND_HEADING)
              .map((k) => ({ k, texts: mine.filter((i) => i.kind === k).map((i) => i.payload.text).filter(Boolean) as string[] }))
              .filter((g) => g.texts.length);
            return (
              <details key={s.id} open={idx === 0} className="group rounded-3xl border border-line bg-white/95 p-5">
                <summary className="flex cursor-pointer flex-wrap items-baseline justify-between gap-2">
                  <span className="text-base font-extrabold">
                    {longDate(s.created_at)} · {s.staff?.full_name ?? "Your advisor"}
                  </span>
                  <span className="text-xs font-bold text-muted">
                    {s.staff ? ROLE_LABEL[s.staff.role] : ""}
                    {s.mode === "notes_only" ? " · notes, not recorded" : ""}
                  </span>
                </summary>
                <div className="mt-3 flex flex-col gap-3">
                  {summary && <p className="text-ink-2">{summary}</p>}
                  {steps.length > 0 && (
                    <div>
                      <p className="text-xs font-extrabold uppercase tracking-widest text-muted">What you agreed to do</p>
                      <ul className="mt-1.5 flex flex-col gap-1.5">
                        {steps.map((a) => (
                          <li key={a.id} className="flex items-start gap-2 text-sm">
                            <span className={a.status === "done" ? "font-bold text-done" : "text-muted"}>{a.status === "done" ? "✓" : "○"}</span>
                            <span className={a.status === "done" ? "text-muted line-through" : ""}>{a.text}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {groups.map((g) => (
                    <div key={g.k}>
                      <p className="text-xs font-extrabold uppercase tracking-widest text-muted">{KIND_HEADING[g.k]}</p>
                      <ul className="mt-1 list-disc pl-5 text-sm text-ink-2">
                        {g.texts.map((t) => (
                          <li key={t}>{t}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                  {!summary && !steps.length && !groups.length && <p className="text-sm text-muted">No notes were kept from this one.</p>}
                </div>
              </details>
            );
          })}
        </section>
      )}
    </main>
  );
}
