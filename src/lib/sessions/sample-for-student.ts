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
  return {
    first: firstName(data?.full_name ?? ""),
    major: sp?.majors?.[0] ?? "your degree",
    focus: interest ? INTEREST_COLORS[interest].label.toLowerCase().replace(/\bai\b/, "AI").replace(/\bux\b/, "UX") : "a field you enjoy",
  };
}
