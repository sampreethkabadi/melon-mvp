import assert from "node:assert/strict";
import { test } from "node:test";
import { ADVISOR_SESSION_TYPES, COACH_SESSION_TYPES } from "../sessions/session-types.ts";
import { selectStudents, summarizeStudent, type RawItem, type StudentRaw, type StudentRow } from "./overview.ts";
import { buildMeetingPrep, purposeOf } from "./prep.ts";

const ctx = { today: "2026-09-03", staffId: "me", localDate: (d: Date) => d.toISOString().slice(0, 10) };
const raw = (over: Partial<StudentRaw> = {}): StudentRaw => ({
  id: "s", name: "Maya Patel", yearLabel: "Junior", program: "B.S. Data Science", majors: ["Data Science"], minors: [], expectedGrad: "May 2028", clubs: [], skills: [], targetRoles: [],
  onboardingStep: "done", roadmapStatus: "published", paths: [], items: [], sessions: [], appointments: [], advice: [], lastSummary: null, goals: [], concerns: [], openFlags: 0, pendingSuggestions: 0, ...over,
});
const item = (over: Partial<RawItem> = {}): RawItem => ({ student_id: "s", title: "Step", kind: "skill", term: "Fall 2026", status: "active", approval: "approved", due_date: null, firm: false, ...over });
const session = (status: string, created_at: string, staff_id = "me") => ({ id: created_at, student_id: "s", staff_id, status, created_at, session_type: "Course planning", staff: { full_name: "Dr. Lee" } });
const row = (over: Partial<StudentRaw> = {}): StudentRow => summarizeStudent(raw(over), ctx);
const keys = (r: StudentRow) => r.attention.map((a) => a.key);

test("progress counts live steps only", () => {
  const r = row({ items: [item({ status: "done" }), item(), item({ status: "queued" }), item({ status: "locked" }), item({ status: "paused" }), item({ status: "skipped" }), item({ approval: "rejected" }), item({ approval: "pending" })] });
  assert.equal(r.done, 1);
  assert.equal(r.total, 3);
  assert.equal(r.percent, 33);
  assert.equal(r.openSteps.length, 1);
});

test("a roadmap with no steps is 0%, not a crash", () => {
  assert.equal(row().percent, 0);
});

test("firm dates come first as the next step", () => {
  const r = row({ items: [item({ title: "Later", due_date: "2026-09-01" }), item({ title: "Firm", firm: true, due_date: "2026-09-20" })] });
  assert.equal(r.nextStep?.title, "Firm");
});

test("what needs attention, most urgent first", () => {
  assert.deepEqual(keys(row({ sessions: [session("ready_for_review", "2026-09-02T12:00:00Z")], openFlags: 1, roadmapStatus: "draft", items: [item({ due_date: "2026-09-01" })] })), ["review", "flag", "draft", "overdue"]);
});

test("another advisor's session waiting for review isn't this person's job", () => {
  const r = row({ sessions: [session("ready_for_review", "2026-09-02T12:00:00Z", "someone")] });
  assert.ok(!keys(r).includes("review"));
});

test("a step due today isn't overdue", () => {
  assert.equal(row({ items: [item({ due_date: "2026-09-03" })] }).overdue, 0);
});

test("quiet students get a nudge unless a meeting is booked", () => {
  const old = [session("reviewed", "2026-07-01T12:00:00Z")];
  assert.ok(keys(row({ sessions: old })).includes("quiet"));
  const booked = row({ sessions: old, appointments: [{ id: "a", student_id: "s", staff_id: "me", starts_at: "2026-09-10T14:00:00Z", type: "Course planning", modality: "teams", location: null }] });
  assert.ok(!keys(booked).includes("quiet"));
});

test("a student still onboarding says so, rather than having no session yet", () => {
  assert.deepEqual(keys(row({ onboardingStep: "resume", roadmapStatus: "none" })), ["onboarding"]);
  assert.deepEqual(keys(row()), ["new"]);
});

