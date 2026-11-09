-- Melon MVP: the candy road. Run this once, after 0008, in Supabase > SQL Editor > New query.
--
-- 1. Each step can say what the student got out of it ("outcomes"). The road shows it when you hover a flag.
-- 2. Students can add something they already did, outside Melon (a club, a job, a hackathon). It goes on
--    their road as done and marked "added by you". They can't backdate it into a future semester.

alter table public.roadmap_items add column if not exists outcomes text[] not null default '{}';

create or replace function public.log_win(p_term text, p_title text, p_kind text default 'experience', p_outcome text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_student uuid := auth.uid();
  v_school uuid;
  v_roadmap uuid;
  v_title text := btrim(coalesce(p_title, ''));
  v_outcome text := nullif(btrim(coalesce(p_outcome, '')), '');
  v_done timestamptz;
  v_id uuid;
begin
  select school_id into v_school from public.profiles where id = v_student and role = 'student';
  if v_school is null then raise exception 'Only students can add to their road.'; end if;
  select id into v_roadmap from public.roadmaps where student_id = v_student and status = 'published';
  if v_roadmap is null then raise exception 'Your roadmap isn''t ready yet.'; end if;
  if length(v_title) < 2 or length(v_title) > 80 then raise exception 'Give it a short name (2 to 80 characters).'; end if;
  if v_outcome is not null and length(v_outcome) > 160 then raise exception 'Keep what you got out of it under 160 characters.'; end if;
  if coalesce(p_kind, '') not in ('experience', 'skill', 'certification', 'event', 'networking', 'project') then
    raise exception 'Pick what kind of thing it was.';
  end if;
  if coalesce(p_term, '') !~ '^(Spring|Fall) [0-9]{4}$' or public.term_rank(p_term) > public.term_rank(public.current_term()) then
    raise exception 'You can only add things you already did.';
  end if;
  -- This semester: today. An earlier one: the middle of that semester, so it reads as "Apr 2025" or "Nov 2025".
  v_done := case
    when p_term = public.current_term() then public.app_now()
    when p_term like 'Spring %' then make_timestamptz(split_part(p_term, ' ', 2)::int, 4, 15, 16, 0, 0, 'UTC')
    else make_timestamptz(split_part(p_term, ' ', 2)::int, 11, 15, 17, 0, 0, 'UTC') end;
  insert into public.roadmap_items (school_id, roadmap_id, student_id, term, kind, title, outcomes, status, source, approval, sort, completed_at)
  values (v_school, v_roadmap, v_student, p_term, p_kind, v_title,
          case when v_outcome is null then '{}'::text[] else array[v_outcome] end,
          'done', 'student', 'not_needed', 950, v_done)
  returning id into v_id;
  return v_id;
end
$$;
revoke all on function public.log_win(text, text, text, text) from public, anon;
grant execute on function public.log_win(text, text, text, text) to authenticated;
