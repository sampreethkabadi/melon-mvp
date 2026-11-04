import type { DraftInsight, Segment } from "./types";

// An invented conversation for rehearsals and the demo, with suggestions saved in advance, so the demo
// works with no microphone, speech-to-text service or AI key. The screens label it as a sample.

type Line = ["staff" | "student", string];

export function sampleConversation(student: { first: string; major: string; focus: string }): { segments: Segment[]; insights: DraftInsight[] } {
  const { first, major, focus } = student;
  const lines: Line[] = [
    ["staff", `Thanks for coming in, ${first}. What's on your mind this week?`],
    ["student", `I've been thinking about my plans after ${major}. I'm most interested in ${focus}, but I don't know if I'm doing enough.`],
    ["staff", "What have you done so far that relates to it?"],
    ["student", "A couple of classes and one small project. I haven't applied to any internships yet because my resume feels thin."],
    ["staff", "That's common. Do you have a target for next summer?"],
    ["student", `I want to land a summer internship in ${focus}. That's my main goal this year.`],
    ["staff", "Good. Then let's make your project count. Can you finish it and put it on GitHub in the next two weeks?"],
    ["student", "Yes, I can do that."],
    ["staff", "And I'd like you to bring your updated resume to the career center drop-in hours before the fair."],
    ["student", "Okay. Honestly I'm worried about networking. Talking to recruiters makes me really nervous."],
    ["staff", "Let's take that one step at a time. Reach out to two alumni for short chats this month. Those are low pressure."],
    ["student", "I can do two. Should I change anything in my classes for spring?"],
    ["staff", "I'd add a statistics or methods course in spring. It'll help you with the kind of work you're describing."],
    ["student", "That makes sense. I've also been teaching myself SQL, and I'm getting pretty comfortable with it."],
    ["staff", "Great, add that to your resume too. Let's check in again after the career fair."],
  ];
  const segments: Segment[] = lines.map(([speaker, text], idx) => ({ idx, start_ms: idx * 12000, end_ms: (idx + 1) * 12000, speaker, text }));
  const insights: DraftInsight[] = [
    { kind: "summary", text: `${first} wants a summer internship in ${focus} but hasn't applied yet and feels their resume is thin. They agreed to finish a project, update their resume, and start with two alumni chats.`, evidence: [1, 3, 5, 6, 8, 10] },
    { kind: "goal", text: `Land a summer internship in ${focus}`, evidence: [5] },
    { kind: "action", text: "Finish your project and put it on GitHub within two weeks", roadmap_kind: "project", evidence: [6, 7] },
    { kind: "action", text: "Bring your updated resume to career center drop-in hours before the fair", roadmap_kind: "coaching", evidence: [8, 9] },
    { kind: "action", text: "Reach out to two alumni for short chats this month", roadmap_kind: "networking", evidence: [10, 11] },
    { kind: "course_change", text: "Add a statistics or methods course in spring", evidence: [12, 13] },
    { kind: "skill", text: "SQL (self-taught, getting comfortable)", evidence: [13] },
    { kind: "concern", text: "Nervous about talking to recruiters", evidence: [9] },
  ];
  return { segments, insights };
}

/** An earlier conversation, used only for seeded history, so a student's briefing has a past to show. */
export function earlierConversation(first: string): { segments: Segment[]; insights: DraftInsight[] } {
  const lines: Line[] = [
    ["staff", `Good to meet you, ${first}. What would you like to figure out this semester?`],
    ["student", "I like data work, but I can't decide between analytics and machine learning."],
    ["staff", "What have you tried in each?"],
    ["student", "Mostly Python in class. I'm not sure I'm technical enough for machine learning."],
    ["staff", "You don't need to decide today. Try the SQL window functions tutorial this month and tell me how it goes."],
    ["student", "Okay, I'll do that."],
    ["staff", "Also update your LinkedIn headline so it says what you're aiming for."],
    ["student", "Will do. By the end of the month I want to know which one to focus on."],
  ];
  const segments: Segment[] = lines.map(([speaker, text], idx) => ({ idx, start_ms: idx * 12000, end_ms: (idx + 1) * 12000, speaker, text }));
  const insights: DraftInsight[] = [
    { kind: "summary", text: `${first} is choosing between analytics and machine learning and doubts they're technical enough for machine learning. They agreed to try a SQL tutorial and update their LinkedIn.`, evidence: [1, 3, 4, 6] },
    { kind: "goal", text: "Decide between analytics and machine learning", evidence: [1, 7] },
    { kind: "action", text: "Try the SQL window functions tutorial this month", roadmap_kind: "skill", evidence: [4, 5] },
    { kind: "action", text: "Update your LinkedIn headline to say what you're aiming for", roadmap_kind: "networking", evidence: [6, 7] },
    { kind: "skill", text: "Python from coursework", evidence: [3] },
    { kind: "concern", text: "Not sure they're technical enough for machine learning", evidence: [3] },
  ];
  return { segments, insights };
}
