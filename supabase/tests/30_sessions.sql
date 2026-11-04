-- Run after 20_roadmap_drafts.sql and 0003_sessions_and_assignment.sql. Each check prints what to expect.
\set ON_ERROR_STOP 0
\set maya '11111111-1111-1111-1111-111111111111'
\set lee '33333333-3333-3333-3333-333333333333'
\set other '44444444-4444-4444-4444-444444444444'
\set sess '55555555-5555-5555-5555-555555555555'
\set school '00000000-0000-0000-0000-00000000000a'
reset role;
-- Three advisors. Lee has Maya, so the others should catch up first.
insert into auth.users (id, email) values ('66666666-6666-6666-6666-666666666666', 'third@melon.test');
update public.profiles set role = 'advisor' where email = 'third@melon.test';
delete from public.staff_assignments where student_id in (select id from public.profiles where role = 'advisor');
insert into auth.users (email) select 'new' || g || '@melon.test' from generate_series(1, 29) g;
\echo '-- 29 sign-ups plus Maya split across 3 advisors (expect 10, 10, 10):'
select count(*) from public.staff_assignments where kind = 'advisor' and active group by staff_id;
\echo '-- every new sign-up has exactly one advisor (expect 0 rows):'
select p.email from public.profiles p left join public.staff_assignments a on a.student_id = p.id and a.kind = 'advisor'
where p.role = 'student' and p.email like 'new%' group by p.email having count(a.id) <> 1;
\echo '-- ties go to different advisors across runs (expect more than 1):'
do $$
declare seen uuid[] := '{}'; v uuid;
begin
  for i in 1..30 loop
    v := public.pick_staff((select id from public.schools limit 1), 'advisor');
    if not v = any(seen) then seen := seen || v; end if;
  end loop;
  raise notice 'distinct picks: %', cardinality(seen);
end $$;

insert into public.sessions (id, school_id, student_id, staff_id) values
 ('77777777-7777-7777-7777-777777777777', :'school', :'maya', :'lee');
\echo '-- audio without both consents (expect error):'
insert into public.recordings (school_id, session_id, student_id, storage_path)
values (:'school', '77777777-7777-7777-7777-777777777777', :'maya', 'x');
\echo '-- audio with both consents, from the earlier test (expect INSERT 0 1):'
insert into public.recordings (school_id, session_id, student_id, storage_path) values (:'school', :'sess', :'maya', 'x');

update public.sessions set status = 'ready_for_review' where id = :'sess';
insert into public.insights (school_id, session_id, student_id, kind, payload) values
 (:'school', :'sess', :'maya', 'summary', '{"text":"A summary"}'),
 (:'school', :'sess', :'maya', 'action', '{"text":"Do the thing","roadmap_kind":"project"}'),
 (:'school', :'sess', :'maya', 'concern', '{"text":"A rejected worry"}');

set role authenticated;
select set_config('request.jwt.claim.sub', :'maya', false) is null;
\echo '-- Maya reads unreviewed suggestions (expect 0):'
select count(*) from public.insights;
\echo '-- Maya publishes or finishes a review (expect 2 errors):'
select public.finish_session_review(:'sess');
select public.publish_roadmap(:'maya');

select set_config('request.jwt.claim.sub', :'lee', false) is null;
\echo '-- Lee finishes with suggestions left (expect error):'
select public.finish_session_review(:'sess');
update public.insights set status = 'accepted' where kind in ('summary', 'action');
update public.insights set status = 'rejected' where kind = 'concern';
\echo '-- Another advisor finishes it (expect error):'
select set_config('request.jwt.claim.sub', :'other', false) is null;
select public.finish_session_review(:'sess');
select set_config('request.jwt.claim.sub', :'lee', false) is null;
\echo '-- Lee finishes it, then tries again (expect success, then error):'
select public.finish_session_review(:'sess');
select public.finish_session_review(:'sess');

select set_config('request.jwt.claim.sub', :'maya', false) is null;
\echo '-- Maya sees the accepted summary and action, not the rejected one (expect 2):'
select count(*) from public.insights;
\echo '-- Her published roadmap gained the action (expect Do the thing|project|approved):'
select title, kind, approval from public.roadmap_items where title = 'Do the thing';
\echo '-- It is in the advice tracker and the change log (expect 1, 1):'
select count(*) from public.advice_items;
select count(*) from public.roadmap_changes where summary ->> 'kind' = 'session';
\echo '-- The rejected worry never reached her profile (expect 0):'
select count(*) from public.profile_events where type = 'session_concern';
