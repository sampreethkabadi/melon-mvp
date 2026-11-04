\set ON_ERROR_STOP 0
insert into public.schools (id, name, slug, short_mark, email_domains) values ('00000000-0000-0000-0000-00000000000a','IU','iu','IU','{iu.edu,melon.test}');
insert into auth.users (id,email) values
 ('11111111-1111-1111-1111-111111111111','maya@melon.test'),
 ('22222222-2222-2222-2222-222222222222','leo@melon.test'),
 ('33333333-3333-3333-3333-333333333333','lee@melon.test'),
 ('44444444-4444-4444-4444-444444444444','other@melon.test');
\echo '-- bad domain signup (expect error):'
insert into auth.users (id,email) values (gen_random_uuid(),'x@gmail.com');
update public.profiles set role='advisor' where email in ('lee@melon.test','other@melon.test');
insert into public.staff_assignments (school_id, student_id, staff_id, kind) values ('00000000-0000-0000-0000-00000000000a','11111111-1111-1111-1111-111111111111','33333333-3333-3333-3333-333333333333','advisor');
insert into public.sessions (id, school_id, student_id, staff_id) values ('55555555-5555-5555-5555-555555555555','00000000-0000-0000-0000-00000000000a','11111111-1111-1111-1111-111111111111','33333333-3333-3333-3333-333333333333');
insert into public.staff_notes (school_id, session_id, student_id, author_id, body) values ('00000000-0000-0000-0000-00000000000a','55555555-5555-5555-5555-555555555555','11111111-1111-1111-1111-111111111111','33333333-3333-3333-3333-333333333333','private');

set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
\echo '-- Maya sees profiles (expect maya + 2 staff, not leo):'
select email, role from public.profiles order by email;
\echo '-- Maya role change (expect UPDATE 0):'
update public.profiles set role='admin' where id = auth.uid();
\echo '-- Maya reads staff notes (expect 0 rows):'
select count(*) from public.staff_notes;
\echo '-- Maya gives consent (expect INSERT 0 1):'
insert into public.consents (school_id, session_id, student_id, subject_id, scope, granted) values ('00000000-0000-0000-0000-00000000000a','55555555-5555-5555-5555-555555555555','11111111-1111-1111-1111-111111111111','11111111-1111-1111-1111-111111111111','record',true);
\echo '-- Maya fakes advisor consent (expect error):'
insert into public.consents (school_id, session_id, student_id, subject_id, scope, granted) values ('00000000-0000-0000-0000-00000000000a','55555555-5555-5555-5555-555555555555','11111111-1111-1111-1111-111111111111','33333333-3333-3333-3333-333333333333','record',true);
\echo '-- Maya edits consent (expect permission denied):'
update public.consents set granted=false;
\echo '-- consent complete? (expect f):'
select public.has_recording_consent('55555555-5555-5555-5555-555555555555');
\echo '-- Maya creates own reward claim (expect error):'
insert into public.reward_claims (school_id, reward_id, student_id, code) values ('00000000-0000-0000-0000-00000000000a', gen_random_uuid(), auth.uid(), 'X');

set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
\echo '-- Lee sees students (expect maya only):'
select email from public.profiles where role='student';
\echo '-- Lee consents:'
insert into public.consents (school_id, session_id, student_id, subject_id, scope, granted) values ('00000000-0000-0000-0000-00000000000a','55555555-5555-5555-5555-555555555555','11111111-1111-1111-1111-111111111111','33333333-3333-3333-3333-333333333333','record',true);
\echo '-- consent complete? (expect t):'
select public.has_recording_consent('55555555-5555-5555-5555-555555555555');

set request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444';
\echo '-- Other advisor sees students (expect none), notes (expect 0), sessions (expect 0):'
select email from public.profiles where role='student';
select count(*) from public.staff_notes;
select count(*) from public.sessions;
\echo '-- Other advisor starts session for unassigned Maya (expect error):'
insert into public.sessions (school_id, student_id, staff_id) values ('00000000-0000-0000-0000-00000000000a','11111111-1111-1111-1111-111111111111','44444444-4444-4444-4444-444444444444');
