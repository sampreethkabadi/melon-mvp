// Reads profile details out of resume text with plain rules, on our own server. Nothing is sent to an
// outside service. It only prefills a form: the student checks and corrects everything before it's saved.
// Email and phone are left out on purpose, because Melon doesn't need them from the resume.

export type ParsedResume = {
  full_name: string | null;
  program: string | null;
  majors: string[];
  minors: string[];
  expected_grad_term: string | null;
  clubs: string[];
  skills: string[];
  interests: string[];
  links: { linkedin?: string; github?: string; portfolio?: string };
  /** Jobs, research and projects with dates, so the roadmap can place them in the right semester. */
  experience: Array<{ title: string; org: string | null; start: string | null; end: string | null }>;
};

const SECTIONS: Record<string, RegExp> = {
  education: /^(education|academic background)\b/i,
  skills: /^(technical\s+)?skills\b|^technologies\b|^tools\b/i,
  activities: /^(activities|involvement|campus involvement|extracurriculars?|organizations|clubs)\b/i,
  experience: /^(experience|work experience|professional experience|employment|projects?|research(?: experience)?|leadership(?: experience)?)$/i,
  other: /^(awards?|honors|certifications?|publications|volunteer\w*|interests|summary|objective|profile|coursework|relevant coursework)\b/i,
};

// Keyword clues for each career interest. Word-bounded, so "r" and "ai" need care: see matches().
const INTEREST_CLUES: Record<string, string[]> = {
  data: ["data science", "data analysis", "data analyst", "machine learning", "pandas", "sql", "tableau", "statistics", "power bi"],
  cyber: ["cybersecurity", "cyber security", "network security", "penetration testing", "security+", "ctf", "wireshark"],
  soft: ["software", "computer science", "java", "javascript", "typescript", "react", "c++", "web development", "git"],
  ux: ["ux", "user experience", "figma", "human-computer interaction", "interaction design", "product design"],
  biz: ["finance", "accounting", "marketing", "consulting", "economics", "business", "kelley", "investment"],
  health: ["public health", "nursing", "pre-med", "biology", "healthcare", "kinesiology", "clinical"],
  arts: ["graphic design", "journalism", "media", "film", "fine arts", "photography", "creative writing"],
};

