# Melon MVP

Career roadmaps that remember every advising session. This is the proof of concept for the InnoQuest demo. **It uses mock students and invented data only: don't enter real student information or real resumes.**

**Stack:** Next.js 15 (App Router, TypeScript, Tailwind 4) · Supabase (login, Postgres with row-level security, file storage) · Vercel (hosting).

## Build steps

| Step | What | Status |
|---|---|---|
| 1 | Foundation: database, login, roles, app shells, test data | ✅ |
| 2 | Student onboarding: resume autofill, profile, year questions, first roadmap draft (held for advisor approval) | ✅ |
| 3 | Student roadmap page | ✅ |
| 4 | Staff: Today, briefing, consent, capture, transcript, review, roadmap publishing and updates | ✅ |
| 3 (rest) | Student app: home, action items, sessions, rewards, resources, notifications | ✅ |
| 3b | Feedback round: fewer steps, one-click approval, pins by year, session types, highlights and flags, demo date | ✅ |
| 3c | Both sides accept the roadmap, concerns stay with staff, sign-in by emailed code | ✅ |
| 4b | Advisor view: suggestions on accepted roadmaps, approval queue, student overview, meeting prep | ✅ |
| 3d | Candy road: semesters as buttons, flags for what you did, a hover summary, the path fork in junior fall, adding your own wins | ✅ |
| 3e | Design review: Sessions renamed Appointments, Home as one clickable dashboard, Action items with a Career Fair plan and undo, team avatars, a Profile page, per-job lists, Jake's-style sample resumes | ✅ |
| 3 (later) | Student settings | |
| 5 | Test prep: test script, feedback capture, fixes | |

## One-time setup (about 20 minutes)

### 1. Supabase: create the database

1. In your Supabase project, open **SQL Editor > New query**.
2. Paste all of [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) and click **Run**. You should see "Success. No rows returned". Then do the same, one new query each, with [`0002_roadmap_drafts.sql`](supabase/migrations/0002_roadmap_drafts.sql), [`0003_sessions_and_assignment.sql`](supabase/migrations/0003_sessions_and_assignment.sql), [`0004_branch_tree.sql`](supabase/migrations/0004_branch_tree.sql), [`0005_student_tabs.sql`](supabase/migrations/0005_student_tabs.sql) and [`0006_focus_and_pins.sql`](supabase/migrations/0006_focus_and_pins.sql), [`0007_accept_and_privacy.sql`](supabase/migrations/0007_accept_and_privacy.sql), [`0008_advisor_suggestions.sql`](supabase/migrations/0008_advisor_suggestions.sql), [`0009_candy_road.sql`](supabase/migrations/0009_candy_road.sql). Skip any you've already run.
3. Open **Authentication > URL Configuration**:
   - **Site URL:** your Vercel link (for example `https://melon-mvp.vercel.app`). Fill this in after step 2 below.
   - **Redirect URLs:** add `https://YOUR-VERCEL-LINK/auth/callback` and `http://localhost:3000/auth/callback`.
4. Open **Project Settings > API** and keep this page open. You need the project URL, the `anon` (public) key and the `service_role` (secret) key.

### 2. Vercel: put it online

1. On vercel.com, click **Add New > Project** and import `melon-mvp` from GitHub. Keep the defaults (Next.js).
2. Before clicking Deploy, open **Environment Variables** and add:

| Name | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase `anon` / publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase `service_role` / secret key (never share this) |
| `NEXT_PUBLIC_ALLOWED_EMAIL_DOMAINS` | `iu.edu` |
| `SEED_SECRET` | any long random string you make up |
| `SEED_PASSWORD` | a password for the test accounts, 10+ characters |
| `ANTHROPIC_API_KEY` | optional: Claude drafts session suggestions |
| `DEEPGRAM_API_KEY` | optional: turns recordings into transcripts, and turns on the record button |
| `NEXT_PUBLIC_DEMO_TODAY` | optional: the date the app pretends is today. Defaults to `2026-09-03`, two weeks before the Fall Career Fair. Set `off` for the real date, then re-open the test data link |

3. Click **Deploy**. If you add or change a variable later, redeploy (Deployments > ⋯ > Redeploy).

### 3. Load the test data

Open `https://YOUR-VERCEL-LINK/api/dev/seed?secret=YOUR_SEED_SECRET` in a browser. It's safe to run again, and **running it again resets every test student**, so use it to start each rehearsal clean. It creates:

- **School:** Indiana University (accepts `@iu.edu` and `@melon.test` emails)
- **Demo day:** Thursday, Sep 3, 2026. The Fall Career Fair is Sep 17–18, and the career center's events (resume drop-in, pitch workshop, mock fair, alumni chat) are dated around it.
- **Advisors (courses and policy):** `lee@`, `malik@`, `becker@melon.test`, with 4 students each
- **Career coach (careers):** `rivera@melon.test`, assigned to everyone. `admin@melon.test` (admin)
- **Lee's students:** `leo@` (freshman), `maya@` (junior, published roadmap and 2 past coach sessions), `sam@` (junior), `priya@` (senior, draft waiting for review), all `@melon.test`
- **Other students:** `ava@`, `daniel@`, `nina@`, `omar@` (Malik), `grace@`, `tyler@`, `zoe@`, `marcus@` (Becker), all `@melon.test`
- Demo-day appointments, each with the type the student booked (for example Maya: Course planning with Lee, Career fair preparation with Rivera)
- A short "start here, then this" list per path and year (juniors and up: per job, for 12 common jobs), clubs on beInvolved, career center events, alumni stories, 3 rewards, 5 integrations
- Past semesters for Maya, Priya and Sam: courses (as if from school records) and jobs and projects (as if from their resumes), so their roads look lived-in

Sign in to test accounts with **Have a test account? Use a password** and your `SEED_PASSWORD`.

### 4. Email: let people sign in with their school address

Supabase's built-in sender is limited to a few emails an hour and is only meant for trying things out, so connect your own.

1. Create an account with an email service and get its SMTP details.
2. In Supabase, open **Authentication > Emails > SMTP Settings**, turn on custom SMTP, and enter them.
3. In **Authentication > Emails > Templates**, paste [`supabase/email-templates/sign-in-code.html`](supabase/email-templates/sign-in-code.html) into both **Magic Link** and **Confirm signup**. School mail filters can use up emailed links, so students type the code instead.
4. In **Authentication > Rate Limits**, raise the emails-per-hour limit to fit your testing.

## Demo walkthrough

A roadmap is final only when both sides agree. The advisor or coach clicks **Approve and send to student**, then the student reads it and clicks **Accept my roadmap**. Finishing a session doesn't publish a draft: its steps wait in the draft.

Use two browser windows, or one normal and one private: Rivera in one, Maya in the other. Reset first by opening the test data link.

1. **Maya, Home:** one dashboard. Every card opens what it's about and ends with the next thing to do: the Career Fair countdown and her fair steps, her next appointment, skills, career vibe, streak and swag. **Action items:** her fair steps as one numbered plan, then Upcoming and Done this semester. Tick a step: Undo stays for 4 seconds, then it moves to Done. Her avatar (top right) opens **Profile** with her team. **Roadmap:** her candy road. Flags are milestones only (things she'd put on a resume), worded as wins. Semesters 1 to 4 are done; tap one to plant its green flags and hover one for a short summary. This semester's milestones are faded crimson flags: hover the Fall Career Fair to see its 4 action items, or mark "Take a leadership role" done with **I did this** and watch it turn green. **See details** on any flag lists the action items behind it. Later semesters show faded milestones from the Luddy four-year guide. To show **Did you go?** on the fair flag, set `NEXT_PUBLIC_DEMO_TODAY=2026-09-18` and open the seed link again.
2. **Rivera, Today:** open Maya's briefing (Career fair preparation), then **Start session** and **I agree to record**. **Maya, Home:** **I agree**.
3. **Rivera:** **Use the sample conversation**. Check the highlights, remove or edit anything wrong, then **Looks good · send to Maya**. One click; nothing else to approve.
4. **Maya, Roadmap:** a new **Cybersecurity** branch, "What changed", and the 2 new steps (never more than 2 from one session, and never more than 5 open). **Rewards:** the sticker pack unlocks (3 appointments). **Claim it** gives a pickup code.
5. **Maya, Roadmap:** **Switch my pin to this path**. Juniors and up pin one path, so Data analyst pauses its steps, and "Building your path" and **Resources** switch to cybersecurity. Pin Data analyst again and its steps come back.
6. **Maya, Appointments:** colored highlights, with **Expand the full transcript** if she wants it. **Flag a mistake** on a highlight. **Rivera** gets a notification and fixes, removes or keeps it from the session page.
7. **Lee, Today:** Maya's **Course planning** session. Advisor samples stay on courses and policy, and their steps are course steps.
8. **Admin, Advisors:** move Maya to Dr. Malik. **Malik, Students, Maya:** the briefing carries over the history, and the roadmap shows as a short card with the full version one click away.

Freshmen and sophomores can pin 2 paths and get gentler lists; juniors and up pin 1. With no API keys, all of this still works: the screens say when a conversation is a sample and when suggestions were saved in advance.

