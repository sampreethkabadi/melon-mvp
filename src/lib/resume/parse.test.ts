import assert from "node:assert/strict";
import { test } from "node:test";
import { parseResumeText } from "./parse.ts";

const RESUME = `Jordan A. Rivers
jrivers@iu.edu | (812) 555-0100 | linkedin.com/in/jordan-rivers | github.com/jrivers

EDUCATION
Indiana University Bloomington
B.S. in Data Science, Expected May 2028
Minor: Business and Economics
GPA 3.8

EXPERIENCE
Data Intern, Acme Corp, June 2026 - August 2026
- Built dashboards in Tableau and wrote SQL

ACTIVITIES
Data Science Club | Treasurer
Hoosier Hackers - Member
• Organized 3 events for 200 students

SKILLS
Languages: Python, SQL, Java
Tools: Tableau, Git
`;

test("reads the main profile fields", () => {
  const r = parseResumeText(RESUME);
  assert.equal(r.full_name, "Jordan A. Rivers");
  assert.equal(r.program, "B.S. Data Science");
  assert.deepEqual(r.majors, ["Data Science"]);
  assert.deepEqual(r.minors, ["Business", "Economics"]);
  assert.equal(r.expected_grad_term, "May 2028");
  assert.deepEqual(r.clubs, ["Data Science Club", "Hoosier Hackers"]);
  assert.deepEqual(r.skills, ["Python", "SQL", "Java", "Tableau", "Git"]);
  assert.equal(r.links.linkedin, "https://linkedin.com/in/jordan-rivers");
  assert.equal(r.links.github, "https://github.com/jrivers");
  assert.equal(r.interests[0], "data");
});

test("never keeps email or phone", () => {
  const json = JSON.stringify(parseResumeText(RESUME));
  assert.ok(!json.includes("jrivers@iu.edu"));
  assert.ok(!json.includes("555-0100"));
});

test("handles an all-caps name, a labelled major and a future term", () => {
  const r = parseResumeText("SAM OKAFOR\n\nEducation\nBachelor of Science\nMajor: Computer Science, Mathematics\nAnticipated graduation: Spring 2028\n");
  assert.equal(r.full_name, "Sam Okafor");
  assert.deepEqual(r.majors, ["Computer Science", "Mathematics"]);
  assert.equal(r.expected_grad_term, "Spring 2028");
});

test("doesn't take the job section's dates for the graduation date", () => {
  const r = parseResumeText("Ava Chen\nEducation\nB.A. in Economics, May 2029\nExperience\nIntern, Fall 2030\n");
  assert.equal(r.expected_grad_term, "May 2029");
});

test("returns empty fields, not guesses, for text it can't read", () => {
  const r = parseResumeText("lorem ipsum dolor sit amet 12345");
  assert.equal(r.full_name, null);
  assert.equal(r.program, null);
  assert.deepEqual(r.majors, []);
  assert.deepEqual(r.interests, []);
});

test("short words inside other words don't count as interests", () => {
  assert.deepEqual(parseResumeText("Worked with luxury brands and digital tools").interests, []);
});

test("doesn't read a state abbreviation as a degree", () => {
  const r = parseResumeText("Ava Chen\nEducation\nBoston University, Boston, MA Expected May 2029\n");
  assert.equal(r.program, null);
  assert.deepEqual(r.majors, []);
  assert.equal(r.expected_grad_term, "May 2029");
});
