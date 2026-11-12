-- Melon MVP: video calls in Melon, and a transcript both people can fix. Run this once, after 0010, in
-- Supabase > SQL Editor > New query.
--
-- 1. A session can run as a Melon video call (Daily). The room's name is kept on the session.
-- 2. After a call, the transcript waits for both people to read it. The student and the advisor or coach can
--    each fix a line, add a missing one or delete one. Every change is logged with who made it and what the line
--    said before. Once the advisor or coach asks for the summary, the transcript is locked.

alter table public.sessions add column if not exists call_room text;

create table if not exists public.transcript_edits (
  id bigserial primary key,
  school_id uuid not null references public.schools(id),
  session_id uuid not null references public.sessions(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  segment_id uuid,
  editor_id uuid references public.profiles(id) on delete set null,
  op text not null check (op in ('edit', 'add', 'delete')),
  before jsonb,
  after jsonb,
  at timestamptz not null default now()
);
alter table public.transcript_edits enable row level security;
drop policy if exists "read transcript edits" on public.transcript_edits;
create policy "read transcript edits" on public.transcript_edits for select using (public.can_see_student(student_id));
-- No insert, update or delete policies: only the functions below write here.

-- The session, if the signed-in person is its student or its advisor or coach and the transcript is still open.
create or replace function public._open_transcript(p_session uuid) returns public.sessions
language plpgsql stable security definer set search_path = public as $$
declare
  v public.sessions;
begin
  select * into v from public.sessions where id = p_session;
  if not found or auth.uid() is null or auth.uid() not in (v.student_id, v.staff_id) then
    raise exception 'This isn''t your session.';
  end if;
  if v.status <> 'transcribed' then
    raise exception 'The transcript is locked now. Flag a highlight instead if something is wrong.';
  end if;
  return v;
end
$$;
revoke all on function public._open_transcript(uuid) from public, anon, authenticated;

create or replace function public.edit_transcript_line(p_segment uuid, p_text text, p_speaker text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_seg public.transcript_segments;
  v_session public.sessions;
  v_text text := btrim(coalesce(p_text, ''));
begin
  select * into v_seg from public.transcript_segments where id = p_segment for update;
  if not found then raise exception 'That line isn''t in the transcript.'; end if;
  v_session := public._open_transcript(v_seg.session_id);
  if length(v_text) = 0 or length(v_text) > 4000 then raise exception 'A line needs some words (up to 4000 characters).'; end if;
  if p_speaker is not null and p_speaker not in ('staff', 'student', 'unknown') then raise exception 'Unknown speaker.'; end if;
  update public.transcript_segments set text = v_text, speaker = coalesce(p_speaker, speaker) where id = p_segment;
  insert into public.transcript_edits (school_id, session_id, student_id, segment_id, editor_id, op, before, after)
  values (v_seg.school_id, v_seg.session_id, v_seg.student_id, p_segment, auth.uid(), 'edit',
          jsonb_build_object('text', v_seg.text, 'speaker', v_seg.speaker),
          jsonb_build_object('text', v_text, 'speaker', coalesce(p_speaker, v_seg.speaker)));
end
$$;

-- Adds a line after line p_after_idx (or at the start, with -1). Later lines move down by one.
create or replace function public.add_transcript_line(p_session uuid, p_after_idx int, p_text text, p_speaker text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_session public.sessions;
  v_text text := btrim(coalesce(p_text, ''));
  v_at int;
  v_ms int;
  v_id uuid;
begin
  v_session := public._open_transcript(p_session);
  if length(v_text) = 0 or length(v_text) > 4000 then raise exception 'A line needs some words (up to 4000 characters).'; end if;
  if p_speaker not in ('staff', 'student', 'unknown') then raise exception 'Unknown speaker.'; end if;
  v_at := greatest(coalesce(p_after_idx, -1), -1) + 1;
  select coalesce(max(end_ms), 0) into v_ms from public.transcript_segments where session_id = p_session and idx < v_at;
  -- Two steps, so the unique (session_id, idx) never clashes mid-update.
  update public.transcript_segments set idx = idx + 100000 where session_id = p_session and idx >= v_at;
  update public.transcript_segments set idx = idx - 99999 where session_id = p_session and idx >= 100000;
  insert into public.transcript_segments (school_id, session_id, student_id, idx, start_ms, end_ms, speaker, text)
  values (v_session.school_id, p_session, v_session.student_id, v_at, v_ms, v_ms, p_speaker, v_text)
  returning id into v_id;
  insert into public.transcript_edits (school_id, session_id, student_id, segment_id, editor_id, op, after)
  values (v_session.school_id, p_session, v_session.student_id, v_id, auth.uid(), 'add',
          jsonb_build_object('text', v_text, 'speaker', p_speaker, 'idx', v_at));
  return v_id;
end
$$;

create or replace function public.delete_transcript_line(p_segment uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_seg public.transcript_segments;
  v_session public.sessions;
begin
  select * into v_seg from public.transcript_segments where id = p_segment for update;
  if not found then raise exception 'That line isn''t in the transcript.'; end if;
  v_session := public._open_transcript(v_seg.session_id);
  delete from public.transcript_segments where id = p_segment;
  update public.transcript_segments set idx = idx + 100000 where session_id = v_seg.session_id and idx > v_seg.idx;
  update public.transcript_segments set idx = idx - 100001 where session_id = v_seg.session_id and idx >= 100000;
  insert into public.transcript_edits (school_id, session_id, student_id, segment_id, editor_id, op, before)
  values (v_seg.school_id, v_seg.session_id, v_seg.student_id, p_segment, auth.uid(), 'delete',
          jsonb_build_object('text', v_seg.text, 'speaker', v_seg.speaker, 'idx', v_seg.idx));
end
$$;

revoke all on function public.edit_transcript_line(uuid, text, text) from public, anon;
revoke all on function public.add_transcript_line(uuid, int, text, text) from public, anon;
revoke all on function public.delete_transcript_line(uuid) from public, anon;
grant execute on function public.edit_transcript_line(uuid, text, text) to authenticated;
grant execute on function public.add_transcript_line(uuid, int, text, text) to authenticated;
grant execute on function public.delete_transcript_line(uuid) to authenticated;
