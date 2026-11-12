// Test data for role-played testing. All test accounts use the @melon.test email domain.

export const SEED_SCHOOL = {
  name: "Indiana University",
  slug: "iu",
  short_mark: "IU",
  color: "#990000",
  email_domains: ["iu.edu", "melon.test"],
};

type SeedStudent = {
  email: string;
  full_name: string;
  class_year: "freshman" | "sophomore" | "junior" | "senior" | "grad";
  program: string;
  majors: string[];
  minors: string[];
  expected_grad_term: string;
  interests: string[];
  onboarding_step: "resume" | "profile" | "questions" | "building" | "done";
  advisor: string;
};

const LEE = "lee@melon.test";
const MALIK = "malik@melon.test";
const BECKER = "becker@melon.test";

// All invented people. Four students per advisor, so the demo starts balanced.
export const SEED_STUDENTS: SeedStudent[] = [
  { advisor: LEE, email: "leo@melon.test", full_name: "Leo Martinez", class_year: "freshman", program: "Exploratory", majors: ["Exploring majors"], minors: [], expected_grad_term: "May 2030", interests: ["unsure", "ux"], onboarding_step: "resume" },
  { advisor: LEE, email: "maya@melon.test", full_name: "Maya Patel", class_year: "junior", program: "B.S. Data Science", majors: ["Data Science"], minors: ["Business"], expected_grad_term: "May 2028", interests: ["data", "soft"], onboarding_step: "done" },
  { advisor: LEE, email: "sam@melon.test", full_name: "Sam Okafor", class_year: "junior", program: "B.S. Computer Science", majors: ["Computer Science"], minors: [], expected_grad_term: "May 2028", interests: ["soft", "cyber"], onboarding_step: "resume" },
  { advisor: LEE, email: "taylor@melon.test", full_name: "Taylor Johnson", class_year: "junior", program: "B.S. Computer Science", majors: ["Computer Science"], minors: ["Informatics"], expected_grad_term: "May 2028", interests: ["soft", "ux"], onboarding_step: "done" },
  { advisor: LEE, email: "priya@melon.test", full_name: "Priya Shah", class_year: "senior", program: "B.S. Business", majors: ["Finance"], minors: ["Economics"], expected_grad_term: "May 2027", interests: ["biz"], onboarding_step: "done" },
  { advisor: MALIK, email: "ava@melon.test", full_name: "Ava Chen", class_year: "sophomore", program: "B.S. Informatics", majors: ["Informatics"], minors: ["Business"], expected_grad_term: "May 2029", interests: ["ux", "soft"], onboarding_step: "resume" },
  { advisor: MALIK, email: "daniel@melon.test", full_name: "Daniel Kim", class_year: "grad", program: "M.S. Data Science", majors: ["Data Science"], minors: [], expected_grad_term: "May 2027", interests: ["data"], onboarding_step: "resume" },
  { advisor: MALIK, email: "nina@melon.test", full_name: "Nina Alvarez", class_year: "sophomore", program: "B.S. Public Health", majors: ["Public Health"], minors: [], expected_grad_term: "May 2029", interests: ["health"], onboarding_step: "resume" },
  { advisor: MALIK, email: "omar@melon.test", full_name: "Omar Haddad", class_year: "senior", program: "B.S. Cybersecurity", majors: ["Cybersecurity"], minors: [], expected_grad_term: "May 2027", interests: ["cyber"], onboarding_step: "resume" },
  { advisor: BECKER, email: "grace@melon.test", full_name: "Grace Lin", class_year: "freshman", program: "B.A. Media", majors: ["Media"], minors: [], expected_grad_term: "May 2030", interests: ["arts"], onboarding_step: "resume" },
  { advisor: BECKER, email: "tyler@melon.test", full_name: "Tyler Reed", class_year: "junior", program: "B.S. Finance", majors: ["Finance"], minors: [], expected_grad_term: "May 2028", interests: ["biz", "data"], onboarding_step: "resume" },
  { advisor: BECKER, email: "zoe@melon.test", full_name: "Zoe Carter", class_year: "senior", program: "B.S. Informatics", majors: ["Informatics"], minors: [], expected_grad_term: "May 2027", interests: ["ux"], onboarding_step: "resume" },
  { advisor: BECKER, email: "marcus@melon.test", full_name: "Marcus Bell", class_year: "grad", program: "M.S. Computer Science", majors: ["Computer Science"], minors: [], expected_grad_term: "Dec 2027", interests: ["soft"], onboarding_step: "resume" },
];

