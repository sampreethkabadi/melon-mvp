import Link from "next/link";
import { Backdrop } from "@/components/Backdrop";
import { SubmitButton } from "@/components/SubmitButton";
import { Pill } from "@/components/student/ui";
import { requireRole } from "@/lib/auth";
import { longDate, plural, timeOf } from "@/lib/format";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Role } from "@/lib/types";
import { flagHighlight } from "../actions";

export const metadata = { title: "Sessions · Melon" };

type Staff = { full_name: string; role: Role } | null;
type Appointment = { id: string; starts_at: string; duration_min: number; type: string; modality: string; location: string | null; staff: Staff };
type Session = { id: string; created_at: string; mode: string; session_type: string | null; school_id: string; staff: Staff };
type Insight = { id: string; session_id: string; kind: string; payload: { text?: string } };
type Advice = { session_id: string | null; text: string; status: string };
type Flag = { insight_id: string; status: string };

const MODALITY: Record<string, string> = { in_person: "In person", teams: "Teams", melon_call: "Melon call" };

// Highlights, colored so the important things catch the eye. Concerns stay between the student and staff
// in person, so they aren't shown here.
const GROUPS = [
  { title: "Next steps", kinds: ["action", "course_change"], box: "border-done/40 bg-done-bg", label: "text-done-ink", dot: "bg-done" },
  { title: "Key advice", kinds: ["advice"], box: "border-new/40 bg-new-bg", label: "text-new-ink", dot: "bg-new" },
  { title: "Goals and decisions", kinds: ["goal", "interest"], box: "border-[#F2C14E]/60 bg-warn-bg", label: "text-warn-ink", dot: "bg-[#F2C14E]" },
  { title: "Skills that came up", kinds: ["skill"], box: "border-[#5AB8E6]/50 bg-[#EAF6FC]", label: "text-link", dot: "bg-[#5AB8E6]" },
];

