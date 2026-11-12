import { INTEREST_COLORS } from "@/components/Backdrop";
import type { RoadItem, RoadPath, RoadSemester } from "@/components/student/CandyRoad";
import { shortDate, shortTerm, TZ } from "@/lib/format";
import { byPlan } from "@/lib/roadmap/focus";
import { CLAIM_KIND, isMilestone, milestoneKey, pastTense, PLANNED, plannedFor, tasksFor, winLabel } from "@/lib/roadmap/milestones";
import { forkAfter, iconFor, semestersFor, slotFor } from "@/lib/roadmap/road";
import type { Path, Step } from "@/lib/student-data";
import type { ClassYear } from "@/lib/types";

// Turns the student's steps and paths into what the candy road draws. Courses stay off the road: it's
// about what students did beyond class. After the fork in junior fall, the road follows the pinned path.

const UNDERGRAD_ZONES = ["Explorer", "Tester", "Getting ready", "Job ready"];
const GRAD_ZONES = ["Getting ready", "Job ready"];

const monthYear = (iso: string) => new Intl.DateTimeFormat("en-US", { timeZone: TZ, month: "short", year: "numeric" }).format(new Date(iso));

function shorten(title: string, max = 44) {
  if (title.length <= max) return title;
  const cut = title.slice(0, max - 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), max - 12)).trimEnd()}…`;
}

export function buildRoadData(input: {
  steps: Step[];
  paths: Path[];
  pinned: Path[];
  isFresh: (p: Path) => boolean;
  year: ClassYear | null;
  gradTerm: string | null;
  term: string;
  limit: number;
  /** This semester's career fair, if there is one, and today's date (both YYYY-MM-DD). */
  fairDate?: string | null;
  today?: string;
}) {
  const slots = semestersFor(input.year, input.gradTerm, input.term);
  const current = Math.max(
    0,
    slots.findIndex((s) => s.term === input.term),
  );
  const fork = forkAfter(slots.length);
  const main = input.pinned[0] ?? null;

  const planWins = new Set(
    PLANNED.flat()
      .flatMap((m) => [pastTense(m.title), main ? pastTense(m.title.replace("your path", main.name)) : ""])
      .filter(Boolean)
      .map((t) => t.toLowerCase()),
  );
  const buckets: Step[][] = slots.map(() => []);
  for (const s of input.steps) {
    // Only finished milestones are flags. Tasks stay on Action items.
    if (s.status !== "done" || !isMilestone(s)) continue;
    const k = slotFor(slots, s.term, s.completed_at, input.term);
    // Past the fork, the road is the pinned path: steps for other paths wait on their own branch.
    if (k > fork && s.path_id && main && s.path_id !== main.id) continue;
    buckets[k].push(s);
  }

  const semesters: RoadSemester[] = slots.map((slot, k) => {
    const status = k < current ? "done" : k === current ? "now" : "next";
    const done = buckets[k].filter((s) => s.status === "done").sort((a, b) => (a.completed_at ?? "").localeCompare(b.completed_at ?? ""));
    const rest = buckets[k].filter((s) => s.status !== "done").sort(byPlan);
    const real: RoadItem[] = [...done, ...rest].map((s) => {
      const state: RoadItem["state"] = s.status === "done" ? "done" : k <= current ? "open" : "planned";
      // A milestone marked done from its flag is part of the plan, not something the student added on the side.
      const fromPlan = planWins.has(s.title.toLowerCase());
      const mine = s.source === "student" && !fromPlan;
      const sub =
        state === "done"
          ? `${mine ? "Added by you · " : ""}${s.completed_at ? monthYear(s.completed_at) : "Done"}`
          : state === "open"
            ? s.due_date
              ? `To do · due ${shortDate(s.due_date)}`
              : "To do this semester"
            : `Planned · ${shortTerm(s.term ?? slot.term)}`;
      const outcomes = (s.outcomes ?? []).filter(Boolean);
      // What the student did to get here: the action items behind this milestone.
      const key = milestoneKey(s, main?.name);
      const did = tasksFor(key, input.steps, s.term ?? slot.term).filter((t) => t.status === "done");
      const summary = did.length
        ? `You finished ${did.length === 1 ? "an action item" : `${did.length} action items`} to get here. Nice work.`
        : s.source === "student"
          ? ""
          : (s.description ?? "");
      return {
        id: s.id,
        label: shorten(winLabel(s)),
        title: winLabel(s),
        icon: iconFor(s.kind, s.title),
        state,
        sub,
        mine,
        about: summary,
        wins: outcomes,
        tasks: did.map((t) => ({ title: t.title, done: true })),
        href: key && k === current ? `/student/tasks?m=${key}` : "/student/tasks",
      };
    });
    // Faded flags: what this semester usually holds, from the four-year guide. This semester's are crimson and
    // can be marked done from the road; past ones you didn't do quietly go away.
    const doneTitles = new Set(real.map((r) => r.title.toLowerCase()));
    const planned: RoadItem[] =
      k < current
        ? []
        : plannedFor(k, slots.length).flatMap((m) => {
            const title = m.path && main ? m.title.replace("your path", main.name) : m.title;
            const win = pastTense(title);
            if (doneTitles.has(win.toLowerCase())) return [];
            if (m.key === "fair" && real.some((r) => /career fair/i.test(r.title))) return [];
            const now = k === current;
            const fairDay = now && m.dated ? (input.fairDate ?? null) : null;
            const when = fairDay ? shortDate(fairDay) : m.when;
            return [
              {
                id: `planned-${k}-${m.key}`,
                label: shorten(title),
                title,
                icon: iconFor(
                  m.key === "fair" ? "event" : m.key === "cert" ? "certification" : m.key === "project" ? "project" : "experience",
                  title,
                ),
                state: now ? ("open" as const) : ("planned" as const),
                sub: now
                  ? m.dated && when
                    ? fairDay && input.today && input.today > fairDay
                      ? `${when} · did you go?`
                      : `Coming up · ${when}`
                    : "This semester"
                  : `Planned · ${shortTerm(slot.term)}`,
                mine: false,
                about: "",
                wins: [],
                tasks: (() => {
                  const mine = now ? tasksFor(m.key, input.steps, slot.term) : [];
                  return mine.length
                    ? mine.map((t) => ({ title: t.title, done: t.status === "done" }))
                    : m.tasks.map((t) => ({ title: t, done: false }));
                })(),
                href: `/student/tasks?m=${m.key}`,
                claim: now
                  ? {
                      title: win,
                      kind: CLAIM_KIND[m.key] ?? "experience",
                      ask: Boolean(m.dated),
                      ready: !m.dated || Boolean(fairDay && input.today && input.today > fairDay),
                    }
                  : undefined,
              },
            ];
          });
    const items = [...real, ...planned];
    return { term: slot.term, short: shortTerm(slot.term), year: slot.year, status, items, canAdd: k <= current };
  });

  const color = (p: Path) => INTEREST_COLORS[p.interest ?? ""]?.color ?? "#9AA49F";
  const mainPath: RoadPath | null = main
    ? {
        id: main.id,
        name: main.name,
        goal: main.first_job ?? main.name,
        color: "#14211B",
        ink: "#FFFFFF",
        tag: "Pinned",
        tagBg: "#14211B",
        tagInk: "#FFFFFF",
        action: "pinned",
      }
    : null;
  const pinnedCount = input.pinned.length;
  const others: RoadPath[] = input.paths
    .filter((p) => p.id !== main?.id)
    .slice(0, 3)
    .map((p) => {
      const fresh = input.isFresh(p);
      const isPinned = p.status === "pinned";
      return {
        id: p.id,
        name: p.name,
        goal: p.first_job ?? p.name,
        color: color(p),
        ink: "#14211B",
        tag: isPinned ? "Also pinned" : fresh ? "New · from your last appointment" : "Explore",
        tagBg: isPinned ? "#14211B" : fresh ? "#EDEAFF" : "#FFFFFF",
        tagInk: isPinned ? "#FFFFFF" : fresh ? "#4B3BB3" : "#3A4640",
        action: isPinned ? "pinned" : input.limit === 1 && pinnedCount >= 1 ? "switch" : pinnedCount < input.limit ? "pin" : "full",
      };
    });

  return { semesters, current, fork, zones: slots.length >= 8 ? UNDERGRAD_ZONES : GRAD_ZONES, main: mainPath, others };
}
