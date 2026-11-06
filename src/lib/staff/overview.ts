import { daysBetween } from "../clock.ts";

// What an advisor or coach needs to scan their students at a glance, and what needs them first.

export type RawItem = { student_id: string; title: string; kind: string; term: string | null; status: string; approval: string; due_date: string | null; firm: boolean };
export type RawSession = { student_id: string; staff_id: string; status: string; created_at: string; session_type: string | null; id: string; staff: { full_name: string } | null };
export type RawAppointment = { id: string; student_id: string; staff_id: string; starts_at: string; type: string; modality: string; location: string | null };
export type RawAdvice = { student_id: string; text: string; status: string };

export type StudentRaw = {
  id: string;
  name: string;
  yearLabel: string | null;
  program: string | null;
  majors: string[];
  minors: string[];
  expectedGrad: string | null;
  clubs: string[];
  skills: string[];
  targetRoles: string[];
  onboardingStep: string | null;
  roadmapStatus: string;
  paths: Array<{ name: string; status: string }>;
  items: RawItem[];
  sessions: RawSession[];
  appointments: RawAppointment[];
  advice: RawAdvice[];
  lastSummary: string | null;
  goals: string[];
  concerns: string[];
  openFlags: number;
  pendingSuggestions: number;
};

export type Attention = { key: string; label: string; urgent: boolean };

export type StudentRow = StudentRaw & {
  done: number;
  total: number;
  percent: number;
  openSteps: RawItem[];
  nextStep: RawItem | null;
  overdue: number;
  lastSession: RawSession | null;
  daysSinceSession: number | null;
  nextAppointment: RawAppointment | null;
  meetingToday: RawAppointment | null;
  openAdvice: string[];
  toReview: RawSession[];
  attention: Attention[];
};

/** A student who hasn't met anyone in this long gets a nudge. */
export const QUIET_DAYS = 45;

const live = (i: RawItem) => (i.approval === "approved" || i.approval === "not_needed") && i.status !== "skipped";
const dated = (a: RawItem, b: RawItem) => Number(b.firm) - Number(a.firm) || (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999");
const dayOf = (iso: string, zone: (d: Date) => string) => zone(new Date(iso));

export function summarizeStudent(raw: StudentRaw, ctx: { today: string; staffId: string; localDate: (d: Date) => string }): StudentRow {
  const items = raw.items.filter(live);
  // Steps saved for later or paused aren't part of what the student is working through now.
  const counted = items.filter((i) => i.status !== "locked" && i.status !== "paused");
  const done = counted.filter((i) => i.status === "done").length;
  const openSteps = items.filter((i) => i.status === "active").sort(dated);
  const overdue = openSteps.filter((i) => i.due_date && i.due_date < ctx.today).length;

  const reviewed = raw.sessions.filter((s) => s.status === "reviewed" || s.status === "closed").sort((a, b) => b.created_at.localeCompare(a.created_at));
  const lastSession = reviewed[0] ?? null;
  const daysSinceSession = lastSession ? daysBetween(dayOf(lastSession.created_at, ctx.localDate), ctx.today) : null;
  const upcoming = raw.appointments
    .filter((a) => dayOf(a.starts_at, ctx.localDate) >= ctx.today)
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const mine = upcoming.filter((a) => a.staff_id === ctx.staffId);
  const meetingToday = mine.find((a) => dayOf(a.starts_at, ctx.localDate) === ctx.today) ?? null;
  const toReview = raw.sessions.filter((s) => s.status === "ready_for_review" && s.staff_id === ctx.staffId);
  const openAdvice = raw.advice.filter((a) => a.status === "new" || a.status === "in_progress").map((a) => a.text);

  const onboarded = raw.onboardingStep === "done" || raw.onboardingStep === null;
  const attention: Attention[] = [];
  if (toReview.length) attention.push({ key: "review", label: toReview.length === 1 ? "Session to review" : `${toReview.length} sessions to review`, urgent: true });
  if (raw.openFlags) attention.push({ key: "flag", label: raw.openFlags === 1 ? "Flagged a highlight" : `Flagged ${raw.openFlags} highlights`, urgent: true });
  if (raw.roadmapStatus === "draft") attention.push({ key: "draft", label: "Roadmap to approve", urgent: true });
  if (overdue) attention.push({ key: "overdue", label: overdue === 1 ? "1 step overdue" : `${overdue} steps overdue`, urgent: true });
  if (onboarded && !raw.sessions.length && !meetingToday) attention.push({ key: "new", label: "No session yet", urgent: false });
  if (daysSinceSession !== null && daysSinceSession >= QUIET_DAYS && !mine.length) attention.push({ key: "quiet", label: `No session in ${daysSinceSession} days`, urgent: false });
  if (!onboarded) attention.push({ key: "onboarding", label: "Hasn't finished onboarding", urgent: false });

  return {
    ...raw,
    done,
    total: counted.length,
    percent: counted.length ? Math.round((done / counted.length) * 100) : 0,
    openSteps,
    nextStep: openSteps[0] ?? null,
    overdue,
    lastSession,
    daysSinceSession,
    nextAppointment: upcoming[0] ?? null,
    meetingToday,
    openAdvice,
    toReview,
    attention,
  };
}

export type ShowFilter = "all" | "attention" | "today";
export type SortKey = "attention" | "name" | "progress";

/** Urgent first, then anything worth a look, then alphabetical. */
export function attentionRank(r: StudentRow) {
  return r.attention.some((a) => a.urgent) ? 0 : r.attention.length ? 1 : 2;
}

export function selectStudents(rows: StudentRow[], opts: { show?: string; sort?: string; q?: string }): StudentRow[] {
  const q = opts.q?.trim().toLowerCase();
  const filtered = rows.filter((r) => {
    if (opts.show === "attention" && !r.attention.length) return false;
    if (opts.show === "today" && !r.meetingToday) return false;
    if (q && ![r.name, r.program ?? "", ...r.majors].some((t) => t.toLowerCase().includes(q))) return false;
    return true;
  });
  const byName = (a: StudentRow, b: StudentRow) => a.name.localeCompare(b.name);
  const compare =
    opts.sort === "name"
      ? byName
      : opts.sort === "progress"
        ? (a: StudentRow, b: StudentRow) => a.percent - b.percent || byName(a, b)
        : (a: StudentRow, b: StudentRow) => attentionRank(a) - attentionRank(b) || byName(a, b);
  return [...filtered].sort(compare);
}
