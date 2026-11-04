import type { ClassYear } from "../types";

// Year questions follow the team's focus patterns: freshmen explore broadly, sophomores start narrowing,
// juniors scope down to a domain in their major, seniors focus on 3-4 roles.

export type Question = {
  id: string;
  label: string;
  help?: string;
  type: "single" | "multi" | "text";
  options?: Array<{ value: string; label: string }>;
  required?: boolean;
};

const opts = (pairs: Record<string, string>) => Object.entries(pairs).map(([value, label]) => ({ value, label }));

const LINKEDIN: Question = {
  id: "linkedin_status",
  label: "How's your LinkedIn?",
  type: "single",
  required: true,
  options: opts({ none: "I don't have one", basic: "It exists, but it's basic", strong: "It's in good shape" }),
};

const LOCATIONS: Question = {
  id: "locations",
  label: "Where would you like to work?",
  help: "Separate places with commas. Leave blank if you're open.",
  type: "text",
};

export const QUESTIONS: Record<ClassYear, Question[]> = {
  freshman: [
    {
      id: "major_certainty",
      label: "How sure are you about your major?",
      type: "single",
      required: true,
      options: opts({ sure: "Pretty sure", maybe: "Leaning one way", unsure: "No idea yet, and that's fine" }),
    },
    {
      id: "explored",
      label: "What have you tried so far?",
      type: "multi",
      options: opts({ clubs: "Joined a club", intro_course: "An intro course in something new", talked: "Talked to someone in a job I like", none: "Nothing yet" }),
    },
    {
      id: "first_help",
      label: "What would help most this semester?",
      type: "single",
      required: true,
      options: opts({ major: "Choosing a major", clubs: "Finding clubs and people", resume: "Writing my first resume", careers: "Seeing what careers exist" }),
    },
  ],
  sophomore: [
    {
      id: "major_certainty",
      label: "How settled is your major?",
      type: "single",
      required: true,
      options: opts({ sure: "Settled", maybe: "Mostly, might change", unsure: "Still deciding" }),
    },
    {
      id: "try_next",
      label: "Which of these would you try this year?",
      help: "Pick any.",
      type: "multi",
      options: opts({ simulation: "A job simulation", alumni: "A chat with an alum", info_session: "A company info session", project: "A small project" }),
    },
    {
      id: "experience",
      label: "Have you had a job or internship related to your interests?",
      type: "single",
      required: true,
      options: opts({ none: "Not yet", some: "Something a bit related", yes: "Yes" }),
    },
  ],
  junior: [
    {
      id: "domain",
      label: "Which area of your major do you want to focus on?",
      help: "For example, machine learning, audit, or product design.",
      type: "text",
      required: true,
    },
    {
      id: "target_roles",
      label: "Which roles are you looking at?",
      help: "Separate roles with commas. A rough idea is fine.",
      type: "text",
    },
    {
      id: "internship",
      label: "Where are you with internships?",
      type: "single",
      required: true,
      options: opts({ not_started: "Haven't started", applying: "Applying now", secured: "I have one lined up" }),
    },
    LINKEDIN,
    LOCATIONS,
  ],
  senior: [
    {
      id: "target_roles",
      label: "Which 3 or 4 roles are you going for?",
      help: "Separate roles with commas.",
      type: "text",
      required: true,
    },
    {
      id: "search_stage",
      label: "Where are you in your job search?",
      type: "single",
      required: true,
      options: opts({ not_started: "Haven't started", applying: "Applying", interviewing: "Interviewing", offer: "I have an offer" }),
    },
    LINKEDIN,
    LOCATIONS,
  ],
  grad: [
    {
      id: "goal",
      label: "What's your goal after this degree?",
      type: "single",
      required: true,
      options: opts({ industry: "A job in industry", switch: "Switching fields", research: "Research or a PhD", unsure: "Not sure yet" }),
    },
    {
      id: "target_roles",
      label: "Which roles are you going for?",
      help: "Separate roles with commas.",
      type: "text",
    },
    {
      id: "search_stage",
      label: "Where are you in your search?",
      type: "single",
      required: true,
      options: opts({ not_started: "Haven't started", applying: "Applying", interviewing: "Interviewing", offer: "I have an offer" }),
    },
    LINKEDIN,
    LOCATIONS,
  ],
};

export type Answers = Record<string, string | string[]>;

/** Checks form values against the questions for this year. Unknown questions and options are dropped. */
export function readAnswers(year: ClassYear, get: (id: string) => string[]): { answers: Answers; missing: string[] } {
  const answers: Answers = {};
  const missing: string[] = [];
  for (const q of QUESTIONS[year]) {
    const raw = get(q.id).map((v) => v.trim().slice(0, 300)).filter(Boolean);
    const allowed = q.options ? raw.filter((v) => q.options!.some((o) => o.value === v)) : raw;
    if (!allowed.length) {
      if (q.required) missing.push(q.id);
      continue;
    }
    answers[q.id] = q.type === "multi" ? allowed : allowed[0];
  }
  return { answers, missing };
}
