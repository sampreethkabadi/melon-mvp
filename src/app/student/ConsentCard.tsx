import { AutoRefresh } from "@/components/AutoRefresh";
import { SubmitButton } from "@/components/SubmitButton";
import { createClient } from "@/lib/supabase/server";
import { answerConsent } from "./actions";

type LiveSession = {
  id: string;
  staff: { full_name: string } | null;
  consents: Array<{ subject_id: string; granted: boolean; scope: string; created_at: string }>;
};

/** Shows the recording question to a student wherever they are, including partway through onboarding. */
export async function ConsentCard({ studentId }: { studentId: string }) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("sessions")
    .select("id, staff:profiles!sessions_staff_id_fkey(full_name), consents(subject_id, granted, scope, created_at)")
    .eq("student_id", studentId)
    .in("status", ["created", "consented", "recording"])
    .order("created_at", { ascending: false })
    .limit(1);
  const session = ((data ?? [])[0] ?? null) as unknown as LiveSession | null;
  if (!session) return <AutoRefresh ms={5000} />;

  const answer = (session.consents ?? [])
    .filter((c) => c.subject_id === studentId && c.scope === "record")
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .at(-1);
  const name = session.staff?.full_name ?? "Your advisor";
  return (
    <section className="flex flex-col gap-3 rounded-3xl border-2 border-new bg-new-bg p-6">
      <AutoRefresh ms={5000} />
      {!answer ? (
        <>
          <h2 className="text-lg font-extrabold text-new-ink">{name} would like to record this appointment</h2>
          <p>
            If you agree, Melon records the audio, makes a transcript, and uses AI to draft notes. {name} checks those notes before anything reaches your profile or roadmap. It&apos;s fine to say no: your appointment goes ahead the same way, and they&apos;ll take notes instead.
          </p>
          <div className="flex flex-wrap gap-2">
            <form action={answerConsent.bind(null, session.id, true)}>
              <SubmitButton label="I agree" />
            </form>
            <form action={answerConsent.bind(null, session.id, false)}>
              <SubmitButton label="No, don't record" variant="secondary" />
            </form>
          </div>
        </>
      ) : answer.granted ? (
        <>
          <h2 className="text-lg font-extrabold text-new-ink">You agreed to record this appointment</h2>
          <form action={answerConsent.bind(null, session.id, false)}>
            <SubmitButton label="Stop and withdraw my consent" variant="secondary" />
          </form>
        </>
      ) : (
        <>
          <h2 className="text-lg font-extrabold text-new-ink">You said no to recording</h2>
          <p>Nothing will be recorded. {name} will take notes instead.</p>
          <form action={answerConsent.bind(null, session.id, true)}>
            <SubmitButton label="I changed my mind, I agree" variant="link" />
          </form>
        </>
      )}
    </section>
  );
}
