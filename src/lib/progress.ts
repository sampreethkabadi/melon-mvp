import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { appNow } from "@/lib/clock";
import { currentSemester, type Semester } from "@/lib/roadmap/semester";

// Everything the Home dashboard and Rewards tab count. Numbers only come from things Melon tracked:
// reviewed sessions, logged activities and roadmap steps the student marked done. Each done step counts
// for a typical amount of time for its kind, and the screens say "about" for that reason.

const WEEK = 7 * 24 * 3600 * 1000;

/** Typical minutes a finished step takes, by kind. Courses run all semester, so they don't add hours. */
export const STEP_MINUTES: Record<string, number> = {
  event: 90,
  coaching: 45,
  networking: 30,
  skill: 60,
  certification: 120,
  application: 60,
  project: 180,
  experience: 120,
  course: 0,
};

export type Progress = {
  sem: Semester;
  showedUp: number;
  showedUpLastTerm: number;
  hours: number;
  sessions: number;
  eventsThisTerm: number;
  streakWeeks: number;
  /** The last 9 weeks, oldest first: true if anything happened that week. */
  weeks: boolean[];
  skills: string[];
  people: number;
  moment: { title: string; when: string } | null;
  doneThisTerm: number;
};

type Activity = { kind: string; title: string; minutes: number; occurred_at: string };
type DoneItem = { title: string; kind: string; completed_at: string | null };

export async function getProgress(supabase: SupabaseClient, studentId: string, now = appNow()): Promise<Progress> {
  const sem = currentSemester(now);
  const lastStart = new Date(sem.start);
  lastStart.setMonth(lastStart.getMonth() - (sem.term.startsWith("Fall") ? 7 : 5));

  const [{ data: acts }, { data: done }, { count: sessions }, { data: skillRows }, { data: team }, { data: staffSessions }] = await Promise.all([
    supabase.from("activities").select("kind, title, minutes, occurred_at").eq("student_id", studentId).gte("occurred_at", lastStart.toISOString()),
    supabase.from("roadmap_items").select("title, kind, completed_at").eq("student_id", studentId).eq("status", "done"),
    supabase.from("sessions").select("id", { count: "exact", head: true }).eq("student_id", studentId).eq("status", "reviewed"),
    supabase
      .from("insights")
      .select("payload, created_at")
      .eq("student_id", studentId)
      .eq("kind", "skill")
      .in("status", ["accepted", "edited"])
      .order("created_at", { ascending: false })
      .limit(6),
    supabase.from("staff_assignments").select("staff_id").eq("student_id", studentId).eq("active", true),
    supabase.from("sessions").select("staff_id").eq("student_id", studentId).eq("status", "reviewed"),
  ]);

  const activities = (acts ?? []) as Activity[];
  const doneItems = ((done ?? []) as DoneItem[]).filter((d) => d.completed_at);
  const inTerm = (iso: string) => new Date(iso) >= sem.start;
  const inLastTerm = (iso: string) => new Date(iso) >= lastStart && new Date(iso) < sem.start;
  const counted = (a: Activity) => ["session", "event", "workshop", "lesson"].includes(a.kind);

  const termActs = activities.filter((a) => inTerm(a.occurred_at));
  const termDone = doneItems.filter((d) => inTerm(d.completed_at!));
  const showedUp = termActs.filter(counted).length + termDone.length;
  const showedUpLastTerm =
    activities.filter((a) => inLastTerm(a.occurred_at) && counted(a)).length + doneItems.filter((d) => inLastTerm(d.completed_at!)).length;
  const minutes = termActs.reduce((m, a) => m + a.minutes, 0) + termDone.reduce((m, d) => m + (STEP_MINUTES[d.kind] ?? 30), 0);

  // Weeks with anything in them, counted back from this week.
  const thisWeek = startOfWeek(now).getTime();
  const weekIndex = (iso: string) => Math.floor((thisWeek - startOfWeek(new Date(iso)).getTime()) / WEEK);
  const busy = new Set([...activities.map((a) => weekIndex(a.occurred_at)), ...doneItems.map((d) => weekIndex(d.completed_at!))]);
  let streak = 0;
  for (let w = busy.has(0) ? 0 : 1; busy.has(w); w++) streak++;
  const weeks = Array.from({ length: 9 }, (_, i) => busy.has(8 - i));

  const skills = [
    ...((skillRows ?? []) as Array<{ payload: { text?: string } }>).map((s) => s.payload.text ?? ""),
    ...termDone.filter((d) => d.kind === "skill" || d.kind === "certification").map((d) => d.title),
  ]
    .map((s) => s.replace(/\s*\(.*\)$/, "").replace(/^(try|finish|do|learn|start|complete|take)\s+(the\s+)?(free\s+)?/i, "").trim())
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .filter(Boolean)
    .filter((s, i, all) => all.indexOf(s) === i)
    .slice(0, 3);

  const people = new Set([
    ...((team ?? []) as Array<{ staff_id: string }>).map((t) => t.staff_id),
    ...((staffSessions ?? []) as Array<{ staff_id: string }>).map((s) => s.staff_id),
  ]).size;

  // The biggest moment: an event you went to beats a step you ticked off.
  const latest = <T,>(xs: T[], at: (x: T) => string) => [...xs].sort((a, b) => at(b).localeCompare(at(a)))[0];
  const doneEvent = latest(termDone.filter((d) => d.kind === "event"), (d) => d.completed_at!);
  const loggedEvent = latest(termActs.filter((a) => a.kind === "event"), (a) => a.occurred_at);
  const big = doneEvent
    ? { title: doneEvent.title, when: doneEvent.completed_at! }
    : loggedEvent
      ? { title: `You went to ${loggedEvent.title}`, when: loggedEvent.occurred_at }
      : termDone.length
        ? { title: latest(termDone, (d) => d.completed_at!).title, when: latest(termDone, (d) => d.completed_at!).completed_at! }
        : null;

  return {
    sem,
    showedUp,
    showedUpLastTerm,
    hours: Math.round(minutes / 60),
    sessions: sessions ?? 0,
    eventsThisTerm: termActs.filter((a) => a.kind === "event").length + termDone.filter((d) => d.kind === "event").length,
    streakWeeks: streak,
    weeks,
    skills,
    people,
    moment: big,
    doneThisTerm: termDone.length,
  };
}

function startOfWeek(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); // Monday
  return x;
}

// ---------------------------------------------------------------- rewards

export type RewardRule = { kind: "sessions" | "events" | "streak_weeks"; count: number };
export type RewardRow = { id: string; name: string; description: string; rule: RewardRule; sort: number };
export type RewardStatus = RewardRow & { have: number; need: number; unlocked: boolean };

export function rewardProgress(reward: RewardRow, p: Progress): RewardStatus {
  const have = reward.rule.kind === "sessions" ? p.sessions : reward.rule.kind === "events" ? p.eventsThisTerm : p.streakWeeks;
  const need = Math.max(reward.rule.count, 1);
  return { ...reward, have: Math.min(have, need), need, unlocked: have >= need };
}

/** All active rewards with the student's progress, plus the one they're closest to unlocking. */
export async function rewardsFor(supabase: SupabaseClient, studentId: string, progress?: Progress) {
  const p = progress ?? (await getProgress(supabase, studentId));
  const { data } = await supabase.from("rewards").select("id, name, description, rule, sort").eq("active", true).order("sort");
  const all = ((data ?? []) as RewardRow[]).map((r) => rewardProgress(r, p));
  const next = all.filter((r) => !r.unlocked).sort((a, b) => b.have / b.need - a.have / a.need)[0] ?? null;
  return { progress: p, all, next };
}
