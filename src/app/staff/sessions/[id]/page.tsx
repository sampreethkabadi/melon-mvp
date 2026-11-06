import Link from "next/link";
import { notFound } from "next/navigation";
import { AutoRefresh } from "@/components/AutoRefresh";
import { SubmitButton } from "@/components/SubmitButton";
import { requireRole } from "@/lib/auth";
import { isSpeechConfigured } from "@/lib/sessions/deepgram";
import type { InsightKind } from "@/lib/sessions/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  approveSession,
  chooseNotesOnly,
  resolveFlag,
  correctSegment,
  giveStaffConsent,
  pasteTranscript,
  retryProcessing,
  saveNotes,
  runSampleConversation,
} from "../actions";
import { ReviewGroups } from "../ReviewGroups";
import { Recorder } from "./Recorder";

export const metadata = { title: "Session · Melon" };

type Segment = { id: string; idx: number; speaker: string; text: string; start_ms: number };
type Insight = { id: string; kind: InsightKind; status: string; model_ref: string | null; payload: { text: string }; insight_evidence: { segment_id: string }[] };

const SOURCE_NOTE: Record<string, string> = {
  sample: "Sample conversation for the demo, not a real student",
  notes: "Typed from the advisor's notes",
  audio: "Transcribed from the recording",
};
const MODEL_NOTE = (ref: string | null) =>
  ref?.startsWith("claude") ? "Drafted by Claude" : ref === "saved-sample-v1" ? "Saved suggestions for the sample conversation" : "Drafted by simple rules, without AI";