const TERM = /\b(Spring|Summer|Fall|Winter|Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+(20\d{2})\b/gi;
// Spaces only, never line breaks, and ", MA" is a state rather than a degree.
const DEGREE = /(?<!, )\b(B\.? ?S\.?|B\.? ?A\.?|BBA|B\.? ?F\.? ?A\.?|M\.? ?S\.?|M\.? ?A\.?|MBA|Ph\.? ?D\.?|Bachelor(?:'s)?(?: of [A-Z]\w+)?|Master(?:'s)?(?: of [A-Z]\w+)?)(?=[ ,.]|$)(?: (?:degree )?(?:in|of) |,? )([A-Z][A-Za-z&]+(?: (?:and |& |of )?[A-Z][A-Za-z&]+)*)/m;

export function parseResumeText(raw: string): ParsedResume {
  const text = raw.replace(/\r/g, "").replace(/[ \t]+/g, " ");
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const sections = splitSections(lines);
  const education = sections.education.join("\n");

  // "Bachelor of Science" with no field after it names the degree, not a major.
  const match = education.match(DEGREE);
  // "Bachelor of Science in Computer Science Aug 2025 – May 2029": the month isn't part of the major.
  if (match) match[2] = match[2].replace(/\s+(Spring|Summer|Fall|Winter|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*$/i, "");
  const degree = match && !/^(science|arts|fine arts)$/i.test(match[2]) ? match : null;
  const majors = unique([
    ...listAfter(education, /\b(?:double\s+)?majors?\s*(?:in)?\s*[:\-–]?\s*/i),
    ...(degree ? [cleanField(degree[2])] : []),
  ]);
  const minors = unique(listAfter(education, /\bminors?\s*(?:in)?\s*[:\-–]?\s*/i));

  return {
    full_name: findName(lines),
    program: degree ? `${normalizeDegree(degree[1])} ${cleanField(degree[2])}` : null,
    majors,
    minors,
    expected_grad_term: findGradTerm(education || text),
    clubs: sections.activities.map(activityName).filter((c): c is string => Boolean(c)).slice(0, 8),
    skills: findSkills(sections.skills),
    interests: findInterests(text),
    links: findLinks(text),
    experience: findExperience(sections.experience),
  };
}

function splitSections(lines: string[]) {
  const out = { education: [] as string[], skills: [] as string[], activities: [] as string[], experience: [] as string[] };
  let current: string | null = null;
  for (const line of lines) {
    const heading = line.length <= 40 ? Object.keys(SECTIONS).find((k) => SECTIONS[k].test(line.replace(/[:\s]+$/, ""))) : undefined;
    if (heading) {
      current = heading;
      // "Skills: Python, SQL" is a heading and its content on one line.
      const rest = line.split(":").slice(1).join(":").trim();
      if (rest && heading in out) out[heading as keyof typeof out].push(rest);
      continue;
    }
    if (current && current in out) out[current as keyof typeof out].push(line);
  }
  return out;
}

const RANGE = new RegExp(
  `(${TERM.source})\\s*(?:-|–|—|to)\\s*((?:${TERM.source})|present|current|now)`,
  "i",
);
const SINGLE = new RegExp(TERM.source, "i");

/** "Data Analytics Intern  Jun 2025 – Aug 2025" with the employer on the line next to it (or before it). */
function findExperience(lines: string[]): ParsedResume["experience"] {
  const out: ParsedResume["experience"] = [];
  const isBullet = (l: string) => /^[•·▪◦*\-–]/.test(l);
  const stripPlace = (l: string) =>
    l.replace(/\s+(?:(?:West|East|North|South|New|San|Los|Fort|Saint|St\.|Salt|Las|Ann)\s)?[A-Z][a-z]+,\s*[A-Z]{2}$/, "").replace(/\s+(remote|online)$/i, "").trim();
  lines.forEach((line, i) => {
    if (isBullet(line)) return;
    const range = line.match(RANGE);
    const single = range ? null : line.match(SINGLE);
    const hit = range ?? single;
    if (!hit || hit.index === undefined) return;
    let title = line.slice(0, hit.index).replace(/[\s,|–—-]+$/, "").trim();
    const next = lines[i + 1] && !isBullet(lines[i + 1]) && !SINGLE.test(lines[i + 1]) ? stripPlace(lines[i + 1]) : null;
    const prev = lines[i - 1] && !isBullet(lines[i - 1]) && !SINGLE.test(lines[i - 1]) ? stripPlace(lines[i - 1]) : null;
    let org: string | null = next;
    if (!title) {
      title = prev ?? "";
      org = next;
    } else if (title.includes("|")) {
      // A project: "Bike-Share Demand Model | Python, scikit-learn"
      org = null;
    } else if (title.includes(",") && !next) {
      // "Data Intern, Acme Corp, June 2026 - August 2026"
      const [t, ...rest] = title.split(",");
      title = t.trim();
      org = rest.join(",").trim() || null;
    }
    title = title.split("|")[0].trim();
    if (!title || title.length > 80) return;
    const start = range
      ? formatTerm([range[0], range[2], range[3]] as unknown as RegExpMatchArray)
      : formatTerm([hit[0], hit[1], hit[2]] as unknown as RegExpMatchArray);
    const endRaw = range ? range[4] : null;
    const end = range && range[5] && range[6] ? formatTerm([range[4], range[5], range[6]] as unknown as RegExpMatchArray) : endRaw ? "Present" : start;
    out.push({ title, org: org && org.length <= 80 ? org : null, start, end });
  });
  return out.slice(0, 12);
}

function findName(lines: string[]): string | null {
  for (const line of lines.slice(0, 5)) {
    if (/[@\d|]|https?:|www\.|\bresume\b|\bcv\b/i.test(line)) continue;
    const words = line.split(" ");
    if (words.length < 2 || words.length > 4) continue;
    if (!words.every((w) => /^[\p{L}][\p{L}.'’-]*$/u.test(w))) continue;
    if (line === line.toUpperCase()) return words.map((w) => w[0] + w.slice(1).toLowerCase()).join(" ");
    if (words.every((w) => /^\p{Lu}/u.test(w))) return line;
  }
  return null;
}

function listAfter(text: string, label: RegExp): string[] {
  const out: string[] = [];
  for (const line of text.split("\n")) {
    const match = line.match(label);
    if (!match || match.index === undefined) continue;
    // "Minor in Business Aug 2024 – May 2028": stop at the dates.
    const value = line
      .slice(match.index + match[0].length)
      .replace(new RegExp(`\\s(?:${TERM.source}).*$`, "i"), "")
      .split(/[|;•]|\bminors?\b|\bmajors?\b|\bGPA\b/i)[0];
    out.push(...value.split(/,|\s+and\s+|\s+&\s+/).map(cleanField).filter(isField));
  }
  return out;
}

const cleanField = (s: string) => s.replace(/\s+/g, " ").replace(/^[\s,.:–-]+|[\s,.:–-]+$/g, "");
const isField = (s: string) => s.length >= 2 && s.length <= 60 && /^[A-Z]/.test(s) && !/\d/.test(s);

function normalizeDegree(raw: string) {
  const compact = raw.replace(/[.\s]/g, "").toUpperCase();
  const known: Record<string, string> = {
    BS: "B.S.", BA: "B.A.", BBA: "BBA", BFA: "B.F.A.", MS: "M.S.", MA: "M.A.", MBA: "MBA", PHD: "Ph.D.",
    BACHELOROFSCIENCE: "B.S.", BACHELOROFARTS: "B.A.", BACHELOROFFINEARTS: "B.F.A.", MASTEROFSCIENCE: "M.S.", MASTEROFARTS: "M.A.",
  };
  return known[compact] ?? raw.trim();
}

/** Prefers a date marked as expected/anticipated, otherwise the latest date in the education section. */
function findGradTerm(text: string): string | null {
  const marked = text.match(/(?:expected|anticipated|graduat\w*)[^\n]{0,30}/i)?.[0];
  const fromMarked = marked ? [...marked.matchAll(TERM)].at(-1) : undefined;
  if (fromMarked) return formatTerm(fromMarked);
  const all = [...text.matchAll(TERM)];
  if (!all.length) return null;
  return formatTerm(all.reduce((latest, m) => (Number(m[2]) >= Number(latest[2]) ? m : latest)));
}

function formatTerm(m: RegExpMatchArray) {
  return `${m[1][0].toUpperCase()}${m[1].slice(1).toLowerCase()} ${m[2]}`;
}

function activityName(line: string): string | null {
  const clean = line.replace(/^[•·▪◦*\-–]\s*/, "");
  if (clean === line && clean.length > 60) return null; // a sentence, not an activity name
  if (line !== clean && /^[A-Z][a-z]+(ed|ing)\b/.test(clean)) return null; // "Organized 3 events…"
  const name = clean.split(/\s+[|–—-]\s+|,\s|\s{2,}/)[0].trim();
  return name.length >= 3 && name.length <= 50 && /^\p{Lu}/u.test(name) && !/^20\d{2}/.test(name) ? name : null;
}

function findSkills(lines: string[]): string[] {
  const items = lines
    .flatMap((l) => l.replace(/^[•·▪◦*\-–]\s*/, "").replace(/^[A-Z][\w &/]{1,25}:\s*/, "").split(/[,;|•]/))
    .map((s) => s.trim().replace(/\.$/, ""))
    .filter((s) => s.length >= 1 && s.length <= 30);
  return unique(items).slice(0, 25);
}

function findInterests(text: string): string[] {
  const lower = text.toLowerCase();
  const scored = Object.entries(INTEREST_CLUES)
    .map(([id, clues]) => [id, clues.filter((c) => matches(lower, c)).length] as const)
    .filter(([, score]) => score > 0)
    .sort((a, b) => b[1] - a[1]);
  return scored.slice(0, 3).map(([id]) => id);
}

function matches(lower: string, clue: string) {
  const escaped = clue.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9+#])${escaped}($|[^a-z0-9+#])`).test(lower);
}

function findLinks(text: string): ParsedResume["links"] {
  const links: ParsedResume["links"] = {};
  const linkedin = text.match(/(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[\w%-]+/i)?.[0];
  const github = text.match(/(?:https?:\/\/)?(?:www\.)?github\.com\/[\w-]+/i)?.[0];
  if (linkedin) links.linkedin = withScheme(linkedin);
  if (github) links.github = withScheme(github);
  return links;
}

const withScheme = (url: string) => (/^https?:/i.test(url) ? url : `https://${url}`);

function unique(items: string[]) {
  const seen = new Set<string>();
  return items.filter((i) => {
    const key = i.toLowerCase();
    if (!i || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
