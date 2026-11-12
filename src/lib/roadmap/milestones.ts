// Milestones are the flags on the road: things a student finished that they'd put on a resume or tell a
// friend about. Tasks (registering, prep, practice, chores, applying) stay on Action items.
// The planned milestones per semester come from the Luddy Four-Year Career Guide (Explore, Evolve, Engage, Execute).

type StepLike = { kind: string; title: string; source: string; status: string };

const NOT_A_MILESTONE =
  /\b(mock|practice|register|rsvp|book|sign up|set up|update your|headline|profile|try the|lessons?|tutorial|info session|coffee|1:1 call|apply to|applied to|review)\b/i;

/** Whether a finished step earns a flag. Anything the student added themselves always does. */
export function isMilestone(s: StepLike) {
  if (s.source === "student") return true;
  if (s.kind === "course" || s.kind === "skill" || s.kind === "application" || s.kind === "coaching") return false;
  if (NOT_A_MILESTONE.test(s.title)) return false;
  if (s.kind === "event") return /career fair|conference|hackathon|expo/i.test(s.title);
  if (s.kind === "networking") return /\b(join|joined|club|lead|president|officer|chair)\b/i.test(s.title);
  return ["experience", "project", "certification"].includes(s.kind);
}

const PAST: Array<[RegExp, string]> = [
  [/^Go to /, "Went to "],
  [/^Join /, "Joined "],
  [/^Earn /, "Earned "],
  [/^Build /, "Built "],
  [/^Finish /, "Finished "],
  [/^Land /, "Landed "],
  [/^Get /, "Got "],
  [/^Take /, "Took "],
  [/^Win /, "Won "],
  [/^Present /, "Presented "],
  [/^Lead /, "Led "],
];

/** A flag reads like a win: past tense and short. Students' own words are left alone. */
export function winLabel(s: StepLike) {
  if (s.source === "student") return s.title;
  let t = s.title;
  for (const [re, to] of PAST) if (re.test(t)) t = t.replace(re, to);
  if (s.kind === "networking" && /club/i.test(t) && !/@/.test(t)) t = `${t} @ IU`;
  return t;
}

export type PlannedMilestone = { key: string; title: string; when?: string; dated?: boolean; path?: boolean; tasks: string[] };

/** What kind of win a milestone is when the student marks it done (the kinds "Add something you did" allows). */
export const CLAIM_KIND: Record<string, string> = {
  resume: "project",
  club: "networking",
  lead: "networking",
  fair: "event",
  cert: "certification",
  project: "project",
  intern: "experience",
  interview: "experience",
  offer: "experience",
};

/** Which of this semester's tasks lead to which milestone. The fair uses isFairStep instead. */
export const TASK_MATCH: Record<string, RegExp> = {
  fair: /career fair|the fair|elevator pitch|handshake|recruiters?|employers to meet|30-second pitch/i,
  resume: /\bresume\b|linkedin|handshake profile/i,
  club: /\bclubs?\b|beinvolved|meeting/i,
  lead: /\bclubs?\b|leadership|run for|officer/i,
  cert: /certificat/i,
  project: /\bproject\b|portfolio/i,
  intern: /intern|references|portfolio|social media audit/i,
  interview: /job search|interview|full-time|apply to \d+ full-time/i,
  offer: /\boffers?\b|12twenty|negotiat/i,
};

/** The milestone in the past tense, for when it's done: "Go to the Fall Career Fair" -> "Went to the Fall Career Fair". */
export function pastTense(title: string) {
  return winLabel({ kind: "", title, source: "system", status: "done" });
}

const FAIR = ["Register for the fair in Handshake", "Career fair strategy", "Elevator pitch", "Resume review"];

/** Planned milestones for each undergrad semester, freshman fall to senior spring. */
export const PLANNED: PlannedMilestone[][] = [
  [
    {
      key: "resume",
      title: "Finish your first college resume",
      tasks: ["Write your college resume", "Get it reviewed by a career coach", "Upload it to Handshake", "Set up LinkedIn"],
    },
    { key: "club", title: "Join a club", tasks: ["Browse clubs on BeInvolved", "Go to two first meetings"] },
  ],
  [{ key: "fair", title: "Go to your first career fair", when: "Spring Career Fair", dated: true, tasks: FAIR }],
  [
    { key: "fair", title: "Go to the Fall Career Fair", when: "Fall Career Fair", dated: true, tasks: FAIR },
    { key: "cert", title: "Earn your first certificate", path: true, tasks: ["Pick a LinkedIn Learning course for your path", "Finish it"] },
  ],
  [
    { key: "project", title: "Finish a portfolio project", path: true, tasks: ["Start a portfolio file", "Pick a project", "Finish and publish it"] },
    {
      key: "intern",
      title: "Land your first internship or research role",
      tasks: ["Research companies", "Update your resume", "Apply", "Practice interviewing"],
    },
  ],
  [
    { key: "fair", title: "Go to the Fall Career Fair", when: "Fall Career Fair", dated: true, tasks: FAIR },
    { key: "lead", title: "Take a leadership role", tasks: ["Run for a role in your club"] },
  ],
  [
    {
      key: "intern",
      title: "Land an internship in your field",
      path: true,
      tasks: [
        "Update Handshake and LinkedIn",
        "Social media audit",
        "Organize your portfolio",
        "Collect two references",
        "Apply and practice interviewing",
      ],
    },
    { key: "cert", title: "Earn a certificate for your path", path: true, tasks: ["Pick the certificate your path asks for", "Finish it"] },
  ],
  [
    { key: "fair", title: "Go to the Fall Career Fair", when: "Fall Career Fair", dated: true, tasks: FAIR },
    { key: "interview", title: "Land your first job interview", tasks: ["Final resume review", "Start your job search", "Mock interview"] },
  ],
  [{ key: "offer", title: "Get a job offer", tasks: ["Review the offer with a coach", "Report it in 12twenty"] }],
];

/** Which guide semester a road slot is: master's students get the junior and senior milestones. */
export function plannedFor(slot: number, slots: number) {
  return PLANNED[slots === PLANNED.length ? slot : PLANNED.length - slots + slot] ?? [];
}

/** Which planned milestone a finished flag is, if any: by its wording first, then by what kind of thing it was. */
export function milestoneKey(item: { title: string; kind: string }, pathName?: string): string | null {
  const t = item.title.toLowerCase();
  for (const m of PLANNED.flat()) {
    const titles = [m.title, pathName ? m.title.replace("your path", pathName) : m.title].map((x) => pastTense(x).toLowerCase());
    if (titles.includes(t)) return m.key;
  }
  if (/career fair/i.test(item.title)) return "fair";
  if (item.kind === "certification") return "cert";
  if (/\bclub\b/i.test(item.title)) return /lead|president|officer/i.test(item.title) ? "lead" : "club";
  if (/intern/i.test(item.title)) return "intern";
  if (/resume/i.test(item.title)) return "resume";
  if (item.kind === "project") return "project";
  return null;
}

/** The action items that led to a milestone: tasks from the same semester that match it (never other milestones). */
export function tasksFor<T extends { title: string; kind: string; source: string; status: string; term: string | null; sort: number }>(
  key: string | null,
  steps: T[],
  term: string,
) {
  if (!key || !TASK_MATCH[key]) return [];
  return steps.filter(
    (s) =>
      s.term === term &&
      s.kind !== "course" &&
      s.sort !== 950 &&
      !isMilestone(s) &&
      TASK_MATCH[key].test(s.title) &&
      (s.status === "done" || s.status === "active"),
  );
}