test("filters, search and sorting", () => {
  const today = { id: "a", student_id: "s", staff_id: "me", starts_at: "2026-09-03T14:00:00Z", type: "Course planning", modality: "teams", location: null };
  const rows = [
    row({ id: "1", name: "Zed Quiet", sessions: [session("reviewed", "2026-09-01T12:00:00Z")], items: [item({ status: "done" })] }),
    row({ id: "2", name: "Ann Urgent", roadmapStatus: "draft", majors: ["Finance"], program: null }),
    row({ id: "3", name: "Bo Today", sessions: [session("reviewed", "2026-09-01T12:00:00Z")], appointments: [today] }),
  ];
  assert.deepEqual(selectStudents(rows, {}).map((r) => r.id), ["2", "3", "1"]);
  assert.deepEqual(selectStudents(rows, { show: "attention" }).map((r) => r.id), ["2"]);
  assert.deepEqual(selectStudents(rows, { show: "today" }).map((r) => r.id), ["3"]);
  assert.deepEqual(selectStudents(rows, { q: "fin" }).map((r) => r.id), ["2"]);
  assert.deepEqual(selectStudents(rows, { sort: "name" }).map((r) => r.name), ["Ann Urgent", "Bo Today", "Zed Quiet"]);
  assert.equal(selectStudents(rows, { sort: "progress" })[2].id, "1");
});

const prepCtx = { today: "2026-09-03", shortDate: (iso: string) => iso.slice(0, 10) };

test("every bookable session type has a purpose written for it", () => {
  for (const type of [...ADVISOR_SESSION_TYPES, ...COACH_SESSION_TYPES]) assert.ok(!purposeOf(type).startsWith("Booked as"), type);
  assert.ok(purposeOf("Something new").includes("Something new"));
});

test("meeting prep brings together background, progress and likely reasons", () => {
  const r = row({
    minors: ["Business"], clubs: ["DS Club"], skills: ["Python"], targetRoles: ["Data analyst"], goals: ["Land an internship"], concerns: ["Nervous about recruiters"], paths: [{ name: "Data analyst", status: "pinned" }],
    items: [item({ title: "Register", firm: true, due_date: "2026-09-15" }), item({ status: "done" }), item({ title: "Old", due_date: "2026-08-01" })],
    sessions: [session("reviewed", "2026-08-27T12:00:00Z")], lastSummary: "Wants an internship.", advice: [{ student_id: "s", text: "Update resume", status: "new" }], openFlags: 1, pendingSuggestions: 1,
  });
  const p = buildMeetingPrep(r, { type: "Career fair preparation" }, prepCtx);
  assert.match(p.purpose, /fair/);
  assert.ok(p.signals.some((s) => s.includes("Register")));
  assert.ok(p.signals.some((s) => s.includes("overdue")));
  assert.ok(p.signals.some((s) => s.includes("flagged")));
  assert.ok(p.signals.some((s) => s.includes("waiting on their answer")));
  assert.ok(p.background[0].includes("Junior") && p.background[0].includes("May 2028"));
  assert.ok(p.background.some((b) => b.includes("Focused on: Data analyst")));
  assert.equal(p.progress, "1 of 3 steps done, 2 open. 1 session so far.");
  assert.ok(p.lastTime?.includes("Dr. Lee") && p.lastTime.includes("Wants an internship."));
  assert.deepEqual(p.openAdvice, ["Update resume"]);
  assert.deepEqual(p.concerns, ["Nervous about recruiters"]);
  assert.equal(p.isFirstMeeting, false);
});

test("a first meeting says so plainly", () => {
  const p = buildMeetingPrep(row({ roadmapStatus: "none", onboardingStep: "resume" }), { type: "Drop-in" }, prepCtx);
  assert.equal(p.isFirstMeeting, true);
  assert.equal(p.lastTime, null);
  assert.equal(p.progress, "No roadmap yet. 0 sessions so far.");
  assert.ok(p.signals.some((s) => s.includes("onboarding")));
});

test("a past-due firm step isn't announced as coming up", () => {
  const p = buildMeetingPrep(row({ items: [item({ title: "Missed", firm: true, due_date: "2026-08-20" })] }), { type: "Drop-in" }, prepCtx);
  assert.ok(!p.signals.some((s) => s.includes("coming up")));
});

test("a session waiting for review means it isn't the first meeting", () => {
  const p = buildMeetingPrep(row({ roadmapStatus: "draft", sessions: [session("ready_for_review", "2026-09-02T12:00:00Z")] }), { type: "Drop-in" }, prepCtx);
  assert.equal(p.isFirstMeeting, false);
});
