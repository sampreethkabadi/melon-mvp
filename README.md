# Melon MVP

Career roadmaps that remember every advising session. This is the testable MVP for role-played student testing (Stage A): real students sign up with their own resume and answers; advising sessions are role-played. No official student records.

**Stack:** Next.js 15 (App Router, TypeScript, Tailwind 4) · Supabase (login, Postgres with row-level security, file storage) · Vercel (hosting).

## Build steps

| Step | What | Status |
|---|---|---|
| 1 | Foundation: database, login, roles, app shells, test data | ✅ this commit |
| 2 | Student onboarding: resume autofill, profile, year questions, first roadmap | next |
| 3 | Student app: home, roadmap, action items, resources, rewards, notifications, settings | |
| 4 | Staff: Today, briefing, recording + consent, transcript, AI review, roadmap auto-update | |
| 5 | Test prep: test script, feedback capture, fixes | |

## One-time setup (about 20 minutes)

### 1. Supabase: create the database

1. In your Supabase project, open **SQL Editor > New query**.
2. Paste all of [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) and click **Run**. You should see "Success. No rows returned".
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

3. Click **Deploy**. If you add or change a variable later, redeploy (Deployments > ⋯ > Redeploy).

### 3. Load the test data

Open `https://YOUR-VERCEL-LINK/api/dev/seed?secret=YOUR_SEED_SECRET` in a browser. It's safe to run again, and running it again refreshes today's appointments. It creates:

- **School:** Indiana University (accepts `@iu.edu` and `@melon.test` emails)
- **Staff:** `lee@melon.test` (advisor), `rivera@melon.test` (career coach), `admin@melon.test` (admin)
- **Students:** `leo@` (freshman), `ava@` (sophomore), `maya@` (junior), `sam@` (junior), `priya@` (senior), `daniel@` (grad student), all `@melon.test`
- Today's 4 appointments for the advisor, a resource library, 3 rewards, 5 integrations

Sign in to test accounts with **Have a test account? Use a password** and your `SEED_PASSWORD`.

### 4. Email for real students (before testing day)

Real students sign in with an emailed link. Supabase's built-in email only sends a few emails per hour, which is fine for the team but not for a testing session. Before testing with students, connect a free email service (for example Resend) under **Authentication > Emails > SMTP Settings**.

## Who can see what

Enforced in the database, not just the app (see the migration):

- Students see only their own data.
- Advisors and coaches see only students assigned to them. Private session notes are visible to their author only.
- Admins see their own school.
- Recording consent can't be edited or deleted, and only the person themself can give it. Both people must agree before audio is stored.
- New sign-ups are students; staff roles are set by an admin. Emails from other domains are refused.

## Run it on your computer (optional)

```bash
cp .env.example .env.local   # fill in the values
npm install
npm run dev                  # http://localhost:3000
```

## Database tests

`supabase/tests/` checks the access rules against a plain Postgres with stand-ins for Supabase's login tables:

```bash
psql -f supabase/tests/00_supabase_stub.sql
psql -f supabase/migrations/0001_init.sql
psql -f supabase/tests/10_access_rules.sql   # each check prints what to expect
```
