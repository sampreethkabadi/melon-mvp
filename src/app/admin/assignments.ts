"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const Id = z.string().uuid();

/** Moves a student to a different advisor. The new advisor gets the briefing and a notification. */
export async function reassignAdvisor(studentId: string, form: FormData) {
  const profile = await requireRole(["admin"]);
  const student = Id.parse(studentId);
  const advisor = Id.parse(form.get("advisor"));
  const db = createAdminClient();
  const { data: people } = await db.from("profiles").select("id, role, school_id, full_name").in("id", [student, advisor]);
  const studentRow = people?.find((p) => p.id === student);
  const advisorRow = people?.find((p) => p.id === advisor);
  if (studentRow?.role !== "student" || advisorRow?.role !== "advisor" || studentRow.school_id !== profile.school_id || advisorRow.school_id !== profile.school_id) {
    throw new Error("That student or advisor isn't at your school.");
  }
  const { error: endError } = await db.from("staff_assignments").update({ active: false }).eq("student_id", student).eq("kind", "advisor").neq("staff_id", advisor);
  if (endError) throw new Error("Couldn't change the advisor. Try again.");
  const { error } = await db
    .from("staff_assignments")
    .upsert({ school_id: profile.school_id, student_id: student, staff_id: advisor, kind: "advisor", active: true }, { onConflict: "student_id,staff_id" });
  if (error) throw new Error("Couldn't change the advisor. Try again.");
  await db.from("notifications").insert({
    school_id: profile.school_id,
    user_id: advisor,
    type: "student_assigned",
    title: `${studentRow.full_name} is now assigned to you. Their briefing is ready.`,
    link: `/staff/students/${student}`,
  });
  await db.from("audit_log").insert({ school_id: profile.school_id, actor_id: profile.id, action: "advisor.reassigned", entity: "student", entity_id: student, meta: { advisor } });
  revalidatePath("/admin/students");
}
