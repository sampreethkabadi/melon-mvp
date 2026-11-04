-- Melon MVP: roadmap drafts. Run this once, after 0001_init.sql, in Supabase > SQL Editor > New query.
--
-- Pitch promise: an advisor approves every roadmap before the student sees it. This makes the database
-- enforce that. Students can't read a draft, and they can't approve their own items.

alter table public.roadmaps
  add column status text not null default 'none' check (status in ('none', 'draft', 'published')),
  add column published_at timestamptz,
  add column published_by uuid references public.profiles(id) on delete set null;

-- ---------------------------------------------------------------- what students can read

create or replace function public.roadmap_is_published(rid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.roadmaps r where r.id = rid and r.status = 'published')
$$;

drop policy "read paths" on public.roadmap_paths;
create policy "read paths" on public.roadmap_paths for select using (
  public.can_see_student(student_id)
  and (student_id <> auth.uid() or public.roadmap_is_published(roadmap_id))
);

drop policy "read items" on public.roadmap_items;
create policy "read items" on public.roadmap_items for select using (
  public.can_see_student(student_id)
  and (student_id <> auth.uid()
       or (public.roadmap_is_published(roadmap_id) and approval in ('not_needed', 'approved')))
);

-- ---------------------------------------------------------------- what students can change

drop policy "student updates own items" on public.roadmap_items;
create policy "student updates own items" on public.roadmap_items for update
  using (student_id = auth.uid() and public.roadmap_is_published(roadmap_id) and approval in ('not_needed', 'approved'))
  with check (student_id = auth.uid());

drop policy "student pins paths" on public.roadmap_paths;
create policy "student pins paths" on public.roadmap_paths for update
  using (student_id = auth.uid() and public.roadmap_is_published(roadmap_id))
  with check (student_id = auth.uid());

-- Students may tick off items and pin paths, nothing else. The system and staff aren't limited here.
create or replace function public.student_may_only_change() returns trigger
language plpgsql set search_path = public as $$
begin
  if auth.uid() = old.student_id and (to_jsonb(new) - tg_argv) is distinct from (to_jsonb(old) - tg_argv) then
    raise exception 'Students can only change: %', array_to_string(tg_argv, ', ');
  end if;
  return new;
end
$$;

create trigger student_item_changes before update on public.roadmap_items
  for each row execute function public.student_may_only_change('status', 'completed_at');
create trigger student_path_changes before update on public.roadmap_paths
  for each row execute function public.student_may_only_change('status');

-- ---------------------------------------------------------------- saving a draft

-- Replaces a student's draft in one transaction, so a retry or double-click can't leave half a roadmap.
-- Never touches a published roadmap. Returns false when there was nothing to do. Server only.
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
    insert into public.roadmap_paths (school_id, roadmap_id, student_id, name, reason, first_job, sort)
    values (v_roadmap.school_id, v_roadmap.id, p_student, v_path ->> 'name', v_path ->> 'reason',
            v_path ->> 'first_job', coalesce((v_path ->> 'sort')::int, 0))
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

  -- Tell the student's advisor and coach there's a draft to review, once.
  if v_roadmap.status = 'none' then
    insert into public.notifications (school_id, user_id, type, title, link)
    select v_roadmap.school_id, a.staff_id, 'roadmap_draft',
           (select full_name from public.profiles where id = p_student) || '''s first roadmap is ready to review', '/staff'
    from public.staff_assignments a where a.student_id = p_student and a.active;
  end if;

  return true;
end
$$;

-- Supabase lets signed-in users call public functions by default, so close this one explicitly.
revoke all on function public.replace_draft_roadmap(uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.replace_draft_roadmap(uuid, jsonb, jsonb) to service_role;

-- ---------------------------------------------------------------- resume files

update storage.buckets
set file_size_limit = 5242880,
    allowed_mime_types = array['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
where id = 'resumes';
