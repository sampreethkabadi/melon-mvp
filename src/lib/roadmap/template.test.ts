import assert from "node:assert/strict";
import { test } from "node:test";
import { buildFirstRoadmap, upcomingTerms, type DraftInput, type Resource } from "./template.ts";

const NOW = new Date("2026-11-03T12:00:00Z");
const RESOURCES: Resource[] = [
  { id: "00000000-0000-0000-0000-000000000001", type: "skill", title: "SQL window functions", interests: ["data"] },
  { id: "00000000-0000-0000-0000-000000000002", type: "certification", title: "Google Data Analytics", interests: ["data"] },
  { id: "00000000-0000-0000-0000-000000000003", type: "course", title: "Applied Machine Learning", interests: ["data"] },
];
const input = (over: Partial<DraftInput>): DraftInput => ({
  class_year: "junior", majors: ["Data Science"], interests: ["data"], target_roles: [], answers: {}, resources: RESOURCES, now: NOW, ...over,
});
const titles = (r: ReturnType<typeof buildFirstRoadmap>) => r.items.map((i) => i.title);

test("terms run from the current semester", () => {
  assert.deepEqual(upcomingTerms(NOW, 3), ["Fall 2026", "Spring 2027", "Fall 2027"]);
  assert.deepEqual(upcomingTerms(new Date("2027-02-01T12:00:00Z"), 2), ["Spring 2027", "Fall 2027"]);
});

test("freshmen with no clear interest keep three broad paths and start with their advisor", () => {
  const r = buildFirstRoadmap(input({ class_year: "freshman", interests: ["unsure"], majors: [], answers: { major_certainty: "unsure", first_help: "resume" } }));
  assert.equal(r.paths.length, 3);
  assert.match(r.items[0].title, /academic advisor/);
  assert.ok(titles(r).includes("Go to a majors and minors fair"));
  assert.ok(titles(r).includes("Write your first resume at drop-in hours"));
});

test("sophomores get a job simulation, an alum chat and an info session", () => {
  const t = titles(buildFirstRoadmap(input({ class_year: "sophomore", answers: { try_next: ["project"], experience: "none" } }))).join("|");
  for (const expected of ["Forage job simulation", "chat with an alum", "info session", "small project", "summer role"]) assert.ok(t.includes(expected), expected);
});

test("juniors narrow to two paths and get career strategy built on their domain", () => {
  const r = buildFirstRoadmap(input({ interests: ["data", "soft", "biz"], answers: { domain: "machine learning", linkedin_status: "basic", internship: "not_started" } }));
  assert.equal(r.paths.length, 2);
  assert.match(r.items[0].title, /career coach/);
  const t = titles(r);
  assert.ok(t.includes("Improve your LinkedIn profile"));
  assert.ok(t.includes("Reach out to three people working in machine learning"));
  assert.ok(t.includes("Make an application plan for internships"));
  assert.ok(t.includes("Prepare for the next career fair"));
});

test("seniors' named roles become the paths, four at most", () => {
  const r = buildFirstRoadmap(input({ class_year: "senior", target_roles: ["A", "B", "C", "D", "E"], answers: { search_stage: "interviewing", linkedin_status: "strong" } }));
  assert.deepEqual(r.paths.map((p) => p.name), ["A", "B", "C", "D"]);
  assert.ok(titles(r).includes("Book a mock interview"));
  assert.ok(!titles(r).some((t) => t.includes("LinkedIn")));
});

test("grad students aiming for research don't get a job application plan", () => {
  const t = titles(buildFirstRoadmap(input({ class_year: "grad", answers: { goal: "research", search_stage: "not_started" } })));
  assert.ok(t.includes("Talk to two faculty members about research paths"));
  assert.ok(!t.some((x) => x.includes("application plan")));
});

test("only links library resources that match, each at most once", () => {
  const r = buildFirstRoadmap(input({ interests: ["data"], answers: { domain: "x" } }));
  const ids = r.items.map((i) => i.resource_id).filter(Boolean);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.length >= 2);
  const other = buildFirstRoadmap(input({ interests: ["cyber"], answers: { domain: "x" } }));
  assert.equal(other.items.filter((i) => i.resource_id).length, 0);
});

test("every item explains itself and every path index is real", () => {
  for (const class_year of ["freshman", "sophomore", "junior", "senior", "grad"] as const) {
    const r = buildFirstRoadmap(input({ class_year }));
    assert.ok(r.paths.length > 0, class_year);
    for (const i of r.items) {
      assert.ok(i.rationale && i.description && i.term, i.title);
      if (i.path_index !== undefined) assert.ok(i.path_index < r.paths.length, i.title);
    }
  }
});

test("a resource sits under a path only when the path is about the same interest", () => {
  const named = buildFirstRoadmap(input({ interests: ["soft", "data"], target_roles: ["Backend engineer", "Security engineer"], answers: { domain: "x" } }));
  const linked = named.items.filter((i) => i.resource_id);
  assert.ok(linked.length >= 2);
  for (const i of linked) {
    assert.equal(i.path_index, undefined, i.title);
    assert.match(i.rationale, /data & analytics/);
  }
  const byInterest = buildFirstRoadmap(input({ interests: ["data"], answers: { domain: "x" } }));
  for (const i of byInterest.items.filter((x) => x.resource_id)) assert.equal(byInterest.paths[i.path_index!].name, "Data & analytics");
});

test("a broad path with no matching resource gets none instead of a random one", () => {
  const r = buildFirstRoadmap(input({ class_year: "freshman", interests: [], answers: {} }));
  assert.equal(r.items.filter((i) => i.resource_id).length, 0);
});

test("every named role gets at least one item of its own", () => {
  const r = buildFirstRoadmap(input({ class_year: "senior", target_roles: ["A", "B", "C"], answers: {} }));
  r.paths.forEach((_, i) => assert.ok(r.items.some((item) => item.path_index === i), `path ${i}`));
});
