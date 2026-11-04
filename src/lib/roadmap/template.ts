import type { Answers } from "../onboarding/questions";
import type { ClassYear } from "../types";

// The first roadmap draft, built from templates plus the student's own answers. No AI yet: this is the
// team's agreed fallback, and an advisor reviews and edits every draft before the student can see it.

export type DraftPath = { name: string; reason: string; first_job: string; sort: number; interest?: string };
export type DraftItem = {
  path_index?: number;
  term: string;
  kind: "course" | "experience" | "skill" | "certification" | "event" | "networking" | "application" | "coaching" | "project";
  title: string;
  description: string;
  rationale: string;
  evidence: Array<{ source: string; field: string }>;
  resource_id?: string;
  sort: number;
};
export type Resource = { id: string; type: string; title: string; interests: string[] };
export type DraftInput = {
  class_year: ClassYear;
  majors: string[];
  interests: string[];
  target_roles: string[];
  answers: Answers;
  resources: Resource[];
  now?: Date;
};

const CAREERS: Record<string, { name: string; first_job: string }> = {
  data: { name: "Data & analytics", first_job: "Data analyst" },
  cyber: { name: "Cybersecurity", first_job: "Security analyst" },
  soft: { name: "Software engineering", first_job: "Junior software engineer" },
  ux: { name: "UX & product design", first_job: "Associate UX designer" },
  biz: { name: "Business & finance", first_job: "Business analyst" },
  health: { name: "Health careers", first_job: "Health program coordinator" },
  arts: { name: "Arts & media", first_job: "Content or media coordinator" },
};

// How many paths to keep open: broad early on, focused later.
const PATH_LIMIT: Record<ClassYear, number> = { freshman: 3, sophomore: 3, junior: 2, senior: 4, grad: 4 };
const BROAD_DEFAULTS = ["soft", "biz", "ux"];

/** The next `count` terms starting from the current one, for example ["Fall 2026", "Spring 2027"]. */
export function upcomingTerms(now: Date, count: number): string[] {
  const month = now.getMonth();
  let year = now.getFullYear();
  let season: "Spring" | "Fall" = month >= 6 ? "Fall" : "Spring"; // Summer plans belong to the coming fall.
  const terms: string[] = [];
  for (let i = 0; i < count; i++) {
    terms.push(`${season} ${year}`);
    if (season === "Fall") {
      season = "Spring";
      year += 1;
    } else {
      season = "Fall";
    }
  }
  return terms;
}

