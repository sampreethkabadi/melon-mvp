-- Melon MVP: a roadmap is final only when both sides accept it, and staff-only notes stay staff-only.
-- Run this once, after 0006, in Supabase > SQL Editor > New query.
--
-- 1. Draft -> the advisor or coach approves -> the student sees it and accepts -> published.
--    Finishing a session no longer publishes anything. Students see only approved roadmaps.
-- 2. Concerns are for staff. Students can't read them, on screen or through the API.
-- 3. Students can change only what they're meant to on advice, change logs and notifications,
--    and reward claims are written by the server alone.

alter table public.roadmaps drop constraint if exists roadmaps_status_check;
alter table public.roadmaps add constraint roadmaps_status_check
  check (status in ('none', 'draft', 'awaiting_student', 'published'));
alter table public.roadmaps
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by uuid references public.profiles(id) on delete set null,
  add column if not exists accepted_at timestamptz;

-- ---------------------------------------------------------------- what students can read

-- Approved by staff, so the student may read it. They can't act on it until they've accepted it.
create or replace function public.roadmap_visible_to_student(rid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.roadmaps r where r.id = rid and r.status in ('awaiting_student', 'published'))
$$;

drop policy "read paths" on public.roadmap_paths;
create policy "read paths" on public.roadmap_paths for select using (
  public.can_see_student(student_id)
  and (student_id <> auth.uid() or public.roadmap_visible_to_student(roadmap_id))
);

drop policy "read items" on public.roadmap_items;
create policy "read items" on public.roadmap_items for select using (
  public.can_see_student(student_id)
  and (student_id <> auth.uid()
       or (public.roadmap_visible_to_student(roadmap_id) and approval in ('not_needed', 'approved')
           and (status not in ('queued', 'locked') or source = 'student')))
);

drop policy "read insights" on public.insights;
create policy "read insights" on public.insights for select using (
  public.can_see_student(student_id)
  and (student_id <> auth.uid() or (status in ('accepted', 'edited') and kind <> 'concern'))
);

drop policy "read profile events" on public.profile_events;
create policy "read profile events" on public.profile_events for select using (
  public.can_see_student(student_id)
  and (student_id <> auth.uid() or (status = 'confirmed' and type <> 'session_concern'))
);

-- ---------------------------------------------------------------- what students can change

create or replace function public.owner_may_only_change() returns trigger
language plpgsql set search_path = public as $$
declare
  v_owner text := coalesce(to_jsonb(old) ->> 'student_id', to_jsonb(old) ->> 'user_id');
begin
  if auth.uid()::text = v_owner and (to_jsonb(new) - tg_argv) is distinct from (to_jsonb(old) - tg_argv) then
    raise exception 'You can only change: %', array_to_string(tg_argv, ', ');
  end if;
  return new;
end
$$;

create trigger owner_advice_changes before update on public.advice_items
  for each row execute function public.owner_may_only_change('status');
create trigger owner_change_log_changes before update on public.roadmap_changes
  for each row execute function public.owner_may_only_change('seen_at');
create trigger owner_notification_changes before update on public.notifications
  for each row execute function public.owner_may_only_change('read_at');

-- Pickup codes come from the server after it checks the reward was earned.
drop policy if exists "student marks claim" on public.reward_claims;

-- ---------------------------------------------------------------- approve, then accept

-- The old one-sided publish is gone, so nobody can skip the student.
drop function if exists public.publish_roadmap(uuid);

