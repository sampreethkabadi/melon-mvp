import assert from "node:assert/strict";
import { test } from "node:test";
import { focusSteps, type Step } from "./focus.ts";
import { currentSemester } from "./semester.ts";

const SEM = currentSemester(new Date("2026-09-03T12:00:00"));
let n = 0;
const step = (over: Partial<Step>): Step => ({
  id: `s${++n}`, title: `Step ${n}`, description: null, rationale: null, term: "Fall 2026", kind: "skill", status: "active", source: "staff",
  path_id: null, due_date: null, firm: false, sort: n, resource_id: null, evidence: null, completed_at: null, created_at: `2026-09-0${n % 9}T00:00:00Z`,
  ...over,
});

test("3 to do now, the rest of this semester unlocks next, firm dates first", () => {
  const firm = step({ title: "Fair", firm: true, due_date: "2026-09-17" });
  const f = focusSteps([step({}), step({}), step({}), step({}), firm, step({ term: "Spring 2027" }), step({ status: "queued", source: "student" }), step({ status: "done", completed_at: "2026-09-01T00:00:00Z" })], SEM);
  assert.equal(f.now.length, 3);
  assert.equal(f.now[0].title, "Fair");
  assert.equal(f.unlocks.length, 2);
  assert.equal(f.later.length, 1);
  assert.equal(f.waiting.length, 1);
  assert.equal(f.done.length, 1);
});
