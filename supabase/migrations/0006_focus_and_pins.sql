-- Melon MVP: keep students focused. Run once, after 0005, in Supabase > SQL Editor > New query.
--
-- 1. Demo clock: the app can pretend today is a set date (2 weeks before the Fall Career Fair).
-- 2. At most 5 open steps this semester. Extra steps wait in a queue ('queued') and move up when one is done.
--    A session adds at most 2 steps; the rest are saved for later ('locked'), which only staff see.
-- 3. Pins depend on year: freshmen and sophomores can pin 2 paths, juniors and up pin 1. Unpinning a path
--    pauses its steps; pinning it again brings them back.
-- 4. Session types (picked when the student books), "key advice" highlights, students can flag a mistake
--    in a highlight, path-tagged resources ("start here, then this"), clubs, and alumni stories.
-- 5. One-click approval of a whole session.

-- ---------------------------------------------------------------- demo clock

create table if not exists public.app_settings (
  id boolean primary key default true check (id),
  demo_today date
);
alter table public.app_settings enable row level security;
drop policy if exists "anyone signed in reads settings" on public.app_settings;
create policy "anyone signed in reads settings" on public.app_settings for select using (true);
insert into public.app_settings (id, demo_today) values (true, '2026-09-03') on conflict (id) do nothing;

-- Now, moved back or forward to the demo date (time of day stays real). Plain now() when there's no demo date.
create or replace function public.app_now() returns timestamptz
language sql stable security definer set search_path = public as $$
  select now() - coalesce((now() at time zone 'America/Indiana/Indianapolis')::date
                          - (select demo_today from public.app_settings where id), 0) * interval '1 day'
$$;

create or replace function public.app_today() returns date
language sql stable as $$ select (public.app_now() at time zone 'America/Indiana/Indianapolis')::date $$;

drop function if exists public.current_term(date);
create function public.current_term(d date default public.app_today()) returns text
language sql stable as $$
  select case when extract(month from d) >= 7 then 'Fall ' else 'Spring ' end || extract(year from d)::int
$$;

-- "Spring 2027" -> 20271, for ordering. Unknown labels sort last.
create or replace function public.term_rank(t text) returns int
language sql immutable as $$
  select case when t ~ '^(Spring|Summer|Fall) [0-9]{4}$'
    then split_part(t, ' ', 2)::int * 10 + case split_part(t, ' ', 1) when 'Spring' then 1 when 'Summer' then 2 else 3 end
    else 2147483647 end
$$;

alter table public.sessions alter column created_at set default public.app_now();
alter table public.insights alter column created_at set default public.app_now();
alter table public.notifications alter column created_at set default public.app_now();
alter table public.roadmap_changes alter column created_at set default public.app_now();
alter table public.roadmap_items alter column created_at set default public.app_now();
alter table public.advice_items alter column created_at set default public.app_now();
alter table public.profile_events alter column occurred_at set default public.app_now();
alter table public.consents alter column created_at set default public.app_now();
alter table public.activities alter column occurred_at set default public.app_now();
alter table public.student_moments alter column created_at set default public.app_now();

-- Same rules as interestFromText() in src/lib/roadmap/template.ts.
create or replace function public.interest_from_text(t text) returns text
language sql immutable as $$
  select case
    when t ~* '(cyber|security|infosec)' then 'cyber'
    when t ~* '(\mux\M|user experience|product design|design)' then 'ux'
    when t ~* '(software|developer|programming|web dev|engineer)' and t !~* '(data|machine learning|\mml\M)' then 'soft'
    when t ~* '(data|analytics|machine learning|\mml\M|\mai\M|statistics)' then 'data'
    when t ~* '(finance|business|consult|marketing|accounting|investment)' then 'biz'
    when t ~* '(health|medic|nurs|clinical)' then 'health'
    when t ~* '(\marts?\M|media|film|music|journalism)' then 'arts'
  end
$$;

-- ---------------------------------------------------------------- new kinds and columns

alter table public.roadmap_items drop constraint if exists roadmap_items_status_check;
alter table public.roadmap_items add constraint roadmap_items_status_check
  check (status in ('locked', 'active', 'done', 'skipped', 'queued', 'paused'));

alter table public.insights drop constraint if exists insights_kind_check;
alter table public.insights add constraint insights_kind_check
  check (kind in ('summary', 'goal', 'action', 'course_change', 'skill', 'interest', 'concern', 'advice'));

