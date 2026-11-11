import Link from "next/link";
import { CalendarDays, GraduationCap, Hourglass, Lock } from "lucide-react";
import { Backdrop } from "@/components/Backdrop";
import { SubmitButton } from "@/components/SubmitButton";
import { requireRole } from "@/lib/auth";
import { longDate, shortDate, shortTerm } from "@/lib/format";
import { pastTense, plannedFor, TASK_MATCH } from "@/lib/roadmap/milestones";
import { semestersFor } from "@/lib/roadmap/road";
import { currentSemester } from "@/lib/roadmap/semester";
import { focusSteps, KIND_LABEL, loadFairPlan, loadRoadmap, upcomingEvents, type Step } from "@/lib/student-data";
import { createClient } from "@/lib/supabase/server";
import { removeStep } from "../actions";
import { TaskBoard, type BoardItem, type MilestoneGroup } from "./TaskBoard";

export const metadata = { title: "Action items · Melon" };

export default async function TasksPage() {
  const profile = await requireRole(["student"]);
  const supabase = await createClient();
  const { roadmap, interests, paths, pinned, steps, year, gradTerm } = await loadRoadmap(supabase, profile.id);

  if (roadmap?.status !== "published") {
    return (
      <main className="relative mx-auto flex max-w-3xl flex-col gap-3 px-4 py-8 sm:px-6">
        <Backdrop interests={interests} />
        <h1 className="text-3xl font-extrabold tracking-tight">Action items</h1>
        <p className="rounded-3xl border border-line bg-white/95 p-6 text-ink-2">Your steps show up here once you and your advisor or coach have both accepted your roadmap.</p>
      </main>
    );
  }

  const sem = currentSemester();
  const f = focusSteps(steps, sem);
  const [plan, events] = await Promise.all([loadFairPlan(supabase, profile.id, steps), upcomingEvents(supabase, pinned, 6)]);
  const pathName = new Map(paths.map((p) => [p.id, p.name]));
  const toItem = (s: Step): BoardItem => ({
    id: s.id,
    title: s.title,
    meta: [KIND_LABEL[s.kind] ?? s.kind, s.path_id && pathName.get(s.path_id) ? `for ${pathName.get(s.path_id)}` : null, s.source === "student" ? "you added this" : null].filter(Boolean).join(" · "),
    date: s.due_date ? (s.firm ? shortDate(s.due_date) : `by ${shortDate(s.due_date)}`) : null,
    fixed: s.firm,
  });
  const thisSem = (s: Step) => Boolean(s.completed_at && new Date(s.completed_at) >= sem.start);
  // Wins logged on the road (log_win puts them at sort 950) are milestones, not tasks: they live on the road.
  const isWin = (s: Step) => s.source === "student" && s.sort === 950;
  const doneSteps = f.done.filter((s) => s.kind !== "course" && thisSem(s) && !isWin(s));

  // Every task leads to a milestone: this semester's from the four-year guide, plus the career fair when one is coming.
  const slots = semestersFor(year, gradTerm, sem.term);
  const slot = Math.max(0, slots.findIndex((x) => x.term === sem.term));
  const main = pinned[0];
  const claimed = new Set(steps.filter((s) => s.status === "done" && s.term === sem.term).map((s) => s.title.toLowerCase()));
  const planned = plannedFor(slot, slots.length)
    .map((m) => ({ ...m, title: m.path && main ? m.title.replace("your path", main.name) : m.title }))
    .filter((m) => !claimed.has(pastTense(m.title).toLowerCase()));
  if (plan && !planned.some((m) => m.key === "fair")) planned.unshift({ key: "fair", title: "Go to the Career Fair", dated: true, tasks: [] });
  const active = [...f.now, ...f.unlocks];
  const taken = new Set<string>();
  const matches = (key: string, s: Step) => (key === "fair" ? Boolean(plan?.ids.has(s.id)) : Boolean(TASK_MATCH[key]?.test(s.title)));
  const byDate = (a: Step, b: Step) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999");
  const groups: MilestoneGroup[] = planned
    .map((m) => {
      const mine = active.filter((s) => !taken.has(s.id) && matches(m.key, s)).sort(byDate);
      mine.forEach((s) => taken.add(s.id));
      const finished = doneSteps.filter((s) => matches(m.key, s)).length;
      const dated = m.key === "fair" && Boolean(plan);
      return {
        key: m.key,
        title: m.title,
        when: dated ? longDate(`${plan!.fair.date}T16:00:00Z`) : "This semester",
        dated,
        days: dated ? plan!.days : null,
        note: dated ? "Do these first. After the fair, your road asks if you went, and the flag goes up." : "Tick these off, then mark the milestone done on your road.",
        total: mine.length + finished,
        done: finished,
        items: mine.map(toItem),
      };
    })
    .filter((g) => g.items.length > 0);
  const others = active.filter((s) => !taken.has(s.id)).map(toItem);
  const goalOf = (s: Step) => planned.find((m) => matches(m.key, s))?.title;
  const done = doneSteps.map((s) => ({ id: s.id, title: s.title, when: shortDate(s.completed_at!.slice(0, 10)), goal: goalOf(s) ? `For: ${goalOf(s)}` : undefined }));

  // Upcoming, in brief: what opens next, what you queued, career center dates, and later semesters.
  const onList = new Set(steps.map((s) => s.resource_id).filter(Boolean));
  const upcoming = [
    ...f.waiting.map((s) => ({ key: s.id, icon: "wait" as const, title: s.title, note: "Waits in line", red: false, removable: s.source === "student" ? s.id : undefined })),
    ...events
      .filter((e) => e.starts_at && !onList.has(e.id) && !(plan && e.starts_at.slice(0, 10) === plan.fair.date))
      .slice(0, 2)
      .map((e) => ({ key: e.id, icon: "event" as const, title: e.title, note: shortDate(e.starts_at!.slice(0, 10)), red: true })),
    ...f.later.slice(0, 2).map((s) => ({ key: s.id, icon: "later" as const, title: s.title, note: shortTerm(s.term), red: false })),
  ].slice(0, 5);
  const ICON = { lock: Lock, wait: Hourglass, event: CalendarDays, later: GraduationCap };

  const upcomingSection = upcoming.length > 0 && (
    <section className="flex flex-col gap-3 rounded-3xl border border-line bg-white/95 p-5 sm:p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-extrabold">Upcoming</h2>
        <Link href="/student/roadmap" className="text-sm font-bold text-link">
          Full roadmap
        </Link>
      </div>
      {upcoming.map((u) => {
        const Icon = ICON[u.icon];
        return (
          <div key={u.key} className="flex items-center gap-3 text-[15px] text-ink-2">
            <Icon size={18} className="shrink-0" aria-hidden="true" />
            <span className="min-w-0 flex-1 font-semibold">{u.title}</span>
            <span className={`shrink-0 text-[13px] ${u.red ? "font-bold text-firm" : "text-muted"}`}>{u.note}</span>
            {"removable" in u && u.removable && (
              <form action={removeStep.bind(null, u.removable)}>
                <SubmitButton label="Remove" variant="link" />
              </form>
            )}
          </div>
        );
      })}
    </section>
  );

  return (
    <main className="relative mx-auto flex max-w-[860px] flex-col gap-6 px-4 py-8 sm:px-6">
      <Backdrop interests={interests} />
      <div>
        <p className="text-[13px] font-extrabold uppercase tracking-[.08em]" style={{ color: "var(--school)" }}>
          {sem.term} · week {sem.week}
        </p>
        <h1 className="mt-1 text-3xl font-extrabold tracking-tight sm:text-4xl">Action items</h1>
        <p className="mt-1 text-ink-2">Every task leads to a milestone on your road. Up to 5 at a time.</p>
      </div>

      <TaskBoard
        groups={groups}
        items={others}
        done={done}
        upcoming={upcomingSection}
      />

      {f.paused.length > 0 && (
        <p className="rounded-2xl bg-soft px-4 py-3 text-xs text-ink-2">
          {f.paused.length} step{f.paused.length === 1 ? " is" : "s are"} paused with a path you unpinned. Pin it again on your{" "}
          <Link href="/student/roadmap" className="font-semibold text-link">
            roadmap
          </Link>{" "}
          and they come back.
        </p>
      )}
    </main>
  );
}
