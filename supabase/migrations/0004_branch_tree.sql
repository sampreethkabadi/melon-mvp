-- Melon MVP: Branch Tree roadmap. Run this once, after 0003, in Supabase > SQL Editor > New query.
--
-- 1. Finishing a session review always reaches the student. The advisor or coach has just reviewed the
--    student, so if their first roadmap was still a draft, finishing the review publishes it.
-- 2. Steps from a session go into the current semester, not a separate "From your sessions" pile.
-- 3. An accepted "interest" suggestion grows a new branch (path) on the roadmap, and it becomes one of the
--    student's two background colors. Nothing is removed: existing paths stay.

alter table public.roadmap_paths add column if not exists interest text;

-- Best-effort label for paths made before this column existed.
update public.roadmap_paths set interest = case name
  when 'Data & analytics' then 'data' when 'Cybersecurity' then 'cyber' when 'Software engineering' then 'soft'
  when 'UX & product design' then 'ux' when 'Business & finance' then 'biz' when 'Health careers' then 'health'
  when 'Arts & media' then 'arts' end
where interest is null;

-- ---------------------------------------------------------------- helpers

-- "Fall 2026" from July on, "Spring 2026" before. Matches upcomingTerms() in src/lib/roadmap/template.ts.
create or replace function public.current_term(d date default current_date) returns text
language sql stable as $$
  select case when extract(month from d) >= 7 then 'Fall ' else 'Spring ' end || extract(year from d)::int
$$;

-- Which career area a sentence is about. Security comes first so "security data analyst" counts as security.
create or replace function public.interest_from_text(t text) returns text
language sql immutable as $$
  select case
    when t ~* '(cyber|security|infosec)' then 'cyber'
    when t ~* '(\mux\M|user experience|product design|design)' then 'ux'
    when t ~* '(software|developer|programming|web dev)' then 'soft'
    when t ~* '(data|analytics|machine learning|\mai\M|statistics)' then 'data'
    when t ~* '(finance|business|consult|marketing|accounting)' then 'biz'
    when t ~* '(health|medic|nurs|clinical)' then 'health'
    when t ~* '(\marts?\M|media|film|music|journalism)' then 'arts'
  end
$$;

-- Same names as CAREERS in src/lib/roadmap/template.ts.
create or replace function public.career_name(i text) returns text
language sql immutable as $$
  select case i when 'data' then 'Data & analytics' when 'cyber' then 'Cybersecurity' when 'soft' then 'Software engineering'
    when 'ux' then 'UX & product design' when 'biz' then 'Business & finance' when 'health' then 'Health careers'
    when 'arts' then 'Arts & media' end
$$;

create or replace function public.career_first_job(i text) returns text
language sql immutable as $$
  select case i when 'data' then 'Data analyst' when 'cyber' then 'Security analyst' when 'soft' then 'Junior software engineer'
    when 'ux' then 'Associate UX designer' when 'biz' then 'Business analyst' when 'health' then 'Health program coordinator'
    when 'arts' then 'Content or media coordinator' end
$$;

-- ---------------------------------------------------------------- drafts keep the interest of each path

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
    insert into public.roadmap_paths (school_id, roadmap_id, student_id, name, reason, first_job, sort, interest)
    values (v_roadmap.school_id, v_roadmap.id, p_student, v_path ->> 'name', v_path ->> 'reason',
            v_path ->> 'first_job', coalesce((v_path ->> 'sort')::int, 0), v_path ->> 'interest')
    returning id into v_id;
    v_path_ids := v_path_ids || v_id;
  end loop;

  insert into public.roadmap_items (school_id, roadmap_id, student_id, path_id, term, kind, title, description,
                                    rationale, evidence, status, source, approval, resource_id, sort)
  select v_roadmap.school_id, v_roadmap.id, p_student,
         v_path_ids[(i ->> 'path_index')::int + 1],
         i ->> 'term', i ->> 'kind', i ->> 'title', i ->> 'description', i ->> 'rationale',
         coalesce(i -> 'evidence', '[]'::jsonb), 'active', 'system', 'pending',
         (i ->> 'resource_id')::uuid, coalesce((i ->> 'sort')::int, 0)
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

-- ---------------------------------------------------------------- finishing a session review

