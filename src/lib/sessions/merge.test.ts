import assert from "node:assert/strict";
import { test } from "node:test";
import { mergeTracks } from "./merge.ts";

test("two microphones become one conversation, in order, with who said what", () => {
  const segs = mergeTracks([
    { speaker: "staff", startedAt: 1_000, utterances: [{ start: 0, end: 2, transcript: "Hi Maya, how's the fair prep?" }, { start: 6, end: 8, transcript: "Lead with one project." }] },
    { speaker: "student", startedAt: 1_500, utterances: [{ start: 2, end: 4, transcript: "A little nervous." }, { start: 9, end: 9.5, transcript: "  " }] },
  ]);
  assert.deepEqual(
    segs.map((s) => [s.idx, s.speaker, s.start_ms, s.text]),
    [
      [0, "staff", 0, "Hi Maya, how's the fair prep?"],
      [1, "student", 2500, "A little nervous."],
      [2, "staff", 6000, "Lead with one project."],
    ],
  );
});

test("no tracks, no lines", () => {
  assert.deepEqual(mergeTracks([]), []);
});

test("one person's sentence split at a short pause becomes one line", () => {
  const segs = mergeTracks([
    { speaker: "student", startedAt: 0, utterances: [{ start: 0, end: 2, transcript: "I want an internship," }, { start: 2.5, end: 4, transcript: "and I'm nervous." }, { start: 9, end: 10, transcript: "Okay." }] },
  ]);
  assert.deepEqual(segs.map((s) => s.text), ["I want an internship, and I'm nervous.", "Okay."]);
});
