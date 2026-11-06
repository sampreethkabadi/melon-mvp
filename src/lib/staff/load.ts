import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { appNow, localDate } from "@/lib/clock";
import { YEAR_LABEL, type ClassYear } from "@/lib/types";
import { summarizeStudent, type RawAdvice, type RawAppointment, type RawItem, type RawSession, type StudentRow } from "./overview";

type Assignment = {
  student: {
    id: string;
    full_name: string;
    student_profiles: {
      class_year: ClassYear | null;
      program: string | null;
      majors: string[];
      minors: string[];
      expected_grad_term: string | null;
      clubs: string[];
      target_roles: string[];
      answers: { skills?: string[] } | null;
      onboarding_step: string;
    } | null;
    roadmaps: { status: string } | null;
  } | null;
};

const group = <T extends { student_id: string }>(rows: T[] | null) => {
  const map = new Map<string, T[]>();
  for (const r of rows ?? []) map.set(r.student_id, [...(map.get(r.student_id) ?? []), r]);
  return map;
};

/**
 * Everything the overview and meeting prep need, for the students assigned to this person. Access rules apply,
 * so it can only ever return students they're allowed to see.
 */
export async function loadStudentRows(supabase: SupabaseClient, staffId: string, only?: string[]): Promise<StudentRow[]> {
  let query = supabase
    .from("staff_assignments")
    .select(
      "student:profiles!staff_assignments_student_id_fkey(id, full_name, student_profiles(class_year, program, majors, minors, expected_grad_term, clubs, target_roles, answers, onboarding_step), roadmaps!roadmaps_student_id_fkey(status))",
    )
    .eq("staff_id", staffId)
    .eq("active", true);
  if (only) query = query.in("student_id", only);
  const { data: assigned, error } = await query;
  if (error) throw new Error("Couldn't load your students. Try again.");
  const students = ((assigned ?? []) as unknown as Assignment[]).map((a) => a.student).filter((s): s is NonNullable<Assignment["student"]> => Boolean(s));
  const ids = students.map((s) => s.id);
  if (!ids.length) return [];

  const today = localDate(appNow());
  const [items, paths, sessions, appts, advice, summaries, events, flags, suggestions] = await Promise.all([
    supabase.from("roadmap_items").select("student_id, title, kind, term, status, approval, due_date, firm").in("student_id", ids).order("sort"),
    supabase.from("roadmap_paths").select("student_id, name, status").in("student_id", ids).neq("status", "dropped").order("sort"),
    supabase.from("sessions").select("id, student_id, staff_id, status, created_at, session_type, staff:profiles!sessions_staff_id_fkey(full_name)").in("student_id", ids),
    supabase.from("appointments").select("id, student_id, staff_id, starts_at, type, modality, location").in("student_id", ids).eq("status", "scheduled").gte("starts_at", `${today}T00:00:00Z`).order("starts_at"),
    supabase.from("advice_items").select("student_id, text, status").in("student_id", ids),
    supabase.from("insights").select("student_id, payload, created_at").in("student_id", ids).eq("kind", "summary").in("status", ["accepted", "edited"]).order("created_at", { ascending: false }),
    supabase.from("profile_events").select("student_id, type, payload").in("student_id", ids).in("type", ["session_goal", "session_concern"]).order("occurred_at", { ascending: false }),
    supabase.from("insight_flags").select("student_id").in("student_id", ids).eq("status", "open"),
    supabase.from("roadmap_suggestions").select("student_id").in("student_id", ids).eq("status", "pending"),
  ]);
  const failed = [items, paths, sessions, appts, advice, summaries, events, flags, suggestions].find((r) => r.error);
  if (failed) throw new Error("Couldn't load your students. Try again.");

  const itemsBy = group(items.data as RawItem[]);
  const pathsBy = group(paths.data as Array<{ student_id: string; name: string; status: string }>);
  const sessionsBy = group(sessions.data as unknown as RawSession[]);
  const apptsBy = group(appts.data as RawAppointment[]);
  const adviceBy = group(advice.data as RawAdvice[]);
  const summaryBy = group(summaries.data as Array<{ student_id: string; payload: { text?: string } }>);
  const eventsBy = group(events.data as Array<{ student_id: string; type: string; payload: { text?: string } }>);
  const flagsBy = group(flags.data as Array<{ student_id: string }>);
  const suggestionsBy = group(suggestions.data as Array<{ student_id: string }>);
  const texts = (id: string, type: string) => (eventsBy.get(id) ?? []).filter((e) => e.type === type).map((e) => e.payload.text ?? "").filter(Boolean);

  return students.map((s) => {
    const sp = s.student_profiles;
    return summarizeStudent(
      {
        id: s.id,
        name: s.full_name,
        yearLabel: sp?.class_year ? YEAR_LABEL[sp.class_year] : null,
        program: sp?.program ?? null,
        majors: sp?.majors ?? [],
        minors: sp?.minors ?? [],
        expectedGrad: sp?.expected_grad_term ?? null,
        clubs: sp?.clubs ?? [],
        skills: sp?.answers?.skills ?? [],
        targetRoles: sp?.target_roles ?? [],
        onboardingStep: sp?.onboarding_step ?? null,
        roadmapStatus: s.roadmaps?.status ?? "none",
        paths: pathsBy.get(s.id) ?? [],
        items: itemsBy.get(s.id) ?? [],
        sessions: sessionsBy.get(s.id) ?? [],
        appointments: apptsBy.get(s.id) ?? [],
        advice: adviceBy.get(s.id) ?? [],
        lastSummary: summaryBy.get(s.id)?.[0]?.payload.text ?? null,
        goals: texts(s.id, "session_goal"),
        concerns: texts(s.id, "session_concern"),
        openFlags: flagsBy.get(s.id)?.length ?? 0,
        pendingSuggestions: suggestionsBy.get(s.id)?.length ?? 0,
      },
      { today, staffId, localDate },
    );
  });
}