export default async function SessionsPage({ searchParams }: { searchParams: Promise<{ transcript?: string }> }) {
  const { transcript } = await searchParams;
  const profile = await requireRole(["student"]);
  const supabase = await createClient();
  const [{ data: sp }, { data: apptRows }, { data: sessionRows }, { data: insightRows }, { data: adviceRows }, { data: flagRows }] = await Promise.all([
    supabase.from("student_profiles").select("interests").eq("user_id", profile.id).maybeSingle(),
    supabase
      .from("appointments")
      .select("id, starts_at, duration_min, type, modality, location, staff:profiles!appointments_staff_id_fkey(full_name, role)")
      .eq("student_id", profile.id)
      .eq("status", "scheduled")
      .order("starts_at")
      .limit(5),
    supabase
      .from("sessions")
      .select("id, created_at, mode, session_type, school_id, staff:profiles!sessions_staff_id_fkey(full_name, role)")
      .eq("student_id", profile.id)
      .in("status", ["reviewed", "closed"])
      .order("created_at", { ascending: false }),
    // Students only ever see what their advisor or coach approved (enforced in the database).
    supabase.from("insights").select("id, session_id, kind, payload").eq("student_id", profile.id).in("status", ["accepted", "edited"]).order("created_at"),
    supabase.from("advice_items").select("session_id, text, status").eq("student_id", profile.id),
    supabase.from("insight_flags").select("insight_id, status").eq("student_id", profile.id),
  ]);

  const appts = (apptRows ?? []) as unknown as Appointment[];
  const sessions = (sessionRows ?? []) as unknown as Session[];
  const insights = (insightRows ?? []) as Insight[];
  const advice = (adviceRows ?? []) as Advice[];
  const flags = new Map(((flagRows ?? []) as Flag[]).map((f) => [f.insight_id, f.status]));

  // The full transcript loads only when asked for, and opening it is logged like any other view.
  const open = sessions.find((s) => s.id === transcript);
  let lines: Array<{ idx: number; speaker: string; text: string }> = [];
  if (open) {
    const { data } = await supabase.from("transcript_segments").select("idx, speaker, text").eq("session_id", open.id).order("idx");
    lines = data ?? [];
    if (lines.length) {
      await createAdminClient()
        .from("audit_log")
        .insert({ school_id: open.school_id, actor_id: profile.id, action: "transcript.viewed", entity: "session", entity_id: open.id });
    }
  }

  return (
    <main className="relative mx-auto flex max-w-4xl flex-col gap-6 px-4 py-8 sm:px-6">
      <Backdrop interests={sp?.interests ?? []} />
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Sessions</h1>
        <p className="mt-1 text-ink-2">
          {sessions.length
            ? `${plural(sessions.length, "session")} so far. Just the highlights, checked by your advisor or coach.`
            : "After your first session, the highlights show up here."}
        </p>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-extrabold">Coming up</h2>
        {appts.length ? (
          appts.map((a) => (
            <div key={a.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border-2 bg-white/95 p-4" style={{ borderColor: "var(--school)" }}>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <b>{a.type}</b>
                  <RolePill staff={a.staff} />
                </div>
                <p className="text-sm text-muted">
                  with {a.staff?.full_name ?? "your team"} · {longDate(a.starts_at)} · {timeOf(a.starts_at)} · {a.duration_min} min ·{" "}
                  {MODALITY[a.modality] ?? a.modality}
                  {a.location ? ` · ${a.location}` : ""}
                </p>
              </div>
              <span className="rounded-full bg-soft px-3 py-1 text-xs font-bold text-ink-2">They&apos;ll ask before recording</span>
            </div>
          ))
        ) : (
          <p className="rounded-2xl border border-line bg-white/90 px-4 py-3 text-sm text-muted">Nothing booked. Book through your career center as usual, and it shows up here.</p>
        )}
        <p className="text-xs text-muted">Career coaches help with careers: interviews, resumes, LinkedIn, the career fair and internships. Your advisor helps with courses and graduation requirements.</p>
      </section>

      {sessions.length > 0 && (
        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-extrabold">Past sessions</h2>
          {sessions.map((s, idx) => {
            const mine = insights.filter((i) => i.session_id === s.id);
            const summary = mine.find((i) => i.kind === "summary")?.payload.text;
            const doneSteps = new Set(advice.filter((a) => a.session_id === s.id && a.status === "done").map((a) => a.text));
            return (
              <details key={s.id} open={idx === 0 || s.id === transcript} className="rounded-3xl border border-line bg-white/95 p-5">
                <summary className="flex cursor-pointer flex-wrap items-center gap-2">
                  <span className="text-base font-extrabold">
                    {longDate(s.created_at)} · {s.session_type ?? "Session"}
                  </span>
                  <span className="text-sm text-muted">with {s.staff?.full_name ?? "your team"}</span>
                  <RolePill staff={s.staff} />
                  {s.mode === "notes_only" && <Pill>Notes, not recorded</Pill>}
                </summary>
                <div className="mt-3 flex flex-col gap-3">
                  {summary && <p className="text-ink-2">{summary}</p>}
                  <div className="grid gap-3 sm:grid-cols-2">
                    {GROUPS.map((g) => {
                      const items = mine.filter((i) => g.kinds.includes(i.kind) && i.payload.text);
                      if (!items.length) return null;
                      return (
                        <div key={g.title} className={`flex flex-col gap-2 rounded-2xl border p-3.5 ${g.box}`}>
                          <span className={`text-xs font-extrabold uppercase tracking-[.08em] ${g.label}`}>{g.title}</span>
                          <ul className="flex flex-col gap-2">
                            {items.map((i) => (
                              <Highlight key={i.id} insight={i} dot={g.dot} done={doneSteps.has(i.payload.text!)} flag={flags.get(i.id)} />
                            ))}
                          </ul>
                        </div>
                      );
                    })}
                  </div>
                  {!summary && !mine.length && <p className="text-sm text-muted">No notes were kept from this one.</p>}
                  {s.mode !== "notes_only" &&
                    (s.id === transcript ? (
                      <details open className="rounded-2xl bg-soft p-3.5">
                        <summary className="cursor-pointer text-sm font-bold">Full transcript</summary>
                        <ol className="mt-2 flex flex-col gap-1 text-sm">
                          {lines.map((l) => (
                            <li key={l.idx}>
                              <b className={l.speaker === "student" ? "text-link" : "text-ink"}>{l.speaker === "student" ? "You" : l.speaker === "staff" ? s.staff?.full_name ?? "Staff" : "Unknown"}: </b>
                              {l.text}
                            </li>
                          ))}
                          {!lines.length && <li className="text-muted">No transcript was kept.</li>}
                        </ol>
                        <Link href="/student/sessions" scroll={false} className="mt-2 inline-block text-sm font-semibold text-link">
                          Hide transcript
                        </Link>
                      </details>
                    ) : (
                      <Link href={`/student/sessions?transcript=${s.id}`} scroll={false} className="self-start text-sm font-semibold text-link">
                        Expand the full transcript
                      </Link>
                    ))}
                </div>
              </details>
            );
          })}
        </section>
      )}
    </main>
  );
}

function RolePill({ staff }: { staff: Staff }) {
  if (!staff) return null;
  return staff.role === "coach" ? <Pill tone="new">Career coach · career</Pill> : <Pill>Advisor · courses</Pill>;
}

function Highlight({ insight, dot, done, flag }: { insight: Insight; dot: string; done: boolean; flag?: string }) {
  return (
    <li className="flex flex-col gap-1">
      <div className="flex items-start gap-2 text-[15px] font-semibold leading-snug">
        <span aria-hidden="true" className={`mt-1.5 size-2 shrink-0 rounded-full ${dot}`} />
        <span className={done ? "text-muted line-through" : ""}>{insight.payload.text}</span>
        {done && <Pill tone="ok">Done</Pill>}
      </div>
      {flag === "open" ? (
        <span className="ml-4">
          <Pill tone="warn">Flagged · under review</Pill>
        </span>
      ) : (
        <details className="ml-4">
          <summary className="cursor-pointer text-xs font-semibold text-muted hover:text-ink">{flag === "fixed" ? "Fixed · flag again" : "Flag a mistake"}</summary>
          <form action={flagHighlight.bind(null, insight.id)} className="mt-1.5 flex flex-col items-start gap-1.5">
            <textarea name="note" rows={2} maxLength={500} placeholder="What's wrong? (optional)" aria-label="What's wrong" className="w-full rounded-xl border border-line bg-white px-3 py-2 text-sm" />
            <SubmitButton label="Send to my advisor or coach" variant="secondary" />
          </form>
        </details>
      )}
    </li>
  );
}

export const dynamic = "force-dynamic";