export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await requireRole(["advisor", "coach", "admin"]);
  const supabase = await createClient();
  const { data: session } = await supabase
    .from("sessions")
    .select("id, school_id, status, mode, transcript_source, session_type, student_id, staff_id, created_at, student:profiles!sessions_student_id_fkey(full_name)")
    .eq("id", id)
    .maybeSingle();
  if (!session) notFound();
  const studentName = (session.student as unknown as { full_name: string } | null)?.full_name ?? "this student";
  const mine = session.staff_id === profile.id;

  const [{ data: consents }, { data: segmentRows }, { data: insightRows }, { data: flagRows }] = await Promise.all([
    supabase.from("consents").select("subject_id, granted, scope, created_at").eq("session_id", id).eq("scope", "record").order("created_at"),
    supabase.from("transcript_segments").select("id, idx, speaker, text, start_ms").eq("session_id", id).order("idx"),
    supabase.from("insights").select("id, kind, status, model_ref, payload, insight_evidence(segment_id)").eq("session_id", id).order("created_at"),
    supabase.from("insight_flags").select("id, insight_id, note, status, created_at").eq("session_id", id).eq("status", "open"),
  ]);
  const flags = (flagRows ?? []) as Array<{ id: string; insight_id: string; note: string | null }>;
  const segments = (segmentRows ?? []) as Segment[];
  const insights = (insightRows ?? []) as unknown as Insight[];

  // Viewing a transcript is logged, so access can be traced.
  if (segments.length) {
    const { error } = await createAdminClient()
      .from("audit_log")
      .insert({ school_id: session.school_id, actor_id: profile.id, action: "transcript.viewed", entity: "session", entity_id: id });
    if (error) console.error("audit failed:", error.message);
  }

  const latest = (subject: string) => [...(consents ?? [])].reverse().find((c) => c.subject_id === subject);
  const staffAgreed = latest(session.staff_id)?.granted === true;
  const studentAnswer = latest(session.student_id);
  const bothAgreed = staffAgreed && studentAnswer?.granted === true;
  const speech = isSpeechConfigured();
  const status = session.status as string;
  const waiting = ["created", "consented"].includes(status) && mine;

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6">
      {waiting && <AutoRefresh />}
      <div>
        <Link href={`/staff/students/${session.student_id}`} className="text-sm font-semibold text-link">
          ← {studentName}
        </Link>
        <h1 className="mt-1 text-3xl font-extrabold tracking-tight">
          {session.session_type ?? "Session"} with {studentName}
        </h1>
        {session.transcript_source && <p className="mt-1 text-sm text-muted">{SOURCE_NOTE[session.transcript_source]}</p>}
      </div>

      {waiting && (
        <section className="flex flex-col gap-4 rounded-3xl border-2 bg-white/95 p-6" style={{ borderColor: "var(--school)" }}>
          <div>
            <h2 className="text-lg font-extrabold">Recording needs both of you to agree</h2>
            <p className="text-sm text-muted">Melon stores nothing unless you both say yes. Either of you can change your mind.</p>
          </div>
          <ul className="flex flex-col gap-2">
            <ConsentRow label="You" state={staffAgreed ? "yes" : "waiting"} />
            <ConsentRow label={studentName} state={!studentAnswer ? "waiting" : studentAnswer.granted ? "yes" : "no"} />
          </ul>
          {!staffAgreed && studentAnswer?.granted !== false && (
            <form action={giveStaffConsent.bind(null, id)}>
              <SubmitButton label="I agree to record" />
            </form>
          )}
          {!studentAnswer && <p className="text-sm text-ink-2">{studentName} answers on their Melon home page. This screen updates on its own.</p>}
          {bothAgreed && (
            <div className="flex flex-col gap-3 rounded-2xl bg-soft p-4">
              {speech ? <Recorder sessionId={id} /> : <p className="text-sm text-ink-2">Speech-to-text isn&apos;t set up yet, so recording is off. Use the sample conversation instead.</p>}
              <form action={runSampleConversation.bind(null, id)}>
                <SubmitButton label="Use the sample conversation" variant={speech ? "secondary" : "primary"} />
              </form>
              <details>
                <summary className="cursor-pointer text-sm font-semibold text-link">Or paste a sample transcript</summary>
                <form action={pasteTranscript.bind(null, id)} className="mt-2 flex flex-col items-start gap-2">
                  <p className="text-sm text-muted">Start each turn with the speaker, like &quot;Advisor: Hello&quot;. Don&apos;t paste a real student&apos;s conversation.</p>
                  <textarea name="transcript" required rows={10} aria-label="Sample transcript" className="w-full rounded-xl border border-line bg-white px-3 py-2 text-sm" />
                  <SubmitButton label="Use this transcript" variant="secondary" />
                </form>
              </details>
            </div>
          )}
          {studentAnswer?.granted === false && <p className="rounded-xl bg-warn-bg px-3 py-2 text-sm font-semibold text-warn-ink">{studentName} said no to recording, so nothing will be recorded.</p>}
          <form action={chooseNotesOnly.bind(null, id)}>
            <SubmitButton label="Don't record. I'll write notes instead" variant="link" />
          </form>
        </section>
      )}

      {status === "no_recording" && mine && (
        <form action={saveNotes.bind(null, id)} className="flex flex-col gap-3 rounded-3xl border border-line bg-white/95 p-6">
          <h2 className="text-lg font-extrabold">Session notes</h2>
          <p className="text-sm text-muted">Write one point per line. Melon drafts suggestions from these for you to review. AI isn&apos;t used, because the student didn&apos;t agree to it.</p>
          <textarea name="notes" required rows={10} aria-label="Session notes" className="rounded-xl border border-line px-3 py-2.5" />
          <div>
            <SubmitButton label="Draft suggestions" />
          </div>
        </form>
      )}

      {["recording", "uploaded", "transcribed"].includes(status) && (
        <section className="rounded-3xl border border-line bg-white/95 p-6">
          {mine && <AutoRefresh />}
          <h2 className="text-lg font-extrabold">Working on it</h2>
          <p className="text-sm text-muted">Melon is preparing the transcript and suggestions.</p>
          {status === "recording" && mine && (
            <form action={retryProcessing.bind(null, id)} className="mt-2">
              <SubmitButton label="Stuck? Try again" variant="link" />
            </form>
          )}
        </section>
      )}

      {status === "failed" && (
        <section className="flex flex-col items-start gap-2 rounded-3xl border border-firm bg-firm-bg p-6">
          <h2 className="text-lg font-extrabold">We couldn&apos;t finish processing this session</h2>
          {mine && (
            <div className="flex flex-wrap gap-3">
              <form action={retryProcessing.bind(null, id)}>
                <SubmitButton label="Try again" />
              </form>
              <form action={chooseNotesOnly.bind(null, id)}>
                <SubmitButton label="Write notes instead" variant="secondary" />
              </form>
            </div>
          )}
        </section>
      )}

      {(segments.length > 0 || insights.length > 0) && (
        <div className="grid items-start gap-4 lg:grid-cols-[1fr_1.1fr]">
          <section className="rounded-3xl border border-line bg-white/95 p-6">
            <h2 className="text-lg font-extrabold">Transcript</h2>
            <ol className="mt-3 flex flex-col gap-1">
              {segments.map((s) => (
                <li key={s.id} id={`line-${s.id}`} className="scroll-mt-24 rounded-xl p-2 target:bg-warn-bg">
                  {status === "ready_for_review" && mine ? (
                    <details>
                      <summary className="cursor-pointer list-none">
                        <Line segment={s} />
                      </summary>
                      <form action={correctSegment.bind(null, id, s.id)} className="mt-2 flex flex-col gap-2">
                        <textarea name="text" defaultValue={s.text} aria-label="Corrected text" className="rounded-xl border border-line px-3 py-2 text-sm" />
                        <div className="flex items-center gap-2">
                          <select name="speaker" defaultValue={s.speaker} aria-label="Speaker" className="rounded-xl border border-line bg-white px-2 py-1.5 text-sm">
                            <option value="staff">Staff</option>
                            <option value="student">Student</option>
                            <option value="unknown">Unknown</option>
                          </select>
                          <SubmitButton label="Save correction" variant="secondary" />
                        </div>
                      </form>
                    </details>
                  ) : (
                    <Line segment={s} />
                  )}
                </li>
              ))}
            </ol>
          </section>

          <section className="flex flex-col gap-3 rounded-3xl border-2 bg-white/95 p-6" style={{ borderColor: "var(--school)" }}>
            <div>
              <h2 className="text-lg font-extrabold">{status === "reviewed" ? "Sent to " + studentName.split(" ")[0] : "Check it, then approve in one click"}</h2>
              <p className="text-sm text-muted">
                {MODEL_NOTE(insights[0]?.model_ref ?? null)}. {studentName.split(" ")[0]} sees the summary and highlights, never the AI draft. At most 2 steps go on
                their roadmap.
              </p>
            </div>
            {flags.length > 0 && mine && (
              <div className="flex flex-col gap-2 rounded-2xl border-2 border-[#F2C14E] bg-warn-bg p-4">
                <h3 className="font-extrabold text-warn-ink">{studentName.split(" ")[0]} flagged {flags.length === 1 ? "a highlight" : `${flags.length} highlights`}</h3>
                {flags.map((f) => {
                  const insight = insights.find((i) => i.id === f.insight_id);
                  return (
                    <form key={f.id} action={resolveFlag.bind(null, id, f.id)} className="flex flex-col gap-2 rounded-xl bg-white p-3">
                      {f.note && <p className="text-sm">&ldquo;{f.note}&rdquo;</p>}
                      <textarea name="text" defaultValue={insight?.payload.text ?? ""} aria-label="Corrected highlight" className="rounded-xl border border-line px-3 py-2 text-sm" />
                      <div className="flex flex-wrap gap-2">
                        <button name="choice" value="fix" className="rounded-full bg-ink px-4 py-2 text-sm font-extrabold text-white">
                          Save the fix
                        </button>
                        <button name="choice" value="remove" className="rounded-full border border-line bg-white px-4 py-2 text-sm font-semibold">
                          Remove it
                        </button>
                        <button name="choice" value="keep" className="text-sm font-semibold text-link">
                          It&apos;s right, keep it
                        </button>
                      </div>
                    </form>
                  );
                })}
              </div>
            )}
            {insights.length === 0 && <p className="text-sm text-muted">Melon found nothing to suggest from this transcript.</p>}
            <ReviewGroups sessionId={id} insights={insights} segments={segments} editable={status === "ready_for_review" && mine} linkLines="#line-" />
            {status === "ready_for_review" && mine && (
              <form action={approveSession.bind(null, id)} className="flex flex-col gap-1.5">
                <SubmitButton label={`Approve the rest · send to ${studentName.split(" ")[0]}`} />
                <span className="text-xs text-muted">Remove anything that&apos;s wrong first. Whatever you haven&apos;t decided on is approved with this click.</span>
              </form>
            )}
            {status === "reviewed" && (
              <p className="rounded-xl bg-done-bg px-3 py-2 text-sm font-semibold text-done-ink">Done. The highlights and steps are on {studentName.split(" ")[0]}&apos;s roadmap.</p>
            )}
          </section>
        </div>
      )}
    </main>
  );
}

function ConsentRow({ label, state }: { label: string; state: "yes" | "no" | "waiting" }) {
  const text = { yes: "Agreed", no: "Said no", waiting: "Waiting" }[state];
  const tone = { yes: "bg-done-bg text-done-ink", no: "bg-firm-bg text-firm", waiting: "bg-soft text-ink-2" }[state];
  return (
    <li className="flex items-center justify-between rounded-xl border border-line px-3 py-2">
      <b>{label}</b>
      <span className={`rounded-full px-3 py-1 text-xs font-bold ${tone}`}>{text}</span>
    </li>
  );
}

function Line({ segment }: { segment: Segment }) {
  return (
    <span className="block text-sm">
      <b className={segment.speaker === "student" ? "text-link" : "text-ink"}>{segment.speaker === "staff" ? "Staff" : segment.speaker === "student" ? "Student" : "Unknown"}: </b>
      {segment.text}
    </span>
  );
}
