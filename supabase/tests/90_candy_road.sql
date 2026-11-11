-- Run after 10 to 80 (uses their people and Leo's accepted roadmap) and 0009_candy_road.sql. Each check prints what to expect.
\set ON_ERROR_STOP 0
\set leo '22222222-2222-2222-2222-222222222222'
\set maya '11111111-1111-1111-1111-111111111111'
\set lee '33333333-3333-3333-3333-333333333333'
reset role;
reset request.jwt.claim.sub;

set role authenticated;
set request.jwt.claim.sub = :'leo';
\echo '-- Leo adds a club he joined this semester and a job from last year (expect t, t):'
select public.log_win(public.current_term(), 'Joined the robotics club', 'networking', 'Met two seniors who build drones') is not null;
select public.log_win('Spring ' || (extract(year from public.app_today())::int - 1), 'Weekend job at the library', 'experience', null) is not null;
\echo '-- both are done milestones, his own, and the first keeps what he got out of it (expect 2 rows: done | student | t | 1, done | student | t | 0):'
select status, source, milestone, cardinality(outcomes) from public.roadmap_items
where student_id = :'leo' and title in ('Joined the robotics club', 'Weekend job at the library') order by title;
\echo '-- the earlier one is dated inside its semester (expect 4):'
select extract(month from completed_at)::int from public.roadmap_items where title = 'Weekend job at the library';
\echo '-- a future semester, a blank name, a course and a made-up kind all fail (expect 4 errors):'
select public.log_win('Fall ' || (extract(year from public.app_today())::int + 1), 'Future thing', 'project', null);
select public.log_win(public.current_term(), ' ', 'project', null);
select public.log_win(public.current_term(), 'Took a class', 'course', null);
select public.log_win(public.current_term(), 'Something', 'party', null);
\echo '-- Leo still can''t change what he got out of a step, or whether it counts, after the fact (expect 2 errors):'
update public.roadmap_items set outcomes = '{edited}' where title = 'Joined the robotics club';
update public.roadmap_items set milestone = false where title = 'Joined the robotics club';

set request.jwt.claim.sub = :'lee';
\echo '-- staff can''t log a win as if they were the student (expect an error):'
select public.log_win(public.current_term(), 'Fake win', 'project', null);
\echo '-- Lee, Leo''s advisor, sees what Leo added (expect 2):'
select count(*) from public.roadmap_items where student_id = :'leo' and source = 'student' and status = 'done' and title in ('Joined the robotics club', 'Weekend job at the library');

set request.jwt.claim.sub = :'maya';
\echo '-- Maya can''t see Leo''s wins (expect 0):'
select count(*) from public.roadmap_items where title = 'Joined the robotics club';
reset role;
reset request.jwt.claim.sub;
