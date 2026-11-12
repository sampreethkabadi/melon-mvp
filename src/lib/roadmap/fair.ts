import type { Step } from "./focus.ts";

// The career fair is the one deadline every student shares, so its steps read as one plan
// ("Get ready for the Career Fair") instead of separate chores.

export type Fair = { title: string; date: string };

/** The next career fair from the events list: the real one, not the mock fair or a prep workshop. */
export function nextFair(events: Array<{ title: string; starts_at: string | null }>, today: string): Fair | null {
  const fair = events
    .filter((e) => e.starts_at && /career fair/i.test(e.title) && !/mock|prep|practice|workshop|drop-in/i.test(e.title))
    .filter((e) => e.starts_at!.slice(0, 10) >= today)
    .sort((a, b) => a.starts_at!.localeCompare(b.starts_at!))[0];
  return fair ? { title: fair.title, date: fair.starts_at!.slice(0, 10) } : null;
}

const FAIR_WORDS = /\b(career fair|the fair|mock fair|recruiters?|elevator pitch|30-second pitch|handshake)\b/i;

/**
 * Whether a step is part of getting ready for the fair: it says so, it came from a fair prep appointment,
 * or it's due in the three weeks before the fair and is the kind of thing you'd do for one.
 */
export function isFairStep(step: Pick<Step, "title" | "description" | "due_date" | "kind" | "evidence">, fair: Fair, fairSessions: Set<string> = new Set()) {
  if (FAIR_WORDS.test(step.title) || FAIR_WORDS.test(step.description ?? "")) return true;
  if ((step.evidence ?? []).some((e) => e.session_id && fairSessions.has(e.session_id))) return true;
  if (!step.due_date || step.due_date > fair.date) return false;
  const daysBefore = (Date.parse(fair.date) - Date.parse(step.due_date)) / 86_400_000;
  return daysBefore <= 21 && ["event", "application", "networking"].includes(step.kind);
}

/** Whole days from one ISO date to another. */
export function daysUntil(from: string, to: string) {
  return Math.round((Date.parse(to.slice(0, 10)) - Date.parse(from.slice(0, 10))) / 86_400_000);
}
