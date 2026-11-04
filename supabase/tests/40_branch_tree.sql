-- Run after 10, 20 and 30 (uses their people) and 0004_branch_tree.sql. Each check prints what to expect.
\set ON_ERROR_STOP 0
\set school '00000000-0000-0000-0000-00000000000a'
\set leo '22222222-2222-2222-2222-222222222222'
\set lee '33333333-3333-3333-3333-333333333333'
\set sess '66666666-6666-6666-6666-666666666666'
reset role;
reset request.jwt.claim.sub;

insert into public.staff_assignments (school_id, student_id, staff_id, kind)
values (:'school', :'leo', :'lee', 'advisor') on conflict do nothing;
update public.student_profiles set interests = '{data}' where user_id = :'leo';
select public.replace_draft_roadmap(:'leo',
  '[{"name":"Data & analytics","reason":"r","first_job":"Data analyst","sort":0,"interest":"data"}]',
  '[{"path_index":0,"term":"Fall 2026","kind":"skill","title":"Learn SQL","sort":0}]');

insert into public.sessions (id, school_id, student_id, staff_id, status)
values (:'sess', :'school', :'leo', :'lee', 'ready_for_review');
insert into public.insights (school_id, session_id, student_id, kind, payload, status) values
  (:'school', :'sess', :'leo', 'summary', '{"text":"Leo talked about the career fair."}', 'accepted'),
  (:'school', :'sess', :'leo', 'interest', '{"text":"Wants to explore cybersecurity as a second path"}', 'accepted'),
  (:'school', :'sess', :'leo', 'action', '{"text":"Try one free beginner cybersecurity resource this month","roadmap_kind":"skill"}', 'accepted'),
  (:'school', :'sess', :'leo', 'action', '{"text":"Bring your resume to drop-in hours","roadmap_kind":"coaching"}', 'edited'),
  (:'school', :'sess', :'leo', 'interest', '{"text":"Likes data work"}', 'accepted');

\echo '-- before: Leo''s roadmap is a draft (expect draft):'
select status from public.roadmaps where student_id = :'leo';

set role authenticated;
set request.jwt.claim.sub = :'leo';
\echo '-- before: Leo sees nothing on his draft (expect 0):'
select count(*) from public.roadmap_items;

set request.jwt.claim.sub = :'lee';
\echo '-- Lee finishes the review (expect success):'
select public.finish_session_review(:'sess');

reset role;
\echo '-- after: a session does not publish anything (expect draft):'
select status from public.roadmaps where student_id = :'leo';

set role authenticated;
set request.jwt.claim.sub = :'leo';
\echo '-- Leo still sees nothing, and can''t accept yet (expect 0, then an error):'
select count(*) from public.roadmap_items;
select public.accept_roadmap();

set request.jwt.claim.sub = :'lee';
\echo '-- Lee approves (expect success):'
select public.approve_roadmap(:'leo');

set request.jwt.claim.sub = :'leo';
\echo '-- Leo can read it but not tick it yet (expect more than 0, then UPDATE 0):'
select count(*) > 0 from public.roadmap_items;
update public.roadmap_items set status = 'done';
\echo '-- Leo accepts (expect success):'
select public.accept_roadmap();
reset role;
\echo '-- now it is published (expect published|t):'
select status, accepted_at is not null from public.roadmaps where student_id = :'leo';
\echo '-- a new Cybersecurity branch, made by this session; data was already an interest, so no duplicate (expect Data & analytics|data|f, Cybersecurity|cyber|t):'
select name, interest, created_from_session is not null as from_session from public.roadmap_paths
 where student_id = :'leo' order by sort;
\echo '-- background colors are now data + cyber (expect {data,cyber}):'
select interests from public.student_profiles where user_id = :'leo';

set role authenticated;
set request.jwt.claim.sub = :'leo';
\echo '-- Leo now sees his roadmap, with the session steps in this semester; the security step is on the new branch (expect 3 rows, both session steps in the current term):'
select i.title, i.term = public.current_term() as this_term, p.name as branch
  from public.roadmap_items i left join public.roadmap_paths p on p.id = i.path_id order by i.sort, i.title;
\echo '-- what changed lists the new path first (expect New path to explore: Cybersecurity, then 2 steps):'
select jsonb_array_elements_text(summary -> 'added') from public.roadmap_changes where session_id = :'sess';
\echo '-- his notification says the roadmap grew (expect Your roadmap grew a new branch):'
select title from public.notifications where type = 'session_reviewed' order by created_at desc limit 1;
reset role;