export const SEED_STAFF = [
  { email: LEE, full_name: "Dr. Jordan Lee", role: "advisor" as const, title: "Academic advisor" },
  { email: MALIK, full_name: "Dr. Sana Malik", role: "advisor" as const, title: "Academic advisor" },
  { email: BECKER, full_name: "Tom Becker", role: "advisor" as const, title: "Academic advisor" },
  { email: "rivera@melon.test", full_name: "Alex Rivera", role: "coach" as const, title: "Career coach" },
  { email: "admin@melon.test", full_name: "Morgan Hale", role: "admin" as const, title: "Career center admin" },
];

/**
 * Sessions booked for the demo day as [student email, local time, session type, modality, location, with].
 * Students pick the type when they book: career topics with the coach, courses and policy with their advisor.
 */
export const SEED_APPOINTMENTS: Array<[string, string, string, "in_person" | "teams" | "melon_call", string | null, "advisor" | "coach"]> = [
  ["leo@melon.test", "09:30", "Course planning", "in_person", "Luddy Hall 2104", "advisor"],
  ["maya@melon.test", "10:30", "Course planning", "in_person", "Luddy Hall 2104", "advisor"],
  ["priya@melon.test", "13:00", "Degree progress check", "teams", null, "advisor"],
  ["sam@melon.test", "15:00", "Academic policy question", "in_person", "Luddy Hall 2104", "advisor"],
  ["ava@melon.test", "10:00", "Declare or change a major or minor", "in_person", "Room 110", "advisor"],
  ["omar@melon.test", "13:30", "Degree progress check", "teams", null, "advisor"],
  ["grace@melon.test", "11:30", "Course planning", "in_person", "Room 118", "advisor"],
  ["tyler@melon.test", "14:30", "Course planning", "melon_call", null, "advisor"],
  ["leo@melon.test", "12:00", "Drop-in", "in_person", "Career center", "coach"],
  ["sam@melon.test", "11:00", "Mock technical interview", "melon_call", null, "coach"],
  ["maya@melon.test", "14:00", "Career fair preparation", "in_person", "Career center, room 3", "coach"],
  ["taylor@melon.test", "16:00", "Mock technical interview", "melon_call", null, "coach"],
  ["priya@melon.test", "15:30", "Mock behavioral interview", "teams", null, "coach"],
  ["ava@melon.test", "09:00", "Resume, cover letter or portfolio review", "in_person", "Career center, room 3", "coach"],
  ["omar@melon.test", "16:30", "Internship search", "teams", null, "coach"],
];

/** Answers behind the demo roadmaps for the students who've already finished onboarding. */
export const SEED_DONE_ANSWERS: Record<string, { answers: Record<string, string>; target_roles: string[] }> = {
  "maya@melon.test": { answers: { domain: "machine learning", internship: "applying", linkedin_status: "basic" }, target_roles: ["Data analyst", "ML engineer"] },
  "priya@melon.test": { answers: { search_stage: "interviewing", linkedin_status: "basic" }, target_roles: ["Financial analyst", "Consultant", "Investment associate"] },
  "taylor@melon.test": { answers: { domain: "web apps", internship: "applying", linkedin_status: "strong" }, target_roles: ["Software engineer", "Product manager"] },
};

type Course = [code: string, title: string, term: string, status: "completed" | "in_progress"];
type Job = { title: string; org: string | null; start: string; end: string };

/**
 * Invented history for the road on the Roadmap tab: courses as if from school records, and jobs, research
 * and projects as if read from each student's resume. Seniors and juniors get a full road; freshmen start fresh.
 */
