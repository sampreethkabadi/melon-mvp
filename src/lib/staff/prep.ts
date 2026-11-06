import type { StudentRow } from "./overview";

// The glimpse an advisor or coach gets before a meeting. "Probably" is honest: it comes from what the student
// booked and what's on their record, not from anything they said about this meeting.

const PURPOSE: Record<string, string> = {
  "Course planning": "Choosing next semester's courses and checking they fit their goals.",
  "Degree progress check": "Checking they're on track to graduate and what's left to complete.",
  "Declare or change a major or minor": "Deciding on a major or minor and what the change would mean for their plan.",
  "Academic policy question": "Getting a clear answer on a university rule or deadline.",
  "Advising drop-in": "A quick academic question. Ask what's on their mind first.",
  "Mock technical interview": "Practicing technical interview questions and getting feedback.",
  "Mock behavioral interview": "Practicing behavioral answers and getting feedback.",
  "Mock case interview": "Working through a practice case and getting feedback.",
  "Career exploration": "Working out which careers fit their interests.",
  "Resume, cover letter or portfolio review": "Getting feedback on application materials.",
  "Interview preparation": "Preparing for an upcoming interview.",
  "LinkedIn profile review": "Improving how their LinkedIn presents them.",
  "Job offer negotiation": "Weighing an offer and how to negotiate it.",
  "Career fair preparation": "Getting ready for the fair: which companies to visit and how to pitch themselves.",
  "Internship search": "Finding and applying to internships.",
  "LinkedIn headshot": "Getting a professional photo taken.",
  "Drop-in": "A quick career question. Ask what's on their mind first.",
};

export function purposeOf(type: string) {
  return PURPOSE[type] ?? `Booked as "${type}". Ask what they'd like to get out of it.`;
}

export type MeetingPrep = {
  purpose: string;
  /** What on their record makes this meeting likely to go somewhere specific. */
  signals: string[];
  background: string[];
  progress: string;
  lastTime: string | null;
  openAdvice: string[];
  concerns: string[];
  isFirstMeeting: boolean;
};

const STATUS_NOTE: Record<string, string> = {
  none: "No roadmap yet.",
  draft: "Their roadmap is a draft you haven't approved, so they can't see it yet.",
  awaiting_student: "Their roadmap is approved and waiting for them to accept it.",
};

export function buildMeetingPrep(row: StudentRow, appt: { type: string }, ctx: { today: string; shortDate: (iso: string) => string }): MeetingPrep {
  const signals: string[] = [];
  const soon = row.openSteps.filter((s) => s.firm && s.due_date && s.due_date >= ctx.today).slice(0, 2);
  for (const s of soon) signals.push(`Firm date coming up: ${s.title} (${ctx.shortDate(s.due_date!)}).`);
  if (row.overdue) signals.push(row.overdue === 1 ? "One step is overdue, so they may need help getting it moving." : `${row.overdue} steps are overdue, so they may need help getting them moving.`);
  if (row.openFlags) signals.push(row.openFlags === 1 ? "They flagged a highlight from a session as wrong." : `They flagged ${row.openFlags} highlights from sessions as wrong.`);
  if (row.pendingSuggestions) signals.push(row.pendingSuggestions === 1 ? "A suggested roadmap change is waiting on their answer." : `${row.pendingSuggestions} suggested roadmap changes are waiting on their answer.`);
  if (STATUS_NOTE[row.roadmapStatus] && row.roadmapStatus !== "none") signals.push(STATUS_NOTE[row.roadmapStatus]);
  if (row.onboardingStep && row.onboardingStep !== "done") signals.push("They haven't finished onboarding, so their profile may be incomplete.");

  const background: string[] = [];
  const who = [row.yearLabel, row.program ?? row.majors.join(" and ")].filter(Boolean).join(" · ");
  if (who) background.push(row.expectedGrad ? `${who} · graduating ${row.expectedGrad}` : who);
  if (row.minors.length) background.push(`Minor: ${row.minors.join(", ")}`);
  if (row.targetRoles.length) background.push(`Looking at: ${row.targetRoles.join(", ")}`);
  const pinned = row.paths.filter((p) => p.status === "pinned").map((p) => p.name);
  if (pinned.length) background.push(`Focused on: ${pinned.join(", ")}`);
  if (row.goals.length) background.push(`Goals: ${row.goals.slice(0, 2).join("; ")}`);
  if (row.clubs.length) background.push(`Clubs: ${row.clubs.join(", ")}`);
  if (row.skills.length) background.push(`Skills: ${row.skills.slice(0, 6).join(", ")}`);

  const sessionCount = row.sessions.filter((s) => s.status === "reviewed" || s.status === "closed").length;
  const progress =
    row.roadmapStatus === "published"
      ? `${row.done} of ${row.total} steps done, ${row.openSteps.length} open. ${sessionCount === 1 ? "1 session" : `${sessionCount} sessions`} so far.`
      : `${STATUS_NOTE[row.roadmapStatus] ?? "No roadmap yet."} ${sessionCount === 1 ? "1 session" : `${sessionCount} sessions`} so far.`;

  const last = row.lastSession;
  const lastTime = last ? `${ctx.shortDate(last.created_at)}, ${last.session_type ?? "session"} with ${last.staff?.full_name ?? "staff"}${row.lastSummary ? `: ${row.lastSummary}` : "."}` : null;

  return {
    purpose: purposeOf(appt.type),
    signals,
    background,
    progress,
    lastTime,
    openAdvice: row.openAdvice.slice(0, 3),
    concerns: row.concerns.slice(0, 2),
    // A session still waiting for review has happened, even though it isn't counted as finished yet.
    isFirstMeeting: row.sessions.length === 0,
  };
}
