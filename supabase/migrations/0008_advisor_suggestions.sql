-- Melon MVP: advisors suggest changes to an accepted roadmap, and the student decides.
-- Run this once, after 0007, in Supabase > SQL Editor > New query.
--
-- 1. While a roadmap is a draft or waiting to be accepted, its advisor or coach edits it directly.
-- 2. Once both sides have accepted it, staff can't change it directly. They suggest adding, editing or
--    removing a step, and the change happens only if the student accepts. Session steps the advisor
--    approves still go straight on, because they were agreed in the meeting.

create table public.roadmap_suggestions (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id),
  roadmap_id uuid not null references public.roadmaps(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  item_id uuid references public.roadmap_items(id) on delete set null,
  action text not null check (action in ('add', 'edit', 'remove')),
  title text,
  description text,
  kind text,
  reason text,
  before jsonb,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'withdrawn')),
  suggested_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default public.app_now(),
  decided_at timestamptz
);
create index on public.roadmap_suggestions (student_id, created_at desc);
create unique index roadmap_suggestions_one_per_item on public.roadmap_suggestions (item_id) where status = 'pending';
alter table public.roadmap_suggestions enable row level security;

-- Anyone who can see the student can read these. All changes go through the functions below.
create policy "read suggestions" on public.roadmap_suggestions for select using (public.can_see_student(student_id));

-- ---------------------------------------------------------------- an accepted roadmap is set

drop policy "staff updates items" on public.roadmap_items;
create policy "staff updates items" on public.roadmap_items for update
  using (public.is_assigned_staff(student_id) and not public.roadmap_is_published(roadmap_id))
  with check (public.is_assigned_staff(student_id) and not public.roadmap_is_published(roadmap_id));

drop policy "staff suggests items" on public.roadmap_items;
create policy "staff suggests items" on public.roadmap_items for insert
  with check (public.is_assigned_staff(student_id) and source = 'staff' and school_id = public.my_school()
              and not public.roadmap_is_published(roadmap_id));

drop policy "staff updates paths" on public.roadmap_paths;
create policy "staff updates paths" on public.roadmap_paths for update
  using (public.is_assigned_staff(student_id) and not public.roadmap_is_published(roadmap_id))
  with check (public.is_assigned_staff(student_id) and not public.roadmap_is_published(roadmap_id));

-- Accepting a suggestion changes a step on the student's behalf, so the system may do what they can't.
create or replace function public.student_may_only_change() returns trigger
language plpgsql set search_path = public as $$
begin
  if auth.uid() = old.student_id and coalesce(current_setting('melon.system', true), 'off') <> 'on'
     and (to_jsonb(new) - tg_argv) is distinct from (to_jsonb(old) - tg_argv) then
    raise exception 'Students can only change: %', array_to_string(tg_argv, ', ');
  end if;
  return new;
end
$$;

-- ---------------------------------------------------------------- suggesting

