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
| 3 (rest) | Student app: home, action items, resources, rewards, notifications, settings | next |
| 5 | Test prep: test script, feedback capture, fixes | |

## One-time setup (about 20 minutes)

### 1. Supabase: create the database

1. In your Supabase project, open **SQL Editor > New query**.
2. Paste all of [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) and click **Run**. You should see "Success. No rows returned". Then do the same, one new query each, with [`0002_roadmap_drafts.sql`](supabase/migrations/0002_roadmap_drafts.sql), [`0003_sessions_and_assignment.sql`](supabase/migrations/0003_sessions_and_assignment.sql) and [`0004_branch_tree.sql`](supabase/migrations/0004_branch_tree.sql). Skip any you've already run.
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

3. Click **Deploy**. If you add or change a variable later, redeploy (Deployments > ⋯ > Redeploy).

### 3. Load the test data

Open `https://YOUR-VERCEL-LINK/api/dev/seed?secret=YOUR_SEED_SECRET` in a browser. It's safe to run again, and **running it again resets every test student**, so use it to start each rehearsal clean. It creates:

- **School:** Indiana University (accepts `@iu.edu` and `@melon.test` emails)
- **Advisors:** `lee@`, `malik@`, `becker@melon.test`, with 4 students each
- **Others:** `rivera@melon.test` (career coach, assigned to everyone), `admin@melon.test` (admin)
- **Lee's students:** `leo@` (freshman), `maya@` (junior, published roadmap and a past session), `sam@` (junior), `priya@` (senior, draft waiting for review), all `@melon.test`
- **Other students:** `ava@`, `daniel@`, `nina@`, `omar@` (Malik), `grace@`, `tyler@`, `zoe@`, `marcus@` (Becker), all `@melon.test`
- Today's appointments, a resource library, 3 rewards, 5 integrations

Sign in to test accounts with **Have a test account? Use a password** and your `SEED_PASSWORD`.

## Demo walkthrough

Use two browser windows, or one normal and one private: Lee in one, Maya in the other. Reset first by opening the test data link.

1. **Lee, Reviews:** open Priya's draft, edit or remove an item, then **Approve and publish**. Priya can now see it. She couldn't before.
2. **Lee, Today:** open Maya's briefing, then **Start session** and **I agree to record**.
3. **Maya, Home:** **I agree**. Lee's screen updates on its own.
4. **Lee:** **Use the sample conversation**, **Or paste a sample transcript** (start each turn with the speaker, like `Advisor: Hello`), or record if `DEEPGRAM_API_KEY` is set. Check the suggestions against the transcript, accept, edit or reject each one, then **Finish review and update roadmap**.
5. **Maya, Roadmap:** the Branch Tree shows a new **Cybersecurity** branch from the session (the sample conversation mentions it), a "What changed" card, and the accepted actions in this semester's next steps. Her background colors change to match. Mark one done, and it shows as done in Lee's advice tracker.
6. **Admin, Advisors:** move Maya to Dr. Malik. **Malik, Students, Maya:** the briefing carries over the history, so there's no cold start.

With no API keys, this all still works. The screens say when a conversation is a sample and when suggestions were saved in advance or drafted by rules. If Claude is unavailable, the session falls back the same way.

## How new sign-ups get an advisor

New sign-ups go to the advisor with the fewest active students, picked at random on a tie, and to the coach the same way. Admins can move a student under **Advisors**. To change an advisor list, set `role` on their row in `profiles`.

## Who can see what

Enforced in the database, not just the app (see the migration):

- Students see only their own data.
- Students can't see a roadmap until it's published, and can't approve their own items. Their advisor or coach sees the draft first.
- Advisors and coaches see only students assigned to them. Private session notes are visible to their author only.
- Admins see their own school.
- Recording consent can't be edited or deleted, and only the person themself can give it. Both people must agree before audio is stored.
- Students can't see AI suggestions until their advisor or coach accepts them. Every suggestion links to the transcript lines behind it, and one with no evidence is dropped.
- Viewing a transcript is written to the audit log.
- New sign-ups are students; staff roles are set by an admin. Emails from other domains are refused.

## Run it on your computer (optional)

```bash
cp .env.example .env.local   # fill in the values
npm install
npm run dev                  # http://localhost:3000
```

## Resumes, roadmaps and AI

Resume text is read with plain rules on our own server, and email and phone aren't kept. The first roadmap comes from year-by-year templates plus the student's answers, then waits for advisor approval. Session suggestions use Claude when `ANTHROPIC_API_KEY` is set and the student agreed to AI. Notes from a session the student declined to record never go to an outside service.

**Known gap:** audio isn't deleted automatically yet. `recordings.delete_after` is set to 30 days, but nothing acts on it. Add a scheduled job before using anything other than mock data.

## Tests

```bash
npm test   # resume reading and roadmap templates
```

## Database tests

`supabase/tests/` checks the access rules against a plain Postgres with stand-ins for Supabase's login tables:

```bash
psql -f supabase/tests/00_supabase_stub.sql
psql -f supabase/migrations/0001_init.sql
psql -f supabase/migrations/0002_roadmap_drafts.sql
psql -f supabase/migrations/0003_sessions_and_assignment.sql
psql -f supabase/migrations/0004_branch_tree.sql
psql -f supabase/tests/10_access_rules.sql   # each check prints what to expect
psql -f supabase/tests/20_roadmap_drafts.sql
psql -f supabase/tests/30_sessions.sql
psql -f supabase/tests/40_branch_tree.sql
```
