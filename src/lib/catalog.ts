import { careerCalendar } from "./calendar.ts";

// What the career center offers, for the demo: a short "start here, then this, then this" ladder for each
// career path and year level, clubs on beInvolved, career services events, and alumni stories.
// Everything is invented or a public free resource. Links to LinkedIn Learning are searches, as a stand-in.

export type Level = "basic" | "specific" | "advanced";
export type CatalogResource = {
  type: "skill" | "certification" | "event" | "course" | "coaching" | "club";
  title: string;
  provider: string;
  url: string | null;
  interests: string[];
  source: "library" | "melon" | "handshake";
  level?: Level;
  step?: number;
  blurb?: string;
  starts_at?: string;
  tags: string[];
};

/** Freshmen get the gentlest ladder, sophomores a more specific one, juniors and up the strictest. */
export function levelFor(year: string | null | undefined): Level {
  return year === "freshman" ? "basic" : year === "sophomore" ? "specific" : "advanced";
}

const li = (q: string) => `https://www.linkedin.com/learning/search?keywords=${encodeURIComponent(q)}`;
const club = (name: string) => `https://beinvolved.indiana.edu/organizations?query=${encodeURIComponent(name)}`;
const LI = "LinkedIn Learning · free for students";

export const CLUBS: Array<{ name: string; interests: string[] }> = [
  { name: "Data Science Club", interests: ["data"] },
  { name: "Computer Science Club", interests: ["soft"] },
  { name: "AI Club", interests: ["data", "soft"] },
  { name: "Cyber Security Club", interests: ["cyber"] },
  { name: "INgineering Club", interests: ["soft"] },
  { name: "Intelligence and Security Club", interests: ["cyber"] },
  { name: "Linux Users Group Club", interests: ["cyber", "soft"] },
  { name: "Luddy Student Government", interests: [] },
  { name: "Machine Learning 4 All", interests: ["data"] },
  { name: "NSBE (National Society of Black Engineers)", interests: ["soft", "data", "cyber"] },
  { name: "Product Management Club", interests: ["biz", "ux"] },
  { name: "QuTE (Quantum Technologies for Everyone)", interests: ["soft", "data"] },
  { name: "TEDxIU", interests: ["arts", "biz"] },
  { name: "UX Design & Research Club", interests: ["ux"] },
  { name: "Women in Computing", interests: ["soft", "data", "ux"] },
  { name: "Women in Cybersecurity", interests: ["cyber"] },
  { name: "HCI/D Club", interests: ["ux"] },
];

