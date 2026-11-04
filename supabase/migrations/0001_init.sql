-- Melon MVP: initial schema
-- Paste this whole file into Supabase > SQL Editor > New query, then Run. Run it once.
--
-- Rules this schema enforces (from the kickoff spec + team decisions):
--   * Every row belongs to a school (school_id). People only see data from their school.
--   * Students see only their own data. Advisors/coaches see students assigned to them. Admins see their school.
--   * Recording consent is append-only (no updates or deletes).
--   * AI output starts as a draft ("proposed") until an advisor/coach reviews it.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- schools & people

create table public.schools (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  short_mark text not null default 'U',
  color text not null default '#990000',
  email_domains text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  school_id uuid not null references public.schools(id),
  role text not null default 'student' check (role in ('student', 'advisor', 'coach', 'admin')),
  full_name text not null default '',
  email text not null,
  title text,
  created_at timestamptz not null default now()
);

create table public.student_profiles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  school_id uuid not null references public.schools(id),
  class_year text check (class_year in ('freshman', 'sophomore', 'junior', 'senior', 'grad')),
  program text,
  majors text[] not null default '{}',
  minors text[] not null default '{}',
  expected_grad_term text,
  interests text[] not null default '{}',
  target_roles text[] not null default '{}',
  locations text[] not null default '{}',
  clubs text[] not null default '{}',
  answers jsonb not null default '{}',
  links jsonb not null default '{}',
  reminders text[] not null default '{email}',
  note text,
  resume_path text,
  resume_parsed jsonb,
  onboarding_step text not null default 'resume'
    check (onboarding_step in ('resume', 'profile', 'questions', 'building', 'done')),
  updated_at timestamptz not null default now()
);

create table public.student_courses (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id),
  student_id uuid not null references public.profiles(id) on delete cascade,
  code text not null,
  title text not null,
  term text,
  status text not null default 'completed' check (status in ('completed', 'in_progress', 'planned')),
  source text not null default 'school_records'
);

create table public.staff_assignments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id),
  student_id uuid not null references public.profiles(id) on delete cascade,
  staff_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('advisor', 'coach')),
  active boolean not null default true,
  assigned_at timestamptz not null default now(),
  unique (student_id, staff_id)
);

-- Everything Melon learns about a student, with where it came from. Append-only.
create table public.profile_events (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id),
  student_id uuid not null references public.profiles(id) on delete cascade,
  type text not null,
  payload jsonb not null default '{}',
  source text not null check (source in ('student', 'session', 'school_records', 'system', 'ai_unreviewed')),
  source_ref text,
  confidence numeric,
  status text not null default 'confirmed' check (status in ('proposed', 'confirmed', 'rejected')),
  created_by uuid references public.profiles(id),
  occurred_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- appointments & sessions

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id),
  student_id uuid not null references public.profiles(id) on delete cascade,
  staff_id uuid not null references public.profiles(id) on delete cascade,
  starts_at timestamptz not null,
  duration_min int not null default 30,
  type text not null default 'Career check-in',
  modality text not null default 'in_person' check (modality in ('in_person', 'teams', 'melon_call')),
  location text,
  status text not null default 'scheduled' check (status in ('scheduled', 'completed', 'cancelled', 'no_show')),
  external_ref text,
  created_at timestamptz not null default now()
);

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id),
  appointment_id uuid references public.appointments(id) on delete set null,
  student_id uuid not null references public.profiles(id) on delete cascade,
  staff_id uuid not null references public.profiles(id) on delete cascade,
  mode text not null default 'in_person' check (mode in ('in_person', 'teams', 'melon_call', 'notes_only')),
  status text not null default 'created' check (status in (
    'created', 'consented', 'recording', 'uploaded', 'transcribed',
    'ready_for_review', 'reviewed', 'closed', 'no_recording', 'failed')),
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now()
);