## What advisors and coaches get

- **Today:** a card for each meeting with what it's probably about, the student's progress, their background and what's still open. The next meeting opens on its own. It's built from their record, so it needs no AI key.
- **Students:** everyone at a glance, with progress and what needs a look. Filter, search or sort, and open a row for details.
- **Reviews:** action items and key points from each session, next to the transcript lines behind them. Approve, edit or remove them one by one, or approve the rest in one click.
- **Roadmaps:** drafts are edited directly. Once both sides have accepted a roadmap, staff can only suggest adding, changing or removing a step, and the student decides. The database enforces this. Steps approved from a session still go straight on, because they were agreed in the meeting.

## How new sign-ups get an advisor

New sign-ups go to the advisor with the fewest active students, picked at random on a tie, and to the coach the same way. Admins can move a student under **Advisors**. To change an advisor list, set `role` on their row in `profiles`.

## Who can see what

Enforced in the database, not just the app (see the migration):

- Students see only their own data.
- Students can't see a roadmap until their advisor or coach approves it, and it's final only once the student accepts. Students can't approve anything themselves.
- Concerns are staff-only. Students can't read them on screen or through the API.
- On advice, change logs and notifications, students can change only the status or read marker. Reward codes are written by the server.
- Advisors and coaches see only students assigned to them. Private session notes are visible to their author only.
- Admins see their own school.
- Recording consent can't be edited or deleted, and only the person themself can give it. Both people must agree before audio is stored.
- Students can't see AI suggestions until their advisor or coach accepts them. Every suggestion links to the transcript lines behind it, and one with no evidence is dropped.
- Viewing a transcript is written to the audit log.
- Students can add library resources to their own roadmap and remove only the steps they added. They can also log something they already did (this semester or earlier, never a future one); it shows on their road as done and "added by you", and their advisor and coach can see it. They can tick steps done but can't queue, pause or approve them. Event photos are private to the student and their advisor or coach.
- At most 5 open steps this semester and 2 new steps per session. Extra steps wait in line (or are saved for later, which only staff see).
- Students can flag a highlight; only their advisor or coach can change or close the flag.
- On an accepted roadmap, staff can only suggest changes, and only the student can accept them.
- New sign-ups are students; staff roles are set by an admin. Emails from other domains are refused.

## Run it on your computer (optional)

```bash
cp .env.example .env.local   # fill in the values
npm install
npm run dev                  # http://localhost:3000
```

## Resumes, roadmaps and AI

Resume text is read with plain rules on our own server, and email and phone aren't kept. Dated jobs, research and projects are kept so the road can place them in the right semester. Testers upload the invented sample resumes in `public/samples/` (sources in `docs/sample-resumes/`), never a real one. The first roadmap comes from year-by-year templates plus the student's answers (3 steps to start, timed around the Fall Career Fair), then waits for advisor approval. Session suggestions use Claude when `ANTHROPIC_API_KEY` is set and the student agreed to AI. Notes from a session the student declined to record never go to an outside service.

**Known gap:** audio isn't deleted automatically yet. `recordings.delete_after` is set to 30 days, but nothing acts on it. Add a scheduled job before using anything other than mock data.

## Tests

```bash
npm test   # resume reading, roadmap templates, step ordering and session samples
```

## Database tests

`supabase/tests/` checks the access rules against a plain Postgres with stand-ins for Supabase's login tables:

```bash
psql -f supabase/tests/00_supabase_stub.sql
psql -f supabase/migrations/0001_init.sql
psql -f supabase/migrations/0002_roadmap_drafts.sql
psql -f supabase/migrations/0003_sessions_and_assignment.sql
psql -f supabase/migrations/0004_branch_tree.sql
psql -f supabase/migrations/0005_student_tabs.sql
psql -f supabase/migrations/0006_focus_and_pins.sql
psql -f supabase/migrations/0007_accept_and_privacy.sql
psql -f supabase/migrations/0008_advisor_suggestions.sql
psql -f supabase/migrations/0009_candy_road.sql
psql -f supabase/tests/10_access_rules.sql   # each check prints what to expect
psql -f supabase/tests/20_roadmap_drafts.sql
psql -f supabase/tests/30_sessions.sql
psql -f supabase/tests/40_branch_tree.sql
psql -f supabase/tests/50_student_tabs.sql
psql -f supabase/tests/60_focus_and_pins.sql
psql -f supabase/tests/70_accept_and_privacy.sql
psql -f supabase/tests/80_advisor_suggestions.sql
psql -f supabase/tests/90_candy_road.sql
```
