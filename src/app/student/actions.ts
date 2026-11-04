"use server";

import { randomInt } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { getProgress, rewardProgress, type RewardRow } from "@/lib/progress";
import { createAdminClient } from "@/lib/supabase/admin";
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
  revalidatePath("/student", "layout");
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

const ITEM_KIND: Record<string, string> = {
  skill: "skill",
  certification: "certification",
  event: "event",
  course: "course",
  coaching: "coaching",
};

/** Puts a library resource straight onto the student's roadmap, under the path it fits best. */
export async function addResource(resourceId: string) {
  const profile = await requireRole(["student"]);
  const supabase = await createClient();
  const id = Id.parse(resourceId);
  const [{ data: resource }, { data: roadmap }, { data: paths }, { data: existing }] = await Promise.all([
    supabase.from("resources").select("id, type, title, provider, url, interests").eq("id", id).single(),
    supabase.from("roadmaps").select("id, status").eq("student_id", profile.id).maybeSingle(),
    supabase.from("roadmap_paths").select("id, interest, status").eq("student_id", profile.id).neq("status", "dropped"),
    supabase.from("roadmap_items").select("id").eq("student_id", profile.id).eq("resource_id", id).limit(1),
  ]);
  if (!resource) throw new Error("That resource isn't available.");
  if (roadmap?.status !== "published") throw new Error("Your roadmap isn't ready yet. Your advisor or coach checks it first.");
  if (existing?.length) return;

  const fits = (paths ?? []).filter((p) => p.interest && (resource.interests as string[]).includes(p.interest));
  const path = fits.find((p) => p.status === "pinned") ?? fits[0];
  const { data: term } = await supabase.rpc("current_term");
  const { error } = await supabase.from("roadmap_items").insert({
    school_id: profile.school_id,
    roadmap_id: roadmap.id,
    student_id: profile.id,
    path_id: path?.id ?? null,
    term: (term as string | null) ?? null,
    kind: ITEM_KIND[resource.type] ?? "skill",
    title: resource.title,
    description: [resource.provider, resource.url].filter(Boolean).join(" · ") || null,
    source: "student",
    approval: "not_needed",
    resource_id: resource.id,
    sort: 900,
  });
  if (error) throw new Error("Couldn't add that. Try again.");
  revalidatePath("/student", "layout");
}

/** Takes a step the student added themselves back off the roadmap. Staff steps can't be removed. */
export async function removeStep(itemId: string) {
  const profile = await requireRole(["student"]);
  const supabase = await createClient();
  const { error } = await supabase.from("roadmap_items").delete().eq("id", Id.parse(itemId)).eq("student_id", profile.id).eq("source", "student");
  if (error) throw new Error("Couldn't remove that. Try again.");
  revalidatePath("/student", "layout");
}

/** Gives a pickup code for a reward the student has earned. Checked here, then written with the admin client. */
export async function claimReward(rewardId: string) {
  const profile = await requireRole(["student"]);
  const supabase = await createClient();
  const id = Id.parse(rewardId);
  const { data: reward } = await supabase.from("rewards").select("id, name, description, rule, sort").eq("id", id).eq("active", true).single();
  if (!reward) throw new Error("That reward isn't available.");
  const status = rewardProgress(reward as RewardRow, await getProgress(supabase, profile.id));
  if (!status.unlocked) throw new Error("Not unlocked yet. Keep going!");

  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const code = `MELON-${Array.from({ length: 6 }, () => alphabet[randomInt(alphabet.length)]).join("")}`;
  const admin = createAdminClient();
  const { error } = await admin
    .from("reward_claims")
    .upsert({ school_id: profile.school_id, reward_id: id, student_id: profile.id, code, status: "claimed" }, { onConflict: "reward_id,student_id", ignoreDuplicates: true });
  if (error) throw new Error("Couldn't claim that. Try again.");
  revalidatePath("/student", "layout");
}

const Moment = z.object({
  path: z.string().regex(/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|jpeg|png|webp|heic)$/),
  caption: z.string().trim().max(140).optional(),
});

/** Saves a photo the browser already uploaded to the student's own folder. */
export async function saveMoment(path: string, caption?: string) {
  const profile = await requireRole(["student"]);
  const input = Moment.parse({ path, caption: caption || undefined });
  if (!input.path.startsWith(`${profile.id}/`)) throw new Error("That photo isn't yours.");
  const supabase = await createClient();
  const { error } = await supabase
    .from("student_moments")
    .insert({ school_id: profile.school_id, student_id: profile.id, storage_path: input.path, caption: input.caption ?? null });
  if (error) throw new Error("Couldn't save that photo. Try again.");
  revalidatePath("/student/rewards");
}

export async function deleteMoment(momentId: string) {
  const profile = await requireRole(["student"]);
  const supabase = await createClient();
  const { data: row } = await supabase.from("student_moments").select("storage_path").eq("id", Id.parse(momentId)).eq("student_id", profile.id).single();
  if (!row) return;
  await supabase.storage.from("moments").remove([row.storage_path]);
  await supabase.from("student_moments").delete().eq("id", momentId).eq("student_id", profile.id);
  revalidatePath("/student/rewards");
}

export async function markNotificationsRead() {
  const profile = await requireRole(["student"]);
  const supabase = await createClient();
  await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", profile.id).is("read_at", null);
  revalidatePath("/student", "layout");
}
