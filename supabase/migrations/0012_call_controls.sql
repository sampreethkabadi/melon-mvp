-- Melon MVP: pausing a recording and ending a meeting. Run this once, after 0011, in Supabase > SQL Editor >
-- New query.
--
-- 1. Either person can pause the recording and either can resume it. While it's paused, nothing is recorded:
--    each browser closes its recording and starts a new one on resume.
-- 2. Either person can end the meeting, recording or not. Ending while recording makes the transcript.
-- 3. Students see the steps their advisor put under a goal even while they wait in line (or are saved for
--    later), so the goal shows its whole plan. They still can't tick them until they open up.

alter table public.sessions add column if not exists paused_by uuid references public.profiles(id) on delete set null;
alter table public.sessions add column if not exists call_ended_at timestamptz;

drop policy if exists "read items" on public.roadmap_items;
create policy "read items" on public.roadmap_items for select using (
  public.can_see_student(student_id)
  and (student_id <> auth.uid()
       or (public.roadmap_visible_to_student(roadmap_id) and approval in ('not_needed', 'approved')
           and (status not in ('queued', 'locked') or source = 'student' or parent_id is not null)))
);