type Rung = [CatalogResource["type"], string, string, string | null, string];
// [type, title, provider, url, why it's this step]
const LADDERS: Record<string, Record<Level, [Rung, Rung, Rung]>> = {
  data: {
    basic: [
      ["skill", "Learning Data Analytics", LI, li("Learning Data Analytics"), "A friendly first look at what data people actually do."],
      ["club", "Data Science Club", "beInvolved", club("Data Science Club"), "Meet students a year or two ahead of you."],
      ["skill", "Kaggle Learn: Pandas", "Kaggle · free · 4 hours", "https://www.kaggle.com/learn", "Your first real data, in short lessons."],
    ],
    specific: [
      ["skill", "Kaggle Learn: Intro to SQL", "Kaggle · free · 3 hours", "https://www.kaggle.com/learn", "SQL shows up in almost every data internship posting."],
      ["skill", "Tableau Essential Training", LI, li("Tableau Essential Training"), "Turn numbers into a chart people understand."],
      ["skill", "Analyze a public dataset you care about", "Mini project · about 6 hours", null, "Your first project to talk about at the fair."],
    ],
    advanced: [
      ["certification", "Google Data Analytics Certificate", "Coursera · financial aid available", "https://www.coursera.org/professional-certificates/google-data-analytics", "A recognized line on your resume."],
      ["skill", "Kaggle Learn: Intro to Machine Learning", "Kaggle · free · 3 hours", "https://www.kaggle.com/learn", "The next skill most data roles ask for."],
      ["coaching", "Mock technical interview: SQL and a case", "30 min · career center", null, "Practice the interview before the real one."],
    ],
  },
  cyber: {
    basic: [
      ["skill", "Cybersecurity Foundations", LI, li("Cybersecurity Foundations"), "What security teams do all day, in plain words."],
      ["club", "Cyber Security Club", "beInvolved", club("Cyber Security Club"), "Weekly meetings and beginner CTF nights."],
      ["skill", "TryHackMe: Pre-Security path", "TryHackMe · free", "https://tryhackme.com", "Hands-on basics in your browser."],
    ],
    specific: [
      ["skill", "OverTheWire: Bandit", "Free Linux wargame", "https://overthewire.org/wargames/bandit/", "Learn the Linux commands security work runs on."],
      ["club", "Linux Users Group Club", "beInvolved", club("Linux Users Group Club"), "People who'll help when you get stuck."],
      ["skill", "Networking Foundations: Networking Basics", LI, li("Networking Foundations: Networking Basics"), "How networks work, so attacks make sense."],
    ],
    advanced: [
      ["skill", "TryHackMe: Pre-Security path", "TryHackMe · free", "https://tryhackme.com", "Fill gaps fast and put it on your resume."],
      ["certification", "CompTIA Security+ free study guide", "Professor Messer · free videos", "https://www.professormesser.com", "The entry-level cert most analyst postings ask for."],
      ["skill", "Build a home log-analysis lab", "Project · about 2 weekends", null, "Your data skills plus security: a story recruiters remember."],
    ],
  },
  soft: {
    basic: [
      ["skill", "Programming Foundations: Fundamentals", LI, li("Programming Foundations: Fundamentals"), "Start from zero, no pressure."],
      ["club", "Computer Science Club", "beInvolved", club("Computer Science Club"), "Hack nights and upperclassmen who've done internships."],
      ["skill", "freeCodeCamp: Responsive Web Design", "freeCodeCamp · free", "https://www.freecodecamp.org", "Build something you can show a friend this week."],
    ],
    specific: [
      ["skill", "Git Essential Training", LI, li("Git Essential Training"), "Every software team uses Git."],
      ["skill", "freeCodeCamp: JavaScript Algorithms", "freeCodeCamp · free", "https://www.freecodecamp.org", "The problem-solving interviews test."],
      ["skill", "Build and deploy a small web app", "Project · about 2 weekends", null, "A link on your resume beats a list of languages."],
    ],
    advanced: [
      ["skill", "Programming Foundations: Algorithms", LI, li("Programming Foundations: Algorithms"), "Refresh the core of technical interviews."],
      ["skill", "Two practice problems a week", "LeetCode · free tier", "https://leetcode.com", "Small and steady beats cramming."],
      ["coaching", "Mock technical interview", "30 min · career center", null, "Practice thinking out loud with a coach."],
    ],
  },
  ux: {
    basic: [
      ["skill", "UX Foundations: Interaction Design", LI, li("UX Foundations: Interaction Design"), "What UX designers do and why it matters."],
      ["club", "UX Design & Research Club", "beInvolved", club("UX Design & Research Club"), "Design jams and portfolio nights."],
      ["skill", "Figma: learn design basics", "Figma · free", "https://www.figma.com/resource-library/", "The tool almost every design team uses."],
    ],
    specific: [
      ["certification", "Google UX Design Certificate, course 1", "Coursera · financial aid available", "https://www.coursera.org/professional-certificates/google-ux-design", "A structured start with a real case study."],
      ["club", "HCI/D Club", "beInvolved", club("HCI/D Club"), "Grad students and alumni who review work."],
      ["skill", "Redesign one app screen you use daily", "Mini project · about 4 hours", null, "Your first portfolio piece."],
    ],
    advanced: [
      ["skill", "Run a 5-person usability test", "Project · one weekend", null, "Research skills set you apart from other designers."],
      ["skill", "Building a UX Portfolio", LI, li("UX portfolio"), "Tell the story behind each project."],
      ["coaching", "Portfolio review", "30 min · career center", null, "A coach's eyes before a recruiter's."],
    ],
  },
  biz: {
    basic: [
      ["skill", "Business Foundations", LI, li("Business Foundations"), "The basic language of business."],
      ["club", "Product Management Club", "beInvolved", club("Product Management Club"), "See how products get planned and launched."],
      ["skill", "Try a free job simulation", "Forage · free · 1 to 3 hours", "https://www.theforage.com", "A taste of real work, no commitment."],
    ],
    specific: [
      ["certification", "Bloomberg Market Concepts", "Free on campus", null, "Finance basics recruiters recognize."],
      ["skill", "Excel Essential Training", LI, li("Excel Essential Training"), "The tool every analyst lives in."],
      ["skill", "Consulting job simulation", "Forage · free", "https://www.theforage.com", "Practice a real client problem."],
    ],
    advanced: [
      ["coaching", "Mock case interview", "45 min · career center", null, "Case interviews take practice. Start here."],
      ["skill", "Financial modeling basics", "CFI · free course", "https://corporatefinanceinstitute.com", "Show you can build a simple model."],
      ["coaching", "Mock behavioral interview", "30 min · career center", null, "Have three good stories ready."],
    ],
  },
  health: {
    basic: [
      ["skill", "Health careers overview", LI, li("healthcare careers"), "See the many jobs beyond doctor and nurse."],
      ["club", "Find a health club on beInvolved", "beInvolved", club("health"), "Pre-health and public health groups meet weekly."],
      ["skill", "Khan Academy: Health and medicine", "Khan Academy · free", "https://www.khanacademy.org", "Short videos to see what clicks."],
    ],
    specific: [
      ["skill", "Volunteer or shadow at a clinic", "Experience · a few hours a month", null, "Real exposure is what health programs look for."],
      ["skill", "Intro to public health data", LI, li("public health"), "Numbers behind health decisions."],
      ["coaching", "Career exploration session", "30 min · career center", null, "Narrow down which health path fits you."],
    ],
    advanced: [
      ["skill", "Healthcare data with Excel", LI, li("healthcare data Excel"), "A practical skill for coordinator roles."],
      ["coaching", "Resume review for health roles", "30 min · career center", null, "Make your volunteer work count."],
      ["coaching", "Mock behavioral interview", "30 min · career center", null, "Health employers interview for judgment."],
    ],
  },
  arts: {
    basic: [
      ["skill", "Content Creation Foundations", LI, li("content creation"), "How creative work becomes a career."],
      ["club", "TEDxIU", "beInvolved", club("TEDxIU"), "Help produce real events and videos."],
      ["skill", "Canva Design School", "Canva · free", "https://www.canva.com/designschool/", "Quick wins you can show off."],
    ],
    specific: [
      ["skill", "Start a simple portfolio site", "Project · one weekend", null, "One link that shows your best three pieces."],
      ["skill", "Video Editing Foundations", LI, li("video editing foundations"), "A skill almost every media team needs."],
      ["coaching", "Portfolio review", "30 min · career center", null, "Feedback before you share it widely."],
    ],
    advanced: [
      ["coaching", "Portfolio review", "30 min · career center", null, "Tighten it for applications."],
      ["skill", "Freelancing on the side", LI, li("freelancing"), "Paid work you can point to."],
      ["coaching", "Mock behavioral interview", "30 min · career center", null, "Talk about your process with confidence."],
    ],
  },
};

