import assert from "node:assert/strict";
import { test } from "node:test";
import { planGroups, type PlanItem } from "./plan.ts";
import { currentSemester } from "./semester.ts";

const SEM = currentSemester(new Date("2026-11-03T12:00:00"));
let n = 0;
const item = (over: Partial<PlanItem>): PlanItem => ({
  id: `i${++n}`,
  title: `Step ${n}`,
  description: null,
  term: "Fall 2026",
  kind: "skill",
  status: "active",
  path_id: null,
  due_date: null,
  firm: false,
  sort: n,
  completed_at: null,
  ...over,
});

test("focus is the first 3 open steps this semester, firm dates first", () => {
  const firm = item({ title: "Firm one", firm: true, due_date: "2026-11-20", sort: 99 });
  const items = [item({}), item({}), item({}), item({}), firm, item({ term: "Spring 2027" }), item({ status: "done", completed_at: "2026-10-01T00:00:00Z" })];
  const g = planGroups(items, SEM);
  assert.equal(g.focus.length, 3);
  assert.equal(g.focus[0].title, "Firm one");
  assert.equal(g.laterThisTerm.length, 2);
  assert.equal(g.moreCount, 2);
  assert.equal(g.later.length, 1);
  assert.equal(g.done.length, 1);
});

test("with nothing open this semester, focus pulls from later semesters", () => {
  const g = planGroups([item({ term: "Spring 2027" }), item({ term: "Fall 2027" })], SEM);
  assert.equal(g.focus.length, 2);
  assert.equal(g.later.length, 0);
});
