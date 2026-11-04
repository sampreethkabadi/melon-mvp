import "server-only";
import { INTEREST_COLORS } from "@/components/Backdrop";
import { firstName } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/** The details that fit the sample conversation to a student. */
export async function sampleForStudent(studentId: string) {
  const { data } = await createAdminClient()
    .from("profiles")
    .select("full_name, student_profiles(majors, interests)")
    .eq("id", studentId)
    .single();
  const sp = (data?.student_profiles ?? null) as unknown as { majors: string[]; interests: string[] } | null;
  const interest = sp?.interests?.find((i) => i !== "unsure" && INTEREST_COLORS[i]);
  // A second area the student mentions in the sample, so the demo shows the roadmap growing a new branch.
  const explore = ["cyber", "data", "ux"].find((i) => !sp?.interests?.includes(i)) ?? "biz";
  return {
    first: firstName(data?.full_name ?? ""),
    major: sp?.majors?.[0] ?? "your degree",
    focus: interest ? label(interest) : "a field you enjoy",
    explore: label(explore),
  };
}

function label(id: string) {
  return INTEREST_COLORS[id].label.toLowerCase().replace(/\bai\b/, "AI").replace(/\bux\b/, "UX");
}