create or replace function public.suggest_roadmap_change(p_student uuid, p_action text, p_item uuid, p_title text,
                                                         p_description text, p_kind text, p_reason text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_roadmap public.roadmaps;
  v_item public.roadmap_items;
  v_id uuid;
  v_label text;
begin
  if not public.is_assigned_staff(p_student) then
    raise exception 'Only this student''s advisor or coach can suggest changes.';
  end if;
  select * into v_roadmap from public.roadmaps where student_id = p_student;
  if not found or v_roadmap.status <> 'published' then
    raise exception 'Suggestions are for accepted roadmaps. Edit a draft directly.';
  end if;
  if p_action not in ('add', 'edit', 'remove') then
    raise exception 'Unknown kind of suggestion.';
  end if;
  if p_action in ('add', 'edit') and coalesce(btrim(p_title), '') = '' then
    raise exception 'A step needs a title.';
  end if;
  if p_action = 'add' and p_kind not in ('course', 'experience', 'skill', 'certification', 'event', 'networking',
                                         'application', 'coaching', 'project') then
    raise exception 'Unknown kind of step.';
  end if;
  if p_action in ('edit', 'remove') then
    select * into v_item from public.roadmap_items
     where id = p_item and student_id = p_student and approval in ('not_needed', 'approved') and status <> 'skipped';
    if not found then
      raise exception 'That step isn''t on this roadmap.';
    end if;
    if exists (select 1 from public.roadmap_suggestions where item_id = p_item and status = 'pending') then
      raise exception 'There is already a suggestion waiting on that step.';
    end if;
  end if;

  insert into public.roadmap_suggestions (school_id, roadmap_id, student_id, item_id, action, title, description, kind, reason,
                                          before, suggested_by)
  values (v_roadmap.school_id, v_roadmap.id, p_student, case when p_action = 'add' then null else p_item end, p_action,
          nullif(btrim(p_title), ''), nullif(btrim(p_description), ''), p_kind, nullif(btrim(p_reason), ''),
          case when p_action = 'add' then null
               else jsonb_build_object('title', v_item.title, 'description', v_item.description) end,
          auth.uid())
  returning id into v_id;

  v_label := case p_action when 'add' then 'a new step' when 'edit' then 'a change to a step' else 'removing a step' end;
  insert into public.notifications (school_id, user_id, type, title, link)
  values (v_roadmap.school_id, p_student, 'roadmap_suggestion',
          (select full_name from public.profiles where id = auth.uid()) || ' suggested ' || v_label, '/student/roadmap');
  insert into public.audit_log (school_id, actor_id, action, entity, entity_id, meta)
  values (v_roadmap.school_id, auth.uid(), 'suggestion.created', 'roadmap', v_roadmap.id::text,
          jsonb_build_object('suggestion', v_id, 'action', p_action));
  return v_id;
end
$$;
revoke all on function public.suggest_roadmap_change(uuid, text, uuid, text, text, text, text) from public, anon;
grant execute on function public.suggest_roadmap_change(uuid, text, uuid, text, text, text, text) to authenticated;

create or replace function public.withdraw_suggestion(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.roadmap_suggestions set status = 'withdrawn', decided_at = public.app_now()
   where id = p_id and status = 'pending' and suggested_by = auth.uid();
  if not found then
    raise exception 'Only the person who made a waiting suggestion can withdraw it.';
  end if;
end
$$;
revoke all on function public.withdraw_suggestion(uuid) from public, anon;
grant execute on function public.withdraw_suggestion(uuid) to authenticated;

-- ---------------------------------------------------------------- the student decides

create or replace function public.answer_suggestion(p_id uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_s public.roadmap_suggestions;
  v_change text;
begin
  select * into v_s from public.roadmap_suggestions where id = p_id for update;
  if not found or v_s.student_id is distinct from auth.uid() then
    raise exception 'That suggestion isn''t yours.';
  end if;
  if v_s.status <> 'pending' then
    raise exception 'That suggestion has already been answered.';
  end if;

  update public.roadmap_suggestions set status = case when p_accept then 'accepted' else 'declined' end,
         decided_at = public.app_now() where id = p_id;

  if p_accept then
    perform set_config('melon.system', 'on', true);
    if v_s.action = 'add' then
      insert into public.roadmap_items (school_id, roadmap_id, student_id, term, kind, title, description, rationale, evidence,
                                        source, approval)
      values (v_s.school_id, v_s.roadmap_id, v_s.student_id, public.current_term(), v_s.kind, v_s.title, v_s.description,
              coalesce(v_s.reason, 'Your advisor or coach suggested this, and you accepted.'),
              jsonb_build_array(jsonb_build_object('source', 'suggestion', 'suggestion_id', v_s.id)),
              -- The student chose this, so it's theirs: it stays visible if it has to wait for a free slot.
              'student', 'approved');
      v_change := v_s.title;
    elsif v_s.action = 'edit' then
      update public.roadmap_items set title = v_s.title, description = coalesce(v_s.description, description)
       where id = v_s.item_id and student_id = v_s.student_id;
      v_change := 'Changed: ' || v_s.title;
    else
      update public.roadmap_items set approval = 'rejected', status = 'skipped'
       where id = v_s.item_id and student_id = v_s.student_id;
      update public.advice_items set status = 'dismissed' where roadmap_item_id = v_s.item_id;
      v_change := 'Removed: ' || (v_s.before ->> 'title');
    end if;
    perform set_config('melon.system', 'off', true);
    update public.roadmaps set version = version + 1, updated_at = now() where id = v_s.roadmap_id;
    -- The student just made this decision, so it isn't news to them.
    insert into public.roadmap_changes (school_id, roadmap_id, student_id, summary, seen_at)
    values (v_s.school_id, v_s.roadmap_id, v_s.student_id,
            jsonb_build_object('kind', 'suggestion', 'added', jsonb_build_array(v_change)), public.app_now());
    insert into public.profile_events (school_id, student_id, type, payload, source, created_by)
    values (v_s.school_id, v_s.student_id, 'suggestion_accepted', jsonb_build_object('text', v_change), 'system', auth.uid());
    perform public.fill_open_steps(v_s.student_id);
  end if;

  if v_s.suggested_by is not null then
    insert into public.notifications (school_id, user_id, type, title, link)
    values (v_s.school_id, v_s.suggested_by, 'suggestion_answered',
            (select full_name from public.profiles where id = auth.uid())
              || case when p_accept then ' accepted your suggestion' else ' declined your suggestion' end,
            '/staff/students/' || v_s.student_id);
  end if;
  insert into public.audit_log (school_id, actor_id, action, entity, entity_id)
  values (v_s.school_id, auth.uid(), case when p_accept then 'suggestion.accepted' else 'suggestion.declined' end,
          'roadmap_suggestion', v_s.id::text);
end
$$;
revoke all on function public.answer_suggestion(uuid, boolean) from public, anon;
grant execute on function public.answer_suggestion(uuid, boolean) to authenticated;
