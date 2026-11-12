"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addLine, deleteLine, draftFromTranscript, editLine } from "../actions";

type Speaker = "staff" | "student" | "unknown";
export type EditorLine = { id: string; idx: number; speaker: Speaker; text: string; editedBy: string | null };

/**
 * The transcript right after the call. Both people can fix a line, add one that's missing or delete one. Every
 * change is logged. The advisor or coach then locks it and asks for the summary.
 */
export function TranscriptEditor({ sessionId, me, lines, names, sample }: { sessionId: string; me: "staff" | "student"; lines: EditorLine[]; names: { staff: string; student: string }; sample: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const label = (s: Speaker) => (s === "staff" ? names.staff.split(" ")[0] : s === "student" ? names.student.split(" ")[0] : "Someone");

  const run = (fn: () => Promise<unknown>, after?: () => void) => {
    setError(null);
    start(async () => {
      try {
        await fn();
        after?.();
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't save that. Try again.");
      }
    });
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <section className="flex flex-col gap-3 rounded-3xl border border-line bg-white p-5 sm:p-6">
        <div>
          <h1 className="text-2xl font-extrabold">Check the transcript together</h1>
          <p className="text-sm text-ink-2">
            {sample ? "This is the invented sample conversation, for the demo. " : ""}
            Fix anything that was heard wrong, add something that was missed, or delete a line. You both see changes as they&apos;re made.
          </p>
        </div>
        {error && (
          <p role="alert" className="rounded-xl bg-firm-bg px-3 py-2 text-sm font-semibold text-firm">
            {error}
          </p>
        )}
        <AddHere open={adding === -1} onOpen={() => setAdding(-1)} onCancel={() => setAdding(null)} pending={pending} names={names} onSave={(text, speaker) => run(() => addLine(sessionId, -1, text, speaker), () => setAdding(null))} />
        <ol className="flex flex-col gap-1">
          {lines.map((l) => (
            <li key={l.id} className="group flex flex-col gap-1 rounded-2xl px-3 py-2 hover:bg-soft/70">
              {editing === l.id ? (
                <form
                  className="flex flex-col gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    run(() => editLine(sessionId, l.id, String(f.get("text") ?? ""), f.get("speaker") as Speaker), () => setEditing(null));
                  }}
                >
                  <select name="speaker" defaultValue={l.speaker} aria-label="Who said it" className="self-start rounded-lg border border-line bg-white px-2 py-1 text-sm">
                    <option value="staff">{names.staff}</option>
                    <option value="student">{names.student}</option>
                    <option value="unknown">Not sure</option>
                  </select>
                  <textarea name="text" defaultValue={l.text} required aria-label="What was said" rows={2} className="rounded-xl border border-line px-3 py-2 text-sm" />
                  <div className="flex gap-2">
                    <button disabled={pending} className="rounded-full bg-ink px-4 py-1.5 text-sm font-extrabold text-white disabled:opacity-50">
                      Save
                    </button>
                    <button type="button" onClick={() => setEditing(null)} className="rounded-full border border-line bg-white px-4 py-1.5 text-sm font-semibold">
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <div className="flex items-start gap-3">
                  <p className="min-w-0 flex-1 text-[15px] leading-relaxed">
                    <b className={l.speaker === "student" ? "text-link" : "text-ink"}>{label(l.speaker)}: </b>
                    {l.text}
                    {l.editedBy && <span className="ml-2 rounded-full bg-new-bg px-2 py-0.5 text-[11px] font-bold text-new-ink">{l.editedBy}</span>}
                  </p>
                  <span className="flex shrink-0 gap-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                    <button type="button" onClick={() => setEditing(l.id)} className="text-xs font-semibold text-link">
                      Edit
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => confirm("Delete this line? It's logged, so it can be traced.") && run(() => deleteLine(sessionId, l.id))}
                      className="text-xs font-semibold text-link"
                    >
                      Delete
                    </button>
                    <button type="button" onClick={() => setAdding(l.idx)} className="text-xs font-semibold text-link">
                      Add below
                    </button>
                  </span>
                </div>
              )}
              {adding === l.idx && (
                <AddHere open onOpen={() => undefined} onCancel={() => setAdding(null)} pending={pending} names={names} onSave={(text, speaker) => run(() => addLine(sessionId, l.idx, text, speaker), () => setAdding(null))} />
              )}
            </li>
          ))}
        </ol>
      </section>

      <aside className="flex flex-col gap-3 self-start lg:sticky lg:top-20">
        {me === "staff" ? (
          <section className="flex flex-col gap-2 rounded-3xl border-2 bg-white p-5" style={{ borderColor: "var(--school)" }}>
            <h2 className="font-extrabold">When you&apos;re both happy with it</h2>
            <p className="text-sm text-ink-2">This locks the transcript and drafts the key points and action items for you to review.</p>
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                run(async () => {
                  const { next } = await draftFromTranscript(sessionId);
                  router.push(next);
                })
              }
              className="rounded-full bg-ink px-5 py-2.5 font-extrabold text-white disabled:opacity-50"
            >
              {pending ? "Drafting…" : "Looks right · draft the summary"}
            </button>
          </section>
        ) : (
          <section className="rounded-3xl border border-line bg-white p-5 text-sm text-ink-2">
            Fix anything that&apos;s wrong. When you&apos;re both done, {names.staff.split(" ")[0]} drafts the key points and action items, and they come to you in Appointments.
          </section>
        )}
      </aside>
    </div>
  );
}

function AddHere({ open, onOpen, onCancel, onSave, pending, names }: { open: boolean; onOpen: () => void; onCancel: () => void; onSave: (text: string, speaker: Speaker) => void; pending: boolean; names: { staff: string; student: string } }) {
  if (!open)
    return (
      <button type="button" onClick={onOpen} className="self-start text-xs font-semibold text-link">
        + Add a line at the start
      </button>
    );
  return (
    <form
      className="flex flex-col gap-2 rounded-2xl border border-dashed border-line p-3"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        onSave(String(f.get("text") ?? ""), f.get("speaker") as Speaker);
      }}
    >
      <select name="speaker" defaultValue="student" aria-label="Who said it" className="self-start rounded-lg border border-line bg-white px-2 py-1 text-sm">
        <option value="staff">{names.staff}</option>
        <option value="student">{names.student}</option>
        <option value="unknown">Not sure</option>
      </select>
      <textarea name="text" required rows={2} aria-label="What was said" placeholder="What was said" className="rounded-xl border border-line px-3 py-2 text-sm" />
      <div className="flex gap-2">
        <button disabled={pending} className="rounded-full bg-ink px-4 py-1.5 text-sm font-extrabold text-white disabled:opacity-50">
          Add line
        </button>
        <button type="button" onClick={onCancel} className="rounded-full border border-line bg-white px-4 py-1.5 text-sm font-semibold">
          Cancel
        </button>
      </div>
    </form>
  );
}
