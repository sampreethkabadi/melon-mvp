-- Run after 10_access_rules.sql (uses its people) and 0002_roadmap_drafts.sql. Each check prints what to expect.
\set ON_ERROR_STOP 0
\set maya '11111111-1111-1111-1111-111111111111'
\set lee '33333333-3333-3333-3333-333333333333'
reset role;
select public.replace_draft_roadmap(:'maya',
  '[{"name":"Data analyst","reason":"r","first_job":"j","sort":0}]',
  '[{"path_index":0,"term":"Fall","kind":"skill","title":"Learn SQL","sort":0},{"term":"Fall","kind":"networking","title":"Coffee chat","sort":1}]');
\echo '-- second run replaces rather than adds (expect 1 path, 2 items, version 2):'
select public.replace_draft_roadmap(:'maya',
  '[{"name":"Data analyst","reason":"r","first_job":"j","sort":0}]',
  '[{"path_index":0,"term":"Fall","kind":"skill","title":"Learn SQL","sort":0},{"term":"Fall","kind":"networking","title":"Coffee chat","sort":1}]');
select (select count(*) from public.roadmap_paths) paths, (select count(*) from public.roadmap_items) items, version from public.roadmaps where student_id = :'maya';
\echo '-- advisor Lee is told about the draft (expect 1):'
select count(*) from public.notifications where user_id = :'lee' and type = 'roadmap_draft';

set role authenticated;
select set_config('request.jwt.claim.sub', :'maya', false) is null;
\echo '-- Maya reads her draft (expect 0 paths, 0 items):'
select (select count(*) from public.roadmap_paths) paths, (select count(*) from public.roadmap_items) items;
\echo '-- Maya self-approves, or changes a draft blind (expect UPDATE 0, UPDATE 0):'
update public.roadmap_items set approval = 'approved';
update public.roadmap_items set status = 'done';
\echo '-- Maya calls the draft function (expect permission denied):'
select public.replace_draft_roadmap(:'maya', '[]', '[]');

select set_config('request.jwt.claim.sub', :'lee', false) is null;
\echo '-- Lee reads the draft (expect 1 path, 2 items):'
select (select count(*) from public.roadmap_paths) paths, (select count(*) from public.roadmap_items) items;

reset role;
update public.roadmap_items set approval = 'approved' where title = 'Learn SQL';
update public.roadmaps set status = 'published' where student_id = :'maya';
set role authenticated;
select set_config('request.jwt.claim.sub', :'maya', false) is null;
\echo '-- Once published Maya reads approved items only (expect Learn SQL, and 1 path):'
select title from public.roadmap_items;
select count(*) paths from public.roadmap_paths;
\echo '-- Maya ticks off an item (expect UPDATE 1):'
update public.roadmap_items set status = 'done', completed_at = now() where title = 'Learn SQL';
\echo '-- Maya rewrites an item or un-approves it (expect 2 errors):'
update public.roadmap_items set title = 'Hacked' where title = 'Learn SQL';
update public.roadmap_items set approval = 'pending' where title = 'Learn SQL';
\echo '-- Maya renames a path (expect error), pins it (expect UPDATE 1):'
update public.roadmap_paths set name = 'Hacked';
update public.roadmap_paths set status = 'pinned';

reset role;
\echo '-- a published roadmap is left alone (expect f, then 1 path):'
select public.replace_draft_roadmap(:'maya', '[]', '[]');
select count(*) paths from public.roadmap_paths;