export function ladderResources(): CatalogResource[] {
  return Object.entries(LADDERS).flatMap(([interest, levels]) =>
    (Object.entries(levels) as Array<[Level, [Rung, Rung, Rung]]>).flatMap(([level, rungs]) =>
      rungs.map(([type, title, provider, url, blurb], i) => ({
        type,
        title,
        provider,
        url,
        interests: [interest],
        source: type === "club" ? ("library" as const) : provider.startsWith("LinkedIn") ? ("library" as const) : ("melon" as const),
        level,
        step: i + 1,
        blurb,
        tags: ["seed", "ladder"],
      })),
    ),
  );
}

/** Career services events for the fall, built around the fair. Most are for everyone. */
export function careerEvents(year: number): CatalogResource[] {
  const c = careerCalendar(year);
  const at = (day: string, hhmm: string) => `${day}T${hhmm}:00-04:00`;
  const ev = (title: string, provider: string, day: string, hhmm: string, interests: string[] = [], blurb?: string): CatalogResource => ({
    type: "event", title, provider, url: null, interests, source: "handshake", starts_at: at(day, hhmm), blurb, tags: ["seed", "career-services"],
  });
  return [
    ev("Pre-fair resume review drop-in", "Career center · walk in", c.resumeDropIn, "13:00", [], "Bring a printed resume. 10 minutes with a coach."),
    ev("Elevator pitch workshop", "Career center", c.pitchWorkshop, "17:30", [], "Leave with a 30-second pitch you've said out loud."),
    ev("Info session: Hoosier Analytics (hiring interns)", "Company on campus", c.infoSession, "18:00", ["data", "biz"]),
    ev("Mock career fair", "Career center · real recruiters", c.mockFair, "16:00", [], "Practice your pitch where mistakes don't count."),
    ev("Fall Career Fair, Day 1: tech, data and engineering", "Biggest fair of the year", c.fair1, "11:00", [], "Internships and full-time roles. Bring 10 resumes."),
    ev("Fall Career Fair, Day 2: business, analytics and nonprofits", "Biggest fair of the year", c.fair2, "11:00", []),
    ev("Free LinkedIn headshots", "At the career fair", c.headshots, "11:00", [], "Free professional photo for your profile."),
    ev("Alumni coffee chat: security and data", "Alumni on campus", c.alumniChat, "16:30", ["cyber", "data"]),
    ev("Networking night with alumni", "Career center", c.networkingNight, "18:00", []),
    ev("Indy tech meetup: intro to security", "Off campus · Indianapolis", c.networkingNight, "18:30", ["cyber"], "Your coach recommends this one."),
    { type: "coaching", title: "Career coach drop-in hours", provider: "Tue and Thu, 1–4 pm", url: null, interests: [], source: "library", tags: ["seed", "career-services"], blurb: "Ask anything, no appointment needed." },
  ];
}

