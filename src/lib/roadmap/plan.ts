import { termOrder, type Semester } from "./semester.ts";

// Shared ordering for roadmap steps, used by the Roadmap and Action items tabs.

export type PlanItem = {
  id: string;
  title: string;
  description: string | null;
  term: string | null;
  kind: string;
  status: string;
  path_id: string | null;
  due_date: string | null;
  firm: boolean;
  sort: number;
  source?: string;
  resource_id?: string | null;
  completed_at: string | null;
};

export const KIND_LABEL: Record<string, string> = {
  course: "Course",
  experience: "Experience",
  skill: "Skill",
  certification: "Certification",
  event: "Event",
  networking: "Networking",
  application: "Applications",
  coaching: "Coaching",
  project: "Project",
};

/** Earlier semesters first, then firm dates, then soonest due date, then the order they were planned in. */
export function byPlan(a: PlanItem, b: PlanItem) {
  return (
    termOrder(a.term) - termOrder(b.term) ||
    Number(b.firm) - Number(a.firm) ||
    (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999") ||
    a.sort - b.sort
  );
}

/** Splits open steps into the 3 to focus on now, the rest of this semester, and later semesters. */
export function planGroups<T extends PlanItem>(items: T[], sem: Semester) {
  const open = items.filter((i) => i.status === "active").sort(byPlan);
  const nowItems = open.filter((i) => termOrder(i.term) <= termOrder(sem.term));
  const pool = nowItems.length ? nowItems : open;
  const focus = pool.slice(0, 3);
  const laterThisTerm = nowItems.length ? nowItems.slice(3) : [];
  const later = open.filter((i) => termOrder(i.term) > termOrder(sem.term) && !focus.includes(i));
  const done = items
    .filter((i) => i.status === "done")
    .sort((a, b) => (b.completed_at ?? "").localeCompare(a.completed_at ?? ""));
  return { open, nowItems, focus, laterThisTerm, later, done, moreCount: pool.length - focus.length };
}
