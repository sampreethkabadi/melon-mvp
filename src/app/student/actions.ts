"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const Id = z.string().uuid();
const SCOPES = ["record", "transcribe", "ai_analysis"] as const;

/** Adds the student's answer. Consent rows are never changed, so a withdrawal is a new "no" row. */
export async function answerConsent(sessionId: string, granted: boolean) {
  const profile = await requireRole(["student"]);
  const supabase = await createClient();
  const { error } = await supabase.from("consents").insert(
    SCOPES.map((scope) => ({
      school_id: profile.school_id,
      session_id: Id.parse(sessionId),
      student_id: profile.id,
      subject_id: profile.id,
      scope,
      granted,
    })),
  );
  if (error) throw new Error("Couldn't save your answer. Try again.");
  revalidatePath("/student", "layout");
}

/** Ticks an item on or off. Anything the item came from in the advice tracker moves with it. */
export async function setItemDone(itemId: string, done: boolean) {
  const profile = await requireRole(["student"]);
  const supabase = await createClient();
  const id = Id.parse(itemId);
  const { error } = await supabase
    .from("roadmap_items")
    .update({ status: done ? "done" : "active", completed_at: done ? new Date().toISOString() : null })
    .eq("id", id)
    .eq("student_id", profile.id);
  if (error) throw new Error("Couldn't save that. Try again.");
  const { error: adviceError } = await supabase.from("advice_items").update({ status: done ? "done" : "new" }).eq("roadmap_item_id", id).eq("student_id", profile.id);
  if (adviceError) console.error("advice sync failed:", adviceError.message);
  revalidatePath("/student/roadmap");
}

export async function markChangesSeen() {
  const profile = await requireRole(["student"]);
  const supabase = await createClient();
  await supabase.from("roadmap_changes").update({ seen_at: new Date().toISOString() }).eq("student_id", profile.id).is("seen_at", null);
  revalidatePath("/student/roadmap");
}

/** Pins one path. The path that was pinned before goes back to "exploring". */
export async function pinPath(pathId: string) {
  const profile = await requireRole(["student"]);
  const supabase = await createClient();
  const id = Id.parse(pathId);
  const { error: clearError } = await supabase
    .from("roadmap_paths")
    .update({ status: "exploring" })
    .eq("student_id", profile.id)
    .eq("status", "pinned")
    .neq("id", id);
  if (clearError) throw new Error("Couldn't pin that path. Try again.");
  const { error } = await supabase.from("roadmap_paths").update({ status: "pinned" }).eq("id", id).eq("student_id", profile.id);
  if (error) throw new Error("Couldn't pin that path. Try again.");
  revalidatePath("/student/roadmap");
}
