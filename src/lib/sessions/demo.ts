import type { DraftInsight, Segment } from "./types";

// Short invented conversations for rehearsals and the demo, one per session type, with suggestions saved
// in advance, so the demo works with no microphone, speech-to-text service or AI key. The screens label
// them as samples. Coach sessions are about careers; advisor sessions are about courses and policy only.
// Each one ends with at most 2 steps for the student.

type Line = ["staff" | "student", string];
export type SampleContext = {
  first: string;
  major: string;
  /** The student's pinned path, in lower case ("data & analytics"). */
  focus: string;
  /** First job on that path, in lower case ("data analyst"). */
  job: string;
  /** Another area the student brings up, so the roadmap can grow a branch ("cybersecurity"). */
  explore: string;
  type: string;
  /** "junior", "freshman" and so on. */
  year: string;
  /** Dates from the career center calendar, as YYYY-MM-DD. */
  dates: { mockFair: string; fair1: string; resumeDropIn: string; networkingNight: string; springRegistration: string; minorForm: string; dropW: string };
};
type Sample = { lines: Line[]; insights: DraftInsight[] };

const md = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

function build(c: SampleContext): Sample {
  const { first, focus, job, explore, dates: d } = c;
  switch (c.type) {
    case "Career fair preparation":
      return {
        lines: [
          ["staff", `Hi ${first}! The fair is two weeks out. How are you feeling about it?`],
          ["student", `Honestly a little nervous. I want a ${job} internship, but my pitch is all over the place.`],
          ["staff", "Totally normal. Say your pitch to me now, like I'm a recruiter."],
          ["student", `Hi, I'm ${first}, a ${c.major} ${c.year}... I like ${focus} and I'm looking for internships?`],
          ["staff", "Good start. Lead with one project and what it found, not your GPA. Recruiters remember a result."],
          ["student", "So my class project on campus bike-share data would work?"],
          ["staff", `Perfect. Rewrite your pitch around it, and try it out at the mock career fair on ${md(d.mockFair)}. Mistakes don't count there.`],
          ["student", "Okay, I'll rewrite it this weekend. Should I also go to events outside campus?"],
          ["staff", "Yes. There's an Indy tech meetup next month. Going outside school is how people find hidden roles."],
          ["student", `Actually, at the last info session I talked to a ${explore} team. I think I want to explore ${explore} too.`],
          ["staff", `Love that. Keep ${focus} pinned for now, and add ${explore} as a path to explore. The fair has ${explore} employers on Day 1.`],
          ["student", "Great. I'll make a list of five companies to visit."],
        ],
        insights: [
          { kind: "summary", text: `${first} is preparing for the Fall Career Fair and wants a ${job} internship. They practiced their pitch and want to explore ${explore} alongside ${focus}.`, evidence: [1, 3, 9] },
          { kind: "action", text: "Rewrite your 30-second pitch around your bike-share project", roadmap_kind: "networking", evidence: [5, 6, 7], due_date: d.mockFair },
          { kind: "action", text: "List 5 companies to visit at the fair, including 2 hiring in " + explore, roadmap_kind: "event", evidence: [10, 11], due_date: d.fair1 },
          { kind: "advice", text: "Lead your pitch with one project and what it found, not your GPA", evidence: [4, 5] },
          { kind: "advice", text: "Go to events outside campus too, like the Indy tech meetup", evidence: [8] },
          { kind: "interest", text: `Wants to explore ${explore} as a second path`, evidence: [9, 10] },
          { kind: "concern", text: "Nervous about talking to recruiters", evidence: [1] },
        ],
      };
    case "Career exploration":
      return {
        lines: [
          ["staff", `What brings you in today, ${first}?`],
          ["student", `I'm in ${c.major}, but I'm not sure what jobs it leads to.`],
          ["staff", "What's a class or project you actually enjoyed?"],
          ["student", "The one where we built something real for a local business. I lost track of time."],
          ["staff", `That fits ${focus} well. Roles like ${job} do a lot of that.`],
          ["student", `I've also wondered about ${explore}.`],
          ["staff", `Then explore both. Join one club for each, and come to the alumni coffee chat. You'll hear real stories.`],
          ["student", "Which club first?"],
          ["staff", "Start with the one that meets this week. Going once is enough to decide."],
        ],
        insights: [
          { kind: "summary", text: `${first} enjoys hands-on project work and is curious about ${explore}. They'll try one club and an alumni chat to compare.`, evidence: [3, 5, 6] },
          { kind: "action", text: `Go to one ${focus} club meeting on beInvolved`, roadmap_kind: "networking", evidence: [6, 8] },
          { kind: "action", text: "Go to the alumni coffee chat", roadmap_kind: "networking", evidence: [6] },
          { kind: "interest", text: `Wants to explore ${explore}`, evidence: [5, 6] },
          { kind: "advice", text: "Follow the work where you lose track of time", evidence: [3, 4] },
        ],
      };
    case "Mock technical interview":
      return {
        lines: [
          ["staff", `Let's do this like the real thing, ${first}. Walk me through how you'd find duplicate customers in a table.`],
          ["student", "I'd... group by email and count, I think?"],
          ["staff", "Good instinct. Say your thinking out loud as you go. Interviewers grade the process."],
          ["student", "Okay. Group by email, keep the ones with a count over one, then join back to see the rows."],
          ["staff", "Nice. What if emails differ only in capital letters?"],
          ["student", "Oh. I'd lower-case them first."],
          ["staff", "Exactly. You froze at the start, though. Use a one-line plan before you write anything."],
          ["student", "That helps. Can we do another one next week?"],
          ["staff", "Yes. Meanwhile, do two practice problems a week, out loud."],
        ],
        insights: [
          { kind: "summary", text: `${first} solved a SQL question with hints. They think clearly once started but froze at the beginning.`, evidence: [1, 3, 6] },
          { kind: "action", text: "Do 2 practice problems a week, saying your thinking out loud", roadmap_kind: "skill", evidence: [8] },
          { kind: "action", text: "Book a second mock technical interview", roadmap_kind: "coaching", evidence: [7] },
          { kind: "advice", text: "Say a one-line plan before you write anything", evidence: [6] },
          { kind: "skill", text: "SQL (grouping and joins)", evidence: [3, 5] },
        ],
      };
    case "Mock behavioral interview":
    case "Interview preparation":
      return {
        lines: [
          ["staff", `Tell me about a time you worked on a team that struggled, ${first}.`],
          ["student", "In a group project, two people stopped replying, so I just did their parts."],
          ["staff", "Okay. Interviewers want to hear what you did to fix the team, not just the work."],
          ["student", "I did set up a quick call to split tasks again, and it helped."],
          ["staff", "That's your story! Use situation, task, action, result. End with the result."],
          ["student", "So: we finished on time and got an A?"],
          ["staff", "Yes. Write three stories like that: teamwork, a mistake, and leading something."],
          ["student", "I can do that this week."],
        ],
        insights: [
          { kind: "summary", text: `${first} has good examples but tells them without the result. They'll write three STAR stories.`, evidence: [1, 3, 6] },
          { kind: "action", text: "Write 3 STAR stories: teamwork, a mistake, and leading something", roadmap_kind: "coaching", evidence: [6, 7] },
          { kind: "advice", text: "End every story with the result", evidence: [4, 5] },
        ],
      };
    case "Mock case interview":
      return {
        lines: [
          ["staff", `A coffee chain's profits fell 10%. How would you start, ${first}?`],
          ["student", "Maybe they raised prices too much?"],
          ["staff", "Before guessing, split it: profit is revenue minus costs. Which side moved?"],
          ["student", "Okay, I'd ask for revenue and costs over the last year."],
          ["staff", "Great. That structure is the whole game. Practice it out loud with a friend."],
          ["student", "Is there a casebook I can use?"],
          ["staff", "The career center has one. Do two cases this week."],
        ],
        insights: [
          { kind: "summary", text: `${first} jumped to a guess, then built a clear structure with a hint.`, evidence: [1, 3] },
          { kind: "action", text: "Do 2 practice cases from the career center casebook", roadmap_kind: "coaching", evidence: [5, 6] },
          { kind: "advice", text: "Structure first (revenue and costs), guess second", evidence: [2, 4] },
        ],
      };
    case "Resume, cover letter or portfolio review":
      return {
        lines: [
          ["staff", `Thanks for sending this, ${first}. First thing: your best project is at the bottom.`],
          ["student", "I put it last because it was just for a class."],
          ["staff", "Class projects count. Move it to the top and add the result, with a number."],
          ["student", "We cut the report time from an hour to five minutes."],
          ["staff", "That's your headline bullet. Also, start every bullet with a verb."],
          ["student", "Should it be one page?"],
          ["staff", "Yes, one page. Send me the new version before the fair."],
        ],
        insights: [
          { kind: "summary", text: `${first}'s resume buries their strongest project. They'll move it up, add numbers, and resend before the fair.`, evidence: [0, 2, 6] },
          { kind: "action", text: "Move your best project to the top and add one number to each bullet", roadmap_kind: "coaching", evidence: [2, 3], due_date: d.resumeDropIn },
          { kind: "advice", text: "Class projects count. Start every bullet with a verb", evidence: [2, 4] },
        ],
      };
    case "LinkedIn profile review":
      return {
        lines: [
          ["staff", `Your headline just says "Student". Let's make it say where you're going, ${first}.`],
          ["student", `Like "${c.major} student, aspiring ${job}"?`],
          ["staff", "Yes, and add one skill. Then put your project in Featured."],
          ["student", "I don't have a good photo."],
          ["staff", "There are free headshots at the career fair. Grab one."],
        ],
        insights: [
          { kind: "summary", text: `${first} will update their LinkedIn headline and feature a project.`, evidence: [0, 2] },
          { kind: "action", text: `Change your LinkedIn headline to "${c.major} student, aspiring ${job}"`, roadmap_kind: "networking", evidence: [1, 2] },
          { kind: "action", text: "Get a free headshot at the career fair", roadmap_kind: "networking", evidence: [3, 4], due_date: d.fair1, firm: true },
        ],
      };
    case "Job offer negotiation":
      return {
        lines: [
          ["staff", `Congrats on the offer, ${first}! What are you unsure about?`],
          ["student", "The salary seems a bit low, but I don't want to seem ungrateful."],
          ["staff", "Asking politely is normal. Look up the typical range for the role and city first."],
          ["student", "And if it's higher?"],
          ["staff", "Thank them, share the range, and ask if there's flexibility. Let's practice the email together next time."],
        ],
        insights: [
          { kind: "summary", text: `${first} has an offer and wants to ask about salary without seeming ungrateful.`, evidence: [1] },
          { kind: "action", text: "Look up the typical salary range for the role and city", roadmap_kind: "application", evidence: [2] },
          { kind: "advice", text: "Thank them, share the range, ask about flexibility", evidence: [4] },
        ],
      };
    case "Internship search":
      return {
        lines: [
          ["staff", `How's the search going, ${first}?`],
          ["student", "I've applied to two places and heard nothing."],
          ["staff", "Two is a start. Most students need 20 or more. Let's set a weekly goal."],
          ["student", "Maybe five a week?"],
          ["staff", `Great. And use Handshake filters for ${job} roles. Plus, message one alum per week.`],
          ["student", "That feels doable."],
        ],
        insights: [
          { kind: "summary", text: `${first} has applied to 2 internships and will aim for 5 a week plus one alum message.`, evidence: [1, 3, 4] },
          { kind: "action", text: `Apply to 5 ${job} internships this week`, roadmap_kind: "application", evidence: [3, 4] },
          { kind: "action", text: "Message one alum on LinkedIn", roadmap_kind: "networking", evidence: [4] },
          { kind: "advice", text: "Most students apply to 20 or more before an offer", evidence: [2] },
        ],
      };
    case "LinkedIn headshot":
      return {
        lines: [
          ["staff", `Ready for your photo, ${first}? Chin slightly down, and relax your shoulders.`],
          ["student", "Like this?"],
          ["staff", "Perfect. I'll email it today. Put it on LinkedIn tonight."],
        ],
        insights: [
          { kind: "summary", text: `${first} had a LinkedIn headshot taken.`, evidence: [0, 2] },
          { kind: "action", text: "Add your new headshot to LinkedIn", roadmap_kind: "networking", evidence: [2] },
        ],
      };
    // ---------------------------------------------------------------- advisor sessions: courses and policy only
    case "Course planning":
      return {
        lines: [
          ["staff", `Let's plan spring, ${first}. Registration opens ${md(d.springRegistration)}.`],
          ["student", "I need one more major elective. I was thinking STAT 450."],
          ["staff", `That works. If you're interested in ${explore}, Network Security Basics also counts as a major elective.`],
          ["student", "Oh, I didn't know that. I'd rather take that one."],
          ["staff", "Fine by me. Keep STAT 450 as your backup in case it fills."],
          ["student", "Do I need anything else to graduate on time?"],
          ["staff", "You're on track. Just keep 15 credits each semester."],
        ],
        insights: [
          { kind: "summary", text: `${first} is on track to graduate. For spring they'll take Network Security Basics as a major elective, with STAT 450 as a backup.`, evidence: [2, 3, 4, 6] },
          { kind: "course_change", text: "Take Network Security Basics in spring instead of STAT 450", evidence: [2, 3] },
          { kind: "action", text: "Register for spring classes when registration opens", roadmap_kind: "course", evidence: [0], due_date: d.springRegistration, firm: true },
          { kind: "advice", text: "Keep 15 credits each semester to graduate on time", evidence: [6] },
        ],
      };
    case "Degree progress check":
      return {
        lines: [
          ["staff", `Your degree audit looks good, ${first}. You have 2 requirements left.`],
          ["student", "Which ones?"],
          ["staff", "One upper-level elective and the writing requirement."],
          ["student", "Can I do the writing one in spring?"],
          ["staff", "Yes. Add it to your spring plan now so it doesn't slip."],
        ],
        insights: [
          { kind: "summary", text: `${first} has 2 requirements left: an upper-level elective and the writing requirement.`, evidence: [0, 2] },
          { kind: "action", text: "Add the writing requirement course to your spring plan", roadmap_kind: "course", evidence: [3, 4] },
        ],
      };
    case "Declare or change a major or minor":
      return {
        lines: [
          ["staff", `So you'd like to add the Business minor, ${first}?`],
          ["student", "Yes. Is it too late?"],
          ["staff", `Not at all. Submit the minor form by ${md(d.minorForm)} and you're set.`],
          ["student", "Will it delay graduation?"],
          ["staff", "No. Two of your courses already count toward it."],
        ],
        insights: [
          { kind: "summary", text: `${first} is adding the Business minor. It won't delay graduation.`, evidence: [0, 4] },
          { kind: "action", text: "Submit the minor declaration form", roadmap_kind: "course", evidence: [2], due_date: d.minorForm, firm: true },
        ],
      };
    case "Academic policy question":
      return {
        lines: [
          ["staff", `What's the question, ${first}?`],
          ["student", "I'm struggling in one class. What happens if I drop it?"],
          ["staff", `Before ${md(d.dropW)} there's no W on your transcript. After that it shows a W, which is okay but worth avoiding.`],
          ["student", "I'll talk to the professor first."],
          ["staff", "Good plan. Come back if you decide to drop."],
        ],
        insights: [
          { kind: "summary", text: `${first} asked about dropping a class and will talk to the professor first.`, evidence: [1, 3] },
          { kind: "action", text: "Talk to your professor before deciding to drop", roadmap_kind: "course", evidence: [3], due_date: d.dropW, firm: true },
        ],
      };
    case "Advising drop-in":
    case "Drop-in":
    default:
      return c.type === "Advising drop-in"
        ? {
            lines: [
              ["staff", `Quick question today, ${first}?`],
              ["student", "Does an internship count for credit?"],
              ["staff", "It can, through the internship course. You'd register the semester you do it."],
            ],
            insights: [{ kind: "summary", text: `${first} asked whether an internship can count for credit. It can, through the internship course.`, evidence: [1, 2] }],
          }
        : {
            lines: [
              ["staff", `Hey ${first}, what's up?`],
              ["student", "Is it worth going to the fair as a freshman?"],
              ["staff", "Absolutely. Just look around and grab a few names. Next year will feel much easier."],
            ],
            insights: [
              { kind: "summary", text: `${first} asked whether the fair is worth it this early. It is.`, evidence: [1, 2] },
              { kind: "advice", text: "Go to the fair just to look around and collect names", evidence: [2] },
            ],
          };
  }
}

