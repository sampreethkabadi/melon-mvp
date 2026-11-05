import assert from "node:assert/strict";
import { test } from "node:test";
import { fallFairDay1 } from "../calendar.ts";
import { buildFirstRoadmap, interestFromText, lowerName, upcomingTerms, type DraftInput, type Resource } from "./template.ts";

const NOW = new Date("2026-09-03T15:00:00Z"); // two weeks before the fair
const RESOURCES: Resource[] = [{ id: "00000000-0000-0000-0000-000000000001", type: "club", title: "Data Science Club", interests: ["data"] }];
const input = (over: Partial<DraftInput>): DraftInput => ({
  class_year: "junior", majors: ["Data Science"], interests: ["data"], target_roles: [], answers: {}, resources: RESOURCES, now: NOW, ...over,
});
const thisTerm = (r: ReturnType<typeof buildFirstRoadmap>) => r.items.filter((i) => i.term === "Fall 2026");

test("the Fall Career Fair is the third Thursday of September", () => {
  assert.equal(fallFairDay1(2026), "2026-09-17");
  assert.equal(fallFairDay1(2027), "2027-09-16");
});

test("terms run from the current semester", () => {
  assert.deepEqual(upcomingTerms(NOW, 3), ["Fall 2026", "Spring 2027", "Fall 2027"]);
  assert.deepEqual(upcomingTerms(new Date("2027-02-01T12:00:00Z"), 2), ["Spring 2027", "Fall 2027"]);
});

test("every year starts with exactly 3 steps this semester and at most 1 for next", () => {
  for (const class_year of ["freshman", "sophomore", "junior", "senior", "grad"] as const) {
    const r = buildFirstRoadmap(input({ class_year }));
    assert.equal(thisTerm(r).length, 3, class_year);
    assert.ok(r.items.length <= 4, class_year);
    for (const i of r.items) {
      assert.ok(i.rationale && i.description && i.term, i.title);
      if (i.path_index !== undefined) assert.ok(i.path_index < r.paths.length, i.title);
    }
  }
});

test("fair steps have firm dates before the fair", () => {
  const r = buildFirstRoadmap(input({ class_year: "sophomore" }));
  const firm = r.items.filter((i) => i.firm).map((i) => i.due_date);
  assert.deepEqual(firm, ["2026-09-09", "2026-09-10", "2026-09-17"]);
  const junior = buildFirstRoadmap(input({}));
  assert.ok(junior.items.some((i) => i.title === "Practice at the mock career fair" && i.due_date === "2026-09-14" && i.firm));
});

test("after the fair, steps don't carry dates that have passed", () => {
  const r = buildFirstRoadmap(input({ class_year: "sophomore", now: new Date("2026-11-03T15:00:00Z") }));
  assert.ok(r.items.every((i) => !i.due_date || i.due_date >= "2026-11-03"));
  assert.ok(r.items.every((i) => !i.firm));
});

test("freshmen are pointed to a club for their interest, linked from the library", () => {
  const r = buildFirstRoadmap(input({ class_year: "freshman", interests: ["data", "soft"] }));
  const club = r.items.find((i) => i.kind === "networking")!;
  assert.equal(club.title, "Go to one Data Science Club meeting");
  assert.equal(club.resource_id, RESOURCES[0].id);
});

test("pins follow year: freshmen pin up to 2 of their interests, juniors pin 1", () => {
  const fresh = buildFirstRoadmap(input({ class_year: "freshman", interests: ["data", "soft"] }));
  assert.deepEqual(fresh.paths.filter((p) => p.status === "pinned").map((p) => p.interest), ["data", "soft"]);
  const junior = buildFirstRoadmap(input({ interests: ["data", "cyber"] }));
  assert.equal(junior.paths.filter((p) => p.status === "pinned").length, 1);
  const unsure = buildFirstRoadmap(input({ class_year: "freshman", interests: ["unsure"] }));
  assert.equal(unsure.paths.filter((p) => p.status === "pinned").length, 0);
});

test("named roles become paths with an interest, so resources can follow them", () => {
  const r = buildFirstRoadmap(input({ class_year: "senior", target_roles: ["Security analyst", "ML engineer", "Backend engineer"] }));
  assert.deepEqual(r.paths.map((p) => p.interest), ["cyber", "data"]);
  assert.equal(r.paths[0].status, "pinned");
});

test("interestFromText matches the database rules", () => {
  assert.equal(interestFromText("security data analyst"), "cyber");
  assert.equal(interestFromText("ML engineer"), "data");
  assert.equal(interestFromText("Backend engineer"), "soft");
  assert.equal(interestFromText("Product designer"), "ux");
  assert.equal(interestFromText("Gardener"), undefined);
});

test("names keep their acronyms in lower case", () => {
  assert.equal(lowerName("UX & product design"), "UX & product design");
  assert.equal(lowerName("ML engineer"), "ML engineer");
  assert.equal(lowerName("Data analyst"), "data analyst");
});

test("each pinned job gets its own list, and Data analyst and ML engineer differ", async () => {
  const { jobKeyFor, jobResources } = await import("../catalog.ts");
  assert.equal(jobKeyFor("Data analyst"), "data-analyst");
  assert.equal(jobKeyFor("ML engineer"), "ml-engineer");
  assert.equal(jobKeyFor("Cybersecurity", "Security analyst"), "security-analyst");
  assert.equal(jobKeyFor("Backend engineer"), "software-engineer");
  assert.equal(jobKeyFor("Product designer"), "ux-designer");
  assert.equal(jobKeyFor("Gardener"), null);
  const list = (key: string) => jobResources().filter((r) => r.tags.includes(`job:${key}`)).map((r) => r.title);
  assert.equal(list("data-analyst").length, 6);
  assert.notDeepEqual(list("data-analyst").slice(0, 3), list("ml-engineer").slice(0, 3));
});