export type Alum = { name: string; degree: string; grad_year: number; title: string; employer: string; story: string; interests: string[] };

/** Invented alumni whose paths are close to, not the same as, a student's. */
export const ALUMNI: Alum[] = [
  { name: "Dev K.", degree: "B.S. Data Science", grad_year: 2023, title: "Security Data Analyst", employer: "a regional bank", story: "Started in data, took Security+ senior year, and now finds fraud in log data.", interests: ["cyber", "data"] },
  { name: "Marco R.", degree: "M.S. Data Science", grad_year: 2024, title: "Data Analyst", employer: "a sports analytics company", story: "Landed it from a Kaggle project he talked about at the fall fair.", interests: ["data"] },
  { name: "Hannah L.", degree: "B.S. Informatics", grad_year: 2022, title: "UX Researcher", employer: "a health-tech startup", story: "Joined the UX club freshman year and ran usability tests for campus apps.", interests: ["ux", "health"] },
  { name: "Aisha B.", degree: "B.S. Computer Science", grad_year: 2021, title: "Software Engineer", employer: "a logistics company", story: "Two hackathons and a deployed side project got her the first interview.", interests: ["soft"] },
  { name: "Jordan T.", degree: "B.S. Cybersecurity", grad_year: 2023, title: "SOC Analyst", employer: "a hospital system", story: "Started in Women in Cybersecurity, then a help desk job, then the SOC.", interests: ["cyber", "health"] },
];