export function sampleConversation(c: SampleContext): { segments: Segment[]; insights: DraftInsight[] } {
  const { lines, insights } = build(c);
  return { segments: toSegments(lines), insights };
}

/** An earlier coach session, used only for seeded history, so a student's briefing has a past to show. */
export function earlierConversation(first: string): { segments: Segment[]; insights: DraftInsight[] } {
  const lines: Line[] = [
    ["staff", `Good to meet you, ${first}. What would you like to figure out this semester?`],
    ["student", "I like data work, but I can't decide between analytics and machine learning."],
    ["staff", "You don't need to decide today. Try the free SQL lessons on Kaggle and tell me how it goes."],
    ["student", "Okay, I'll do that."],
    ["staff", "Also update your LinkedIn headline so it says what you're aiming for."],
    ["student", "Will do."],
  ];
  return {
    segments: toSegments(lines),
    insights: [
      { kind: "summary", text: `${first} is choosing between analytics and machine learning. They'll try free SQL lessons and update LinkedIn.`, evidence: [1, 2, 4] },
      { kind: "action", text: "Try the free Kaggle SQL lessons", roadmap_kind: "skill", evidence: [2, 3] },
      { kind: "action", text: "Update your LinkedIn headline to say what you're aiming for", roadmap_kind: "networking", evidence: [4, 5] },
      { kind: "advice", text: "You don't have to pick one path yet", evidence: [2] },
    ],
  };
}

function toSegments(lines: Line[]): Segment[] {
  return lines.map(([speaker, text], idx) => ({ idx, start_ms: idx * 15000, end_ms: (idx + 1) * 15000, speaker, text }));
}
