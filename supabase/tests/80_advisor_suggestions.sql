-- Run after 10 to 70 (uses their people) and 0008_advisor_suggestions.sql. Each check prints what to expect.
\set ON_ERROR_STOP 0
\set school '00000000-0000-0000-0000-00000000000a'
\set leo '22222222-2222-2222-2222-222222222222'
\set maya '11111111-1111-1111-1111-111111111111'
\set lee '33333333-3333-3333-3333-333333333333'
\set other '44444444-4444-4444-4444-444444444444'
reset role;
reset request.jwt.claim.sub;
\echo '-- Leo has an accepted roadmap (expect published):'
select status from public.roadmaps where student_id = :'leo';
insert into public.roadmap_items (id, school_id, roadmap_id, student_id, term, kind, title, source, approval, status)
select ('aaaaaaa' || n || '-0000-0000-0000-000000000000')::uuid, :'school', r.id, :'leo', public.current_term(), 'skill', 'Step ' || n, 'staff', 'approved', 'done'
from public.roadmaps r, generate_series(1, 2) n where r.student_id = :'leo';

set role authenticated;
set request.jwt.claim.sub = :'lee';
\echo '-- Lee can''t change an accepted roadmap directly (expect UPDATE 0, then an error):'
update public.roadmap_items set title = 'Direct edit' where id = 'aaaaaaa1-0000-0000-0000-000000000000';
insert into public.roadmap_items (school_id, roadmap_id, student_id, kind, title, source)
select :'school', id, :'leo', 'skill', 'Direct add', 'staff' from public.roadmaps where student_id = :'leo';
\echo '-- Lee suggests adding, editing and removing (expect 3 ids), and a second suggestion on one step fails:'
select public.suggest_roadmap_change(:'leo', 'add', null, 'New step', 'Details', 'project', 'It will help') is not null;
select public.suggest_roadmap_change(:'leo', 'edit', 'aaaaaaa1-0000-0000-0000-000000000000', 'Edited step', null, null, null) is not null;
select public.suggest_roadmap_change(:'leo', 'remove', 'aaaaaaa2-0000-0000-0000-000000000000', null, null, null, 'Not needed') is not null;
select public.suggest_roadmap_change(:'leo', 'remove', 'aaaaaaa1-0000-0000-0000-000000000000', null, null, null, null);
\echo '-- a suggestion for a step on someone else''s roadmap fails, and so does a blank title (expect 2 errors):'
select public.suggest_roadmap_change(:'maya', 'edit', 'aaaaaaa1-0000-0000-0000-000000000000', 'X', null, null, null);
select public.suggest_roadmap_change(:'leo', 'add', null, '  ', null, 'skill', null);

set request.jwt.claim.sub = :'other';
\echo '-- an unassigned advisor can''t suggest, read or withdraw (expect error, 0, error):'
select public.suggest_roadmap_change(:'leo', 'add', null, 'Nope', null, 'skill', null);
select count(*) from public.roadmap_suggestions;
select public.withdraw_suggestion((select id from public.roadmap_suggestions limit 1));

set request.jwt.claim.sub = :'leo';
\echo '-- nothing has changed yet (expect Step 1, Step 2, no New step):'
select title from public.roadmap_items where title in ('Step 1', 'Step 2', 'New step', 'Edited step') order by title;
\echo '-- Leo sees 3 suggestions, and can''t write them directly (expect 3, UPDATE 0):'
select count(*) from public.roadmap_suggestions;
update public.roadmap_suggestions set status = 'accepted';
\echo '-- Leo accepts all 3, and can''t answer twice (expect 3 successes, then an error):'
select public.answer_suggestion(id, true) from public.roadmap_suggestions where action = 'add';
select public.answer_suggestion(id, true) from public.roadmap_suggestions where action = 'edit';
select public.answer_suggestion(id, true) from public.roadmap_suggestions where action = 'remove';
select public.answer_suggestion(id, false) from public.roadmap_suggestions where action = 'add';
\echo '-- the roadmap changed, and an accepted step stays visible even if it waits for a slot (expect Edited step, New step; Step 2 gone):'
select title from public.roadmap_items where title in ('Step 1', 'Step 2', 'New step', 'Edited step') order by title;

set request.jwt.claim.sub = :'lee';
select public.suggest_roadmap_change(:'leo', 'remove', 'aaaaaaa1-0000-0000-0000-000000000000', null, null, null, null) is not null;
set request.jwt.claim.sub = :'maya';
\echo '-- Maya can''t read or answer Leo''s suggestion (expect 0, then an error):'
select count(*) from public.roadmap_suggestions where student_id = :'leo';
select public.answer_suggestion((select id from public.roadmap_suggestions limit 1), true);
reset role;
\echo '-- a decline leaves the step alone (expect Edited step|done):'
set role authenticated;
set request.jwt.claim.sub = :'leo';
select public.answer_suggestion(id, false) from public.roadmap_suggestions where status = 'pending';
select title, status from public.roadmap_items where id = 'aaaaaaa1-0000-0000-0000-000000000000';
reset role;
\echo '-- Lee hears the answers (expect 4):'
select count(*) from public.notifications where user_id = :'lee' and type = 'suggestion_answered';
