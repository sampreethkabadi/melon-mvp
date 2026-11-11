import { termOrder, type Semester } from "./semester.ts";

// Which steps a student sees now. Shared by Home, Roadmap and Action items.

export type Step = {
  id: string;
  title: string;
  description: string | null;
  rationale: string | null;
  term: string | null;
  kind: string;
  status: string;
  source: string;
  path_id: string | null;
  due_date: string | null;
  firm: boolean;
  sort: number;
  resource_id: string | null;
  evidence: Array<{ session_id?: string }> | null;
  completed_at: string | null;
  created_at: string;
  /** What the student got out of it, shown on the road. Empty until someone writes it. */
  outcomes?: string[] | null;
};

/** Earlier semesters first, then firm dates, then the soonest due date, then the order they were added. */
export function byPlan(a: Step, b: Step) {
  return (
    termOrder(a.term) - termOrder(b.term) ||
    Number(b.firm) - Number(a.firm) ||
    (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999") ||
    a.created_at.localeCompare(b.created_at) ||
    a.sort - b.sort
  );
}

/** The student's open steps: 3 to do now, up to 2 that unlock next, and their own steps waiting in line. */
export function focusSteps(steps: Step[], sem: Semester) {
  const thisTerm = (s: Step) => termOrder(s.term) <= termOrder(sem.term);
  const open = steps.filter((s) => s.status === "active" && thisTerm(s)).sort(byPlan);
  return {
    now: open.slice(0, 3),
    unlocks: open.slice(3),
    waiting: steps.filter((s) => s.status === "queued").sort(byPlan),
    paused: steps.filter((s) => s.status === "paused"),
    later: steps.filter((s) => s.status === "active" && !thisTerm(s)).sort(byPlan),
    done: steps.filter((s) => s.status === "done").sort((a, b) => (b.completed_at ?? "").localeCompare(a.completed_at ?? "")),
  };
}