alter table public.resources drop constraint if exists resources_type_check;
alter table public.resources add constraint resources_type_check
  check (type in ('skill', 'certification', 'event', 'course', 'coaching', 'club'));
-- "Start here, then this": a resource can be one rung of a path's ladder for a year level.
alter table public.resources
  add column if not exists level text check (level in ('basic', 'specific', 'advanced')),
  add column if not exists step int,
  add column if not exists blurb text;

alter table public.sessions add column if not exists session_type text;

-- ---------------------------------------------------------------- at most 5 open steps

create or replace function public.is_open_term(t text) returns boolean
language sql stable as $$ select t is null or public.term_rank(t) <= public.term_rank(public.current_term()) $$;

create or replace function public.open_step_count(p_student uuid) returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from public.roadmap_items
  where student_id = p_student and status = 'active' and public.is_open_term(term)
$$;

-- A new or re-opened step for this semester waits in line if 5 are already open.
create or replace function public._cap_open_steps() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'active' and (tg_op = 'INSERT' or old.status <> 'active') and public.is_open_term(new.term)
     and new.approval in ('not_needed', 'approved')
     and public.open_step_count(new.student_id) >= 5 then
    new.status := 'queued';
  end if;
  return new;
end
$$;
drop trigger if exists cap_open_steps on public.roadmap_items;
create trigger cap_open_steps before insert or update of status on public.roadmap_items
  for each row execute function public._cap_open_steps();