create or replace function public.approve_roadmap(p_student uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_roadmap public.roadmaps;
begin
  if not public.is_assigned_staff(p_student) then
    raise exception 'Only this student''s advisor or coach can approve their roadmap.';
  end if;
  select * into v_roadmap from public.roadmaps where student_id = p_student for update;
  if not found or v_roadmap.status <> 'draft' then
    raise exception 'There is no draft to approve.';
  end if;
  update public.roadmap_items set approval = 'approved' where roadmap_id = v_roadmap.id and approval = 'pending';
  update public.roadmaps set status = 'awaiting_student', approved_at = public.app_now(), approved_by = auth.uid(),
         updated_at = now() where id = v_roadmap.id;
  perform public.trim_open_steps(p_student);
  insert into public.notifications (school_id, user_id, type, title, link)
  values (v_roadmap.school_id, p_student, 'roadmap_approved', 'Your roadmap is ready for you to accept', '/student/roadmap');
  insert into public.profile_events (school_id, student_id, type, payload, source, created_by)
  values (v_roadmap.school_id, p_student, 'roadmap_approved', '{}', 'system', auth.uid());
  insert into public.audit_log (school_id, actor_id, action, entity, entity_id)
  values (v_roadmap.school_id, auth.uid(), 'roadmap.approved', 'roadmap', v_roadmap.id::text);
end
$$;
revoke all on function public.approve_roadmap(uuid) from public, anon;
grant execute on function public.approve_roadmap(uuid) to authenticated;

-- A student accepts only their own roadmap, and only after staff have approved it.
create or replace function public.accept_roadmap() returns void
language plpgsql security definer set search_path = public as $$
declare
  v_roadmap public.roadmaps;
begin
  select * into v_roadmap from public.roadmaps where student_id = auth.uid() for update;
  if not found or v_roadmap.status <> 'awaiting_student' then
    raise exception 'There is no approved roadmap for you to accept.';
  end if;
  update public.roadmaps set status = 'published', version = version + 1, accepted_at = public.app_now(),
         published_at = public.app_now(), published_by = v_roadmap.approved_by, updated_at = now() where id = v_roadmap.id;
  insert into public.roadmap_changes (school_id, roadmap_id, student_id, summary)
  values (v_roadmap.school_id, v_roadmap.id, auth.uid(), jsonb_build_object('kind', 'published'));
  insert into public.notifications (school_id, user_id, type, title, link)
  select v_roadmap.school_id, a.staff_id, 'roadmap_accepted',
         (select full_name from public.profiles where id = auth.uid()) || ' accepted their roadmap', '/staff/students/' || auth.uid()
  from public.staff_assignments a where a.student_id = auth.uid() and a.active;
  insert into public.profile_events (school_id, student_id, type, payload, source, created_by)
  values (v_roadmap.school_id, auth.uid(), 'roadmap_accepted', '{}', 'system', auth.uid());
  insert into public.audit_log (school_id, actor_id, action, entity, entity_id)
  values (v_roadmap.school_id, auth.uid(), 'roadmap.accepted', 'roadmap', v_roadmap.id::text);
  perform public.fill_open_steps(auth.uid());
end
$$;
revoke all on function public.accept_roadmap() from public, anon;
grant execute on function public.accept_roadmap() to authenticated;

-- ---------------------------------------------------------------- drafts and sessions

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
  if v_roadmap.status in ('awaiting_student', 'published') then
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
              'staff', case when v_roadmap.status in ('awaiting_student', 'published') then 'approved' else 'pending' end,
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

  -- A session never publishes a roadmap. Its steps wait in the draft for the advisor and the student to accept.
  if v_roadmap.status = 'none' then
    update public.roadmaps set status = 'draft', updated_at = now() where id = v_roadmap.id;
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
          case when v_new_paths <> '{}' and v_roadmap.status = 'published' then 'Your roadmap grew a new branch'
               else 'Highlights from your ' || coalesce(lower(v_session.session_type), 'session') || ' are ready' end,
          '/student/sessions');
  insert into public.audit_log (school_id, actor_id, action, entity, entity_id)
  values (v_session.school_id, v_session.staff_id, 'session.reviewed', 'session', p_session::text);
  perform public.fill_open_steps(v_session.student_id);
end
$$;
revoke all on function public._apply_session_review(uuid) from public, anon, authenticated;
grant execute on function public._apply_session_review(uuid) to service_role;
