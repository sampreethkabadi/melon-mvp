// The briefing a new advisor reads before meeting a student, built from what Melon already knows.

export type BriefingInput = {
  name: string;
  yearLabel: string | null;
  majors: string[];
  expectedGrad: string | null;
  targetRoles: string[];
  goals: string[];
  concerns: string[];
  lastSummary: { text: string; date: string; staff: string } | null;
  sessionCount: number;
  advice: Array<{ text: string; status: string }>;
  roadmapStatus: string;
  items: Array<{ status: string }>;
};

export type Briefing = { headline: string; points: string[]; openAdvice: string[]; doneAdvice: number };

export function buildBriefing(b: BriefingInput): Briefing {
  const who = [b.yearLabel, b.majors.join(" and "), b.expectedGrad ? `graduating ${b.expectedGrad}` : null].filter(Boolean).join(", ");
  const headline = who ? `${b.name}: ${who}.` : `${b.name}.`;

  const points: string[] = [];
  if (b.lastSummary) points.push(`Last session (${b.lastSummary.date}, with ${b.lastSummary.staff}): ${b.lastSummary.text}`);
  else points.push("This is your first session on record with this student, so nothing has been discussed yet.");
  if (b.goals.length) points.push(`Goals: ${b.goals.slice(0, 3).join("; ")}.`);
  if (b.targetRoles.length) points.push(`Looking at: ${b.targetRoles.join(", ")}.`);
  if (b.concerns.length) points.push(`Has raised: ${b.concerns.slice(0, 3).join("; ")}.`);

  if (b.roadmapStatus === "published") {
    const live = b.items.filter((i) => i.status !== "skipped");
    points.push(`Roadmap: ${live.filter((i) => i.status === "done").length} of ${live.length} items done.`);
  } else if (b.roadmapStatus === "draft") {
    points.push("Roadmap: a draft is waiting for review, and the student can't see it yet.");
  } else if (b.roadmapStatus === "awaiting_student") {
    points.push("Roadmap: approved and waiting for the student to accept it.");
  } else {
    points.push("Roadmap: not started.");
  }

  const open = b.advice.filter((a) => a.status === "new" || a.status === "in_progress").map((a) => a.text);
  return { headline, points, openAdvice: open, doneAdvice: b.advice.filter((a) => a.status === "done").length };
}
