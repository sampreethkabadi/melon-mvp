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
};

export const SEED_STUDENTS: SeedStudent[] = [
  { email: "leo@melon.test", full_name: "Leo Martinez", class_year: "freshman", program: "Exploratory", majors: ["Exploring majors"], minors: [], expected_grad_term: "May 2030", interests: ["unsure", "ux"], onboarding_step: "resume" },
  { email: "ava@melon.test", full_name: "Ava Chen", class_year: "sophomore", program: "B.S. Informatics", majors: ["Informatics"], minors: ["Business"], expected_grad_term: "May 2029", interests: ["ux", "soft"], onboarding_step: "resume" },
  { email: "maya@melon.test", full_name: "Maya Patel", class_year: "junior", program: "B.S. Data Science", majors: ["Data Science"], minors: ["Business"], expected_grad_term: "May 2028", interests: ["data", "soft"], onboarding_step: "done" },
  { email: "sam@melon.test", full_name: "Sam Okafor", class_year: "junior", program: "B.S. Computer Science", majors: ["Computer Science"], minors: [], expected_grad_term: "May 2028", interests: ["soft", "cyber"], onboarding_step: "resume" },
  { email: "priya@melon.test", full_name: "Priya Shah", class_year: "senior", program: "B.S. Business", majors: ["Finance"], minors: ["Economics"], expected_grad_term: "May 2027", interests: ["biz"], onboarding_step: "done" },
  { email: "daniel@melon.test", full_name: "Daniel Kim", class_year: "grad", program: "M.S. Data Science", majors: ["Data Science"], minors: [], expected_grad_term: "May 2027", interests: ["data"], onboarding_step: "resume" },
];

export const SEED_STAFF = [
  { email: "lee@melon.test", full_name: "Dr. Jordan Lee", role: "advisor" as const, title: "Academic advisor" },
  { email: "rivera@melon.test", full_name: "Alex Rivera", role: "coach" as const, title: "Career coach" },
  { email: "admin@melon.test", full_name: "Morgan Hale", role: "admin" as const, title: "Career center admin" },
];

/** Today's sessions for the advisor, as [student email, local time, type, modality, location]. */
export const SEED_APPOINTMENTS: Array<[string, string, string, "in_person" | "teams" | "melon_call", string | null]> = [
  ["leo@melon.test", "09:30", "First meeting", "in_person", "Room 204"],
  ["priya@melon.test", "11:00", "Offer review", "teams", null],
  ["maya@melon.test", "14:00", "Career check-in", "in_person", "Room 204"],
  ["sam@melon.test", "15:30", "Resume review", "melon_call", null],
];

export const SEED_COURSES = [
  ["CSCI-C 200", "Intro to Programming", "Fall 2024", "completed"],
  ["CSCI-C 343", "Data Structures", "Spring 2025", "completed"],
  ["STAT-S 350", "Statistics I", "Fall 2024", "completed"],
  ["MATH-M 301", "Linear Algebra", "Spring 2025", "completed"],
  ["INFO-I 308", "Databases", "Fall 2025", "completed"],
  ["CSCI-B 365", "Intro to Machine Learning", "Fall 2026", "in_progress"],
] as const;

export const SEED_RESOURCES = [
  { type: "skill", title: "SQL window functions", provider: "Free tutorial", interests: ["data"], source: "library" },
  { type: "skill", title: "Log analysis with Python", provider: "Open tutorial", interests: ["cyber", "data"], source: "melon" },
  { type: "skill", title: "Kaggle Learn: Intro to Machine Learning", provider: "Kaggle · 7 lessons", interests: ["data"], source: "library" },
  { type: "skill", title: "Telling a story with data", provider: "Library video · 12 min", interests: ["data", "biz"], source: "library" },
  { type: "skill", title: "Build a tiny webpage in 1 hour", provider: "Free coding lesson", interests: ["soft", "unsure"], source: "library" },
  { type: "certification", title: "Google Data Analytics", provider: "Coursera · student financial aid", interests: ["data"], source: "library" },
  { type: "certification", title: "CompTIA Security+", provider: "Free study guide", interests: ["cyber"], source: "library" },
  { type: "certification", title: "Bloomberg Market Concepts", provider: "Free on campus", interests: ["biz"], source: "library" },
  { type: "event", title: "Fall Career Fair", provider: "On campus", interests: ["data", "soft", "biz", "cyber", "ux"], source: "handshake" },
  { type: "event", title: "Cyber Club beginner CTF night", provider: "On campus", interests: ["cyber"], source: "handshake" },
  { type: "event", title: "DS Club Industry Night", provider: "On campus", interests: ["data"], source: "handshake" },
  { type: "event", title: "Majors & Minors Fair", provider: "On campus", interests: ["unsure"], source: "handshake" },
  { type: "course", title: "Applied Machine Learning", provider: "Course catalog", interests: ["data"], source: "library" },
  { type: "course", title: "Network Security Basics", provider: "Course catalog", interests: ["cyber"], source: "library" },
  { type: "course", title: "Design Basics", provider: "Course catalog", interests: ["ux", "arts"], source: "library" },
  { type: "coaching", title: "Mock technical interview", provider: "30 min · career center", interests: ["soft", "data", "cyber"], source: "handshake" },
  { type: "coaching", title: "Resume drop-in hours", provider: "Tue + Thu, 1–4 pm", interests: [], source: "library" },
] as const;

export const SEED_REWARDS = [
  { name: "Sticker pack", description: "Have 3 sessions with your advisor or coach", rule: { kind: "sessions", count: 3 }, sort: 1 },
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
