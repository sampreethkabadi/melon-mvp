import Link from "next/link";
import { CalendarPlus, ChevronDown, Clock, FileText, Flag, MapPin, Mic, Video } from "lucide-react";
import { Backdrop } from "@/components/Backdrop";
import { SubmitButton } from "@/components/SubmitButton";
import { Avatar } from "@/components/student/Avatar";
import { Pill } from "@/components/student/ui";
import { requireRole } from "@/lib/auth";
import { daysUntil } from "@/lib/roadmap/fair";
import { appNow } from "@/lib/clock";
import { longDate, shortDate, timeOf } from "@/lib/format";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Role } from "@/lib/types";
import { flagHighlight } from "../actions";
import { ConsentCard } from "../ConsentCard";

export const metadata = { title: "Appointments · Melon" };

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

export default async function AppointmentsPage({ searchParams }: { searchParams: Promise<{ transcript?: string }> }) {
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
  // Video calls that are open right now (or whose transcript is waiting to be checked), by appointment.
  const { data: callRows } = await supabase
    .from("sessions")
    .select("id, appointment_id, status, call_ended_at")
    .eq("student_id", profile.id)
    .not("call_room", "is", null)
    .in("status", ["created", "consented", "recording", "uploaded", "transcribed"]);
  const liveCalls = ((callRows ?? []) as Array<{ id: string; appointment_id: string | null; status: string; call_ended_at: string | null }>).filter(
    (c) => !c.call_ended_at || c.status === "transcribed",
  );
  const callFor = (apptId: string) => liveCalls.find((c) => c.appointment_id === apptId);

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

  const today = appNow().toISOString();
  return (
    <main className="relative mx-auto flex max-w-4xl flex-col gap-7 px-4 py-8 sm:px-6">
      <Backdrop interests={sp?.interests ?? []} />
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Appointments</h1>
        <p className="mt-1 text-ink-2">Book through the career center as usual. It shows up here.</p>
      </div>

      {/* Your advisor or coach opened a call, or asked to record: answer here as well as on Home. */}
      <ConsentCard studentId={profile.id} />

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-extrabold">Coming up</h2>
        {appts.length ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {appts.map((a, i) => {
              const days = daysUntil(today, a.starts_at);
              const Where = a.modality === "in_person" ? MapPin : Video;
              return (
                <article
                  key={a.id}
                  className={`anim-fade-up flex flex-col gap-4 rounded-3xl bg-white/95 p-5 ${i === 0 ? "border-2" : "border border-line"}`}
                  style={i === 0 ? { borderColor: "var(--school)", animationDelay: `${i * 60}ms` } : { animationDelay: `${i * 60}ms` }}
                >
                  <div className="flex items-center gap-4">
                    {a.staff ? <Avatar name={a.staff.full_name} role={a.staff.role} size={60} /> : null}
                    <div className="min-w-0">
                      <span className={`text-xs font-extrabold uppercase tracking-[.08em] ${i === 0 ? "text-school" : "text-muted"}`} style={i === 0 ? { color: "var(--school)" } : undefined}>
                        {days <= 0 ? "Today" : days === 1 ? "Tomorrow" : `In ${days} days`}
                      </span>
                      <b className="block text-lg leading-snug">{a.type}</b>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5 text-[15px] text-ink-2">
                    <span className="flex items-center gap-2">
                      <Clock size={16} aria-hidden="true" />
                      {longDate(a.starts_at)} · {timeOf(a.starts_at)} · {a.duration_min} min
                    </span>
                    <span className="flex items-center gap-2">
                      <Where size={16} aria-hidden="true" />
                      {a.location ?? MODALITY[a.modality] ?? a.modality}
                    </span>
                  </div>
                  <div className="mt-auto flex items-center justify-between gap-3">
                    {callFor(a.id) ? (
                      <Link
                        href={`/call/${callFor(a.id)!.id}`}
                        className="anim-pulse inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2.5 text-sm font-extrabold text-white"
                      >
                        <Video size={16} aria-hidden="true" />
                        {callFor(a.id)!.status === "transcribed" ? "Check the transcript" : "Join the video call"}
                      </Link>
                    ) : (
                      <span className="flex items-center gap-1.5 text-[13px] font-bold text-muted">
                        <Mic size={15} aria-hidden="true" />
                        Asks before recording
                      </span>
                    )}
                    <a
                      href={calendarLink(a)}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`Add ${a.type} to your calendar`}
                      title="Add to calendar"
                      className="inline-flex size-11 items-center justify-center rounded-full border border-line bg-white hover:border-ink"
                    >
                      <CalendarPlus size={18} aria-hidden="true" />
                    </a>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <p className="rounded-2xl border border-line bg-white/90 px-4 py-3 text-sm text-muted">Nothing booked yet.</p>
        )}
      </section>

      {sessions.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-extrabold">Past</h2>
          {sessions.map((s, idx) => {
            const mine = insights.filter((i) => i.session_id === s.id);
            const summary = mine.find((i) => i.kind === "summary")?.payload.text;
            const doneSteps = new Set(advice.filter((a) => a.session_id === s.id && a.status === "done").map((a) => a.text));
            return (
              <details key={s.id} open={idx === 0 || s.id === transcript} className="group overflow-hidden rounded-3xl border border-line bg-white/95">
                <summary className="flex min-h-[72px] cursor-pointer list-none items-center gap-3.5 px-5 py-3.5 [&::-webkit-details-marker]:hidden">
                  {s.staff && <Avatar name={s.staff.full_name} role={s.staff.role} size={44} badge={false} />}
                  <b className="min-w-0 flex-1 text-base sm:text-[17px]">{s.session_type ?? "Appointment"}</b>
                  {s.mode === "notes_only" && <Pill>Notes only</Pill>}
                  <span className="shrink-0 text-sm font-semibold text-muted">{shortDate(s.created_at)}
                    {s.created_at.slice(0, 4) !== today.slice(0, 4) ? `, ${s.created_at.slice(0, 4)}` : ""}
                  </span>
                  <ChevronDown size={20} aria-hidden="true" className="shrink-0 text-muted transition-transform duration-300 group-open:rotate-180" />
                </summary>
                <div className="anim-fade-up flex flex-col gap-3.5 px-5 pb-5">
                  {summary && <p className="leading-relaxed text-ink-2">{summary}</p>}
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
                        <Link href="/student/appointments" scroll={false} className="mt-2 inline-block text-sm font-semibold text-link">
                          Hide transcript
                        </Link>
                      </details>
                    ) : (
                      <Link href={`/student/appointments?transcript=${s.id}`} scroll={false} className="flex items-center gap-1.5 self-start text-sm font-bold text-link">
                        <FileText size={16} aria-hidden="true" />
                        Full transcript
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

/** A Google Calendar link with the appointment filled in. Works without connecting anything. */
function calendarLink(a: Appointment) {
  const start = new Date(a.starts_at);
  const end = new Date(start.getTime() + a.duration_min * 60_000);
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const q = new URLSearchParams({
    action: "TEMPLATE",
    text: `${a.type}${a.staff ? ` with ${a.staff.full_name}` : ""}`,
    dates: `${fmt(start)}/${fmt(end)}`,
    location: a.location ?? MODALITY[a.modality] ?? "",
  });
  return `https://calendar.google.com/calendar/render?${q}`;
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
          <summary className="flex cursor-pointer items-center gap-1 text-xs font-semibold text-muted hover:text-ink">
            <Flag size={12} aria-hidden="true" />
            {flag === "fixed" ? "Fixed · flag again" : "Flag a mistake"}
          </summary>
          <form action={flagHighlight.bind(null, insight.id)} className="mt-1.5 flex flex-col items-start gap-1.5">
            <textarea name="note" rows={2} maxLength={500} placeholder="What's wrong? (optional)" aria-label="What's wrong" className="w-full rounded-xl border border-line bg-white px-3 py-2 text-sm" />
            <SubmitButton label="Send to my team" variant="secondary" />
          </form>
        </details>
      )}
    </li>
  );
}

export const dynamic = "force-dynamic";
