"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { QUESTIONS, readAnswers } from "@/lib/onboarding/questions";
import { extractResumeText } from "@/lib/resume/extract";
import { parseResumeText, type ParsedResume } from "@/lib/resume/parse";
import { buildFirstRoadmap } from "@/lib/roadmap/template";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { ClassYear, Profile } from "@/lib/types";

export type FormState = { error?: string };

type Step = "resume" | "profile" | "questions" | "building";

/** Student and client for an onboarding action. Students who've finished go home instead. */
async function start() {
  const profile = await requireRole(["student"]);
  const supabase = await createClient();
  const { data: sp } = await supabase
    .from("student_profiles")
    .select("onboarding_step, class_year")
    .eq("user_id", profile.id)
    .single();
  if (!sp || sp.onboarding_step === "done") redirect("/student");
  return { profile, supabase, classYear: sp.class_year as ClassYear | null };
}

type Db = Awaited<ReturnType<typeof createClient>>;

async function setStep(supabase: Db, profile: Profile, step: Step) {
  const { error } = await supabase
    .from("student_profiles")
    .update({ onboarding_step: step, updated_at: new Date().toISOString() })
    .eq("user_id", profile.id);
  if (error) throw new Error("Couldn't save your progress. Try again.");
}

async function logEvent(supabase: Db, profile: Profile, type: string, payload: Record<string, unknown>) {
  // The profile timeline shouldn't block the student, but a gap in it should be visible to us.
  const { error } = await supabase
    .from("profile_events")
    .insert({ school_id: profile.school_id, student_id: profile.id, type, payload, source: "student", created_by: profile.id });
  if (error) console.error(`profile event ${type} failed:`, error.message);
}

export async function goToStep(step: Step) {
  const { profile, supabase } = await start();
  await setStep(supabase, profile, z.enum(["resume", "profile", "questions"]).parse(step));
  redirect("/student/onboarding");
}

/** Reads the resume the browser just uploaded to <student id>/resume, then moves on to the profile step. */
export async function processResume(): Promise<void> {
  const { profile, supabase } = await start();
  const path = `${profile.id}/resume`;
  let parsed: (ParsedResume & { read_ok: true }) | { read_ok: false } = { read_ok: false };
  const { data: file, error: fileError } = await supabase.storage.from("resumes").download(path);
  if (fileError || !file) throw new Error("We couldn't find your upload. Try again.");
  try {
    const text = await extractResumeText(await file.arrayBuffer());
    if (text.trim().length >= 50) parsed = { ...parseResumeText(text), read_ok: true };
  } catch (err) {
    // A damaged or locked file is expected sometimes. The student fills in the form by hand instead.
    console.error("resume read failed:", err instanceof Error ? err.message : "unknown");
  }
  const { error } = await supabase
    .from("student_profiles")
    .update({ resume_path: path, resume_parsed: parsed, onboarding_step: "profile", updated_at: new Date().toISOString() })
    .eq("user_id", profile.id);
  if (error) throw new Error("Couldn't save your resume. Try again.");
  await logEvent(supabase, profile, "resume_uploaded", { read_ok: parsed.read_ok });
  redirect("/student/onboarding");
}

const list = (max: number) =>
  z
    .string()
    .max(1000)
    .transform((s) => [...new Set(s.split(",").map((x) => x.trim()).filter(Boolean))].slice(0, max));

