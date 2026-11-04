-- Run after 10 to 60 (uses their people) and 0007_accept_and_privacy.sql. Each check prints what to expect.
\set ON_ERROR_STOP 0
\set school '00000000-0000-0000-0000-00000000000a'
\set maya '11111111-1111-1111-1111-111111111111'
\set leo '22222222-2222-2222-2222-222222222222'
\set lee '33333333-3333-3333-3333-333333333333'
\set sess '8a8a8a8a-8888-8888-8888-888888888888'
reset role;
reset request.jwt.claim.sub;
insert into public.sessions (id, school_id, student_id, staff_id, status) values (:'sess', :'school', :'leo', :'lee', 'reviewed');
insert into public.insights (school_id, session_id, student_id, kind, payload, status) values
  (:'school', :'sess', :'leo', 'concern', '{"text":"STAFF ONLY"}', 'accepted'),
  (:'school', :'sess', :'leo', 'summary', '{"text":"A shared summary"}', 'accepted');
insert into public.profile_events (school_id, student_id, type, payload, source) values
  (:'school', :'leo', 'session_concern', '{"text":"STAFF ONLY"}', 'session'),
  (:'school', :'leo', 'session_goal', '{"text":"A goal"}', 'session');
insert into public.advice_items (id, school_id, student_id, given_by, text) values
  ('99999999-9999-9999-9999-999999999999', :'school', :'leo', :'lee', 'Original advice');
insert into public.notifications (school_id, user_id, type, title) values (:'school', :'leo', 'x', 'Original title');
insert into public.rewards (id, school_id, name, description) values ('77777777-0000-0000-0000-000000000007', :'school', 'R', 'r');
insert into public.reward_claims (school_id, reward_id, student_id, code) values (:'school', '77777777-0000-0000-0000-000000000007', :'leo', 'CODE1');
update public.roadmaps set status = 'draft' where student_id = :'maya';

set role authenticated;
set request.jwt.claim.sub = :'leo';
\echo '-- Leo reads no concerns, but does read the summary and goal (expect 0, 0, t, t):'
select count(*) from public.insights where kind = 'concern';
select count(*) from public.profile_events where type = 'session_concern';
select exists (select 1 from public.insights where kind = 'summary');
select exists (select 1 from public.profile_events where type = 'session_goal');
\echo '-- Leo rewrites advice (expect error), updates its status (expect UPDATE 1):'
update public.advice_items set text = 'Rewritten' where id = '99999999-9999-9999-9999-999999999999';
update public.advice_items set status = 'done' where id = '99999999-9999-9999-9999-999999999999';
\echo '-- Leo rewrites a notification (expect error), marks it read (expect UPDATE at least 1):'
update public.notifications set title = 'Rewritten' where title = 'Original title';
update public.notifications set read_at = now() where title = 'Original title';
\echo '-- Leo rewrites his change log (expect error):'
update public.roadmap_changes set summary = '{}';
\echo '-- Leo changes a reward claim (expect UPDATE 0):'
update public.reward_claims set status = 'picked_up', code = 'FREE';
\echo '-- Leo approves or re-accepts (expect 2 errors):'
select public.approve_roadmap(:'maya');
select public.accept_roadmap();
\echo '-- the old publish shortcut is gone (expect error):'
select public.publish_roadmap(:'leo');

set request.jwt.claim.sub = :'lee';
\echo '-- Lee sees concerns (expect at least 1), and can''t accept for a student (expect error):'
select count(*) from public.insights where kind = 'concern';
select public.accept_roadmap();
\echo '-- another advisor can''t approve Maya (expect error):'
set request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444';
select public.approve_roadmap(:'maya');
reset role;
