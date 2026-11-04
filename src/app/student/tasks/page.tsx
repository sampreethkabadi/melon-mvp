import Link from "next/link";
import { Backdrop } from "@/components/Backdrop";
import { SubmitButton } from "@/components/SubmitButton";
import { Eyebrow, Panel, Pill, SwagStrip } from "@/components/student/ui";
import { requireRole } from "@/lib/auth";
import { shortDate, shortTerm } from "@/lib/format";
import { rewardsFor } from "@/lib/progress";
import { currentSemester } from "@/lib/roadmap/semester";
import { focusSteps, KIND_LABEL, loadRoadmap, upcomingEvents, type Step } from "@/lib/student-data";
import { createClient } from "@/lib/supabase/server";
import { removeStep, setItemDone } from "../actions";

export const metadata = { title: "Action items · Melon" };

export default async function TasksPage() {
  const profile = await requireRole(["student"]);
  const supabase = await createClient();
  const { roadmap, interests, paths, pinned, steps } = await loadRoadmap(supabase, profile.id);

  if (roadmap?.status !== "published") {
    return (
      <main className="relative mx-auto flex max-w-3xl flex-col gap-3 px-4 py-8 sm:px-6">
        <Backdrop interests={interests} />
        <h1 className="text-3xl font-extrabold tracking-tight">Your action items</h1>
        <p className="rounded-3xl border border-line bg-white/95 p-6 text-ink-2">Your steps show up here once your advisor or coach approves your first roadmap.</p>
      </main>
    );
  }

  const [rewards, events] = await Promise.all([rewardsFor(supabase, profile.id), upcomingEvents(supabase, pinned, 8)]);
  const sem = currentSemester();
  const f = focusSteps(steps, sem);
  const pathName = new Map(paths.map((p) => [p.id, p.name]));
  const doneThisTerm = f.done.filter((s) => s.completed_at && new Date(s.completed_at) >= sem.start);
  // Firm dates: the student's own firm steps, then career center events that can't move.
  const firm = [
    ...[...f.now, ...f.unlocks].filter((s) => s.firm && s.due_date).map((s) => ({ key: s.id, date: s.due_date!, title: s.title })),
    ...events
      .filter((e) => e.starts_at && !steps.some((s) => s.resource_id === e.id || (s.kind === "event" && s.due_date === e.starts_at!.slice(0, 10))))
      .map((e) => ({ key: e.id, date: e.starts_at!.slice(0, 10), title: e.title })),
  ]
    .sort((a, b) => a.date.localeCompare(b.date))
    .filter((x, i, all) => all.findIndex((y) => y.title === x.title) === i)
    .slice(0, 5);

  return (
    <main className="relative mx-auto flex max-w-7xl flex-col gap-5 px-4 py-8 sm:px-6">
      <Backdrop interests={interests} />
      <div>
        <Eyebrow school>
          {sem.term} · week {sem.week}
        </Eyebrow>
        <h1 className="mt-1 text-[28px] font-extrabold tracking-tight sm:text-3xl">Your action items</h1>
        <p className="mt-1 text-ink-2">Three at a time, so it never piles up on top of your classes. Finish one and the next one unlocks.</p>
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-3.5">
          <Panel hero>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-extrabold">This week</h2>
              <Pill>{f.now.length} steps</Pill>
            </div>
            {f.now.length ? (
              f.now.map((s) => <Row key={s.id} step={s} pathName={s.path_id ? pathName.get(s.path_id) : undefined} />)
            ) : (
              <p className="rounded-2xl bg-done-bg px-4 py-3 text-sm font-semibold text-done-ink">All done for now. Nice work. Your next session will add more.</p>
            )}
          </Panel>

          {(f.unlocks.length > 0 || f.waiting.length > 0) && (
            <Panel>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-extrabold">Unlocks next</h2>
                <span className="text-xs text-muted">finish 1 step to open</span>
              </div>
              {f.unlocks.map((s) => (
                <Locked key={s.id} title={s.title} note={s.due_date ? `${s.firm ? "Firm · " : "By "}${shortDate(s.due_date)}` : undefined} />
              ))}
              {f.waiting.map((s) => (
                <Locked key={s.id} title={s.title} note="You added this. It waits in line." removable={s.source === "student" ? s.id : undefined} />
              ))}
              <span className="text-xs text-muted">During winter and summer break you get more steps at once.</span>
            </Panel>
          )}

          {doneThisTerm.length > 0 && (
            <Panel>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-extrabold">Done this semester</h2>
                <Pill tone="ok">{doneThisTerm.length}</Pill>
              </div>
              <div className="flex flex-wrap gap-2">
                {doneThisTerm.map((s) => (
                  <form key={s.id} action={setItemDone.bind(null, s.id, false)} className="contents">
                    <button title="Undo" className="rounded-full bg-done-bg px-3 py-1.5 text-[13px] font-bold text-done-ink hover:line-through">
                      ✓ {s.title}
                    </button>
                  </form>
                ))}
              </div>
            </Panel>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-3.5">
          <Panel>
            <h2 className="text-lg font-extrabold">Firm deadlines</h2>
            <span className="text-xs text-muted">These dates can&apos;t move. We remind you 3 days and 1 day before.</span>
            {firm.length ? (
              firm.map((d) => (
                <div key={d.key} className="flex items-center gap-3 rounded-[14px] border border-line bg-white px-3.5 py-3">
                  <span className="w-14 shrink-0 text-sm font-extrabold text-firm">{shortDate(d.date)}</span>
                  <b className="min-w-0 flex-1 text-sm">{d.title}</b>
                  <Pill tone="firm">Firm</Pill>
                </div>
              ))
            ) : (
              <span className="text-sm text-muted">Nothing firm coming up.</span>
            )}
          </Panel>
          {f.later.length > 0 && (
            <Panel>
              <h2 className="text-lg font-extrabold">Later semesters</h2>
              {f.later.map((s) => (
                <div key={s.id} className="flex items-baseline justify-between gap-2 text-sm">
                  <span>{s.title}</span>
                  <span className="shrink-0 text-xs font-bold text-muted">{shortTerm(s.term)}</span>
                </div>
              ))}
            </Panel>
          )}
          {f.paused.length > 0 && (
            <p className="rounded-2xl bg-soft px-4 py-3 text-xs text-ink-2">
              {f.paused.length} step{f.paused.length === 1 ? " is" : "s are"} paused with a path you unpinned. Pin it again on your{" "}
              <Link href="/student/roadmap" className="font-semibold text-link">
                roadmap
              </Link>{" "}
              and they come back.
            </p>
          )}
          <SwagStrip reward={rewards.next} label="Every step counts toward" />
        </div>
      </div>
    </main>
  );
}

function Row({ step, pathName }: { step: Step; pathName?: string }) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-3 rounded-[14px] border border-line bg-white px-3.5 py-3">
      <form action={setItemDone.bind(null, step.id, true)}>
        <button aria-label={`Mark ${step.title} done`} title="Mark done" className="size-[22px] rounded-md border-2 border-[#9AA49F] bg-white hover:border-done hover:bg-done-bg" />
      </form>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <Link href={`/student/tasks/${step.id}`} className="font-bold hover:underline">
          {step.title}
        </Link>
        <span className="text-xs text-muted">
          {KIND_LABEL[step.kind] ?? step.kind} · {pathName ? `for ${pathName}` : "counts for every path"}
        </span>
      </div>
      {step.due_date ? (
        <Pill tone={step.firm ? "firm" : "plain"}>
          {step.firm ? "Firm · " : "By "}
          {shortDate(step.due_date)}
        </Pill>
      ) : step.source === "student" ? (
        <Pill tone="new">You added</Pill>
      ) : null}
      <Link href={`/student/tasks/${step.id}`} className="rounded-full border border-ink px-3 py-1.5 text-[13px] font-bold">
        Open
      </Link>
    </div>
  );
}

function Locked({ title, note, removable }: { title: string; note?: string; removable?: string }) {
  return (
    <div className="flex items-center gap-3 rounded-[14px] border border-dashed border-line bg-white/60 px-3.5 py-3 text-muted">
      <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <rect x="5" y="11" width="14" height="10" rx="2" />
        <path d="M8 11V7a4 4 0 0 1 8 0v4" />
      </svg>
      <div className="flex min-w-0 flex-1 flex-col">
        <b className="text-sm">{title}</b>
        {note && <span className="text-xs">{note}</span>}
      </div>
      {removable && (
        <form action={removeStep.bind(null, removable)}>
          <SubmitButton label="Remove" variant="link" />
        </form>
      )}
    </div>
  );
}