export const SEED_HISTORY: Record<string, { courses: Course[]; experience: Job[]; clubs: string[]; events?: Array<[title: string, iso: string]> }> = {
  "maya@melon.test": {
    courses: [
      ["CSCI-C 200", "Intro to Programming", "Fall 2024", "completed"],
      ["STAT-S 350", "Statistics I", "Fall 2024", "completed"],
      ["CSCI-C 343", "Data Structures", "Spring 2025", "completed"],
      ["MATH-M 301", "Linear Algebra", "Spring 2025", "completed"],
      ["INFO-I 308", "Databases", "Fall 2025", "completed"],
      ["STAT-S 352", "Statistics II", "Spring 2026", "completed"],
      ["CSCI-B 365", "Intro to Machine Learning", "Fall 2026", "in_progress"],
    ],
    experience: [
      { title: "Research Assistant", org: "IU Social Media Lab", start: "Jan 2025", end: "May 2025" },
      { title: "Data Analytics Intern", org: "Hoosier Health", start: "Jun 2025", end: "Aug 2025" },
      { title: "Bike-Share Demand Model", org: null, start: "Oct 2025", end: "Dec 2025" },
      { title: "Teaching Assistant, STAT-S 350", org: "Indiana University", start: "Jan 2026", end: "May 2026" },
    ],
    clubs: ["Data Science Club"],
  },
  "taylor@melon.test": {
    courses: [
      ["CSCI-C 200", "Intro to Programming", "Fall 2024", "completed"],
      ["CSCI-C 211", "Intro to Computer Science", "Spring 2025", "completed"],
      ["CSCI-C 343", "Data Structures", "Fall 2025", "completed"],
      ["INFO-I 300", "Human-Computer Interaction", "Spring 2026", "completed"],
      ["CSCI-P 465", "Software Engineering I", "Fall 2026", "in_progress"],
    ],
    experience: [
      { title: "CourseMate (course-planner web app)", org: null, start: "Jan 2026", end: "Apr 2026" },
      { title: "Software Engineering Intern", org: "Hoosier Logistics", start: "May 2026", end: "Aug 2026" },
    ],
    clubs: ["Computer Science Club"],
  },
  "priya@melon.test": {
    courses: [
      ["BUS-A 100", "Basic Accounting Skills", "Fall 2023", "completed"],
      ["ECON-E 201", "Intro to Microeconomics", "Fall 2023", "completed"],
      ["BUS-K 201", "The Computer in Business", "Spring 2024", "completed"],
      ["BUS-F 370", "Integrated Core: Finance", "Fall 2024", "completed"],
      ["BUS-F 303", "Intermediate Investments", "Spring 2025", "completed"],
      ["BUS-F 305", "Intermediate Corporate Finance", "Fall 2025", "completed"],
      ["BUS-F 420", "Equity Valuation", "Spring 2026", "completed"],
      ["BUS-F 446", "Bank Management", "Fall 2026", "in_progress"],
    ],
    experience: [
      { title: "Peer Tutor, Accounting", org: "Academic Support Center", start: "Jan 2024", end: "May 2024" },
      { title: "Treasurer, Finance Club", org: null, start: "Sep 2024", end: "Present" },
      { title: "Summer Analyst Intern", org: "Midwest Regional Bank", start: "Jun 2025", end: "Aug 2025" },
      { title: "Investment Banking Summer Analyst", org: "Hoosier Capital Partners", start: "Jun 2026", end: "Aug 2026" },
    ],
    clubs: ["Finance Club"],
    events: [
      ["Fall career fair", "2024-09-19T16:00:00Z"],
      ["Spring career fair", "2025-02-26T17:00:00Z"],
      ["Alumni networking night", "2025-10-07T23:00:00Z"],
    ],
  },
  "sam@melon.test": {
    courses: [
      ["CSCI-C 211", "Intro to Computer Science", "Fall 2024", "completed"],
      ["CSCI-C 212", "Intro to Software Systems", "Spring 2025", "completed"],
      ["CSCI-C 343", "Data Structures", "Fall 2025", "completed"],
      ["CSCI-C 241", "Discrete Structures", "Spring 2026", "completed"],
      ["CSCI-P 436", "Intro to Operating Systems", "Fall 2026", "in_progress"],
    ],
    experience: [
      { title: "IT Help Desk Assistant", org: "University IT Services", start: "Jan 2025", end: "Present" },
      { title: "Campus Events App", org: null, start: "Sep 2025", end: "Dec 2025" },
    ],
    clubs: ["Computer Science Club"],
    events: [["Spring career fair", "2026-02-25T17:00:00Z"]],
  },
};

/**
 * What Maya did in earlier semesters, so her candy road has something to be proud of. Terms count back from
 * the demo year: -2 is her freshman fall, -1 her freshman spring and sophomore fall, 0 her sophomore spring.
 * "student" rows are things she added herself. Courses stay off the road on purpose.
 */
