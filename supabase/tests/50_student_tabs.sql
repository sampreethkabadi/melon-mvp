-- Run after 10–40 (uses their people) and 0005_student_tabs.sql. Each check prints what to expect.
\set ON_ERROR_STOP 0
\set school '00000000-0000-0000-0000-00000000000a'
\set maya '11111111-1111-1111-1111-111111111111'
\set leo '22222222-2222-2222-2222-222222222222'
reset role;
reset request.jwt.claim.sub;

-- Both have published roadmaps by now (Maya from 20/30, Leo from 40).
select student_id, status from public.roadmaps where student_id in (:'maya', :'leo') order by student_id;

set role authenticated;
set request.jwt.claim.sub = :'leo';

\echo '-- Leo adds a library resource to his own roadmap (expect INSERT 0 1):'
insert into public.roadmap_items (school_id, roadmap_id, student_id, term, kind, title, source, approval)
select :'school', id, :'leo', public.current_term(), 'certification', 'CompTIA Security+', 'student', 'not_needed'
from public.roadmaps where student_id = :'leo';
\echo '-- ...and sees it (expect 1):'
select count(*) from public.roadmap_items where title = 'CompTIA Security+';

\echo '-- Leo pretends a step came from staff, or approves it himself (expect 2 errors):'
insert into public.roadmap_items (school_id, roadmap_id, student_id, kind, title, source, approval)
select :'school', id, :'leo', 'skill', 'Fake staff step', 'staff', 'approved' from public.roadmaps where student_id = :'leo';
insert into public.roadmap_items (school_id, roadmap_id, student_id, kind, title, source, approval)
select :'school', id, :'leo', 'skill', 'Self-approved', 'student', 'approved' from public.roadmaps where student_id = :'leo';

\echo '-- Leo adds a step to Maya''s roadmap (expect error):'
insert into public.roadmap_items (school_id, roadmap_id, student_id, kind, title, source, approval)
select :'school', r.id, :'maya', 'skill', 'Not yours', 'student', 'not_needed' from (select gen_random_uuid() as id) r;

\echo '-- Leo removes his own added step (expect DELETE 1), but not a step his advisor added (expect DELETE 0):'
delete from public.roadmap_items where title = 'CompTIA Security+' and student_id = :'leo';
delete from public.roadmap_items where title = 'Bring your resume to drop-in hours';
reset role;
\echo '-- the advisor''s step is still there (expect 1):'
select count(*) from public.roadmap_items where title = 'Bring your resume to drop-in hours';

\echo '-- moments: Leo adds a photo row in his own folder (expect INSERT 0 1), not in Maya''s (expect error):'
set role authenticated;
set request.jwt.claim.sub = :'leo';
insert into public.student_moments (school_id, student_id, storage_path) values (:'school', :'leo', :'leo' || '/fair.jpg');
insert into public.student_moments (school_id, student_id, storage_path) values (:'school', :'leo', :'maya' || '/fair.jpg');
set request.jwt.claim.sub = :'maya';
\echo '-- Maya can''t see Leo''s photos (expect 0):'
select count(*) from public.student_moments;
reset role;

\echo '-- Leo adds a resource under his own path (expect INSERT 0 1) and can read the current term (expect a term):'
set role authenticated;
set request.jwt.claim.sub = :'leo';
insert into public.roadmap_items (school_id, roadmap_id, student_id, path_id, term, kind, title, source, approval, resource_id)
select :'school', r.id, :'leo', (select id from public.roadmap_paths where student_id = :'leo' limit 1), public.current_term(),
       'skill', 'Library pick', 'student', 'not_needed', null
from public.roadmaps r where r.student_id = :'leo';
select public.current_term();
reset role;