create or replace function public._apply_session_review(p_session uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_session public.sessions;
  v_roadmap public.roadmaps;
  v_insight public.insights;
  v_item uuid;
  v_text text;
  v_added text[] := '{}';
  v_interest text;
  v_path uuid;
  v_new_paths jsonb := '{}';  -- interest -> new path id, so this session's steps can sit on its new branch
  v_term text := public.current_term();
  v_day text := to_char(now() at time zone 'America/Indiana/Indianapolis', 'Mon FMDD');
begin
  select * into v_session from public.sessions where id = p_session for update;
  if not found or v_session.status <> 'ready_for_review' then
    raise exception 'This session isn''t waiting for review.';
  end if;
  if exists (select 1 from public.insights where session_id = p_session and status = 'proposed') then
    raise exception 'Review every suggestion first.';
  end if;
  select * into v_roadmap from public.roadmaps where student_id = v_session.student_id for update;

  -- New interests first, so steps about them can go on the new branch.
  for v_insight in
    select * from public.insights where session_id = p_session and status in ('accepted', 'edited') and kind = 'interest'
    order by created_at
  loop
    v_interest := public.interest_from_text(v_insight.payload ->> 'text');
    continue when v_interest is null;
    continue when exists (select 1 from public.student_profiles where user_id = v_session.student_id and v_interest = any (interests));
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
    -- Keep two background colors at most: the student's first interest plus the new one.
    update public.student_profiles
       set interests = case when cardinality(interests) = 0 then array[v_interest] else array[interests[1], v_interest] end,
           updated_at = now()
     where user_id = v_session.student_id;
  end loop;

  for v_insight in
    select * from public.insights where session_id = p_session and status in ('accepted', 'edited') order by created_at
  loop
    v_text := v_insight.payload ->> 'text';
    if v_insight.kind in ('action', 'course_change') then
      insert into public.roadmap_items (school_id, roadmap_id, student_id, path_id, term, kind, title, description,
                                        rationale, evidence, source, approval)
      values (v_session.school_id, v_roadmap.id, v_session.student_id,
              (v_new_paths ->> public.interest_from_text(v_text))::uuid,
              v_term,
              case when v_insight.kind = 'course_change' then 'course'
                   else coalesce(v_insight.payload ->> 'roadmap_kind', 'coaching') end,
              v_text, 'Added after your session on ' || v_day || '.', 'You agreed on this with your advisor or coach.',
              jsonb_build_array(jsonb_build_object('source', 'session', 'session_id', p_session, 'insight_id', v_insight.id)),
              'staff', 'approved')
      returning id into v_item;
      v_added := v_added || v_text;
      if v_insight.kind = 'action' then
        insert into public.advice_items (school_id, student_id, session_id, given_by, text, roadmap_item_id)
        values (v_session.school_id, v_session.student_id, p_session, v_session.staff_id, v_text, v_item);
      end if;
    end if;
    if v_insight.kind <> 'summary' then
      insert into public.profile_events (school_id, student_id, type, payload, source, source_ref, created_by)
      values (v_session.school_id, v_session.student_id, 'session_' || v_insight.kind,
              jsonb_build_object('text', v_text), 'session', p_session::text, v_session.staff_id);
    end if;
  end loop;

  -- The advisor or coach just reviewed this student, so a first roadmap still in draft is approved now.
  if v_roadmap.status = 'draft' then
    perform public._publish_roadmap(v_session.student_id, v_session.staff_id);
  elsif v_roadmap.status = 'none' then
    update public.roadmaps set status = 'published', published_at = now(), published_by = v_session.staff_id
     where id = v_roadmap.id;
  end if;

  update public.sessions set status = 'reviewed', ended_at = coalesce(ended_at, now()) where id = p_session;
  update public.appointments set status = 'completed' where id = v_session.appointment_id;
  insert into public.activities (school_id, student_id, kind, title, minutes)
  values (v_session.school_id, v_session.student_id, 'session', 'Session with your advisor or coach', 30);

  if cardinality(v_added) > 0 then
    update public.roadmaps set version = version + 1, updated_at = now() where id = v_roadmap.id;
    insert into public.roadmap_changes (school_id, roadmap_id, student_id, session_id, summary)
    values (v_session.school_id, v_roadmap.id, v_session.student_id, p_session,
            jsonb_build_object('kind', 'session', 'added', to_jsonb(v_added)));
  end if;
  insert into public.notifications (school_id, user_id, type, title, link)
  values (v_session.school_id, v_session.student_id, 'session_reviewed',
          case when v_new_paths <> '{}' then 'Your roadmap grew a new branch' else 'Your session notes are ready' end,
          '/student/roadmap');
  insert into public.audit_log (school_id, actor_id, action, entity, entity_id)
  values (v_session.school_id, v_session.staff_id, 'session.reviewed', 'session', p_session::text);
end
$$;
revoke all on function public._apply_session_review(uuid) from public, anon, authenticated;
grant execute on function public._apply_session_review(uuid) to service_role;