export const SEED_MAYA_WINS: Array<{
  season: "Spring" | "Fall";
  yearOffset: number;
  month: number;
  kind: string;
  title: string;
  description: string;
  outcomes: string[];
  source: "system" | "student";
}> = [
  { season: "Fall", yearOffset: -2, month: 9, kind: "skill", title: "Explore career paths for Luddy majors", description: "Looked into what data analysts, data scientists and software engineers actually do day to day.", outcomes: ["Picked data analyst as the role to test first", "Learned which skills each role needs"], source: "system" },
  { season: "Fall", yearOffset: -2, month: 9, kind: "networking", title: "Join the Data Science Club", description: "Joined the club and went to the weekly meetups.", outcomes: ["Met students a year or two ahead of you", "Found your first project team"], source: "system" },
  { season: "Fall", yearOffset: -2, month: 11, kind: "skill", title: "Set up LinkedIn and GitHub", description: "Set up profiles so recruiters and teammates can find your work.", outcomes: ["A profile recruiters can find", "A place to show your projects"], source: "system" },
  { season: "Spring", yearOffset: -1, month: 2, kind: "experience", title: "Research Assistant @ IU Social Media Lab", description: "Helped clean and analyze social media data at the IU Social Media Lab.", outcomes: ["Your first real research experience", "Practiced Python on messy, real data"], source: "student" },
  { season: "Spring", yearOffset: -1, month: 4, kind: "project", title: "Build a small project with real data", description: "Built a small project from start to finish with a real dataset.", outcomes: ["Your first portfolio piece", "Got comfortable with pandas"], source: "system" },
  { season: "Spring", yearOffset: -1, month: 6, kind: "experience", title: "Data Analytics Intern @ Hoosier Health", description: "Spent the summer as a data analytics intern at Hoosier Health.", outcomes: ["Built dashboards a real team used", "A strong first line on your resume"], source: "student" },
  { season: "Fall", yearOffset: -1, month: 10, kind: "skill", title: "Learn SQL on a Forage job simulation", description: "Finished a Forage job simulation built around questions a real analyst gets.", outcomes: ["Wrote SQL on a real-world dataset", "A completion certificate to share"], source: "system" },
  { season: "Fall", yearOffset: -1, month: 12, kind: "certification", title: "Earn the Google Data Analytics certificate", description: "Finished the Google Data Analytics certificate online.", outcomes: ["Proof of skills you can link to", "Covered spreadsheets, SQL and Tableau"], source: "system" },
  { season: "Spring", yearOffset: 0, month: 2, kind: "event", title: "Go to the Spring Career Fair", description: "Went to the Spring Career Fair with your first resume.", outcomes: ["Talked to 4 employers", "Learned what recruiters ask sophomores"], source: "system" },
  { season: "Spring", yearOffset: 0, month: 3, kind: "project", title: "Hackathon with the Data Science Club", description: "Built a project in 24 hours with your club team.", outcomes: ["Shipped a working demo", "Practiced teamwork under a deadline"], source: "student" },
  { season: "Spring", yearOffset: 0, month: 4, kind: "networking", title: "1:1 call with a Luddy alum", description: "Talked with a Luddy alum who works as a data analyst.", outcomes: ["Learned what the job is really like", "A contact who offered to refer you later"], source: "system" },
];

export const SEED_REWARDS = [
  { name: "Sticker pack", description: "Have 3 appointments with your advisor or coach", rule: { kind: "sessions", count: 3 }, sort: 1 },
  { name: "Career Fair cap", description: "Go to 3 career events this semester", rule: { kind: "events", count: 3 }, sort: 2 },
  { name: "Melon hoodie", description: "A 6-week streak of doing one thing for your career", rule: { kind: "streak_weeks", count: 6 }, sort: 3 },
];

export const SEED_INTEGRATIONS = [
  { system: "handshake", enabled: true, status_note: "Mock data · CSV import ready" },
  { system: "teams", enabled: true, status_note: "Needs IT admin consent for live data" },
  { system: "calendar", enabled: true, status_note: "Mock · .ics export works" },
  { system: "stellic", enabled: false, status_note: "Mock · CSV import ready" },
  { system: "canvas", enabled: false, status_note: "Needs a school developer key" },
] as const;

/**
 * Taylor's story: a junior who has used Melon since her first semester, so the road shows almost every milestone
 * from the Luddy four-year career guide, each with the action items she finished to get there.
 * Milestone titles match the guide's wording in the past tense; action item kinds keep them off the road.
 */
