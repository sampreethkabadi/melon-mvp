import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { levelFor, type Level } from "@/lib/catalog";
import { appNow } from "@/lib/clock";
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
    supabase.from("student_profiles").select("interests, class_year, majors").eq("user_id", studentId).maybeSingle(),
    supabase
      .from("roadmap_paths")
      .select("id, name, reason, first_job, status, interest, created_from_session, created_at")
      .eq("student_id", studentId)
      .order("sort"),
    supabase
      .from("roadmap_items")
      .select("id, title, description, rationale, term, kind, status, source, path_id, due_date, firm, sort, resource_id, evidence, completed_at, created_at")
      .eq("student_id", studentId)
      .order("sort"),
  ]);
  const paths = (pathRows ?? []) as Path[];
  return {
    roadmap: roadmap as { id: string; status: string; published_at: string | null } | null,
    year: (sp?.class_year ?? null) as ClassYear | null,
    majors: (sp?.majors ?? []) as string[],
    interests: (sp?.interests ?? []) as string[],
    paths,
    pinned: paths.filter((p) => p.status === "pinned"),
    steps: (itemRows ?? []) as Step[],
  };
}

export const pinLimit = (year: ClassYear | null) => (year === "freshman" || year === "sophomore" ? 2 : 1);

/** "Start here, then this, then this" for each pinned path, at the student's year level. */
export async function pathLadders(supabase: SupabaseClient, pinned: Path[], year: ClassYear | null) {
  const interests = [...new Set(pinned.map((p) => p.interest).filter((i): i is string => Boolean(i)))];
  if (!interests.length) return [];
  const level = levelFor(year);
  const { data } = await supabase
    .from("resources")
    .select(RESOURCE_COLUMNS)
    .eq("level", level)
    .overlaps("interests", interests)
    .order("step");
  const rows = (data ?? []) as Resource[];
  return pinned
    .filter((p) => p.interest)
    .map((p) => ({ path: p, rungs: rows.filter((r) => r.interests.includes(p.interest!)).slice(0, 3) }))
    .filter((l) => l.rungs.length);
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