-- Append-only. One row per person per scope. Upload is blocked unless both people granted 'record'.
create table public.consents (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id),
  session_id uuid not null references public.sessions(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  subject_id uuid not null references public.profiles(id) on delete cascade,
  scope text not null check (scope in ('record', 'transcribe', 'ai_analysis')),
  granted boolean not null,
  policy_version text not null default 'v1',
  created_at timestamptz not null default now()
);

create table public.recordings (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id),
  session_id uuid not null unique references public.sessions(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  storage_path text not null,
  duration_s int,
  size_bytes bigint,
  delete_after timestamptz not null default (now() + interval '30 days'),
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.transcript_segments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id),
  session_id uuid not null references public.sessions(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  idx int not null,
  start_ms int not null default 0,
  end_ms int not null default 0,
  speaker text not null default 'unknown' check (speaker in ('staff', 'student', 'unknown')),
  text text not null,
  redacted boolean not null default false,
  unique (session_id, idx)
);

create table public.insights (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id),
  session_id uuid not null references public.sessions(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('summary', 'goal', 'action', 'course_change', 'skill', 'interest', 'concern')),
  payload jsonb not null default '{}',
  status text not null default 'proposed' check (status in ('proposed', 'accepted', 'edited', 'rejected')),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  model_ref text,
  prompt_version text,
  created_at timestamptz not null default now()
);

create table public.insight_evidence (
  insight_id uuid not null references public.insights(id) on delete cascade,
  segment_id uuid not null references public.transcript_segments(id) on delete cascade,
  primary key (insight_id, segment_id)
);

-- Private notes: only the author can ever read them.
create table public.staff_notes (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id),
  session_id uuid references public.sessions(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- roadmap

create table public.roadmaps (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id),
  student_id uuid not null unique references public.profiles(id) on delete cascade,
  version int not null default 0,
  updated_at timestamptz not null default now()
);