-- Moves queued steps up until 5 are open: firm dates first, then the soonest due, then the oldest.
create or replace function public.fill_open_steps(p_student uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_free int := 5 - public.open_step_count(p_student);
begin
  if v_free <= 0 then return; end if;
  perform set_config('melon.system', 'on', true);
  update public.roadmap_items set status = 'active'
   where id in (
     select i.id from public.roadmap_items i
     where i.student_id = p_student and i.status = 'queued' and i.approval in ('not_needed', 'approved')
       and public.is_open_term(i.term)
     order by i.firm desc, i.due_date nulls last, i.created_at, i.sort
     limit v_free);
  perform set_config('melon.system', 'off', true);
end
$$;
revoke all on function public.fill_open_steps(uuid) from public, anon, authenticated;

-- Queues anything past the first 5 open steps (used when a whole draft is published at once).
create or replace function public.trim_open_steps(p_student uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform set_config('melon.system', 'on', true);
  update public.roadmap_items set status = 'queued'
   where id in (
     select i.id from public.roadmap_items i
     where i.student_id = p_student and i.status = 'active' and public.is_open_term(i.term)
     order by i.firm desc, i.due_date nulls last, i.created_at, i.sort
     offset 5);
  perform set_config('melon.system', 'off', true);
end
$$;
revoke all on function public.trim_open_steps(uuid) from public, anon, authenticated;

create or replace function public._after_step_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if old.status = 'active' then perform public.fill_open_steps(old.student_id); end if;
    return old;
  end if;
  if old.status = 'active' and new.status <> 'active' then
    perform public.fill_open_steps(new.student_id);
  end if;
  return new;
end
$$;
drop trigger if exists after_step_change on public.roadmap_items;
create trigger after_step_change after update of status or delete on public.roadmap_items
  for each row execute function public._after_step_change();

-- Students can only tick steps done or undo them. Queueing and pausing are Melon's job.
create or replace function public._student_step_moves() returns trigger
language plpgsql set search_path = public as $$
begin
  if auth.uid() = old.student_id and new.status is distinct from old.status
     and coalesce(current_setting('melon.system', true), 'off') <> 'on'
     and not (old.status in ('active', 'done') and new.status in ('active', 'done')) then
    raise exception 'Students can only mark steps done or undo them.';
  end if;
  return new;
end
$$;
drop trigger if exists student_step_moves on public.roadmap_items;
create trigger student_step_moves before update of status on public.roadmap_items
  for each row execute function public._student_step_moves();

-- Students don't see staff steps that are waiting in line. They do see their own.
drop policy "read items" on public.roadmap_items;
create policy "read items" on public.roadmap_items for select using (
  public.can_see_student(student_id)
  and (student_id <> auth.uid()
       or (public.roadmap_is_published(roadmap_id) and approval in ('not_needed', 'approved')
           and (status not in ('queued', 'locked') or source = 'student')))
);

drop policy "student adds own steps" on public.roadmap_items;
create policy "student adds own steps" on public.roadmap_items for insert with check (
  student_id = auth.uid()
  and source = 'student'
  and approval = 'not_needed'
  and status in ('active', 'queued')
  and school_id = public.my_school()
  and exists (select 1 from public.roadmaps r where r.id = roadmap_id and r.student_id = auth.uid() and r.status = 'published')
  and (path_id is null or exists (select 1 from public.roadmap_paths p where p.id = path_id and p.student_id = auth.uid()))
);

-- ---------------------------------------------------------------- pins by year

create or replace function public.pin_limit(p_student uuid) returns int
language sql stable security definer set search_path = public as $$
  select case when class_year in ('freshman', 'sophomore') then 2 else 1 end
  from public.student_profiles where user_id = p_student
$$;

create or replace function public._unpin(p_path uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.roadmap_paths set status = 'exploring' where id = p_path;
  update public.roadmap_items set status = 'paused' where path_id = p_path and status in ('active', 'queued');
end
$$;
revoke all on function public._unpin(uuid) from public, anon, authenticated;

-- Pins or unpins one of the student's paths. Juniors and up switch straight away (the old path is paused).
create or replace function public.set_pin(p_path uuid, p_pin boolean) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_path public.roadmap_paths;
  v_limit int;
  v_other uuid;
begin
  select * into v_path from public.roadmap_paths where id = p_path for update;
  if not found or v_path.student_id <> auth.uid() then
    raise exception 'That path isn''t yours.';
  end if;
  if not public.roadmap_is_published(v_path.roadmap_id) then
    raise exception 'Your roadmap isn''t ready yet.';
  end if;
  v_limit := coalesce(public.pin_limit(v_path.student_id), 1);
  perform set_config('melon.system', 'on', true);
  if p_pin then
    if v_path.status <> 'pinned' then
      if (select count(*) from public.roadmap_paths where student_id = v_path.student_id and status = 'pinned') >= v_limit then
        if v_limit > 1 then
          raise exception 'You can pin % paths. Unpin one first.', v_limit;
        end if;
        for v_other in select id from public.roadmap_paths where student_id = v_path.student_id and status = 'pinned' loop
          perform public._unpin(v_other);
        end loop;
      end if;
      update public.roadmap_paths set status = 'pinned' where id = p_path;
      update public.roadmap_items set status = 'queued' where path_id = p_path and status = 'paused';
    end if;
  elsif v_path.status = 'pinned' then
    perform public._unpin(p_path);
  end if;
  perform set_config('melon.system', 'off', true);
  perform public.fill_open_steps(v_path.student_id);
end
$$;
revoke all on function public.set_pin(uuid, boolean) from public, anon;
grant execute on function public.set_pin(uuid, boolean) to authenticated;

-- Pinning goes through set_pin, so the limits hold.
drop policy if exists "student pins paths" on public.roadmap_paths;

-- ---------------------------------------------------------------- drafts carry dates and pins

create or replace function public.replace_draft_roadmap(p_student uuid, p_paths jsonb, p_items jsonb) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_roadmap public.roadmaps;
  v_path_ids uuid[] := '{}';
  v_path jsonb;
  v_id uuid;
begin
  select * into v_roadmap from public.roadmaps where student_id = p_student for update;
  if not found then
    raise exception 'No roadmap for student %', p_student;
  end if;

  update public.student_profiles set onboarding_step = 'done', updated_at = now() where user_id = p_student;
  if v_roadmap.status = 'published' then
    return false;
  end if;

  delete from public.roadmap_items where roadmap_id = v_roadmap.id and source = 'system';
  delete from public.roadmap_paths where roadmap_id = v_roadmap.id;

  for v_path in select value from jsonb_array_elements(p_paths) with ordinality as t(value, ord) order by ord loop
    insert into public.roadmap_paths (school_id, roadmap_id, student_id, name, reason, first_job, sort, interest, status)
    values (v_roadmap.school_id, v_roadmap.id, p_student, v_path ->> 'name', v_path ->> 'reason',
            v_path ->> 'first_job', coalesce((v_path ->> 'sort')::int, 0), v_path ->> 'interest',
            coalesce(v_path ->> 'status', 'exploring'))
    returning id into v_id;
    v_path_ids := v_path_ids || v_id;
  end loop;

  insert into public.roadmap_items (school_id, roadmap_id, student_id, path_id, term, kind, title, description,
                                    rationale, evidence, status, source, approval, resource_id, sort, due_date, firm)
  select v_roadmap.school_id, v_roadmap.id, p_student,
         v_path_ids[(i ->> 'path_index')::int + 1],
         i ->> 'term', i ->> 'kind', i ->> 'title', i ->> 'description', i ->> 'rationale',
         coalesce(i -> 'evidence', '[]'::jsonb), 'active', 'system', 'pending',
         (i ->> 'resource_id')::uuid, coalesce((i ->> 'sort')::int, 0),
         (i ->> 'due_date')::date, coalesce((i ->> 'firm')::boolean, false)
  from jsonb_array_elements(p_items) as i;

  update public.roadmaps set status = 'draft', version = version + 1, updated_at = now() where id = v_roadmap.id;

  insert into public.profile_events (school_id, student_id, type, payload, source)
  values (v_roadmap.school_id, p_student, 'roadmap_drafted',
          jsonb_build_object('items', jsonb_array_length(p_items), 'paths', jsonb_array_length(p_paths)), 'system');
  insert into public.audit_log (school_id, actor_id, action, entity, entity_id)
  values (v_roadmap.school_id, p_student, 'roadmap.drafted', 'roadmap', v_roadmap.id::text);

  if v_roadmap.status = 'none' then
    insert into public.notifications (school_id, user_id, type, title, link)
    select v_roadmap.school_id, a.staff_id, 'roadmap_draft',
           (select full_name from public.profiles where id = p_student) || '''s first roadmap is ready to review', '/staff'
    from public.staff_assignments a where a.student_id = p_student and a.active;
  end if;

  return true;
end
$$;
revoke all on function public.replace_draft_roadmap(uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.replace_draft_roadmap(uuid, jsonb, jsonb) to service_role;

create or replace function public._publish_roadmap(p_student uuid, p_actor uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_roadmap public.roadmaps;
begin
  select * into v_roadmap from public.roadmaps where student_id = p_student for update;
  if not found or v_roadmap.status <> 'draft' then
    raise exception 'There is no draft to publish.';
  end if;
  -- Oldest first, so the cap keeps the first steps open and queues the rest.
  update public.roadmap_items set approval = 'approved' where roadmap_id = v_roadmap.id and approval = 'pending';
  update public.roadmaps set status = 'published', version = version + 1, published_at = public.app_now(),
         published_by = p_actor, updated_at = now() where id = v_roadmap.id;
  insert into public.roadmap_changes (school_id, roadmap_id, student_id, summary)
  values (v_roadmap.school_id, v_roadmap.id, p_student, jsonb_build_object('kind', 'published'));
  insert into public.notifications (school_id, user_id, type, title, link)
  values (v_roadmap.school_id, p_student, 'roadmap_published', 'Your roadmap is ready', '/student/roadmap');
  insert into public.profile_events (school_id, student_id, type, payload, source, created_by)
  values (v_roadmap.school_id, p_student, 'roadmap_published', '{}', 'system', p_actor);
  insert into public.audit_log (school_id, actor_id, action, entity, entity_id)
  values (v_roadmap.school_id, p_actor, 'roadmap.published', 'roadmap', v_roadmap.id::text);
  perform public.trim_open_steps(p_student);
end
$$;
revoke all on function public._publish_roadmap(uuid, uuid) from public, anon, authenticated;
grant execute on function public._publish_roadmap(uuid, uuid) to service_role;

-- ---------------------------------------------------------------- finishing a session review

create or replace function public._apply_session_review(p_session uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_session public.sessions;
  v_roadmap public.roadmaps;
  v_insight public.insights;
  v_staff_role text;
  v_item uuid;
  v_text text;
  v_added text[] := '{}';
  v_saved int := 0;
  v_steps int := 0;
  v_interest text;
  v_path uuid;
  v_new_paths jsonb := '{}';
  v_term text := public.current_term();
  v_day text := to_char(public.app_now() at time zone 'America/Indiana/Indianapolis', 'Mon FMDD');
begin
  select * into v_session from public.sessions where id = p_session for update;
  if not found or v_session.status <> 'ready_for_review' then
    raise exception 'This session isn''t waiting for review.';
  end if;
  if exists (select 1 from public.insights where session_id = p_session and status = 'proposed') then
    raise exception 'Review every suggestion first.';
  end if;
  select * into v_roadmap from public.roadmaps where student_id = v_session.student_id for update;
  select role into v_staff_role from public.profiles where id = v_session.staff_id;

  -- A new interest grows a branch to explore. Existing paths stay as they are.
  for v_insight in
    select * from public.insights where session_id = p_session and status in ('accepted', 'edited') and kind = 'interest'
    order by created_at
  loop
    v_interest := public.interest_from_text(v_insight.payload ->> 'text');
    continue when v_interest is null;
    continue when exists (select 1 from public.roadmap_paths where roadmap_id = v_roadmap.id and interest = v_interest and status <> 'dropped');
    select id into v_path from public.roadmap_paths where roadmap_id = v_roadmap.id and interest = v_interest limit 1;
    if v_path is null then
      insert into public.roadmap_paths (school_id, roadmap_id, student_id, name, kind, status, reason, first_job, sort,
                                        created_from_session, interest)
      values (v_session.school_id, v_roadmap.id, v_session.student_id, public.career_name(v_interest), 'career', 'exploring',
              'You brought this up in your session on ' || v_day || '.', public.career_first_job(v_interest),
              coalesce((select max(sort) + 1 from public.roadmap_paths where roadmap_id = v_roadmap.id), 0),
              p_session, v_interest)
      returning id into v_path;
    else
      update public.roadmap_paths set status = 'exploring', created_from_session = p_session where id = v_path;
    end if;
    v_new_paths := v_new_paths || jsonb_build_object(v_interest, v_path);
    v_added := v_added || ('New path to explore: ' || public.career_name(v_interest));
    update public.student_profiles
       set interests = case when cardinality(interests) = 0 then array[v_interest] else array[interests[1], v_interest] end,
           updated_at = now()
     where user_id = v_session.student_id;
  end loop;

  -- At most 2 new steps per session. Anything beyond that is saved for later, out of the student's way.
  for v_insight in
    select * from public.insights where session_id = p_session and status in ('accepted', 'edited') order by created_at
  loop
    v_text := v_insight.payload ->> 'text';
    if v_insight.kind in ('action', 'course_change') then
      v_steps := v_steps + 1;
      insert into public.roadmap_items (school_id, roadmap_id, student_id, path_id, term, kind, title, description,
                                        rationale, evidence, source, approval, status, due_date, firm)
      values (v_session.school_id, v_roadmap.id, v_session.student_id,
              (v_new_paths ->> public.interest_from_text(v_text))::uuid,
              v_term,
              case when v_insight.kind = 'course_change' then 'course'
                   else coalesce(v_insight.payload ->> 'roadmap_kind', 'coaching') end,
              v_text,
              'From your ' || coalesce(lower(v_session.session_type), 'session') || ' on ' || v_day || '.',
              'You agreed on this with your ' || case when v_staff_role = 'coach' then 'career coach' else 'advisor' end || '.',
              jsonb_build_array(jsonb_build_object('source', 'session', 'session_id', p_session, 'insight_id', v_insight.id)),
              'staff', 'approved',
              case when v_steps <= 2 then 'active' else 'locked' end,
              (v_insight.payload ->> 'due_date')::date, coalesce((v_insight.payload ->> 'firm')::boolean, false))
      returning id into v_item;
      if v_steps <= 2 then v_added := v_added || v_text; else v_saved := v_saved + 1; end if;
      insert into public.advice_items (school_id, student_id, session_id, given_by, text, roadmap_item_id)
      values (v_session.school_id, v_session.student_id, p_session, v_session.staff_id, v_text, v_item);
    end if;
    if v_insight.kind <> 'summary' then
      insert into public.profile_events (school_id, student_id, type, payload, source, source_ref, created_by)
      values (v_session.school_id, v_session.student_id, 'session_' || v_insight.kind,
              jsonb_build_object('text', v_text), 'session', p_session::text, v_session.staff_id);
    end if;
  end loop;

  if v_roadmap.status = 'draft' then
    perform public._publish_roadmap(v_session.student_id, v_session.staff_id);
  elsif v_roadmap.status = 'none' then
    update public.roadmaps set status = 'published', published_at = public.app_now(), published_by = v_session.staff_id
     where id = v_roadmap.id;
  end if;

  update public.sessions set status = 'reviewed', ended_at = coalesce(ended_at, public.app_now()) where id = p_session;
  update public.appointments set status = 'completed' where id = v_session.appointment_id;
  insert into public.activities (school_id, student_id, kind, title, minutes)
  values (v_session.school_id, v_session.student_id, 'session', coalesce(v_session.session_type, 'Session'), 30);

  if cardinality(v_added) > 0 then
    update public.roadmaps set version = version + 1, updated_at = now() where id = v_roadmap.id;
    insert into public.roadmap_changes (school_id, roadmap_id, student_id, session_id, summary)
    values (v_session.school_id, v_roadmap.id, v_session.student_id, p_session,
            jsonb_build_object('kind', 'session', 'added', to_jsonb(v_added), 'saved_for_later', v_saved));
  end if;
  insert into public.notifications (school_id, user_id, type, title, link)
  values (v_session.school_id, v_session.student_id, 'session_reviewed',
          case when v_new_paths <> '{}' then 'Your roadmap grew a new branch'
               else 'Highlights from your ' || coalesce(lower(v_session.session_type), 'session') || ' are ready' end,
          '/student/sessions');
  insert into public.audit_log (school_id, actor_id, action, entity, entity_id)
  values (v_session.school_id, v_session.staff_id, 'session.reviewed', 'session', p_session::text);
  perform public.fill_open_steps(v_session.student_id);
end
$$;
revoke all on function public._apply_session_review(uuid) from public, anon, authenticated;
grant execute on function public._apply_session_review(uuid) to service_role;

-- One click: everything not removed is accepted, then the review is finished.
create or replace function public.approve_session(p_session uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.sessions where id = p_session and staff_id = auth.uid()) then
    raise exception 'Only the person who ran this session can approve it.';
  end if;
  update public.insights set status = 'accepted', reviewed_by = auth.uid(), reviewed_at = public.app_now()
   where session_id = p_session and status = 'proposed';
  perform public._apply_session_review(p_session);
end
$$;
revoke all on function public.approve_session(uuid) from public, anon;
grant execute on function public.approve_session(uuid) to authenticated;

-- ---------------------------------------------------------------- students flag a highlight

create table if not exists public.insight_flags (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id),
  insight_id uuid not null references public.insights(id) on delete cascade,
  session_id uuid not null references public.sessions(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  note text check (char_length(note) <= 500),
  status text not null default 'open' check (status in ('open', 'fixed', 'dismissed')),
  created_at timestamptz not null default public.app_now(),
  resolved_by uuid references public.profiles(id),
  resolved_at timestamptz
);
create unique index if not exists insight_flags_one_open on public.insight_flags (insight_id) where status = 'open';
alter table public.insight_flags enable row level security;

create policy "read flags" on public.insight_flags for select using (public.can_see_student(student_id));
create policy "student flags own highlights" on public.insight_flags for insert with check (
  student_id = auth.uid() and status = 'open' and school_id = public.my_school()
  and exists (select 1 from public.insights i where i.id = insight_id and i.session_id = insight_flags.session_id
              and i.student_id = auth.uid() and i.status in ('accepted', 'edited'))
);
create policy "staff resolves flags" on public.insight_flags for update
  using (public.is_assigned_staff(student_id)) with check (public.is_assigned_staff(student_id));

create or replace function public._notify_flag() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (school_id, user_id, type, title, body, link)
  select new.school_id, s.staff_id, 'highlight_flagged',
         (select full_name from public.profiles where id = new.student_id) || ' flagged a highlight from your session',
         new.note, '/staff/sessions/' || s.id
  from public.sessions s where s.id = new.session_id;
  return new;
end
$$;
drop trigger if exists notify_flag on public.insight_flags;
create trigger notify_flag after insert on public.insight_flags for each row execute function public._notify_flag();

-- ---------------------------------------------------------------- alumni stories

create table if not exists public.alumni (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id),
  name text not null,
  degree text not null,
  grad_year int not null,
  title text not null,
  employer text not null,
  story text not null,
  interests text[] not null default '{}',
  created_at timestamptz not null default now()
);
alter table public.alumni enable row level security;
create policy "school members read alumni" on public.alumni for select using (school_id = public.my_school());
