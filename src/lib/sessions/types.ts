export const INSIGHT_KINDS = ["summary", "goal", "action", "course_change", "skill", "interest", "concern", "advice"] as const;
export type InsightKind = (typeof INSIGHT_KINDS)[number];

export const ROADMAP_KINDS = ["course", "experience", "skill", "certification", "event", "networking", "application", "coaching", "project"] as const;
export type RoadmapKind = (typeof ROADMAP_KINDS)[number];

export type Speaker = "staff" | "student" | "unknown";
export type Segment = { idx: number; start_ms: number; end_ms: number; speaker: Speaker; text: string };

/** One suggestion for the advisor. `evidence` lists the segment idx values it rests on. */
export type DraftInsight = { kind: InsightKind; text: string; roadmap_kind?: RoadmapKind | null; evidence: number[]; due_date?: string; firm?: boolean };

export const INSIGHT_LABEL: Record<InsightKind, string> = {
  summary: "Summary",
  goal: "Goal",
  action: "Action item",
  course_change: "Course change",
  skill: "Skill",
  interest: "Interest",
  concern: "Concern",
  advice: "Key advice",
};

/** Keeps only suggestions that point at real transcript lines. A suggestion with no evidence isn't shown. */
export function keepSupported(insights: DraftInsight[], segments: Pick<Segment, "idx">[]): DraftInsight[] {
  const known = new Set(segments.map((s) => s.idx));
  return insights
    .map((i) => ({ ...i, text: i.text.trim(), evidence: [...new Set(i.evidence)].filter((e) => known.has(e)) }))
    .filter((i) => i.text && i.evidence.length);
}
