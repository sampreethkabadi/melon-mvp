"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const Input = z.object({ id: z.string().uuid(), enabled: z.boolean() });

/** Turn a school system integration on or off. Access rules also check the person is an admin. */
export async function setIntegration(id: string, enabled: boolean) {
  const profile = await requireRole(["admin"]);
  const input = Input.parse({ id, enabled });
  const supabase = await createClient();
  const { error } = await supabase
    .from("integrations")
    .update({ enabled: input.enabled, updated_at: new Date().toISOString() })
    .eq("id", input.id)
    .eq("school_id", profile.school_id);
  if (error) throw new Error("Couldn't save that change. Try again.");
  revalidatePath("/admin");
}
