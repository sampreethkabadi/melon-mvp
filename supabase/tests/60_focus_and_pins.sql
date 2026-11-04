-- Run after 10–50 (uses their people) and 0006_focus_and_pins.sql. Each check prints what to expect.
\set ON_ERROR_STOP 0
\set school '00000000-0000-0000-0000-00000000000a'
\set leo '22222222-2222-2222-2222-222222222222'
\set lee '33333333-3333-3333-3333-333333333333'
\set sess2 '88888888-8888-8888-8888-888888888888'
reset role;
reset request.jwt.claim.sub;

\echo '-- demo clock: today is the demo date (expect 2026-09-03, Fall 2026):'
select public.app_today(), public.current_term();

-- A clean slate for Leo: a junior with two paths, one pinned, and 4 open steps.
delete from public.roadmap_items where student_id = :'leo';
update public.student_profiles set class_year = 'junior' where user_id = :'leo';
update public.roadmap_paths set status = 'pinned' where student_id = :'leo' and interest = 'data';
update public.roadmap_paths set status = 'exploring' where student_id = :'leo' and interest <> 'data';
insert into public.roadmap_items (school_id, roadmap_id, student_id, path_id, term, kind, title, source, approval, firm, due_date)
select :'school', r.id, :'leo', (select id from public.roadmap_paths where student_id = :'leo' and interest = 'data'),
       'Fall 2026', 'skill', 'Data step ' || g, 'staff', 'approved', g = 1, case when g = 1 then date '2026-09-17' end
from public.roadmaps r, generate_series(1, 3) g where r.student_id = :'leo';
insert into public.roadmap_items (school_id, roadmap_id, student_id, term, kind, title, source, approval)
select :'school', r.id, :'leo', 'Fall 2026', 'event', 'Go to the career fair', 'staff', 'approved'
from public.roadmaps r where r.student_id = :'leo';

\echo '-- a session adds 3 actions: only 2 go on: 1 opens, 1 waits for a free slot, the 3rd is saved for later (expect 5 open, 1 queued, 1 locked):'
insert into public.sessions (id, school_id, student_id, staff_id, status, session_type)
values (:'sess2', :'school', :'leo', :'lee', 'ready_for_review', 'Career fair preparation');
insert into public.insights (school_id, session_id, student_id, kind, payload, status) values
  (:'school', :'sess2', :'leo', 'summary', '{"text":"Fair prep."}', 'proposed'),
  (:'school', :'sess2', :'leo', 'action', '{"text":"Practice your pitch at the mock fair","roadmap_kind":"event"}', 'proposed'),
  (:'school', :'sess2', :'leo', 'action', '{"text":"Register for the fair in Handshake","roadmap_kind":"event"}', 'proposed'),
  (:'school', :'sess2', :'leo', 'action', '{"text":"Update your LinkedIn headline","roadmap_kind":"networking"}', 'proposed'),
  (:'school', :'sess2', :'leo', 'advice', '{"text":"Lead with your project, not your GPA"}', 'proposed');
set role authenticated;
set request.jwt.claim.sub = :'leo';
\echo '-- Leo approves his own session (expect error):'
select public.approve_session(:'sess2');
set request.jwt.claim.sub = :'lee';
\echo '-- Lee approves the whole session in one click (expect success):'
select public.approve_session(:'sess2');
reset role;
select count(*) filter (where status = 'active') open, count(*) filter (where status = 'queued') queued,
       count(*) filter (where status = 'locked') locked
from public.roadmap_items where student_id = :'leo';
\echo '-- the third action is the saved one (expect Update your LinkedIn headline):'
select title from public.roadmap_items where student_id = :'leo' and status = 'locked';

set role authenticated;
set request.jwt.claim.sub = :'leo';
\echo '-- Leo can''t see the waiting or saved staff steps (expect 5):'
select count(*) from public.roadmap_items;
\echo '-- Leo can''t move steps around himself (expect error):'
update public.roadmap_items set status = 'paused' where title = 'Data step 2';
\echo '-- Leo finishes one: the queued step moves up (expect UPDATE 1, then 5 open, 0 queued):'
update public.roadmap_items set status = 'done', completed_at = now() where title = 'Data step 2';
reset role;
select count(*) filter (where status = 'active') open, count(*) filter (where status = 'queued') queued
from public.roadmap_items where student_id = :'leo';

set role authenticated;
set request.jwt.claim.sub = :'leo';
\echo '-- Leo adds his own step when full: it waits in line and he can see it (expect INSERT 0 1, then queued):'
insert into public.roadmap_items (school_id, roadmap_id, student_id, term, kind, title, source, approval)
select :'school', id, :'leo', 'Fall 2026', 'skill', 'My own extra', 'student', 'not_needed' from public.roadmaps where student_id = :'leo';
select status from public.roadmap_items where title = 'My own extra';

\echo '-- Leo (a junior) pins a second path: it switches, and the old path''s steps pause (expect 1 pinned = cyber):'
select public.set_pin((select id from public.roadmap_paths where interest = 'cyber'), true);
select interest from public.roadmap_paths where status = 'pinned';
\echo '-- data steps are paused, and his own step moved up into the free slot (expect 2 paused, My own extra active):'
select count(*) from public.roadmap_items where status = 'paused';
select status from public.roadmap_items where title = 'My own extra';
\echo '-- pinning data again brings its steps back (expect 0 paused):'
select public.set_pin((select id from public.roadmap_paths where interest = 'data'), true);
select count(*) from public.roadmap_items where status = 'paused';
\echo '-- Leo can''t pin by editing the row (expect UPDATE 0):'
update public.roadmap_paths set status = 'pinned';
reset role;

\echo '-- a freshman can pin 2 but not 3 (expect 2 pinned, then an error):'
update public.student_profiles set class_year = 'freshman' where user_id = :'leo';
insert into public.roadmap_paths (school_id, roadmap_id, student_id, name, interest, status)
select :'school', id, :'leo', 'UX & product design', 'ux', 'exploring' from public.roadmaps where student_id = :'leo';
set role authenticated;
set request.jwt.claim.sub = :'leo';
select public.set_pin((select id from public.roadmap_paths where interest = 'cyber'), true);
select count(*) from public.roadmap_paths where status = 'pinned';
select public.set_pin((select id from public.roadmap_paths where interest = 'ux'), true);

\echo '-- Leo flags a highlight; Lee hears about it (expect INSERT 0 1, then 1 notification):'
insert into public.insight_flags (school_id, insight_id, session_id, student_id, note)
select :'school', id, :'sess2', :'leo', 'I said resume, not GPA' from public.insights where session_id = :'sess2' and kind = 'advice';
reset role;
select count(*) from public.notifications where user_id = :'lee' and type = 'highlight_flagged';
set role authenticated;
set request.jwt.claim.sub = :'leo';
\echo '-- Leo can''t mark his own flag fixed (expect UPDATE 0); Lee can (expect UPDATE 1):'
update public.insight_flags set status = 'fixed';
set request.jwt.claim.sub = :'lee';
update public.insight_flags set status = 'fixed', resolved_by = :'lee', resolved_at = now();
reset role;
update public.student_profiles set class_year = 'freshman' where user_id = :'leo';
