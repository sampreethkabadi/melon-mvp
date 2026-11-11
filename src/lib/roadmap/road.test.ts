import { test } from "node:test";
import assert from "node:assert/strict";
import { buildRoad, gradTermOf, iconFor, isMilestone, labelSize, placeLabels, semestersFor, slotFor, winTitle } from "./road.ts";

test("a junior graduating May 2028 gets Fall 2024 to Spring 2028", () => {
  const slots = semestersFor("junior", "May 2028", "Fall 2026");
  assert.equal(slots.length, 8);
  assert.equal(slots[0].term, "Fall 2024");
  assert.equal(slots[4].term, "Fall 2026");
  assert.equal(slots[4].year, "Junior");
  assert.equal(slots[7].term, "Spring 2028");
});

test("grad dates read as terms, and a wrong date falls back to the class year", () => {
  assert.equal(gradTermOf("Dec 2027"), "Fall 2027");
  assert.equal(gradTermOf("Spring 2027"), "Spring 2027");
  assert.equal(gradTermOf("soon"), null);
  const slots = semestersFor("sophomore", "May 2020", "Spring 2027");
  assert.equal(slots[3].term, "Spring 2027");
  const grad = semestersFor("grad", "May 2027", "Fall 2026");
  assert.deepEqual(grad.map((s) => s.term), ["Fall 2025", "Spring 2026", "Fall 2026", "Spring 2027"]);
});

test("steps land in their semester; done steps without a term go where they were finished", () => {
  const slots = semestersFor("junior", "May 2028", "Fall 2026");
  assert.equal(slotFor(slots, "Spring 2025", null, "Fall 2026"), 1);
  assert.equal(slotFor(slots, null, "2025-10-14T12:00:00Z", "Fall 2026"), 2);
  assert.equal(slotFor(slots, null, null, "Fall 2026"), 4);
  assert.equal(slotFor(slots, "Summer 2025", null, "Fall 2026"), 2);
  assert.equal(slotFor(slots, "Fall 2031", null, "Fall 2026"), 7);
});

test("icons follow the title first, then the kind", () => {
  assert.equal(iconFor("event", "Go to the Fall Career Fair"), "tent");
  assert.equal(iconFor("skill", "Set up LinkedIn"), "link");
  assert.equal(iconFor("project", "Build a dashboard"), "code");
});

function sample(open: boolean[]) {
  const counts = [4, 5, 3, 6, 4, 2, 1, 1];
  return buildRoad({ counts, open, fork: 4, current: 4, doneInCurrent: 2, addInCurrent: true, spurs: 2 });
}

test("an open semester has one flag spot per item, in order along the road", () => {
  const road = sample([false, false, false, false, true, false, false, false]);
  assert.equal(road.itemIdx[4].length, 4);
  assert.deepEqual(road.itemIdx[3], []);
  const idx = road.itemIdx[4];
  for (let i = 1; i < idx.length; i++) assert.ok(idx[i] > idx[i - 1]);
  assert.ok(road.rest > idx[1] && road.rest < idx[2], "the student stands between done and to do");
  assert.ok(road.fork.idx > idx[3] && road.fork.idx < road.nodeIdx[5], "the fork comes right after junior fall");
});

test("labels never sit on the road, whatever is open", () => {
  for (const open of [Array(8).fill(true), [true, false, false, false, false, false, false, false], [false, false, false, true, false, false, false, false]]) {
    const road = sample(open);
    const flags = road.itemIdx.flatMap((list) => list.map((i) => ({ at: road.S[i], title: "Kaggle project with friends", sub: "Added by you · Oct 2026" })));
    const { labels, hitsRoad } = placeLabels(road, flags, [], { w: 200, h: 30 });
    labels.forEach((l) => assert.equal(hitsRoad(l), 0));
    for (let a = 0; a < labels.length; a++)
      for (let b = a + 1; b < labels.length; b++) {
        const x = labels[a];
        const y = labels[b];
        assert.ok(!(x.x < y.x + y.w && x.x + x.w > y.x && x.y < y.y + y.h && x.y + x.h > y.y), "labels don't overlap");
      }
  }
});

test("long titles wrap to two lines inside the label", () => {
  assert.equal(labelSize("Build a dashboard project for your portfolio", "To do").h, 58);
  assert.equal(labelSize("Set up LinkedIn", "Done · Nov 2024").h, 40);
});

test("milestones are things you finished, not chores, practice or to-dos", () => {
  const yes: Array<[string, string]> = [
    ["event", "Go to both days of the Career Fair"],
    ["event", "Go to HackIU, your first hackathon"],
    ["networking", "Join the Data Science Club"],
    ["experience", "Summer data internship at Hoosier Health"],
    ["project", "Build a small project with real data"],
    ["certification", "Earn the Google Data Analytics certificate"],
    ["skill", "Make your first resume with the career center template"],
    ["skill", "Learn SQL on a Forage job simulation"],
  ];
  const no: Array<[string, string]> = [
    ["event", "Register for the Career Fair in Handshake"],
    ["event", "Practice at the mock career fair"],
    ["skill", "Try the free Kaggle SQL lessons"],
    ["skill", "Update your LinkedIn headline to say what you want"],
    ["application", "Apply to 3 Data analyst internships before the fair"],
    ["coaching", "Mock technical interview: SQL and a case"],
    ["event", "Get your resume reviewed at the pre-fair drop-in"],
    ["networking", "Coffee chat with an alum"],
    ["event", "Employer info session"],
    ["skill", "Set up LinkedIn and GitHub"],
    ["course", "CSCI-B 365"],
    ["event", "Build your 30-second pitch at the elevator pitch workshop"],
  ];
  yes.forEach(([k, t]) => assert.equal(isMilestone(k, t), true, t));
  no.forEach(([k, t]) => assert.equal(isMilestone(k, t), false, t));
});

test("done flags read like wins", () => {
  assert.equal(winTitle("Go to both days of the Career Fair"), "Went to both days of the Career Fair");
  assert.equal(winTitle("Make your first resume"), "Made your first resume");
  assert.equal(winTitle("Research assistant at the Social Media Lab"), "Research assistant at the Social Media Lab");
});