export const SEED_TAYLOR_STORY: Array<{
  season: "Spring" | "Fall";
  yearOffset: number;
  month: number;
  /** Day of the month her first action item for it was done (default the 2nd). */
  day?: number;
  milestone: { kind: string; title: string; description: string; outcomes: string[] };
  tasks: Array<[kind: string, title: string]>;
}> = [
  {
    season: "Fall",
    yearOffset: -2,
    month: 10,
    milestone: {
      kind: "project",
      title: "Finished your first college resume",
      description: "One page, reviewed by a coach, and on Handshake.",
      outcomes: ["A resume ready for the spring fair", "Learned to lead every bullet with a verb"],
    },
    tasks: [
      ["skill", "Write your college resume"],
      ["coaching", "Get your resume reviewed by a career coach"],
      ["skill", "Upload your resume to Handshake"],
      ["skill", "Set up LinkedIn with a free headshot"],
    ],
  },
  {
    season: "Fall",
    yearOffset: -2,
    month: 11,
    milestone: {
      kind: "networking",
      title: "Joined the Computer Science Club @ IU",
      description: "Weekly meetings and a project team.",
      outcomes: ["Found friends a year ahead in CS", "Your first hackathon team"],
    },
    tasks: [
      ["skill", "Browse clubs on BeInvolved"],
      ["skill", "Go to two club meetings"],
    ],
  },
  {
    season: "Spring",
    yearOffset: -1,
    month: 2,
    milestone: {
      kind: "event",
      title: "Went to the Spring Career Fair",
      description: "Your first career fair.",
      outcomes: ["Talked to 5 employers", "Learned what they want from freshmen"],
    },
    tasks: [
      ["event", "Register for the Spring Career Fair in Handshake"],
      ["networking", "Career fair strategy: pick 5 employers to meet"],
      ["event", "Elevator pitch: 30 seconds about you"],
    ],
  },
  {
    season: "Fall",
    yearOffset: -1,
    month: 9,
    milestone: {
      kind: "event",
      title: "Went to the Fall Career Fair",
      description: "Your second fair, with a sharper pitch.",
      outcomes: ["Talked to 8 employers", "2 recruiters asked you to apply"],
    },
    tasks: [
      ["event", "Register for the Fall Career Fair in Handshake"],
      ["networking", "Career fair strategy: pick 5 employers to meet"],
      ["event", "Elevator pitch: 30 seconds about you"],
      ["coaching", "Resume review before the fair"],
    ],
  },
  {
    season: "Fall",
    yearOffset: -1,
    month: 11,
    milestone: {
      kind: "certification",
      title: "Earned the LinkedIn Learning Python Essential Training certificate",
      description: "Finished it in four weekends.",
      outcomes: ["A certificate on your LinkedIn", "Python you use in class every week"],
    },
    tasks: [
      ["skill", "Pick a LinkedIn Learning certificate course"],
      ["skill", "Finish the certificate course"],
    ],
  },
  {
    season: "Spring",
    yearOffset: 0,
    month: 4,
    milestone: {
      kind: "project",
      title: "Built CourseMate, a course-planner web app",
      description: "A portfolio project, start to finish, on GitHub.",
      outcomes: ["Your first portfolio piece", "Used by 40 classmates"],
    },
    tasks: [
      ["skill", "Pick a project that excites you"],
      ["skill", "Finish and publish the project on GitHub"],
    ],
  },
  {
    season: "Spring",
    yearOffset: 0,
    month: 5,
    milestone: {
      kind: "experience",
      title: "Software Engineering Intern @ Hoosier Logistics",
      description: "Summer internship on the routing team.",
      outcomes: ["Shipped 3 features to production", "A return offer conversation for next summer"],
    },
    tasks: [
      ["skill", "Research companies that hire Luddy interns"],
      ["application", "Apply to 6 software internships"],
      ["coaching", "Mock interview for internships"],
    ],
  },
  {
    season: "Fall",
    yearOffset: 0,
    month: 8,
    day: 25,
    milestone: {
      kind: "networking",
      title: "Became events lead of the Computer Science Club",
      description: "Elected at the first meeting of the year.",
      outcomes: ["You run the club's speaker series"],
    },
    tasks: [["skill", "Run for a role in your club"]],
  },
];
