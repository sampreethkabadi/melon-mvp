import Link from "next/link";
import { notFound } from "next/navigation";
import { AutoRefresh } from "@/components/AutoRefresh";
import { Logo } from "@/components/Logo";
import { requireRole } from "@/lib/auth";
import { isDailyConfigured } from "@/lib/daily";
import { createClient } from "@/lib/supabase/server";
import { CallRoom } from "./CallRoom";
import { TranscriptEditor, type EditorLine } from "./TranscriptEditor";

export const metadata = { title: "Video call · Melon" };

export default async function CallPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await requireRole(["student", "advisor", "coach"]);
  const supabase = await createClient();
  const { data: session } = await supabase
    .from("sessions")
    .select(
      "id, status, session_type, student_id, staff_id, transcript_source, student:profiles!sessions_student_id_fkey(full_name), staff:profiles!sessions_staff_id_fkey(full_name)",
    )
    .eq("id", id)
    .maybeSingle();
  if (!session || (session.student_id !== profile.id && session.staff_id !== profile.id)) notFound();
  const me = session.staff_id === profile.id ? "staff" : "student";
  const studentName = (session.student as unknown as { full_name: string } | null)?.full_name ?? "Student";
  const staffName = (session.staff as unknown as { full_name: string } | null)?.full_name ?? "Advisor";
  const other = me === "staff" ? studentName : staffName;
  const back = me === "staff" ? `/staff/sessions/${session.id}` : "/student/appointments";
  const status = session.status as string;

  let body: React.ReactNode;
  if (status === "transcribed") {
    const [{ data: segs }, { data: edits }] = await Promise.all([
      supabase.from("transcript_segments").select("id, idx, speaker, text").eq("session_id", id).order("idx"),
      supabase.from("transcript_edits").select("segment_id, op, editor:profiles!transcript_edits_editor_id_fkey(full_name)").eq("session_id", id).order("at"),
    ]);
    const editedBy = new Map<string, string>();
    for (const e of (edits ?? []) as unknown as Array<{ segment_id: string | null; op: string; editor: { full_name: string } | null }>) {
      if (!e.segment_id || !e.editor) continue;
      const who = e.editor.full_name.split(" ")[0];
      // A line someone added stays "added by" them, even after later edits.
      if (e.op === "add" || !editedBy.get(e.segment_id)?.startsWith("added")) editedBy.set(e.segment_id, `${e.op === "add" ? "added" : "edited"} by ${who}`);
    }
    const lines: EditorLine[] = ((segs ?? []) as Array<{ id: string; idx: number; speaker: string; text: string }>).map((s) => ({
      ...s,
      speaker: s.speaker as EditorLine["speaker"],
      editedBy: editedBy.get(s.id) ?? null,
    }));
    body = (
      <>
        <AutoRefresh ms={4000} />
        <TranscriptEditor
          sessionId={session.id}
          me={me}
          lines={lines}
          names={{ staff: staffName, student: studentName }}
          sample={session.transcript_source === "sample"}
        />
      </>
    );
  } else if (["ready_for_review", "reviewed", "closed"].includes(status)) {
    body = (
      <section className="flex flex-col items-start gap-3 rounded-3xl border border-line bg-white p-6">
        <h1 className="text-2xl font-extrabold">This call is done</h1>
        <p className="text-ink-2">
          {me === "staff"
            ? "The transcript is locked. Review the key points and action items, then send them."
            : `${staffName.split(" ")[0]} is reviewing the key points and action items. They'll show up in Appointments.`}
        </p>
        <Link href={back} className="rounded-full bg-ink px-5 py-2.5 font-extrabold text-white">
          {me === "staff" ? "Review the summary" : "Go to Appointments"}
        </Link>
      </section>
    );
  } else if (!isDailyConfigured()) {
    body = (
      <section className="rounded-3xl border border-line bg-white p-6">
        <h1 className="text-2xl font-extrabold">Video calls aren&apos;t set up yet</h1>
        <p className="mt-1 text-ink-2">Add DAILY_API_KEY to the app&apos;s settings to turn them on.</p>
      </section>
    );
  } else {
    body = <CallRoom sessionId={session.id} me={me} other={other} />;
  }

  return (
    <div className="min-h-dvh bg-ground">
      <header className="sticky top-0 z-20 border-b border-line bg-white/85 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link href={me === "staff" ? "/staff" : "/student"} className="flex items-center gap-3 hover:opacity-70">
            <Logo size={28} />
          </Link>
          <p className="truncate text-sm font-semibold text-ink-2">
            {session.session_type ?? "Appointment"} · with {other}
          </p>
          <Link href={back} className="text-sm font-semibold text-link">
            Leave
          </Link>
        </div>
      </header>
      <main className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-6 sm:px-6">{body}</main>
    </div>
  );
}
