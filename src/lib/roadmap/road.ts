import { termOrder } from "./semester.ts";

// The candy road on the Roadmap page: one stop per semester from the first term to graduation, a fork in
// junior fall where the student picks a path, and a flag on the road for everything they did or plan to do.
// This file is the plain math (which semesters, where each flag sits, where its label fits). The drawing
// and the walking student live in components/student/CandyRoad.tsx.

export const ROAD_W = 1140; // the road's own coordinate space; the component scales it to fit
const XL = 430;
const XR = 690;
const GAP = 150; // a closed semester
const FORK_GAP = 170; // from the fork to the next semester
const STEP_PX = 5; // spacing of the sampled road, used for walking and hit tests

export type Pt = { x: number; y: number };

// ---------------------------------------------------------------- semesters

function addTerms(term: string, n: number): string {
  const m = term.match(/^(Spring|Fall) (\d{4})$/);
  if (!m) return term;
  let idx = Number(m[2]) * 2 + (m[1] === "Fall" ? 1 : 0) + n;
  const year = Math.floor(idx / 2);
  idx -= year * 2;
  return `${idx === 1 ? "Fall" : "Spring"} ${year}`;
}

/** "May 2028" or "Spring 2028" → "Spring 2028"; "Dec 2027" → "Fall 2027". */
export function gradTermOf(label: string | null): string | null {
  if (!label) return null;
  const t = label.match(/^(Spring|Fall) (\d{4})$/);
  if (t) return label;
  const m = label.match(/^([A-Za-z]{3})[a-z]* (\d{4})$/);
  if (!m) return null;
  const month = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(m[1].toLowerCase());
  if (month < 0) return null;
  return month <= 6 ? `Spring ${m[2]}` : `Fall ${m[2]}`;
}

const YEARS_IN: Record<string, number> = { freshman: 0, sophomore: 1, junior: 2, senior: 3, grad: 0 };
const UNDERGRAD = ["Freshman", "Freshman", "Sophomore", "Sophomore", "Junior", "Junior", "Senior", "Senior"];
const GRAD = ["Year 1", "Year 1", "Year 2", "Year 2"];

export type SemesterSlot = { term: string; year: string };

/**
 * The student's semesters, oldest first: 8 for undergrads, 4 for grad students, ending at the expected
 * graduation term. If that date is missing or doesn't contain today, it counts from the class year instead.
 */
export function semestersFor(classYear: string | null, expectedGrad: string | null, currentTerm: string): SemesterSlot[] {
  const grad = classYear === "grad";
  const labels = grad ? GRAD : UNDERGRAD;
  const n = labels.length;
  const end = gradTermOf(expectedGrad);
  let start = end ? addTerms(end, -(n - 1)) : null;
  const inside = (s: string) => termOrder(currentTerm) >= termOrder(s) && termOrder(currentTerm) <= termOrder(addTerms(s, n - 1));
  if (!start || !inside(start)) {
    const isFall = currentTerm.startsWith("Fall");
    start = addTerms(currentTerm, -((YEARS_IN[classYear ?? "freshman"] ?? 0) * 2 + (isFall ? 0 : 1)));
  }
  return labels.map((year, i) => ({ term: addTerms(start!, i), year }));
}

