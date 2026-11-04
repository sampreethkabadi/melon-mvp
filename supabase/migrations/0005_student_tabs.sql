-- Melon MVP: student tabs (action items, sessions, rewards, resources). Run once, after 0004.
--
-- 1. Students can add a library resource straight onto their own roadmap, and take it off again.
--    They can't add steps as if staff wrote them, approve anything, or touch steps they didn't add.
-- 2. Optional event photos ("moments"): private to the student and their advisors/coaches.

-- ---------------------------------------------------------------- students add their own steps

create policy "student adds own steps" on public.roadmap_items for insert with check (
  student_id = auth.uid()
  and source = 'student'
  and approval = 'not_needed'
  and status = 'active'
  and school_id = public.my_school()
  and exists (select 1 from public.roadmaps r where r.id = roadmap_id and r.student_id = auth.uid() and r.status = 'published')
  and (path_id is null or exists (select 1 from public.roadmap_paths p where p.id = path_id and p.student_id = auth.uid()))
);

create policy "student removes own steps" on public.roadmap_items for delete using (
  student_id = auth.uid() and source = 'student'
);

-- ---------------------------------------------------------------- moments (optional event photos)

create table public.student_moments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id),
  student_id uuid not null references public.profiles(id) on delete cascade,
  storage_path text not null,
  caption text,
  created_at timestamptz not null default now()
);
create index on public.student_moments (student_id, created_at desc);
alter table public.student_moments enable row level security;

create policy "read moments" on public.student_moments for select using (public.can_see_student(student_id));
create policy "student adds own moments" on public.student_moments for insert
  with check (student_id = auth.uid() and school_id = public.my_school()
              and (storage.foldername(storage_path))[1] = auth.uid()::text);
create policy "student removes own moments" on public.student_moments for delete using (student_id = auth.uid());

insert into storage.buckets (id, name, public)
values ('moments', 'moments', false)
on conflict (id) do nothing;
update storage.buckets
   set file_size_limit = 5242880, allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/heic']
 where id = 'moments';

-- Photos live at moments/<student id>/<file>.
create policy "student uploads own moments" on storage.objects for insert to authenticated
  with check (bucket_id = 'moments' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "student deletes own moments" on storage.objects for delete to authenticated
  using (bucket_id = 'moments' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "read moments you can see" on storage.objects for select to authenticated
  using (bucket_id = 'moments' and public.can_see_student(((storage.foldername(name))[1])::uuid));
