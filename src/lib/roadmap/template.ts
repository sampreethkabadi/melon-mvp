import type { Answers } from "../onboarding/questions";
import { careerCalendar, type CalendarKey } from "../calendar.ts";
import { addDays } from "../clock.ts";
import type { ClassYear } from "../types";

// The first roadmap draft, built from templates plus the student's own answers. No AI yet: this is the
// team's agreed fallback, and an advisor reviews and edits every draft before the student can see it.
// It starts small on purpose: 3 steps for this semester, timed around the Fall Career Fair, plus one for next.

export type DraftPath = { name: string; reason: string; first_job: string; sort: number; interest?: string; status: "pinned" | "exploring" };
export type DraftItem = {
  path_index?: number;
  term: string;
  kind: "course" | "experience" | "skill" | "certification" | "event" | "networking" | "application" | "coaching" | "project";
  title: string;
  description: string;
  rationale: string;
  evidence: Array<{ source: string; field: string }>;
  resource_id?: string;
  due_date?: string;
  firm?: boolean;
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
const PATH_LIMIT: Record<ClassYear, number> = { freshman: 3, sophomore: 3, junior: 2, senior: 2, grad: 2 };
/** Freshmen and sophomores can pin 2 paths; juniors and up pin 1. Matches pin_limit() in the database. */
export const PIN_LIMIT: Record<ClassYear, number> = { freshman: 2, sophomore: 2, junior: 1, senior: 1, grad: 1 };
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
  const today = input.now ?? new Date();
  const [now, next] = upcomingTerms(today, 2);
  const interests = input.interests.filter((i) => CAREERS[i]);
  const { paths, pathInterests } = buildPaths(input, interests);
  const main = paths[0];
  const mainInterest = pathInterests[0];
  const pathWord = main ? lowerName(main.name) : "your field";
  const domain = text(answers.domain);
  const focus = domain ?? (input.target_roles[0] ? lowerName(input.target_roles[0]) : pathWord);

  // Dates from the career center's fall calendar, only while they're still ahead.
  const cal = careerCalendar(today.getFullYear());
  const todayIso = today.toISOString().slice(0, 10);
  const when = (key: CalendarKey) => (cal[key] >= todayIso ? cal[key] : undefined);
  const fair = when("fair1");

  const items: DraftItem[] = [];
  const add = (item: Omit<DraftItem, "sort">) => items.push({ ...item, sort: items.length });
  const from = (field: string, source = "onboarding") => [{ source, field }];
  const resource = (title: string) => input.resources.find((r) => r.title === title)?.id;

  // Three steps to start, never more. Sessions and the student add the rest, a few at a time.
  if (year === "freshman") {
    add({ term: now, kind: "event", title: fair ? "Go to the Career Fair just to look around" : "Go to the next career fair just to look around", resource_id: fair ? resource(FAIR_DAY1) : undefined, description: "No resume needed. Walk around, grab some swag, and see who hires for what.", rationale: "Seeing the fair once makes next year's much easier.", evidence: from("class_year"), due_date: fair, firm: Boolean(fair) });
    add({ term: now, kind: "coaching", title: "Make your first resume with the career center template", description: "Classes, clubs and any job count. One page is plenty.", rationale: answers.first_help === "resume" ? "You said a first resume would help most." : "Everything else gets easier once you have one.", evidence: from("first_help"), due_date: fair ? addDays(fair, -3) : undefined });
    const c = clubFor(mainInterest);
    add({ path_index: mainInterest ? 0 : undefined, term: now, kind: "networking", title: `Go to one ${c} meeting`, description: "Find it on beInvolved. Going once is enough to decide.", rationale: "Clubs are the easiest way to try a field and meet people.", evidence: from("interests"), resource_id: resource(c), due_date: `${today.getFullYear()}-09-30` });
    if (main) add({ path_index: 0, term: next, kind: "course", title: `Pick one intro ${pathWord} course for spring`, description: "Choose it with your advisor when you plan next semester.", rationale: "A course is a low-risk way to test an interest.", evidence: from("interests") });
  } else if (year === "sophomore") {
    add({ term: now, kind: "coaching", title: "Get your resume reviewed at the pre-fair drop-in", resource_id: resource("Pre-fair resume review drop-in"), description: "Bring a printed copy. Ten minutes with a coach.", rationale: "A reviewed resume makes the fair less stressful.", evidence: from("class_year"), due_date: when("resumeDropIn"), firm: Boolean(when("resumeDropIn")) });
    add({ term: now, kind: "event", title: "Build your 30-second pitch at the elevator pitch workshop", resource_id: resource("Elevator pitch workshop"), description: "Leave with a pitch you've said out loud at least once.", rationale: "Recruiters remember a clear 30 seconds.", evidence: from("class_year"), due_date: when("pitchWorkshop"), firm: Boolean(when("pitchWorkshop")) });
    add({ term: now, kind: "event", title: "Talk to 3 companies at the fair and get a recruiter's name", resource_id: fair ? resource(FAIR_DAY1) : undefined, description: "Ask what they look for in sophomores.", rationale: "Names turn into internship leads next year.", evidence: from("class_year"), due_date: fair, firm: Boolean(fair) });
    if (main) add({ path_index: 0, term: next, kind: "project", title: `Start a small ${pathWord} project`, description: "Keep it small enough to finish in a few weekends.", rationale: "Your first project to talk about.", evidence: from("try_next") });
  } else {
    const senior = year === "senior" || (year === "grad" && answers.goal !== "research");
    const role = main?.first_job ?? "entry-level";
    if (senior) {
      add({ path_index: main ? 0 : undefined, term: now, kind: "application", title: `Apply to 5 full-time ${role} roles`, description: "Many fall postings close at the end of September.", rationale: "Fall is when most full-time hiring starts.", evidence: from("search_stage"), due_date: when("appCloses") });
      add({ term: now, kind: "event", title: "Go to both days of the Career Fair", resource_id: fair ? resource(FAIR_DAY1) : undefined, description: "Day 1 is tech and data, Day 2 is business and analytics.", rationale: "Your last fall fair: make it count.", evidence: from("class_year"), due_date: fair, firm: Boolean(fair) });
      add({ term: now, kind: "networking", title: "Get a free LinkedIn headshot at the fair", resource_id: resource("Free LinkedIn headshots"), description: "The booth is near the entrance.", rationale: answers.linkedin_status === "strong" ? "A fresh photo for a strong profile." : "A profile photo makes recruiters far more likely to look.", evidence: from("linkedin_status"), due_date: when("headshots"), firm: Boolean(when("headshots")) });
      add({ term: next, kind: "coaching", title: "Go over offers with your coach", description: "Bring every offer, even ones you plan to turn down.", rationale: "Negotiating is easier with a plan.", evidence: from("search_stage") });
    } else {
      add({ term: now, kind: "event", title: "Practice at the mock career fair", resource_id: resource("Mock career fair"), description: "Real recruiters, practice pitches, no pressure.", rationale: "Practice the week before the real thing.", evidence: from("class_year"), due_date: when("mockFair"), firm: Boolean(when("mockFair")) });
      add({ path_index: main ? 0 : undefined, term: now, kind: "application", title: `Apply to 3 ${role} internships before the fair`, description: "Then tell recruiters at the fair you've applied.", rationale: answers.internship === "applying" ? "You're already applying, so keep the momentum." : "Applying first gives you something to talk about.", evidence: from("internship"), due_date: fair ? addDays(fair, -1) : undefined });
      add({ term: now, kind: "event", title: "Register for the Career Fair in Handshake", description: "It takes 2 minutes and gets you the employer list.", rationale: "Registered students get the map and list first.", evidence: from("class_year"), due_date: when("fairRegister"), firm: Boolean(when("fairRegister")) });
      if (main) add({ path_index: 0, term: next, kind: "project", title: `Build a project that shows your ${focus} skills`, description: "Finish something small you can link from your resume.", rationale: "A project helps you stand out.", evidence: from(year === "junior" ? "domain" : "target_roles") });
    }
  }
  return { paths, items };
}