/** The semester a date falls in: January to June is spring, the rest is fall (summer counts toward fall). */
export function termOfDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getUTCMonth() <= 5 ? "Spring" : "Fall"} ${d.getUTCFullYear()}`;
}

/** Which slot a step belongs to. Done steps without a term go where they were finished. */
export function slotFor(slots: SemesterSlot[], term: string | null, completedAt: string | null, currentTerm: string): number {
  const t = term && /^(Spring|Fall) \d{4}$/.test(term) ? term : term?.startsWith("Summer ") ? `Fall ${term.slice(7)}` : completedAt ? termOfDate(completedAt) : currentTerm;
  const r = termOrder(t);
  if (r <= termOrder(slots[0].term)) return 0;
  for (let i = slots.length - 1; i >= 0; i--) if (r >= termOrder(slots[i].term)) return i;
  return 0;
}

/** Where the fork goes: after junior fall for undergrads, after the first term for grad students. */
export const forkAfter = (n: number) => (n >= 8 ? 4 : 0);

// ---------------------------------------------------------------- icons

export const ICONS: Record<string, string> = {
  tent: "M2 21 L12 6 L22 21 Z M12 6 L12 21 M9 21 L12 15 L15 21 M12 6 L12 2 L16 3.5 L12 5",
  coffee: "M4 9 H16 V14 A4 4 0 0 1 12 18 H8 A4 4 0 0 1 4 14 Z M16 10 H18 A2 2 0 0 1 18 14 H16 M8 3 V6 M12 3 V6 M3 21 H17",
  club: "M9 11 A3 3 0 1 0 9 5 A3 3 0 0 0 9 11 Z M3 20 A6 6 0 0 1 15 20 M16 5 A3 3 0 0 1 16 11 M18 14 A5 5 0 0 1 21 20",
  job: "M3 8 H21 V19 H3 Z M8 8 V5 H16 V8 M3 13 H21",
  code: "M4 5 H20 V15 H4 Z M2 19 H22 M10 8 L8 10 L10 12 M14 8 L16 10 L14 12",
  mic: "M12 3 A3 3 0 0 1 15 6 V11 A3 3 0 0 1 9 11 V6 A3 3 0 0 1 12 3 Z M6 11 A6 6 0 0 0 18 11 M12 17 V21 M9 21 H15",
  doc: "M6 3 H15 L19 7 V21 H6 Z M14 3 V8 H19 M9 12 H16 M9 16 H16",
  trophy: "M7 4 H17 V8 A5 5 0 0 1 7 8 Z M7 6 H4 A3 3 0 0 0 7 10 M17 6 H20 A3 3 0 0 1 17 10 M12 13 V17 M8 21 H16 M9 17 H15 V21",
  chat: "M4 5 H20 V16 H10 L5 20 V16 H4 Z M8 9 H16 M8 12 H13",
  link: "M10 14 A4 4 0 0 0 15.6 14 L18.6 11 A4 4 0 0 0 13 5.4 L12 6.4 M14 10 A4 4 0 0 0 8.4 10 L5.4 13 A4 4 0 0 0 11 18.6 L12 17.6",
  compass: "M12 3 A9 9 0 1 0 12 21 A9 9 0 1 0 12 3 Z M15.5 8.5 L13.5 13.5 L8.5 15.5 L10.5 10.5 Z",
  flask: "M9 3 H15 M10 3 V9 L5 18 A2 2 0 0 0 7 21 H17 A2 2 0 0 0 19 18 L14 9 V3 M7 15 H17",
  send: "M3 11 L21 3 L13 21 L11 13 Z M11 13 L21 3",
  star: "M12 3 L14.6 8.6 L20.7 9.3 L16.2 13.4 L17.4 19.5 L12 16.5 L6.6 19.5 L7.8 13.4 L3.3 9.3 L9.4 8.6 Z",
  plus: "M12 5 V19 M5 12 H19",
  sign: "M12 2 V22 M12 4.5 H19.5 L22 7.5 L19.5 10.5 H12 M12 12.5 H4.5 L2 15.5 L4.5 18.5 H12 M8.5 22 H15.5",
};

/** A small picture for a step, from its kind and a few words in its title. */
export function iconFor(kind: string, title: string): string {
  const t = title.toLowerCase();
  if (/fair/.test(t)) return "tent";
  if (/linkedin|github|portfolio site|headshot/.test(t)) return "link";
  if (/resume|cover letter/.test(t)) return "doc";
  if (/coffee|alum|mentor|1:1/.test(t)) return "coffee";
  if (/club|meetup/.test(t)) return "club";
  if (/research|lab/.test(t)) return "flask";
  if (/hackathon|certificat|award/.test(t)) return "trophy";
  return (
    { experience: "job", project: "code", skill: "compass", certification: "trophy", event: "mic", networking: "club", application: "send", coaching: "chat" } as Record<string, string>
  )[kind] ?? "star";
}

// ---------------------------------------------------------------- the road

export type RoadInput = {
  /** Flags per semester, counting the "add something you did" flag when there is one. */
  counts: number[];
  open: boolean[];
  fork: number;
  /** Index of the current semester, and how many of its flags (in order) are done. */
  current: number;
  doneInCurrent: number;
  /** Whether the current semester ends in an "add" flag (so the student stands before it). */
  addInCurrent: boolean;
  spurs: number;
};

export type Road = {
  S: Pt[];
  nodeIdx: number[];
  nodes: Pt[];
  itemIdx: number[][];
  fork: Pt & { idx: number };
  goal: Pt & { idx: number };
  spurEnds: Pt[];
  rest: number;
  H: number;
  paths: { all: string; past: string; future: string; chosen: string; spurs: string[] };
  mid: Pt;
};

export function buildRoad(input: RoadInput): Road {
  const n = input.counts.length;
  // Points along the road: semesters up to the fork, the fork, the rest of the semesters, the first-job goal.
  const kinds: Array<{ sem: number } | { fork: true } | { goal: true }> = [];
  for (let k = 0; k < n; k++) {
    kinds.push({ sem: k });
    if (k === input.fork) kinds.push({ fork: true });
  }
  kinds.push({ goal: true });
  const P = kinds.length;
  const px = (i: number) => (i % 2 === 0 ? XL : XR);
  const seg: Array<{ L: number; open: boolean; N: number }> = [];
  const py = [130];
  for (let i = 0; i < P - 1; i++) {
    const k = kinds[i];
    let L = "fork" in k ? FORK_GAP : GAP;
    let open = false;
    let N = 0;
    if ("sem" in k) {
      N = input.counts[k.sem];
      open = input.open[k.sem] && N > 0;
      if (open) L = Math.max(240, (N + 1) * 92);
    }
    seg.push({ L, open, N });
    py.push(py[i] + L);
  }

  const dense = (i: number): Pt[] => {
    const a = { x: px(i), y: py[i] };
    const b = { x: px(i + 1), y: py[i + 1] };
    const s = seg[i];
    const out: Pt[] = [];
    if (!s.open) {
      for (let j = 0; j <= 200; j++) {
        const t = j / 200;
        const u = 1 - t;
        out.push({
          x: u * u * u * a.x + 3 * u * u * t * a.x + 3 * u * t * t * b.x + t * t * t * b.x,
          y: u * u * u * a.y + 3 * u * u * t * (a.y + 60) + 3 * u * t * t * (b.y - 60) + t * t * t * b.y,
        });
      }
    } else {
      // An open semester winds back and forth so its flags have room. An odd number of half-waves lands on the next stop.
      let m = Math.max(1, Math.round(s.L / 230));
      if (m % 2 === 0) m += 1;
      for (let j = 0; j <= 500; j++) {
        const t = j / 500;
        out.push({ x: a.x + ((b.x - a.x) * (1 - Math.cos(Math.PI * m * t))) / 2, y: a.y + s.L * t });
      }
    }
    return out;
  };

  const S: Pt[] = [];
  const ptIdx: number[] = [];
  const segStart: number[] = [];
  const segEnd: number[] = [];
  for (let i = 0; i < P - 1; i++) {
    const D = dense(i);
    const cum = [0];
    for (let j = 1; j < D.length; j++) cum.push(cum[j - 1] + Math.hypot(D[j].x - D[j - 1].x, D[j].y - D[j - 1].y));
    const tot = cum[cum.length - 1];
    const cnt = Math.max(1, Math.round(tot / STEP_PX));
    segStart.push(S.length);
    ptIdx.push(S.length);
    let j = 0;
    for (let c = 0; c < cnt; c++) {
      const tg = (tot * c) / cnt;
      while (j < cum.length - 2 && cum[j + 1] < tg) j++;
      const f = (tg - cum[j]) / (cum[j + 1] - cum[j] || 1);
      // Rounded so the server and the browser draw the same numbers.
      S.push({ x: Math.round((D[j].x + (D[j + 1].x - D[j].x) * f) * 10) / 10, y: Math.round((D[j].y + (D[j + 1].y - D[j].y) * f) * 10) / 10 });
    }
    segEnd.push(S.length);
  }
  S.push({ x: px(P - 1), y: py[P - 1] });
  ptIdx.push(S.length - 1);

  const nodeIdx: number[] = [];
  const itemIdx: number[][] = [];
  let forkPt = 0;
  kinds.forEach((k, i) => {
    if ("sem" in k) {
      nodeIdx.push(ptIdx[i]);
      const s = seg[i];
      const list: number[] = [];
      if (s?.open) for (let j = 0; j < s.N; j++) list.push(segStart[i] + Math.round(((j + 1) / (s.N + 1)) * (segEnd[i] - segStart[i])));
      itemIdx.push(list);
    } else if ("fork" in k) forkPt = i;
  });
  const fork = { x: px(forkPt), y: py[forkPt], idx: ptIdx[forkPt] };
  const goal = { x: px(P - 1), y: py[P - 1], idx: S.length - 1 };

  // Where the student stands: between what's done and what's next in the current semester.
  const cur = input.current;
  const items = itemIdx[cur] ?? [];
  let rest = nodeIdx[cur];
  if (items.length) {
    const d = input.doneInCurrent;
    const real = items.length - (input.addInCurrent ? 1 : 0);
    if (d <= 0) rest = Math.max(nodeIdx[cur], items[0] - 12);
    else if (d < real) rest = Math.round((items[d - 1] + items[d]) / 2);
    else rest = Math.round((items[real - 1] + (items[real] ?? segEnd[kinds.findIndex((k) => "sem" in k && k.sem === cur)])) / 2);
  }

  const side = fork.x >= (XL + XR) / 2 ? 1 : -1;
  const spurEnds: Pt[] = Array.from({ length: input.spurs }, (_, i) => ({ x: fork.x + side * 170, y: fork.y + 70 + i * 98 }));
  const spurPath = (e: Pt) => `M ${fork.x} ${fork.y} C ${fork.x + side * 90} ${fork.y} ${e.x - side * 90} ${e.y} ${e.x} ${e.y}`;
  const poly = (a: number, b: number) => {
    if (b <= a) return "";
    let s = "";
    for (let i = a; i <= b; i++) s += `${i === a ? "M" : " L"} ${S[i].x.toFixed(1)} ${S[i].y.toFixed(1)}`;
    return s;
  };
  const midIdx = Math.round((fork.idx + ptIdx[forkPt + 1]) / 2);

  return {
    S,
    nodeIdx,
    nodes: nodeIdx.map((i) => S[i]),
    itemIdx,
    fork,
    goal,
    spurEnds,
    rest,
    H: goal.y + 170,
    paths: {
      all: poly(0, S.length - 1),
      past: poly(0, rest),
      future: rest < fork.idx ? poly(rest, fork.idx) : "",
      chosen: poly(Math.max(rest, fork.idx), S.length - 1),
      spurs: spurEnds.map(spurPath),
    },
    mid: S[midIdx],
  };
}

// ---------------------------------------------------------------- labels

export type Box = { x: number; y: number; w: number; h: number };
export type LabelSpot = { x: number; y: number; w: number; h: number; side: "L" | "R" };

/** A rough width for a label: 14px bold title over a 12px line. Long titles wrap to two lines inside 230px. */
export function labelSize(title: string, sub: string) {
  const est = Math.max(title.length * 7.8, sub.length * 6.4) + 6;
  return { w: Math.min(230, Math.ceil(est)), h: est > 230 ? 58 : 40 };
}

/**
 * Finds a spot for every flag's label that doesn't touch the road, the buttons, or another label.
 * It tries beside the flag first (on the outer side of the road), then further out, then above or below.
 */
export function placeLabels(road: Road, flags: Array<{ at: Pt; title: string; sub: string }>, extra: Box[], pill: { w: number; h: number }) {
  const pts = road.S.slice();
  road.spurEnds.forEach((e) => {
    const f = road.fork;
    const side = e.x > f.x ? 1 : -1;
    for (let i = 0; i <= 40; i++) {
      const t = i / 40;
      const u = 1 - t;
      const b = { x: f.x + side * 90, y: f.y };
      const c = { x: e.x - side * 90, y: e.y };
      pts.push({ x: u * u * u * f.x + 3 * u * u * t * b.x + 3 * u * t * t * c.x + t * t * t * e.x, y: u * u * u * f.y + 3 * u * u * t * b.y + 3 * u * t * t * c.y + t * t * t * e.y });
    }
  });
  const boxes: Box[] = [...extra];
  flags.forEach((f) => boxes.push({ x: f.at.x - 14, y: f.at.y - 54, w: 54, h: 60 }));
  const hitsRoad = (b: Box) => {
    let n = 0;
    for (let i = 0; i < pts.length; i += 2) {
      const q = pts[i];
      if (q.y < b.y - 40 || q.y > b.y + b.h + 40) continue;
      const dx = Math.max(b.x - q.x, 0, q.x - (b.x + b.w));
      const dy = Math.max(b.y - q.y, 0, q.y - (b.y + b.h));
      if (dx * dx + dy * dy < 24 * 24) n++;
    }
    return n;
  };
  const overlaps = (b: Box) => boxes.reduce((n, o) => n + (b.x < o.x + o.w && b.x + b.w > o.x && b.y < o.y + o.h && b.y + b.h > o.y ? 1 : 0), 0);
  const pick = <T extends Box>(cands: T[]): T => {
    let best = cands[0];
    let bs = Infinity;
    cands.forEach((c, i) => {
      let sc = hitsRoad(c) * 100 + overlaps(c) * 40 + i;
      if (c.x < 4 || c.x + c.w > ROAD_W - 4) sc += 5000;
      if (sc < bs) {
        bs = sc;
        best = c;
      }
    });
    boxes.push({ x: best.x, y: best.y, w: best.w, h: best.h });
    return best;
  };
  const tiers: Array<[number, number, number]> = [
    [-46, 44, 24],
    [-46, 90, 70],
    [-98, 44, 24],
    [6, 44, 24],
    [-46, 150, 130],
    [-150, 44, 24],
    [58, 44, 24],
  ];
  const mid = (XL + XR) / 2;
  const labels: LabelSpot[] = flags.map((f) => {
    const { w, h } = labelSize(f.title, f.sub);
    const cands: LabelSpot[] = [];
    tiers.forEach(([dy, r, l]) => {
      const R: LabelSpot = { side: "R", x: f.at.x + r, y: f.at.y + dy, w, h };
      const L: LabelSpot = { side: "L", x: f.at.x - l - w, y: f.at.y + dy, w, h };
      if (f.at.x >= mid) cands.push(R, L);
      else cands.push(L, R);
    });
    return pick(cands);
  });
  const m = road.mid;
  const pillSpot = pick([
    { x: m.x - 34 - pill.w, y: m.y - 15, ...pill },
    { x: m.x + 34, y: m.y - 15, ...pill },
    { x: m.x - 34 - pill.w, y: m.y - 60, ...pill },
    { x: m.x + 34, y: m.y + 20, ...pill },
    { x: m.x - 60 - pill.w, y: m.y + 20, ...pill },
    { x: m.x + 60, y: m.y - 60, ...pill },
  ]);
  return { labels, pill: { x: pillSpot.x, y: pillSpot.y }, hitsRoad };
}

export const ROAD_X = { left: XL, right: XR, mid: (XL + XR) / 2 };
