-- Melon MVP: the advisor decides where each action item from a session goes. Run this once, after 0009, in
-- Supabase > SQL Editor > New query.
--
-- On the review screen, each action item can be:
--   * an action item (the default, as before),
--   * a milestone: a flag on the student's road, in this semester or a later one the advisor picks, or
--   * an action item under a bigger goal: one already on the roadmap, or a new one the advisor names.
-- The choice is saved on the suggestion (insights.payload.placement) and applied when the advisor approves.
-- Milestones don't count toward the 5 open steps or the 2 new steps per session: they're what steps lead to.

alter table public.roadmap_items add column if not exists milestone boolean; -- null: the app's own rules decide
alter table public.roadmap_items add column if not exists parent_id uuid references public.roadmap_items(id) on delete set null;
create index if not exists roadmap_items_parent_idx on public.roadmap_items (parent_id);

create or replace function public.open_step_count(p_student uuid) returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from public.roadmap_items
  where student_id = p_student and status = 'active' and public.is_open_term(term) and milestone is not true
$$;

create or replace function public._cap_open_steps() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'active' and (tg_op = 'INSERT' or old.status <> 'active') and public.is_open_term(new.term)
     and new.approval in ('not_needed', 'approved') and new.milestone is not true
     and public.open_step_count(new.student_id) >= 5 then
    new.status := 'queued';
  end if;
  return new;
end
$$;

create or replace function public.trim_open_steps(p_student uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform set_config('melon.system', 'on', true);
  update public.roadmap_items set status = 'queued'
   where id in (
     select i.id from public.roadmap_items i
     where i.student_id = p_student and i.status = 'active' and public.is_open_term(i.term) and i.milestone is not true
     order by i.firm desc, i.due_date nulls last, i.created_at, i.sort
     offset 5);
  perform set_config('melon.system', 'off', true);
end
$$;
revoke all on function public.trim_open_steps(uuid) from public, anon, authenticated;

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
  v_place jsonb;
  v_as text;
  v_parent uuid;
  v_item_term text;
  v_goal_title text;
  v_goal_term text;
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
      -- Where the advisor put it: a plain action item (the default), a milestone on the road in a semester they
      -- picked, or an action item under a bigger goal (one already on the roadmap, or a new one named here).
      v_place := coalesce(v_insight.payload -> 'placement', '{}'::jsonb);
      v_as := coalesce(nullif(v_place ->> 'as', ''), 'task');
      if v_as not in ('task', 'milestone', 'goal') then raise exception 'Unknown placement for "%".', left(v_text, 40); end if;
      v_parent := null;
      v_item_term := v_term;
      if v_as = 'milestone' then
        v_item_term := coalesce(nullif(v_place ->> 'term', ''), v_term);
        if v_item_term !~ '^(Spring|Fall) [0-9]{4}$' or public.term_rank(v_item_term) < public.term_rank(v_term) then
          raise exception 'Pick this semester or a later one for "%".', left(v_text, 40);
        end if;
      elsif v_as = 'goal' then
        if nullif(v_place ->> 'goal_id', '') is not null then
          select id into v_parent from public.roadmap_items
           where id = (v_place ->> 'goal_id')::uuid and student_id = v_session.student_id and milestone is true and status <> 'done';
          if v_parent is null then raise exception 'That goal isn''t open on this student''s roadmap.'; end if;
        else
          v_goal_title := btrim(coalesce(v_place ->> 'goal_title', ''));
          if length(v_goal_title) < 2 or length(v_goal_title) > 80 then
            raise exception 'Name the goal for "%" (2 to 80 characters).', left(v_text, 40);
          end if;
          v_goal_term := coalesce(nullif(v_place ->> 'term', ''), v_term);
          if v_goal_term !~ '^(Spring|Fall) [0-9]{4}$' or public.term_rank(v_goal_term) < public.term_rank(v_term) then
            raise exception 'Pick this semester or a later one for the goal "%".', left(v_goal_title, 40);
          end if;
          -- Two action items under the same new goal share it.
          select id into v_parent from public.roadmap_items
           where roadmap_id = v_roadmap.id and milestone is true and status <> 'done' and lower(title) = lower(v_goal_title)
           limit 1;
          if v_parent is null then
            insert into public.roadmap_items (school_id, roadmap_id, student_id, term, kind, title, description, rationale,
                                              evidence, source, approval, status, milestone)
            values (v_session.school_id, v_roadmap.id, v_session.student_id, v_goal_term, 'experience', v_goal_title,
                    'A goal from your ' || coalesce(lower(v_session.session_type), 'session') || ' on ' || v_day || '.',
                    'You set this goal with your ' || case when v_staff_role = 'coach' then 'career coach' else 'advisor' end || '.',
                    jsonb_build_array(jsonb_build_object('source', 'session', 'session_id', p_session)),
                    'staff', case when v_roadmap.status in ('awaiting_student', 'published') then 'approved' else 'pending' end,
                    'active', true)
            returning id into v_parent;
            v_added := v_added || ('New goal: ' || v_goal_title);
          end if;
        end if;
      end if;

      -- Milestones don't count toward the 2 new steps per session: they're what the steps lead to.
      if v_as <> 'milestone' then v_steps := v_steps + 1; end if;
      insert into public.roadmap_items (school_id, roadmap_id, student_id, path_id, term, kind, title, description,
                                        rationale, evidence, source, approval, status, due_date, firm, milestone, parent_id)
      values (v_session.school_id, v_roadmap.id, v_session.student_id,
              (v_new_paths ->> public.interest_from_text(v_text))::uuid,
              v_item_term,
              case when v_insight.kind = 'course_change' then 'course'
                   else coalesce(v_insight.payload ->> 'roadmap_kind', 'coaching') end,
              v_text,
              'From your ' || coalesce(lower(v_session.session_type), 'session') || ' on ' || v_day || '.',
              'You agreed on this with your ' || case when v_staff_role = 'coach' then 'career coach' else 'advisor' end || '.',
              jsonb_build_array(jsonb_build_object('source', 'session', 'session_id', p_session, 'insight_id', v_insight.id)),
              'staff', case when v_roadmap.status in ('awaiting_student', 'published') then 'approved' else 'pending' end,
              case when v_as = 'milestone' or v_steps <= 2 then 'active' else 'locked' end,
              (v_insight.payload ->> 'due_date')::date, coalesce((v_insight.payload ->> 'firm')::boolean, false),
              case when v_as = 'milestone' then true end, v_parent)
      returning id into v_item;
      if v_as = 'milestone' then
        v_added := v_added || ('New milestone: ' || v_text);
      elsif v_steps <= 2 then
        v_added := v_added || v_text;
      else
        v_saved := v_saved + 1;
      end if;
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
          '/student/appointments');
  insert into public.audit_log (school_id, actor_id, action, entity, entity_id)
  values (v_session.school_id, v_session.staff_id, 'session.reviewed', 'session', p_session::text);
  perform public.fill_open_steps(v_session.student_id);
end
$$;
revoke all on function public._apply_session_review(uuid) from public, anon, authenticated;
grant execute on function public._apply_session_review(uuid) to service_role;
