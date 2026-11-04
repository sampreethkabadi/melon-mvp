import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile, Role } from "@/lib/types";

export function homeFor(role: Role | undefined | null): string {
  if (role === "student") return "/student";
  if (role === "advisor" || role === "coach") return "/staff";
  if (role === "admin") return "/admin";
  return "/login";
}

/** The signed-in person and their profile, or null when signed out. */
export async function getCurrentProfile(): Promise<Profile | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("profiles")
    .select("id, role, full_name, email, title, school_id, schools(id, name, short_mark, color)")
    .eq("id", user.id)
    .single();
  return (data as unknown as Profile) ?? null;
}

/** Send people who aren't allowed on a page back to their own home. */
export async function requireRole(roles: Role[]): Promise<Profile> {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (!roles.includes(profile.role)) redirect(homeFor(profile.role));
  return profile;
}

export function firstName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts[0]?.toLowerCase().startsWith("dr")) return parts.slice(0, 2).join(" ");
  return parts[0] || "there";
}
