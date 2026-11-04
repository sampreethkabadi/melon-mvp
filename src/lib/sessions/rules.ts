import type { DraftInsight, Segment } from "./types";

// A plain fallback for notes and transcripts when AI isn't available or allowed. It only points at lines
// that look like plans, goals or worries. The advisor edits or rejects what doesn't fit.

const ACTION = /\b(i'll|i will|you should|you could|next step|let's|please|reach out|apply|sign up|finish|bring|schedule|update|follow up)\b/i;
const GOAL = /\b(i want to|i'd like to|my goal|goal is|i'm hoping to|hoping to|plan to)\b/i;
const CONCERN = /\b(worried|nervous|struggling|not sure|unsure|stressed|overwhelmed|anxious|concerned)\b/i;

export function analyzeByRules(segments: Segment[]): DraftInsight[] {
  const insights: DraftInsight[] = [];
  for (const s of segments) {
    const text = s.text.trim();
    if (GOAL.test(text)) insights.push({ kind: "goal", text, evidence: [s.idx] });
    else if (CONCERN.test(text)) insights.push({ kind: "concern", text, evidence: [s.idx] });
    else if (ACTION.test(text) && !text.endsWith("?")) insights.push({ kind: "action", text, roadmap_kind: "coaching", evidence: [s.idx] });
  }
  const covered = [...new Set(insights.flatMap((i) => i.evidence))];
  const summaryLines = (covered.length ? covered : segments.map((s) => s.idx)).slice(0, 3);
  if (summaryLines.length) {
    const text = summaryLines.map((idx) => segments.find((s) => s.idx === idx)!.text.trim()).join(" ");
    insights.unshift({ kind: "summary", text, evidence: summaryLines });
  }
  return insights;
}

/** Turns typed notes into transcript lines, one per non-empty line. */
export function notesToSegments(notes: string): Segment[] {
  return notes
    .split("\n")
    .map((l) => l.replace(/^[\s•*-]+/, "").trim())
    .filter(Boolean)
    .slice(0, 200)
    .map((text, idx) => ({ idx, start_ms: 0, end_ms: 0, speaker: "staff" as const, text: text.slice(0, 2000) }));
}

const STAFF_LABEL = /^(advisor|adviser|counsel+or|coach|staff|career (coach|advisor|counsel+or)|therapist|interviewer|mentor|dr\.?\b.*)$/i;
const STUDENT_LABEL = /^(student|client|advisee|mentee|interviewee|candidate)$/i;
const CUE = /^(?:\d+|WEBVTT.*|NOTE.*|\[?\(?\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d+)?\)?\]?(?:\s*-->.*)?)$/;

/**
 * Reads a pasted transcript. "Name: words" starts a new line, and text with no label joins the line before it.
 * Labels like Advisor and Student are recognized. Otherwise the first person to speak counts as staff, and the
 * advisor can swap any label on the review screen. Caption numbers and timestamps are ignored.
 */
export function parseTranscript(raw: string): Segment[] {
  const turns: Array<{ label: string | null; text: string }> = [];
  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim().replace(/^\[?\(?\d{1,2}:\d{2}(?::\d{2})?\)?\]?\s+/, "");
    if (!line || CUE.test(line)) continue;
    const match = line.match(/^([A-Z][\w.' -]{0,40}?)\s*:\s+(.+)$/);
    if (match) turns.push({ label: match[1].trim(), text: match[2] });
    else if (turns.length) turns[turns.length - 1].text += ` ${line}`;
    else turns.push({ label: null, text: line });
  }
  const firstLabel = turns.find((t) => t.label)?.label;
  const speakerOf = (label: string | null): Segment["speaker"] => {
    if (!label) return "unknown";
    if (STAFF_LABEL.test(label)) return "staff";
    if (STUDENT_LABEL.test(label)) return "student";
    if (firstLabel && (STAFF_LABEL.test(firstLabel) || STUDENT_LABEL.test(firstLabel))) return STAFF_LABEL.test(firstLabel) ? "student" : "staff";
    return label === firstLabel ? "staff" : "student";
  };
  return turns.slice(0, 1000).map((t, idx) => ({ idx, start_ms: 0, end_ms: 0, speaker: speakerOf(t.label), text: t.text.slice(0, 4000) }));
}
