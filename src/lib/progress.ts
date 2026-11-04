import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
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

export async function getProgress(supabase: SupabaseClient, studentId: string, now = new Date()): Promise<Progress> {
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
    .map((s) => s.replace(/\s*\(.*\)$/, "").trim())
    .filter(Boolean)
    .filter((s, i, all) => all.indexOf(s) === i)
    .slice(0, 3);

  const people = new Set([
    ...((team ?? []) as Array<{ staff_id: string }>).map((t) => t.staff_id),
    ...((staffSessions ?? []) as Array<{ staff_id: string }>).map((s) => s.staff_id),
  ]).size;

  const big = termDone.filter((d) => d.kind === "event").sort((a, b) => b.completed_at!.localeCompare(a.completed_at!))[0] ??
    termDone.sort((a, b) => b.completed_at!.localeCompare(a.completed_at!))[0];

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
    moment: big ? { title: big.title, when: big.completed_at! } : null,
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
