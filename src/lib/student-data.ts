import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { jobKeyFor, levelFor, type Level } from "@/lib/catalog";
import { appNow } from "@/lib/clock";
import { daysUntil, isFairStep, nextFair } from "@/lib/roadmap/fair";
import { currentSemester } from "@/lib/roadmap/semester";
import type { ClassYear } from "@/lib/types";

// What the student pages share: their roadmap, paths and steps, and the short "start here" ladder for
// each pinned path. Resources only ever follow a pinned path; things for everyone (the fair, a resume
// review) show in Action items and the events list, never in "Building your path".

export type Path = {
  id: string;
  name: string;
  reason: string | null;
  first_job: string | null;
  status: "pinned" | "exploring" | "backup" | "dropped";
  interest: string | null;
  created_from_session: string | null;
  created_at: string;
};
export { byPlan, focusSteps } from "@/lib/roadmap/focus";
import type { Step } from "@/lib/roadmap/focus";
export type { Step };

export type Resource = {
  id: string;
  type: string;
  title: string;
  provider: string | null;
  url: string | null;
  interests: string[];
  source: string;
  level: Level | null;
  step: number | null;
  blurb: string | null;
  starts_at: string | null;
};
export type Alum = { id: string; name: string; degree: string; grad_year: number; title: string; employer: string; story: string; interests: string[] };

export const RESOURCE_COLUMNS = "id, type, title, provider, url, interests, source, level, step, blurb, starts_at";

export async function loadRoadmap(supabase: SupabaseClient, studentId: string) {
  const [{ data: roadmap }, { data: sp }, { data: pathRows }, { data: itemRows }] = await Promise.all([
    supabase.from("roadmaps").select("id, status, published_at").eq("student_id", studentId).maybeSingle(),
    supabase.from("student_profiles").select("interests, class_year, majors, expected_grad_term").eq("user_id", studentId).maybeSingle(),
    supabase
      .from("roadmap_paths")
      .select("id, name, reason, first_job, status, interest, created_from_session, created_at")
      .eq("student_id", studentId)
      .order("sort"),
    supabase
      .from("roadmap_items")
      .select("id, title, description, rationale, term, kind, status, source, path_id, due_date, firm, sort, resource_id, evidence, completed_at, created_at, outcomes, milestone, parent_id")
      .eq("student_id", studentId)
      .order("sort"),
  ]);
  const paths = (pathRows ?? []) as Path[];
  return {
    roadmap: roadmap as { id: string; status: string; published_at: string | null } | null,
    year: (sp?.class_year ?? null) as ClassYear | null,
    majors: (sp?.majors ?? []) as string[],
    gradTerm: (sp?.expected_grad_term ?? null) as string | null,
    interests: (sp?.interests ?? []) as string[],
    paths,
    pinned: paths.filter((p) => p.status === "pinned"),
    steps: (itemRows ?? []) as Step[],
  };
}

export const pinLimit = (year: ClassYear | null) => (year === "freshman" || year === "sophomore" ? 2 : 1);

/** "Start here, then this, then this" for each pinned path, at the student's year level. */
/**
 * "Start here, then this, then this" for each pinned path. Juniors and up get the list for the exact job
 * they pinned (Data analyst and ML engineer differ). Freshmen and sophomores, whose paths are broad areas,
 * get the gentler list for that area at their year's level. `more` is the rest, for the Resources tab.
 */
export async function pathLadders(supabase: SupabaseClient, pinned: Path[], year: ClassYear | null) {
  const early = year === "freshman" || year === "sophomore";
  const out: Array<{ path: Path; job: string | null; rungs: Resource[]; more: Resource[] }> = [];
  for (const p of pinned) {
    const job = early ? null : jobKeyFor(p.name, p.first_job);
    let rows: Resource[] = [];
    if (job) {
      const { data } = await supabase.from("resources").select(RESOURCE_COLUMNS).contains("tags", [`job:${job}`]).order("step");
      rows = (data ?? []) as Resource[];
    }
    if (!rows.length && p.interest) {
      const { data } = await supabase.from("resources").select(RESOURCE_COLUMNS).eq("level", levelFor(year)).contains("interests", [p.interest]).order("step");
      rows = (data ?? []) as Resource[];
    }
    if (rows.length) out.push({ path: p, job, rungs: rows.slice(0, 3), more: rows.slice(3) });
  }
  return out;
}

/** Alumni whose path is close to a pinned one. Often there's none, and then the section stays hidden. */
export async function alumniFor(supabase: SupabaseClient, pinned: Path[]): Promise<Alum[]> {
  const interests = pinned.map((p) => p.interest).filter((i): i is string => Boolean(i));
  if (!interests.length) return [];
  const { data } = await supabase.from("alumni").select("id, name, degree, grad_year, title, employer, story, interests").overlaps("interests", interests).limit(2);
  return (data ?? []) as Alum[];
}

/** Career center events still ahead: everything for everyone, plus ones for the student's pinned paths. */
export async function upcomingEvents(supabase: SupabaseClient, pinned: Path[], limit = 5) {
  const interests = pinned.map((p) => p.interest).filter((i): i is string => Boolean(i));
  const { data } = await supabase
    .from("resources")
    .select(RESOURCE_COLUMNS)
    .eq("type", "event")
    .gte("starts_at", appNow().toISOString().slice(0, 10))
    .order("starts_at")
    .limit(30);
  return ((data ?? []) as Resource[]).filter((r) => r.interests.length === 0 || r.interests.some((i) => interests.includes(i))).slice(0, limit);
}

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
export const RESOURCE_LABEL: Record<string, string> = {
  skill: "Skill",
  certification: "Certification",
  event: "Event",
  course: "Course",
  coaching: "Career center",
  club: "Club · beInvolved",
};

/**
 * The next career fair and which of the student's steps get them ready for it. Fair steps come from
 * their wording, the fair prep appointment they came from, or their date (see isFairStep).
 */
export async function loadFairPlan(supabase: SupabaseClient, studentId: string, steps: Step[]) {
  const today = appNow().toISOString().slice(0, 10);
  const [{ data: events }, { data: prep }] = await Promise.all([
    supabase.from("resources").select("title, starts_at").eq("type", "event").ilike("title", "%career fair%").gte("starts_at", today).order("starts_at").limit(10),
    supabase.from("sessions").select("id").eq("student_id", studentId).ilike("session_type", "%fair%"),
  ]);
  const fair = nextFair((events ?? []) as Array<{ title: string; starts_at: string | null }>, today);
  if (!fair || daysUntil(today, fair.date) > 35) return null;
  const prepIds = new Set((prep ?? []).map((s) => s.id as string));
  const sem = currentSemester();
  const inPlay = (s: Step) => s.kind !== "course" && (s.status === "active" || (s.status === "done" && s.completed_at !== null && new Date(s.completed_at) >= sem.start));
  const ids = new Set(steps.filter((s) => inPlay(s) && isFairStep(s, fair, prepIds)).map((s) => s.id));
  return { fair, today, days: daysUntil(today, fair.date), ids, total: ids.size, done: steps.filter((s) => ids.has(s.id) && s.status === "done").length };
}
