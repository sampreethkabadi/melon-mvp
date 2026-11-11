import assert from "node:assert/strict";
import { test } from "node:test";
import { daysUntil, isFairStep, nextFair } from "./fair.ts";

const events = [
  { title: "Mock career fair", starts_at: "2026-09-14T20:00:00Z" },
  { title: "Fall Career Fair, Day 1: tech, data and engineering", starts_at: "2026-09-17T15:00:00Z" },
  { title: "Fall Career Fair, Day 2: business", starts_at: "2026-09-18T15:00:00Z" },
  { title: "Spring career fair", starts_at: "2026-02-25T17:00:00Z" },
];

test("the next real fair skips the mock fair and past fairs", () => {
  assert.deepEqual(nextFair(events, "2026-09-03"), { title: "Fall Career Fair, Day 1: tech, data and engineering", date: "2026-09-17" });
  assert.equal(nextFair(events, "2026-09-19"), null);
});

const fair = { title: "Fall Career Fair", date: "2026-09-17" };
const step = (title: string, extra: Partial<{ description: string; due_date: string; kind: string; evidence: Array<{ session_id: string }> }> = {}) => ({
  title,
  description: extra.description ?? null,
  due_date: extra.due_date ?? null,
  kind: extra.kind ?? "skill",
  evidence: extra.evidence ?? null,
});

test("fair steps: by wording, by the appointment they came from, or by date and kind", () => {
  assert.ok(isFairStep(step("Practice at the mock career fair"), fair));
  assert.ok(isFairStep(step("Register for the Career Fair in Handshake"), fair));
  assert.ok(isFairStep(step("Rewrite your 30-second pitch around your bike-share project"), fair));
  assert.ok(isFairStep(step("List 5 companies to visit", { evidence: [{ session_id: "s1" }] }), fair, new Set(["s1"])));
  assert.ok(isFairStep(step("Message two alumni", { kind: "networking", due_date: "2026-09-10" }), fair));
  assert.ok(!isFairStep(step("Try the free Kaggle SQL lessons"), fair));
  assert.ok(!isFairStep(step("Message two alumni", { kind: "networking", due_date: "2026-10-10" }), fair));
  assert.ok(!isFairStep(step("Finish a SQL course", { kind: "skill", due_date: "2026-09-10" }), fair));
});

test("days until", () => {
  assert.equal(daysUntil("2026-09-03", "2026-09-17"), 14);
  assert.equal(daysUntil("2026-09-03T23:00:00Z", "2026-09-03"), 0);
});
