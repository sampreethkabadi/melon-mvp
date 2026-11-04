import { appNow } from "../clock.ts";

// Semester math for the roadmap's week strip. Fall starts in late August, spring in mid-January, 16 weeks each.

export type Semester = { term: string; start: Date; week: number; weeks: number };

export function currentSemester(now = appNow()): Semester {
  const year = now.getFullYear();
  const fall = now.getMonth() >= 6; // July onward plans for fall, matching upcomingTerms() and current_term().
  const start = fall ? new Date(year, 7, 24) : new Date(year, 0, 12);
  const weeks = 16;
  const raw = Math.floor((now.getTime() - start.getTime()) / (7 * 24 * 3600 * 1000)) + 1;
  return { term: `${fall ? "Fall" : "Spring"} ${year}`, start, week: Math.min(Math.max(raw, 1), weeks), weeks };
}

/** 1-based week of the semester a date falls in, or null if it's outside the semester. */
export function weekOf(sem: Semester, date: Date): number | null {
  const w = Math.floor((date.getTime() - sem.start.getTime()) / (7 * 24 * 3600 * 1000)) + 1;
  return w >= 1 && w <= sem.weeks ? w : null;
}

/** Sorts terms like "Spring 2027" in time order. Unknown labels go last. */
export function termOrder(term: string | null): number {
  const m = term?.match(/^(Spring|Summer|Fall) (\d{4})$/);
  if (!m) return Number.MAX_SAFE_INTEGER;
  return Number(m[2]) * 10 + (m[1] === "Spring" ? 1 : m[1] === "Summer" ? 2 : 3);
}
