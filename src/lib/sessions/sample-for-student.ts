import "server-only";
import { INTEREST_COLORS } from "@/components/Backdrop";
import { firstName } from "@/lib/auth";
import { careerCalendar } from "@/lib/calendar";
import { appNow } from "@/lib/clock";
import { YEAR_LABEL, type ClassYear } from "@/lib/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { lowerName } from "@/lib/roadmap/template";
import type { SampleContext } from "./demo";

/** The details that fit a sample conversation to a student and the type of session they booked. */
export async function sampleForStudent(studentId: string, type: string): Promise<SampleContext> {
  const db = createAdminClient();
  const [{ data }, { data: paths }] = await Promise.all([
    db.from("profiles").select("full_name, student_profiles(majors, interests, class_year)").eq("id", studentId).single(),
    db.from("roadmap_paths").select("name, first_job, interest, status").eq("student_id", studentId).neq("status", "dropped").order("sort"),
  ]);
  const sp = (data?.student_profiles ?? null) as unknown as { majors: string[]; interests: string[]; class_year: ClassYear | null } | null;
  const rows = (paths ?? []) as Array<{ name: string; first_job: string | null; interest: string | null; status: string }>;
  const pinned = rows.find((p) => p.status === "pinned") ?? rows[0];
  const have = new Set([...(sp?.interests ?? []), ...rows.map((p) => p.interest)]);
  // A second area the student mentions in some samples, so the demo can show the roadmap growing a branch.
  const explore = ["cyber", "data", "ux", "biz"].find((i) => !have.has(i)) ?? "biz";
  const cal = careerCalendar(appNow().getFullYear());
  return {
    first: firstName(data?.full_name ?? ""),
    major: sp?.majors?.[0] ?? "your degree",
    year: sp?.class_year ? YEAR_LABEL[sp.class_year].toLowerCase() : "student",
    focus: lowerName(pinned?.name ?? label(sp?.interests?.[0] ?? "unsure")),
    job: lowerName(pinned?.first_job ?? "entry-level analyst"),
    explore: label(explore),
    type,
    dates: cal,
  };
}

function label(id: string) {
  return (INTEREST_COLORS[id]?.label ?? id).toLowerCase().replace(/\bai\b/, "AI").replace(/\bux\b/, "UX");
}
