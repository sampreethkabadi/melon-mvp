import Link from "next/link";
import { shortDate } from "@/lib/format";
import type { StudentRow } from "@/lib/staff/overview";
import { buildMeetingPrep } from "@/lib/staff/prep";

const MODALITY: Record<string, string> = { teams: "Teams", melon_call: "Melon call", in_person: "In person" };

type Appointment = { id: string; type: string; modality: string; location: string | null; student_id: string; status?: string };

/** A glimpse before a meeting: who the student is, how they're doing, and what this is probably about. */
export function MeetingPrepCard({ appointment, row, today, open, when, hideLink }: { appointment: Appointment; row: StudentRow; today: string; open: boolean; when: string; hideLink?: boolean }) {
  const prep = buildMeetingPrep(row, appointment, { today, shortDate });
  const done = appointment.status === "completed";
  return (
    <details open={open} className={`group rounded-3xl bg-white/95 ${open ? "border-2" : "border border-line"}`} style={open ? { borderColor: "var(--school)" } : undefined}>
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 p-4 sm:px-5">
        <span className="font-extrabold tabular-nums">{when}</span>
        <span className="flex min-w-0 flex-1 flex-col">
          <b>{row.name}</b>
          <span className="text-sm text-muted">
            {appointment.type} · {MODALITY[appointment.modality] ?? appointment.modality}
            {appointment.location ? ` · ${appointment.location}` : ""}
          </span>
        </span>
        {done ? <span className="rounded-full bg-done-bg px-3 py-1 text-xs font-bold text-done-ink">Done</span> : prep.isFirstMeeting && <span className="rounded-full bg-new-bg px-3 py-1 text-xs font-bold text-new-ink">First session</span>}
        <span aria-hidden="true" className="text-sm font-bold text-link group-open:hidden">
          Prep
        </span>
      </summary>
      <div className="grid gap-4 border-t border-line p-4 sm:px-5 md:grid-cols-2">
        <div className="flex flex-col gap-3">
          <Block title="Probably here for">
            <p>{prep.purpose}</p>
            {prep.signals.length > 0 && <List items={prep.signals} />}
          </Block>
          {prep.lastTime && (
            <Block title="Last time">
              <p>{prep.lastTime}</p>
            </Block>
          )}
          {prep.openAdvice.length > 0 && (
            <Block title="Advice still open">
              <List items={prep.openAdvice} />
            </Block>
          )}
        </div>
        <div className="flex flex-col gap-3">
          <Block title="Progress so far">
            <p>{prep.progress}</p>
            {row.total > 0 && <ProgressBar percent={row.percent} />}
            {row.nextStep && <p className="mt-1 text-sm text-muted">Next step: {row.nextStep.title}</p>}
          </Block>
          <Block title="Background">{prep.background.length ? <List items={prep.background} /> : <p className="text-muted">Nothing on their profile yet.</p>}</Block>
          {prep.concerns.length > 0 && (
            <Block title="Has raised · only staff see this">
              <List items={prep.concerns} />
            </Block>
          )}
        </div>
        {!hideLink && (
          <div className="flex flex-wrap gap-3 md:col-span-2">
            <Link href={`/staff/students/${row.id}?appointment=${appointment.id}`} className="rounded-full bg-ink px-5 py-2 text-sm font-extrabold text-white">
              Open full record
            </Link>
          </div>
        )}
      </div>
    </details>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="text-sm text-ink-2">
      <h3 className="mb-1 text-xs font-extrabold uppercase tracking-widest text-muted">{title}</h3>
      {children}
    </section>
  );
}

function List({ items }: { items: string[] }) {
  return (
    <ul className="mt-1 flex list-disc flex-col gap-0.5 pl-4">
      {items.map((i) => (
        <li key={i}>{i}</li>
      ))}
    </ul>
  );
}

export function ProgressBar({ percent }: { percent: number }) {
  return (
    <span role="img" aria-label={`${percent}% of steps done`} className="mt-1 block h-2 w-full overflow-hidden rounded-full bg-soft">
      <span className="block h-full rounded-full bg-done" style={{ width: `${percent}%` }} />
    </span>
  );
}
