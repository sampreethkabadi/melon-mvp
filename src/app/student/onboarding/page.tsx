import { redirect } from "next/navigation";
import { Backdrop } from "@/components/Backdrop";
import { requireRole } from "@/lib/auth";
import { QUESTIONS, type Answers } from "@/lib/onboarding/questions";
import type { ParsedResume } from "@/lib/resume/parse";
import { createClient } from "@/lib/supabase/server";
import type { ClassYear } from "@/lib/types";
import { ConsentCard } from "../ConsentCard";
import { RetryDraft } from "./parts";
import { ProfileStep, type ProfileValues } from "./ProfileStep";
import { QuestionsStep } from "./QuestionsStep";
import { ResumeStep } from "./ResumeStep";

export const metadata = { title: "Get started · Melon" };

const STEPS = [
  { id: "resume", label: "Resume" },
  { id: "profile", label: "Profile" },
  { id: "questions", label: "Questions" },
];

type Stored = { read_ok?: boolean } & Partial<ParsedResume>;

export default async function Onboarding() {
  const profile = await requireRole(["student"]);
  const supabase = await createClient();
  const { data: sp } = await supabase
    .from("student_profiles")
    .select("onboarding_step, class_year, program, majors, minors, expected_grad_term, interests, clubs, links, answers, resume_parsed")
    .eq("user_id", profile.id)
    .single();
  if (!sp || sp.onboarding_step === "done") redirect("/student");

  const step = sp.onboarding_step as string;
  const parsed = (sp.resume_parsed ?? {}) as Stored;
  const links = (sp.links ?? {}) as Record<string, string>;
  const answers = (sp.answers ?? {}) as Answers;
  const current = step === "building" ? STEPS.length : STEPS.findIndex((s) => s.id === step);

  // What the student already saved wins over what the resume suggests.
  const values: ProfileValues = {
    full_name: parsed.full_name ?? profile.full_name,
    class_year: sp.class_year ?? "",
    program: sp.program ?? parsed.program ?? "",
    majors: (sp.majors?.length ? sp.majors : (parsed.majors ?? [])).join(", "),
    minors: (sp.minors?.length ? sp.minors : (parsed.minors ?? [])).join(", "),
    expected_grad_term: sp.expected_grad_term ?? parsed.expected_grad_term ?? "",
    clubs: (sp.clubs?.length ? sp.clubs : (parsed.clubs ?? [])).join(", "),
    skills: ((answers.skills as string[] | undefined)?.length ? (answers.skills as string[]) : (parsed.skills ?? [])).join(", "),
    interests: sp.interests?.length ? sp.interests : (parsed.interests ?? []),
    linkedin: links.linkedin ?? parsed.links?.linkedin ?? "",
    github: links.github ?? parsed.links?.github ?? "",
    portfolio: links.portfolio ?? parsed.links?.portfolio ?? "",
  };

  const resumeNote =
    parsed.read_ok === true
      ? "We filled this in from your resume. Please fix anything we got wrong."
      : parsed.read_ok === false
        ? "We saved your resume but couldn't read the text in it, so please fill this in yourself."
        : null;

  return (
    <main className="relative mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6">
      <Backdrop interests={values.interests} />
      <ConsentCard studentId={profile.id} />
      <ol aria-label="Your progress" className="flex flex-wrap gap-x-6 gap-y-1 text-sm font-semibold">
        {STEPS.map((s, i) => (
          <li key={s.id} aria-current={i === current ? "step" : undefined} className={i === current ? "text-ink" : "text-muted"}>
            {i + 1}. {s.label}
          </li>
        ))}
      </ol>
      {step === "resume" && <ResumeStep studentId={profile.id} />}
      {step === "profile" && <ProfileStep values={values} resumeNote={resumeNote} />}
      {step === "questions" && sp.class_year && <QuestionsStep questions={QUESTIONS[sp.class_year as ClassYear]} answers={answers} />}
      {step === "questions" && !sp.class_year && <ProfileStep values={values} resumeNote={null} />}
      {step === "building" && <RetryDraft />}
    </main>
  );
}
