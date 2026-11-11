import Link from "next/link";
import { CalendarDays, GraduationCap, Hourglass, Lock } from "lucide-react";
import { Backdrop } from "@/components/Backdrop";
import { SubmitButton } from "@/components/SubmitButton";
import { requireRole } from "@/lib/auth";
import { longDate, shortDate, shortTerm } from "@/lib/format";
import { currentSemester } from "@/lib/roadmap/semester";
import { focusSteps, KIND_LABEL, loadFairPlan, loadRoadmap, upcomingEvents, type Step } from "@/lib/student-data";
import { createClient } from "@/lib/supabase/server";
import { removeStep } from "../actions";
import { TaskBoard, type BoardItem } from "./TaskBoard";

export const metadata = { title: "Action items · Melon" };

export default async function TasksPage() {
  const profile = await requireRole(["student"]);
  const supabase = await createClient();
  const { roadmap, interests, paths, pinned, steps } = await loadRoadmap(supabase, profile.id);

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
  const isFair = (s: Step) => Boolean(plan?.ids.has(s.id));
  const fairItems = f.now.filter(isFair).sort((a, b) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999")).map(toItem);
  const others = f.now.filter((s) => !isFair(s)).map(toItem);
  const done = f.done
    .filter((s) => s.kind !== "course" && s.completed_at && new Date(s.completed_at) >= sem.start)
    .map((s) => ({ id: s.id, title: s.title, when: shortDate(s.completed_at!.slice(0, 10)) }));
  const fairWhen = plan ? longDate(`${plan.fair.date}T16:00:00Z`) : "";

  // Upcoming, in brief: what opens next, what you queued, career center dates, and later semesters.
  const onList = new Set(steps.map((s) => s.resource_id).filter(Boolean));
  const upcoming = [
    ...f.unlocks.map((s) => ({ key: s.id, icon: "lock" as const, title: s.title, note: "Opens next", red: false })),
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
        <p className="mt-1 text-ink-2">3 at a time. Finish one and the next one opens.</p>
      </div>

      <TaskBoard
        fair={plan ? { title: "Career Fair", when: fairWhen, days: plan.days, total: plan.total, done: plan.done } : null}
        fairItems={fairItems}
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
