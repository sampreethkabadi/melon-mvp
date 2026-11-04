"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { ROADMAP_KINDS } from "@/lib/sessions/types";
import { createClient } from "@/lib/supabase/server";

const Id = z.string().uuid();

async function staff(studentId: string) {
  const profile = await requireRole(["advisor", "coach"]);
  return { profile, supabase: await createClient(), studentId: Id.parse(studentId) };
}
const refresh = (studentId: string) => revalidatePath(`/staff/students/${studentId}`);

export async function editItem(studentId: string, itemId: string, form: FormData) {
  const { supabase } = await staff(studentId);
  const title = String(form.get("title") ?? "").trim().slice(0, 200);
  const description = String(form.get("description") ?? "").trim().slice(0, 1000);
  if (!title) throw new Error("An item needs a title.");
  const { error } = await supabase.from("roadmap_items").update({ title, description }).eq("id", Id.parse(itemId)).eq("student_id", studentId);
  if (error) throw new Error("Couldn't save that. Try again.");
  refresh(studentId);
}

export async function setItemApproval(studentId: string, itemId: string, approval: "pending" | "rejected") {
  const { supabase } = await staff(studentId);
  const { error } = await supabase.from("roadmap_items").update({ approval }).eq("id", Id.parse(itemId)).eq("student_id", studentId);
  if (error) throw new Error("Couldn't save that. Try again.");
  refresh(studentId);
}

export async function addItem(studentId: string, roadmapId: string, form: FormData) {
  const { profile, supabase } = await staff(studentId);
  const title = String(form.get("title") ?? "").trim().slice(0, 200);
  if (!title) throw new Error("An item needs a title.");
  const { error } = await supabase.from("roadmap_items").insert({
    school_id: profile.school_id,
    roadmap_id: Id.parse(roadmapId),
    student_id: studentId,
    term: String(form.get("term") ?? "").trim().slice(0, 40) || "From your sessions",
    kind: z.enum(ROADMAP_KINDS).parse(form.get("kind")),
    title,
    description: "Added by your advisor or coach.",
    rationale: "Your advisor or coach added this for you.",
    source: "staff",
    approval: "pending",
  });
  if (error) throw new Error("Couldn't add that item. Check that this student is assigned to you.");
  refresh(studentId);
}

/** Drops a path along with the items under it, which the student then never sees. */
export async function dropPath(studentId: string, pathId: string) {
  const { supabase } = await staff(studentId);
  const id = Id.parse(pathId);
  const { error } = await supabase.from("roadmap_paths").update({ status: "dropped" }).eq("id", id).eq("student_id", studentId);
  if (error) throw new Error("Couldn't remove that path. Try again.");
  await supabase.from("roadmap_items").update({ approval: "rejected" }).eq("path_id", id).eq("student_id", studentId);
  refresh(studentId);
}

export async function publishRoadmap(studentId: string) {
  const { supabase } = await staff(studentId);
  const { error } = await supabase.rpc("publish_roadmap", { p_student: studentId });
  if (error) throw new Error(error.message);
  refresh(studentId);
}