const optionalUrl = z
  .string()
  .trim()
  .max(300)
  .transform((s) => (s && !/^https?:\/\//i.test(s) ? `https://${s}` : s))
  .refine((s) => !s || z.string().url().safeParse(s).success, "Check that your links are complete web addresses.");

const ProfileForm = z.object({
  full_name: z.string().trim().min(2, "Add your name.").max(100),
  class_year: z.enum(["freshman", "sophomore", "junior", "senior", "grad"], { message: "Choose your year." }),
  program: z.string().trim().max(120),
  majors: list(4),
  minors: list(4),
  expected_grad_term: z.string().trim().max(40),
  clubs: list(12),
  skills: list(30),
  interests: z.array(z.enum(["data", "cyber", "soft", "ux", "biz", "health", "arts", "unsure"])).min(1, "Choose at least one interest, or \"Not sure yet\"."),
  linkedin: optionalUrl,
  github: optionalUrl,
  portfolio: optionalUrl,
});

export async function saveProfile(_: FormState, form: FormData): Promise<FormState> {
  const { profile, supabase } = await start();
  const field = (k: string) => String(form.get(k) ?? "");
  const parsed = ProfileForm.safeParse({
    full_name: field("full_name"),
    class_year: field("class_year"),
    program: field("program"),
    majors: field("majors"),
    minors: field("minors"),
    expected_grad_term: field("expected_grad_term"),
    clubs: field("clubs"),
    skills: field("skills"),
    interests: form.getAll("interests").map(String),
    linkedin: field("linkedin"),
    github: field("github"),
    portfolio: field("portfolio"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const p = parsed.data;

  const { data: current } = await supabase.from("student_profiles").select("answers").eq("user_id", profile.id).single();
  const links = Object.fromEntries(Object.entries({ linkedin: p.linkedin, github: p.github, portfolio: p.portfolio }).filter(([, v]) => v));
  const { error } = await supabase
    .from("student_profiles")
    .update({
      class_year: p.class_year,
      program: p.program || null,
      majors: p.majors,
      minors: p.minors,
      expected_grad_term: p.expected_grad_term || null,
      clubs: p.clubs,
      interests: p.interests,
      links,
      answers: { ...(current?.answers ?? {}), skills: p.skills },
      onboarding_step: "questions",
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", profile.id);
  if (error) return { error: "Couldn't save your profile. Try again." };

  // Sign-ups start with the first part of their email as a name, and only the server can change a name.
  if (p.full_name !== profile.full_name) {
    const { error: nameError } = await createAdminClient().from("profiles").update({ full_name: p.full_name }).eq("id", profile.id);
    if (nameError) return { error: "Couldn't save your name. Try again." };
  }
  await logEvent(supabase, profile, "profile_confirmed", {
    class_year: p.class_year,
    majors: p.majors,
    minors: p.minors,
    interests: p.interests,
    expected_grad_term: p.expected_grad_term,
  });
  redirect("/student/onboarding");
}

export async function saveAnswers(_: FormState, form: FormData): Promise<FormState> {
  const { profile, supabase, classYear } = await start();
  if (!classYear) redirect("/student/onboarding");
  const { answers, missing } = readAnswers(classYear, (id) => form.getAll(id).map(String));
  if (missing.length) {
    const first = QUESTIONS[classYear].find((q) => q.id === missing[0]);
    return { error: `Please answer: ${first?.label}` };
  }
  const split = (v: unknown) => (typeof v === "string" ? v.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 8) : []);
  const { data: current } = await supabase.from("student_profiles").select("answers").eq("user_id", profile.id).single();
  const { error } = await supabase
    .from("student_profiles")
    .update({
      answers: { skills: current?.answers?.skills ?? [], ...answers },
      target_roles: split(answers.target_roles),
      locations: split(answers.locations),
      onboarding_step: "building",
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", profile.id);
  if (error) return { error: "Couldn't save your answers. Try again." };
  await logEvent(supabase, profile, "questions_answered", { class_year: classYear, answers });
  await draftRoadmap(supabase, profile);
  redirect("/student");
}

/** Used when the draft failed the first time: the student's answers are already saved. */
export async function retryDraft(): Promise<void> {
  const { profile, supabase } = await start();
  await draftRoadmap(supabase, profile);
  redirect("/student");
}

async function draftRoadmap(supabase: Db, profile: Profile) {
  const [{ data: sp, error: spError }, { data: resources, error: resourceError }] = await Promise.all([
    supabase.from("student_profiles").select("class_year, majors, interests, target_roles, answers").eq("user_id", profile.id).single(),
    supabase.from("resources").select("id, type, title, interests").eq("school_id", profile.school_id).order("title"),
  ]);
  if (spError || resourceError || !sp?.class_year) throw new Error("Couldn't load your answers to build your roadmap.");
  const { paths, items } = buildFirstRoadmap({ ...sp, resources: resources ?? [] });
  // Students can't write roadmaps directly, and the draft function refuses to touch a published one.
  const { error } = await createAdminClient().rpc("replace_draft_roadmap", {
    p_student: profile.id,
    p_paths: paths,
    p_items: items,
  });
  if (error) {
    console.error("roadmap draft failed:", error.message);
    throw new Error("Couldn't build your roadmap draft. Try again.");
  }
}
