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
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const refresh = (_studentId: string) => revalidatePath("/staff", "layout");

const text = (form: FormData, key: string, max: number) => String(form.get(key) ?? "").trim().slice(0, max);

/** On an accepted roadmap, staff suggest a change and the student decides. */
export async function suggestAdd(studentId: string, form: FormData) {
  const { supabase } = await staff(studentId);
  const title = text(form, "title", 200);
  if (!title) throw new Error("A step needs a title.");
  const { error } = await supabase.rpc("suggest_roadmap_change", {
    p_student: studentId,
    p_action: "add",
    p_item: null,
    p_title: title,
    p_description: text(form, "description", 1000),
    p_kind: z.enum(ROADMAP_KINDS).parse(form.get("kind")),
    p_reason: text(form, "reason", 500),
  });
  if (error) throw new Error(error.message);
  refresh(studentId);
}

export async function suggestEdit(studentId: string, itemId: string, form: FormData) {
  const { supabase } = await staff(studentId);
  const title = text(form, "title", 200);
  if (!title) throw new Error("A step needs a title.");
  const { error } = await supabase.rpc("suggest_roadmap_change", {
    p_student: studentId,
    p_action: "edit",
    p_item: Id.parse(itemId),
    p_title: title,
    p_description: text(form, "description", 1000),
    p_kind: null,
    p_reason: text(form, "reason", 500),
  });
  if (error) throw new Error(error.message);
  refresh(studentId);
}

export async function suggestRemove(studentId: string, itemId: string, form: FormData) {
  const { supabase } = await staff(studentId);
  const { error } = await supabase.rpc("suggest_roadmap_change", {
    p_student: studentId,
    p_action: "remove",
    p_item: Id.parse(itemId),
    p_title: null,
    p_description: null,
    p_kind: null,
    p_reason: text(form, "reason", 500),
  });
  if (error) throw new Error(error.message);
  refresh(studentId);
}

export async function withdrawSuggestion(studentId: string, suggestionId: string) {
  const { supabase } = await staff(studentId);
  const { error } = await supabase.rpc("withdraw_suggestion", { p_id: Id.parse(suggestionId) });
  if (error) throw new Error(error.message);
  refresh(studentId);
}

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
  // A draft goes through approval as a whole. Otherwise the advisor adding it is the approval.
  const { data: roadmap } = await supabase.from("roadmaps").select("status").eq("id", Id.parse(roadmapId)).single();
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
    approval: roadmap?.status === "draft" ? "pending" : "approved",
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

/** The advisor's half of the sign-off. The student then sees the roadmap and accepts it. */
export async function approveRoadmap(studentId: string) {
  const { supabase } = await staff(studentId);
  const { error } = await supabase.rpc("approve_roadmap", { p_student: studentId });
  if (error) throw new Error(error.message);
  refresh(studentId);
}