/** "UX & Product design" -> "UX & product design": lower case, but acronyms like UX, AI and ML stay. */
export function lowerName(name: string): string {
  return name
    .split(" ")
    .map((w) => (/^[A-Z]{2,4}$/.test(w) ? w : w.toLowerCase()))
    .join(" ");
}

/** Same rules as interest_from_text() in the database. Security comes first. */
export function interestFromText(t: string): string | undefined {
  if (/(cyber|security|infosec)/i.test(t)) return "cyber";
  if (/(\bux\b|user experience|product design|design)/i.test(t)) return "ux";
  if (/(software|developer|programming|web dev|engineer)/i.test(t) && !/(data|machine learning|ml)/i.test(t)) return "soft";
  if (/(data|analytics|machine learning|\bml\b|\bai\b|statistics)/i.test(t)) return "data";
  if (/(finance|business|consult|marketing|accounting|investment)/i.test(t)) return "biz";
  if (/(health|medic|nurs|clinical)/i.test(t)) return "health";
  if (/(\barts?\b|media|film|music|journalism)/i.test(t)) return "arts";
  return undefined;
}

const FAIR_DAY1 = "Fall Career Fair, Day 1: tech, data and engineering";

const FIRST_CLUB: Record<string, string> = {
  data: "Data Science Club",
  cyber: "Cyber Security Club",
  soft: "Computer Science Club",
  ux: "UX Design & Research Club",
  biz: "Product Management Club",
  arts: "TEDxIU",
};
function clubFor(interest: string | undefined) {
  return (interest && FIRST_CLUB[interest]) || "Women in Computing";
}

function buildPaths(input: DraftInput, interests: string[]): { paths: DraftPath[]; pathInterests: Array<string | undefined> } {
  const limit = PATH_LIMIT[input.class_year];
  const early = input.class_year === "freshman" || input.class_year === "sophomore";
  // From junior year, roles the student names become the paths. They aren't tied to any one interest.
  if (!early && input.target_roles.length) {
    const roles = input.target_roles.slice(0, limit);
    return {
      paths: roles.map((role, sort) => ({
        name: role,
        reason: "You named this as a role you're going for.",
        first_job: role,
        sort,
        interest: interestFromText(role) ?? interests[0],
        status: sort === 0 ? "pinned" : "exploring",
      })),
      pathInterests: roles.map((role) => interestFromText(role) ?? interests[0]),
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
      // Pin what the student said they like, up to their year's limit. Broad defaults stay unpinned.
      status: interests.includes(id) && sort < PIN_LIMIT[input.class_year] ? "pinned" : "exploring",
    })),
    pathInterests: chosen,
  };
}

const text = (v: string | string[] | undefined) => (typeof v === "string" && v ? v : undefined);