export function buildFirstRoadmap(input: DraftInput): { paths: DraftPath[]; items: DraftItem[] } {
  const { class_year: year, answers } = input;
  const [now, next] = upcomingTerms(input.now ?? new Date(), 2);
  const interests = input.interests.filter((i) => CAREERS[i]);
  const { paths, pathInterests } = buildPaths(input, interests);
  const major = input.majors[0] ?? "your major";
  const domain = text(answers.domain);

  const items: DraftItem[] = [];
  const add = (item: Omit<DraftItem, "sort">) => items.push({ ...item, sort: items.length });
  const from = (field: string, source = "onboarding") => [{ source, field }];

  // Links a library resource for one interest. It sits under a path only if that path is about the same interest.
  const fromLibrary = (type: string, interest: string, term: string, kind: DraftItem["kind"]) => {
    const r = input.resources.find((x) => x.type === type && x.interests.includes(interest) && !items.some((i) => i.resource_id === x.id));
    if (!r) return;
    const index = pathInterests.indexOf(interest);
    add({
      path_index: index >= 0 ? index : undefined,
      term,
      kind,
      title: r.title,
      description: "From your school's resource library.",
      rationale: `A next step for your interest in ${CAREERS[interest].name.toLowerCase()}.`,
      evidence: from("interests"),
      resource_id: r.id,
    });
  };

  add({
    term: now,
    kind: "coaching",
    title: year === "freshman" || year === "sophomore" ? "Meet with your academic advisor" : "Meet with your career coach",
    description: "Bring this roadmap and talk through what to change. Aim for at least one session each semester.",
    rationale: year === "freshman" || year === "sophomore"
      ? "In your first two years, courses and exploring matter most, so your advisor is the best first stop."
      : "In your last years, career strategy matters most, so your coach is the best first stop.",
    evidence: from("class_year"),
  });

  if (year === "freshman") {
    const unsure = answers.major_certainty !== "sure";
    add({
      term: now,
      kind: "event",
      title: unsure ? "Go to a majors and minors fair" : `Talk to two students in ${major}`,
      description: unsure ? "Collect two or three majors worth a closer look." : "Ask what they wish they'd known in their first year.",
      rationale: unsure ? "You said you're still working out your major." : "You're fairly sure about your major, so test it against real experience.",
      evidence: from("major_certainty"),
    });
    add({ term: now, kind: "networking", title: "Join one club that sounds interesting", description: "It doesn't have to match your major. Go to two meetings before you decide.", rationale: "Trying things is the whole point of first year.", evidence: from("explored") });
    add({ term: next, kind: "course", title: "Take one course outside your comfort zone", description: "Choose it with your advisor when you plan next semester.", rationale: "A course is a low-risk way to test an interest.", evidence: from("interests") });
    if (answers.first_help === "resume") add({ term: next, kind: "coaching", title: "Write your first resume at drop-in hours", description: "Bring anything you've done: jobs, clubs, school projects.", rationale: "You said a first resume would help most.", evidence: from("first_help") });
    if (answers.first_help === "careers") add({ term: next, kind: "networking", title: "Have one chat with someone in a job you're curious about", description: "Fifteen minutes is enough. Your coach can help you find someone.", rationale: "You said you want to see what careers exist.", evidence: from("first_help") });
    pathInterests.forEach((interest) => interest && fromLibrary("skill", interest, next, "skill"));
  }

  if (year === "sophomore") {
    const tryNext = list(answers.try_next);
    add({ path_index: 0, term: now, kind: "experience", title: `Try a Forage job simulation in ${paths[0].name.toLowerCase()}`, description: "Short, self-paced tasks that show what the work is really like.", rationale: tryNext.includes("simulation") ? "You said you'd try a job simulation." : "An easy way to narrow your interests without a big commitment.", evidence: from("try_next") });
    add({ term: now, kind: "networking", title: "Have a chat with an alum", description: "Ask how they chose their path and what they'd do differently.", rationale: "From sophomore year, hearing real career stories helps you narrow down.", evidence: from("try_next") });
    add({ term: next, kind: "event", title: "Go to a company info session", description: "Pick a company you know little about.", rationale: "You'll learn which kinds of workplaces appeal to you.", evidence: from("try_next") });
    if (tryNext.includes("project")) add({ path_index: 0, term: next, kind: "project", title: "Build a small project on something you care about", description: "Keep it small enough to finish in a few weekends.", rationale: "You said you'd like to try a project.", evidence: from("try_next") });
    if (answers.experience === "none") add({ term: next, kind: "application", title: "Apply for one summer role or campus job", description: "Anything related counts for a first step.", rationale: "You haven't had related experience yet.", evidence: from("experience") });
    pathInterests.forEach((interest) => interest && fromLibrary("skill", interest, next, "skill"));
  }

  if (year === "junior" || year === "senior" || year === "grad") {
    addCareerStrategy();
  }

  return { paths, items };

  function addCareerStrategy() {
    const linkedin = answers.linkedin_status;
    const stage = text(answers.search_stage) ?? text(answers.internship);
    const research = year === "grad" && answers.goal === "research";
    const focus = domain ?? input.target_roles[0] ?? paths[0]?.name.toLowerCase() ?? major;

    if (linkedin !== "strong") {
      add({ term: now, kind: "networking", title: linkedin === "none" ? "Create your LinkedIn profile" : "Improve your LinkedIn profile", description: `Write your headline and summary around ${focus}.`, rationale: linkedin === "none" ? "You said you don't have one yet." : "You said yours is basic.", evidence: from("linkedin_status") });
    }
    add({ term: now, kind: "networking", title: `Reach out to three people working in ${focus}`, description: "Ask for a 15-minute chat, not a job.", rationale: "Most of a job search runs on people you know, so start before you need it.", evidence: from(year === "junior" ? "domain" : "target_roles") });
    add({ term: now, kind: "event", title: "Prepare for the next career fair", description: "Research five companies and their roles, and practice a 30-second elevator pitch.", rationale: "Students who prepare get far more from a fair.", evidence: from("class_year") });

    if (stage === "not_started" && !research) {
      add({ term: now, kind: "application", title: `Make an application plan for ${year === "junior" ? "internships" : "jobs"}`, description: "List 15 target companies and their deadlines, and set a weekly goal.", rationale: "You said you haven't started yet.", evidence: from(year === "junior" ? "internship" : "search_stage") });
    } else if (stage === "applying") {
      add({ term: now, kind: "coaching", title: "Review your applications with your coach", description: "Bring your resume and a list of where you've applied.", rationale: "You're applying now, so a second look pays off quickly.", evidence: from(year === "junior" ? "internship" : "search_stage") });
    } else if (stage === "interviewing") {
      add({ term: now, kind: "coaching", title: "Book a mock interview", description: "Practice with a role you're interviewing for.", rationale: "You're interviewing now.", evidence: from("search_stage") });
    } else if (stage === "offer") {
      add({ term: now, kind: "coaching", title: "Go over your offer with your coach", description: "Compare it with your goals before you decide.", rationale: "You said you have an offer.", evidence: from("search_stage") });
    }

    if (research) {
      add({ term: next, kind: "networking", title: "Talk to two faculty members about research paths", description: "Ask about labs, funding and timelines.", rationale: "You said you're aiming for research or a PhD.", evidence: from("goal") });
    }
    if (input.target_roles.length) {
      paths.forEach((p, i) => add({ path_index: i, term: now, kind: "application", title: `Read three job postings for ${p.name}`, description: "Note the skills they ask for most, and which of them you already have.", rationale: "You named this role, so this shows what it takes.", evidence: from("target_roles") }));
    }
    add({ path_index: 0, term: next, kind: "project", title: `Build a project that shows your skills in ${focus}`, description: "Finish something small you can link from your resume.", rationale: "A personal project helps you stand out in your field.", evidence: from(year === "junior" ? "domain" : "target_roles") });

    interests.slice(0, 2).forEach((interest) => {
      fromLibrary("certification", interest, next, "certification");
      fromLibrary("course", interest, next, "course");
    });
  }
}