create table public.roadmap_paths (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id),
  roadmap_id uuid not null references public.roadmaps(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  kind text not null default 'career' check (kind in ('career', 'route')),
  status text not null default 'exploring' check (status in ('pinned', 'exploring', 'backup', 'dropped')),
  reason text,
  first_job text,
  sort int not null default 0,
  created_from_session uuid references public.sessions(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.resources (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id),
  type text not null check (type in ('skill', 'certification', 'event', 'course', 'coaching')),
  title text not null,
  provider text,
  url text,
  interests text[] not null default '{}',
  tags text[] not null default '{}',
  source text not null default 'library' check (source in ('library', 'melon', 'handshake')),
  is_free boolean not null default true,
  starts_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.roadmap_items (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id),
  roadmap_id uuid not null references public.roadmaps(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  path_id uuid references public.roadmap_paths(id) on delete cascade,
  term text,
  kind text not null check (kind in ('course', 'experience', 'skill', 'certification', 'event',
                                      'networking', 'application', 'coaching', 'project')),
  title text not null,
  description text,
  rationale text,
  evidence jsonb not null default '[]',
  due_date date,
  firm boolean not null default false,
  status text not null default 'active' check (status in ('locked', 'active', 'done', 'skipped')),
  source text not null default 'ai' check (source in ('ai', 'staff', 'student', 'system')),
  approval text not null default 'not_needed' check (approval in ('not_needed', 'pending', 'approved', 'rejected')),
  resource_id uuid references public.resources(id) on delete set null,
  sort int not null default 0,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table public.roadmap_changes (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id),
  roadmap_id uuid not null references public.roadmaps(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  session_id uuid references public.sessions(id) on delete set null,
  summary jsonb not null default '{}',
  created_at timestamptz not null default now(),
  seen_at timestamptz
);

create table public.advice_items (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id),
  student_id uuid not null references public.profiles(id) on delete cascade,
  session_id uuid references public.sessions(id) on delete set null,
  given_by uuid references public.profiles(id) on delete set null,
  text text not null,
  status text not null default 'new' check (status in ('new', 'in_progress', 'done', 'dismissed')),
  due_date date,
  roadmap_item_id uuid references public.roadmap_items(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- engagement

create table public.activities (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id),
  student_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('session', 'event', 'workshop', 'lesson', 'task')),
  title text not null,
  minutes int not null default 0,
  occurred_at timestamptz not null default now()
);

create table public.rewards (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id),
  name text not null,
  description text not null,
  rule jsonb not null default '{}',
  sort int not null default 0,
  active boolean not null default true
);

create table public.reward_claims (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id),
  reward_id uuid not null references public.rewards(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  code text not null,
  status text not null default 'unlocked' check (status in ('unlocked', 'claimed', 'picked_up')),
  created_at timestamptz not null default now(),
  unique (reward_id, student_id)
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- admin

create table public.integrations (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id),
  system text not null check (system in ('handshake', 'teams', 'calendar', 'stellic', 'canvas')),
  enabled boolean not null default false,
  status_note text,
  settings jsonb not null default '{}',
  updated_at timestamptz not null default now(),
  unique (school_id, system)
);

create table public.audit_log (
  id bigserial primary key,
  school_id uuid references public.schools(id),
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity text,
  entity_id text,
  meta jsonb not null default '{}',
  at timestamptz not null default now()
);

-- ---------------------------------------------------------------- indexes

create index on public.student_courses (student_id);
create index on public.staff_assignments (staff_id) where active;
create index on public.profile_events (student_id, occurred_at desc);
create index on public.appointments (staff_id, starts_at);
create index on public.appointments (student_id, starts_at);
create index on public.sessions (student_id, created_at desc);
create index on public.consents (session_id);
create index on public.transcript_segments (session_id, idx);
create index on public.insights (session_id);
create index on public.roadmap_paths (roadmap_id);
create index on public.roadmap_items (roadmap_id, status);
create index on public.roadmap_items (approval) where approval = 'pending';
create index on public.advice_items (student_id);
create index on public.activities (student_id, occurred_at desc);
create index on public.notifications (user_id, created_at desc);

-- ---------------------------------------------------------------- helper functions (used by access rules)

create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.my_school() returns uuid
language sql stable security definer set search_path = public as $$
  select school_id from public.profiles where id = auth.uid()
$$;

-- Assigned advisor/coach for this student (not the student themself).
create or replace function public.is_assigned_staff(sid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.staff_assignments a
    where a.student_id = sid and a.staff_id = auth.uid() and a.active
  )
$$;

create or replace function public.is_school_admin(sch uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles me
    where me.id = auth.uid() and me.role = 'admin' and me.school_id = sch
  )
$$;

-- Student themself, an assigned advisor/coach, or an admin of the same school.
create or replace function public.can_see_student(sid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() = sid
    or public.is_assigned_staff(sid)
    or exists (
      select 1 from public.profiles s
      where s.id = sid and public.is_school_admin(s.school_id)
    )
$$;

-- Both people said yes to recording for this session.
create or replace function public.has_recording_consent(sess uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select
    exists (select 1 from public.consents c join public.sessions s on s.id = c.session_id
            where c.session_id = sess and c.subject_id = s.student_id and c.scope = 'record' and c.granted)
    and exists (select 1 from public.consents c join public.sessions s on s.id = c.session_id
            where c.session_id = sess and c.subject_id = s.staff_id and c.scope = 'record' and c.granted)
    and not exists (select 1 from public.consents c
            where c.session_id = sess and c.scope = 'record' and not c.granted
              and c.created_at > (select max(c2.created_at) from public.consents c2
                                  where c2.session_id = sess and c2.scope = 'record' and c2.granted))
$$;

-- ---------------------------------------------------------------- new sign-ups

-- Every new login account becomes a student at the school that owns their email domain.
-- Sign-ups from other email domains are refused. Staff roles are set by an admin.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_school uuid;
  v_domain text := lower(split_part(new.email, '@', 2));
begin
  select id into v_school from public.schools where v_domain = any (email_domains) limit 1;
  if v_school is null then
    raise exception 'Please sign in with your school email address.';
  end if;
  insert into public.profiles (id, school_id, email, full_name)
  values (new.id, v_school, new.email,
          coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), split_part(new.email, '@', 1)));
  insert into public.student_profiles (user_id, school_id) values (new.id, v_school);
  insert into public.roadmaps (school_id, student_id) values (v_school, new.id);
  return new;
end
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------- access rules (row-level security)

alter table public.schools enable row level security;
alter table public.profiles enable row level security;
alter table public.student_profiles enable row level security;
alter table public.student_courses enable row level security;
alter table public.staff_assignments enable row level security;
alter table public.profile_events enable row level security;
alter table public.appointments enable row level security;
alter table public.sessions enable row level security;
alter table public.consents enable row level security;
alter table public.recordings enable row level security;
alter table public.transcript_segments enable row level security;
alter table public.insights enable row level security;
alter table public.insight_evidence enable row level security;
alter table public.staff_notes enable row level security;
alter table public.roadmaps enable row level security;
alter table public.roadmap_paths enable row level security;
alter table public.resources enable row level security;
alter table public.roadmap_items enable row level security;
alter table public.roadmap_changes enable row level security;
alter table public.advice_items enable row level security;
alter table public.activities enable row level security;
alter table public.rewards enable row level security;
alter table public.reward_claims enable row level security;
alter table public.notifications enable row level security;
alter table public.integrations enable row level security;
alter table public.audit_log enable row level security;

-- School-wide reference data: readable by anyone signed in at that school.
create policy "school members read school" on public.schools for select using (id = public.my_school());
create policy "school members read resources" on public.resources for select using (school_id = public.my_school());
create policy "school members read rewards" on public.rewards for select using (school_id = public.my_school());
create policy "school members read integrations" on public.integrations for select using (school_id = public.my_school());
create policy "admins change integrations" on public.integrations for update
  using (public.is_school_admin(school_id)) with check (public.is_school_admin(school_id));
create policy "admins read audit log" on public.audit_log for select using (public.is_school_admin(school_id));

-- People: yourself, students you can see, and staff at your school.
create policy "read people" on public.profiles for select using (
  id = auth.uid()
  or public.can_see_student(id)
  or (school_id = public.my_school() and role <> 'student')
);

create policy "read student profile" on public.student_profiles for select using (public.can_see_student(user_id));
create policy "student edits own profile" on public.student_profiles for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "read courses" on public.student_courses for select using (public.can_see_student(student_id));

create policy "read assignments" on public.staff_assignments for select using (
  student_id = auth.uid() or staff_id = auth.uid() or public.is_school_admin(school_id)
);

create policy "read profile events" on public.profile_events for select using (public.can_see_student(student_id));
create policy "student adds own events" on public.profile_events for insert
  with check (student_id = auth.uid() and source = 'student' and school_id = public.my_school());
create policy "staff adds events" on public.profile_events for insert
  with check (public.is_assigned_staff(student_id) and school_id = public.my_school());

create policy "read appointments" on public.appointments for select using (public.can_see_student(student_id));

create policy "read sessions" on public.sessions for select using (public.can_see_student(student_id));
create policy "staff starts sessions" on public.sessions for insert
  with check (staff_id = auth.uid() and public.is_assigned_staff(student_id) and school_id = public.my_school());
create policy "staff updates own sessions" on public.sessions for update
  using (staff_id = auth.uid()) with check (staff_id = auth.uid());

create policy "read consents" on public.consents for select using (public.can_see_student(student_id));
create policy "people give their own consent" on public.consents for insert with check (
  subject_id = auth.uid()
  and exists (select 1 from public.sessions s
              where s.id = session_id and s.student_id = consents.student_id
                and (s.student_id = auth.uid() or s.staff_id = auth.uid()))
);

create policy "read recordings" on public.recordings for select using (public.can_see_student(student_id));
create policy "read transcripts" on public.transcript_segments for select using (public.can_see_student(student_id));
create policy "read insights" on public.insights for select using (public.can_see_student(student_id));
create policy "staff reviews insights" on public.insights for update
  using (public.is_assigned_staff(student_id)) with check (public.is_assigned_staff(student_id));
create policy "read insight evidence" on public.insight_evidence for select using (
  exists (select 1 from public.insights i where i.id = insight_id and public.can_see_student(i.student_id))
);

create policy "author reads own notes" on public.staff_notes for select using (author_id = auth.uid());
create policy "author writes own notes" on public.staff_notes for insert
  with check (author_id = auth.uid() and public.is_assigned_staff(student_id));
create policy "author edits own notes" on public.staff_notes for update
  using (author_id = auth.uid()) with check (author_id = auth.uid());
create policy "author deletes own notes" on public.staff_notes for delete using (author_id = auth.uid());

create policy "read roadmap" on public.roadmaps for select using (public.can_see_student(student_id));
create policy "read paths" on public.roadmap_paths for select using (public.can_see_student(student_id));
create policy "student pins paths" on public.roadmap_paths for update
  using (student_id = auth.uid()) with check (student_id = auth.uid());
create policy "read items" on public.roadmap_items for select using (public.can_see_student(student_id));
create policy "student updates own items" on public.roadmap_items for update
  using (student_id = auth.uid()) with check (student_id = auth.uid());
create policy "staff updates items" on public.roadmap_items for update
  using (public.is_assigned_staff(student_id)) with check (public.is_assigned_staff(student_id));
create policy "staff suggests items" on public.roadmap_items for insert
  with check (public.is_assigned_staff(student_id) and source = 'staff' and school_id = public.my_school());
create policy "read changes" on public.roadmap_changes for select using (public.can_see_student(student_id));
create policy "student marks changes seen" on public.roadmap_changes for update
  using (student_id = auth.uid()) with check (student_id = auth.uid());

create policy "read advice" on public.advice_items for select using (public.can_see_student(student_id));
create policy "student updates advice status" on public.advice_items for update
  using (student_id = auth.uid()) with check (student_id = auth.uid());
create policy "staff gives advice" on public.advice_items for insert
  with check (public.is_assigned_staff(student_id) and given_by = auth.uid() and school_id = public.my_school());
create policy "staff updates advice" on public.advice_items for update
  using (public.is_assigned_staff(student_id)) with check (public.is_assigned_staff(student_id));

create policy "read activities" on public.activities for select using (public.can_see_student(student_id));
create policy "read reward claims" on public.reward_claims for select using (public.can_see_student(student_id));
create policy "student marks claim" on public.reward_claims for update
  using (student_id = auth.uid()) with check (student_id = auth.uid());

create policy "read own notifications" on public.notifications for select using (user_id = auth.uid());
create policy "mark own notifications read" on public.notifications for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Append-only tables: nobody using the app can edit or delete these rows.
revoke update, delete on public.consents from anon, authenticated;
revoke update, delete on public.profile_events from anon, authenticated;
revoke insert, update, delete on public.audit_log from anon, authenticated;

-- ---------------------------------------------------------------- file storage

insert into storage.buckets (id, name, public)
values ('resumes', 'resumes', false), ('recordings', 'recordings', false)
on conflict (id) do nothing;

-- Resumes live at resumes/<student id>/<file>. Students manage their own; their advisors can read.
create policy "student uploads own resume" on storage.objects for insert to authenticated
  with check (bucket_id = 'resumes' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "student replaces own resume" on storage.objects for update to authenticated
  using (bucket_id = 'resumes' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "read resumes you can see" on storage.objects for select to authenticated
  using (bucket_id = 'resumes' and public.can_see_student(((storage.foldername(name))[1])::uuid));

-- Recordings have no app-user rules on purpose: only the server uploads them, and only
-- after has_recording_consent() is true. Audio is deleted after 30 days.
