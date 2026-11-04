-- Melon MVP: balanced advisor assignment, the session review loop, roadmap publishing.
-- Run this once, after 0002_roadmap_drafts.sql, in Supabase > SQL Editor > New query.

alter table public.sessions
  add column transcript_source text check (transcript_source in ('audio', 'sample', 'notes'));

update storage.buckets set file_size_limit = 52428800 where id = 'recordings';

-- ---------------------------------------------------------------- balanced assignment

-- The advisor or coach with the fewest active students. Ties are broken at random. The lock makes
-- simultaneous sign-ups take turns, so they can't all pick the same person.
create or replace function public.pick_staff(p_school uuid, p_kind text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_staff uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_school::text || p_kind, 0));
  select p.id into v_staff
  from public.profiles p
  left join public.staff_assignments a on a.staff_id = p.id and a.kind = p_kind and a.active
  where p.school_id = p_school and p.role = p_kind
  group by p.id
  order by count(a.id), random()
  limit 1;
  return v_staff;
end
$$;
revoke all on function public.pick_staff(uuid, text) from public, anon, authenticated;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_school uuid;
  v_domain text := lower(split_part(new.email, '@', 2));
  v_kind text;
  v_staff uuid;
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
  foreach v_kind in array array['advisor', 'coach'] loop
    v_staff := public.pick_staff(v_school, v_kind);
    if v_staff is not null then
      insert into public.staff_assignments (school_id, student_id, staff_id, kind)
      values (v_school, new.id, v_staff, v_kind);
    end if;
  end loop;
  return new;
end
$$;

-- ---------------------------------------------------------------- nothing unreviewed reaches a student

drop policy "read insights" on public.insights;
create policy "read insights" on public.insights for select using (
  public.can_see_student(student_id)
  and (student_id <> auth.uid() or status in ('accepted', 'edited'))
);

drop policy "read profile events" on public.profile_events;
create policy "read profile events" on public.profile_events for select using (
  public.can_see_student(student_id)
  and (student_id <> auth.uid() or status = 'confirmed')
);

create policy "staff corrects transcripts" on public.transcript_segments for update
  using (public.is_assigned_staff(student_id)) with check (public.is_assigned_staff(student_id));

create policy "staff updates paths" on public.roadmap_paths for update
  using (public.is_assigned_staff(student_id)) with check (public.is_assigned_staff(student_id));

-- Audio can't be saved unless both people agreed, whatever the app does.
create or replace function public.recording_needs_consent() returns trigger
language plpgsql set search_path = public as $$
begin
  if not public.has_recording_consent(new.session_id) then
    raise exception 'Both people must agree before audio is stored.';
  end if;
  return new;
end
$$;
create trigger recording_needs_consent before insert on public.recordings
  for each row execute function public.recording_needs_consent();

-- ---------------------------------------------------------------- publishing a roadmap

create or replace function public._publish_roadmap(p_student uuid, p_actor uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_roadmap public.roadmaps;
begin
  select * into v_roadmap from public.roadmaps where student_id = p_student for update;
  if not found or v_roadmap.status <> 'draft' then
    raise exception 'There is no draft to publish.';
  end if;
  update public.roadmap_items set approval = 'approved' where roadmap_id = v_roadmap.id and approval = 'pending';
  update public.roadmaps set status = 'published', version = version + 1, published_at = now(),
         published_by = p_actor, updated_at = now() where id = v_roadmap.id;
  insert into public.roadmap_changes (school_id, roadmap_id, student_id, summary)
  values (v_roadmap.school_id, v_roadmap.id, p_student, jsonb_build_object('kind', 'published'));
  insert into public.notifications (school_id, user_id, type, title, link)
  values (v_roadmap.school_id, p_student, 'roadmap_published', 'Your roadmap is ready', '/student/roadmap');
  insert into public.profile_events (school_id, student_id, type, payload, source, created_by)
  values (v_roadmap.school_id, p_student, 'roadmap_published', '{}', 'system', p_actor);
  insert into public.audit_log (school_id, actor_id, action, entity, entity_id)
  values (v_roadmap.school_id, p_actor, 'roadmap.published', 'roadmap', v_roadmap.id::text);
end
$$;
revoke all on function public._publish_roadmap(uuid, uuid) from public, anon, authenticated;
grant execute on function public._publish_roadmap(uuid, uuid) to service_role;

create or replace function public.publish_roadmap(p_student uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_assigned_staff(p_student) then
    raise exception 'Only this student''s advisor or coach can publish their roadmap.';
  end if;
  perform public._publish_roadmap(p_student, auth.uid());
end
$$;
revoke all on function public.publish_roadmap(uuid) from public, anon;
grant execute on function public.publish_roadmap(uuid) to authenticated;

-- ---------------------------------------------------------------- finishing a session review

-- Accepted suggestions update the profile, the advice tracker and the roadmap, all in one transaction.
create or replace function public._apply_session_review(p_session uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_session public.sessions;
  v_roadmap public.roadmaps;
  v_insight public.insights;
  v_item uuid;
  v_text text;
  v_added text[] := '{}';
begin
  select * into v_session from public.sessions where id = p_session for update;
  if not found or v_session.status <> 'ready_for_review' then
    raise exception 'This session isn''t waiting for review.';
  end if;
  if exists (select 1 from public.insights where session_id = p_session and status = 'proposed') then
    raise exception 'Review every suggestion first.';
  end if;
  select * into v_roadmap from public.roadmaps where student_id = v_session.student_id for update;

  for v_insight in
    select * from public.insights where session_id = p_session and status in ('accepted', 'edited') order by created_at
  loop
    v_text := v_insight.payload ->> 'text';
    if v_insight.kind in ('action', 'course_change') then
      insert into public.roadmap_items (school_id, roadmap_id, student_id, term, kind, title, description, rationale,
                                        evidence, source, approval)
      values (v_session.school_id, v_roadmap.id, v_session.student_id, 'From your sessions',
              case when v_insight.kind = 'course_change' then 'course'
                   else coalesce(v_insight.payload ->> 'roadmap_kind', 'coaching') end,
              v_text, 'Added after a session.', 'You agreed on this with your advisor or coach.',
              jsonb_build_array(jsonb_build_object('source', 'session', 'session_id', p_session, 'insight_id', v_insight.id)),
              'staff', case when v_roadmap.status = 'published' then 'approved' else 'pending' end)
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
  values (v_session.school_id, v_session.student_id, 'session_reviewed', 'Your session notes are ready', '/student/roadmap');
  insert into public.audit_log (school_id, actor_id, action, entity, entity_id)
  values (v_session.school_id, v_session.staff_id, 'session.reviewed', 'session', p_session::text);
end
$$;
revoke all on function public._apply_session_review(uuid) from public, anon, authenticated;
grant execute on function public._apply_session_review(uuid) to service_role;

create or replace function public.finish_session_review(p_session uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.sessions where id = p_session and staff_id = auth.uid()) then
    raise exception 'Only the person who ran this session can finish its review.';
  end if;
  perform public._apply_session_review(p_session);
end
$$;
revoke all on function public.finish_session_review(uuid) from public, anon;
grant execute on function public.finish_session_review(uuid) to authenticated;