function buildPaths(input: DraftInput, interests: string[]): { paths: DraftPath[]; pathInterests: Array<string | undefined> } {
  const limit = PATH_LIMIT[input.class_year];
  const early = input.class_year === "freshman" || input.class_year === "sophomore";
  // From junior year, roles the student names become the paths. They aren't tied to any one interest.
  if (!early && input.target_roles.length) {
    const roles = input.target_roles.slice(0, limit);
    return {
      paths: roles.map((role, sort) => ({ name: role, reason: "You named this as a role you're going for.", first_job: role, sort })),
      pathInterests: roles.map(() => undefined),
    };
  }
  const ids = [...interests];
  if (early) for (const d of BROAD_DEFAULTS) if (ids.length < limit && !ids.includes(d)) ids.push(d);
  if (!ids.length) ids.push(...BROAD_DEFAULTS);
  const chosen = ids.slice(0, limit);
  return {
    paths: chosen.map((id, sort) => ({
      name: CAREERS[id].name,
      reason: interests.includes(id) ? "You said you're interested in this." : "A broad option to explore while you work out what you like.",
      first_job: CAREERS[id].first_job,
      sort,
      interest: id,
    })),
    pathInterests: chosen,
  };
}

const text = (v: string | string[] | undefined) => (typeof v === "string" && v ? v : undefined);
const list = (v: string | string[] | undefined) => (Array.isArray(v) ? v : v ? [v] : []);
