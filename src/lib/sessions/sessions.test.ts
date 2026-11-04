import assert from "node:assert/strict";
import { test } from "node:test";
import { buildBriefing, type BriefingInput } from "./briefing.ts";
import { sampleConversation } from "./demo.ts";
import { ADVISOR_SESSION_TYPES, COACH_SESSION_TYPES } from "./session-types.ts";
import { analyzeByRules, notesToSegments, parseTranscript } from "./rules.ts";
import { keepSupported } from "./types.ts";

const CTX = {
  first: "Maya", major: "Data Science", focus: "data & analytics", job: "data analyst", explore: "cybersecurity", year: "junior",
  dates: { mockFair: "2026-09-14", fair1: "2026-09-17", resumeDropIn: "2026-09-09", networkingNight: "2026-10-06", springRegistration: "2026-10-26", minorForm: "2026-10-01", dropW: "2026-09-06" },
};

test("every session type has a short sample with one summary, at most 2 steps, and real evidence", () => {
  for (const type of [...COACH_SESSION_TYPES, ...ADVISOR_SESSION_TYPES]) {
    const { segments, insights } = sampleConversation({ ...CTX, type });
    assert.ok(segments.length >= 3 && segments.length <= 16, type);
    assert.equal(keepSupported(insights, segments).length, insights.length, type);
    assert.equal(insights.filter((i) => i.kind === "summary").length, 1, type);
    assert.ok(insights.filter((i) => i.kind === "action" || i.kind === "course_change").length <= 2, type);
  }
});

test("advisor samples stick to courses and policy", () => {
  for (const type of ADVISOR_SESSION_TYPES) {
    const { insights } = sampleConversation({ ...CTX, type });
    for (const i of insights.filter((x) => x.kind === "action")) assert.equal(i.roadmap_kind, "course", `${type}: ${i.text}`);
    assert.ok(!insights.some((i) => i.kind === "interest"), type);
  }
});

test("suggestions with no real evidence are dropped", () => {
  const kept = keepSupported(
    [
      { kind: "goal", text: "Made up", evidence: [99] },
      { kind: "goal", text: "No evidence", evidence: [] },
      { kind: "goal", text: "  ", evidence: [0] },
      { kind: "goal", text: "Real", evidence: [0, 0, 99] },
    ],
    [{ idx: 0 }],
  );
  assert.deepEqual(kept, [{ kind: "goal", text: "Real", evidence: [0] }]);
});

test("notes become lines and rules pick out plans, goals and worries", () => {
  const segments = notesToSegments("- Talked about internships\n\n* She wants a plan. I want to apply by March\n• Worried about her GPA\nReach out to two alumni\nWhat should she do next?\n");
  assert.equal(segments.length, 5);
  const found = analyzeByRules(segments);
  assert.equal(found[0].kind, "summary");
  assert.deepEqual(found.slice(1).map((i) => i.kind), ["goal", "concern", "action"]);
  assert.equal(keepSupported(found, segments).length, found.length);
});

test("empty notes produce no suggestions", () => {
  assert.deepEqual(analyzeByRules(notesToSegments("  \n\n")), []);
});

const base: BriefingInput = {
  name: "Maya Patel", yearLabel: "Junior", majors: ["Data Science"], expectedGrad: "May 2028", targetRoles: ["Data analyst"], goals: ["Land an internship"], concerns: [],
  lastSummary: { text: "Wants an internship.", date: "Oct 10", staff: "Dr. Jordan Lee" }, sessionCount: 1,
  advice: [{ text: "Finish project", status: "new" }, { text: "Old", status: "done" }, { text: "Skipped", status: "dismissed" }],
  roadmapStatus: "published", items: [{ status: "done" }, { status: "active" }, { status: "skipped" }],
};

test("a briefing carries the history a new advisor needs", () => {
  const b = buildBriefing(base);
  assert.equal(b.headline, "Maya Patel: Junior, Data Science, graduating May 2028.");
  assert.ok(b.points[0].includes("with Dr. Jordan Lee"));
  assert.ok(b.points.includes("Roadmap: 1 of 2 items done."));
  assert.deepEqual(b.openAdvice, ["Finish project"]);
  assert.equal(b.doneAdvice, 1);
});

test("a briefing is honest when there's no history", () => {
  const b = buildBriefing({ ...base, lastSummary: null, sessionCount: 0, advice: [], roadmapStatus: "none", items: [], goals: [], targetRoles: [] });
  assert.ok(b.points[0].includes("first session on record"));
  assert.ok(b.points.includes("Roadmap: not started."));
});

test("the earlier sample's suggestions all point at real lines", async () => {
  const { earlierConversation } = await import("./demo.ts");
  const { segments, insights } = earlierConversation("Maya");
  assert.equal(keepSupported(insights, segments).length, insights.length);
});

test("pasted transcripts keep their speakers, and wrapped lines join up", () => {
  const s = parseTranscript("Advisor: Hi there.\nHow are you?\n\nStudent: Good.\nCounselor: Great.");
  assert.deepEqual(s.map((x) => [x.speaker, x.text]), [["staff", "Hi there. How are you?"], ["student", "Good."], ["staff", "Great."]]);
});

test("plain names count the first speaker as staff", () => {
  const s = parseTranscript("Ms. Rao: Welcome.\nJamie: Thanks.\nMs. Rao: Tell me more.");
  assert.deepEqual(s.map((x) => x.speaker), ["staff", "student", "staff"]);
});

test("caption numbers and timestamps are ignored", () => {
  const s = parseTranscript("WEBVTT\n\n1\n00:00:01.000 --> 00:00:03.000\nCoach: Hello\n\n2\n00:00:03.000 --> 00:00:05.000\nClient: Hi\n0:07 Coach: Next\n");
  assert.deepEqual(s.map((x) => [x.speaker, x.text]), [["staff", "Hello"], ["student", "Hi"], ["staff", "Next"]]);
});

test("text with no labels still becomes a transcript, marked unknown", () => {
  assert.deepEqual(parseTranscript("just some words\nand more").map((x) => [x.speaker, x.text]), [["unknown", "just some words and more"]]);
});
