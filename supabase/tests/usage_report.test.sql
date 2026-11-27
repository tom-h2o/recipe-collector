-- The admin Usage tab (migration 0075): what admin_usage() counts, and who
-- may see it. The report reads every account's activity and addresses, so
-- the second half matters as much as the first.

create extension if not exists pgtap with schema extensions;
create schema if not exists tests;

begin;
select plan(16);

insert into auth.users (id, email, instance_id, aud, role, last_sign_in_at)
values
  ('a1000000-0000-0000-0000-0000000000a1', 'reader@example.com', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', now() - interval '1 day'),
  ('b1000000-0000-0000-0000-0000000000b1', 'cook@example.com',   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', now()),
  ('c1000000-0000-0000-0000-0000000000c1', 'gone@example.com',   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', now() - interval '60 days');

-- The reader only opens the app, on two days. The cook saves recipes, uses
-- AI features and an iPhone import. The third account did something long ago.
insert into public.app_opens (user_id, day)
values
  ('a1000000-0000-0000-0000-0000000000a1', (now() at time zone 'utc')::date),
  ('a1000000-0000-0000-0000-0000000000a1', (now() at time zone 'utc')::date - 3);

insert into public.recipes (title, ingredients, instructions, user_id, created_at)
values
  ('Soup',  '[{"amount":"1","name":"leek"}]'::jsonb, 'cook', 'b1000000-0000-0000-0000-0000000000b1', now()),
  ('Bread', '[{"amount":"1","name":"flour"}]'::jsonb, 'bake', 'b1000000-0000-0000-0000-0000000000b1', now() - interval '2 days'),
  ('Old',   '[{"amount":"1","name":"salt"}]'::jsonb, 'stir', 'c1000000-0000-0000-0000-0000000000c1', now() - interval '45 days');

insert into public.gemini_logs (endpoint, model, status, user_id)
values
  ('translate',     'tap', 'success', 'b1000000-0000-0000-0000-0000000000b1'),
  ('translate',     'tap', 'error',   'b1000000-0000-0000-0000-0000000000b1'),
  ('extract-photo', 'tap', 'success', 'b1000000-0000-0000-0000-0000000000b1'),
  ('find-image',    'tap', 'success', 'b1000000-0000-0000-0000-0000000000b1'),
  -- The admin's own system check: neither activity nor a feature.
  ('health-check',  'tap', 'success', 'c1000000-0000-0000-0000-0000000000c1');

insert into public.recipe_imports (user_id, status, source)
values ('b1000000-0000-0000-0000-0000000000b1', 'saved', 'page');

-- ── Who may read it ──────────────────────────────────────────────────────────
select ok(
  not has_function_privilege('anon', 'public.admin_usage(integer)', 'execute')
  and not has_function_privilege('authenticated', 'public.admin_usage(integer)', 'execute')
  and has_function_privilege('service_role', 'public.admin_usage(integer)', 'execute'),
  'only the service key, which the admin route uses, may run the usage report'
);

create or replace function tests.as_member(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

select tests.as_member('a1000000-0000-0000-0000-0000000000a1');
select is(
  (select count(*)::int from public.app_opens),
  0,
  'nobody reads app opens through the API, not even their own'
);
select throws_ok(
  $$ insert into public.app_opens (user_id, day) values ('a1000000-0000-0000-0000-0000000000a1', current_date + 1) $$,
  '42501', null,
  'nor writes them: only the server does'
);
reset role;

-- ── What it counts ───────────────────────────────────────────────────────────
create temporary table report as select public.admin_usage(30) as r;

select is((select (r->'totals'->>'active_people')::int from report), 2,
  'active: the reader (app opens) and the cook (saving), not the account idle for 45 days');
select is((select (r->'totals'->>'recipes_added')::int from report), 2,
  'recipes added in the period, not before it');
select is((select (r->'totals'->>'ai_calls')::int from report), 3,
  'AI calls leave out the Unsplash search and the admin''s system check');
select is((select (r->'totals'->>'iphone_imports')::int from report), 1,
  'iPhone imports in the period');
select is((select jsonb_array_length(r->'weeks') from report), 8,
  'eight weeks for the charts');
select is((select (r->'weeks'->7->>'active_people')::int from report), 2,
  'the current week counts the reader and the cook');
select is(
  (select f->>'calls' from report, jsonb_array_elements(r->'features') f where f->>'endpoint' = 'translate'),
  '2',
  'features count calls per endpoint'
);
select is(
  (select f->>'failed' from report, jsonb_array_elements(r->'features') f where f->>'endpoint' = 'translate'),
  '1',
  'and how many of them failed'
);
select ok(
  not exists (select 1 from report, jsonb_array_elements(r->'features') f where f->>'endpoint' = 'health-check'),
  'the admin''s system check is not a feature anyone used'
);
select is(
  (select p->>'active_days' from report, jsonb_array_elements(r->'people') p where p->>'email' = 'reader@example.com'),
  '2',
  'a person who only reads is counted on each day they opened the app'
);
select is(
  (select p->>'recipes_total' from report, jsonb_array_elements(r->'people') p where p->>'email' = 'cook@example.com'),
  '2',
  'per person: recipes in total'
);
select is(
  (select r->>'tracking_since' from report),
  ((now() at time zone 'utc')::date - 3)::text,
  'the report says since when app opens are counted'
);
select is(
  (select (public.admin_usage(7)->>'days')::int),
  7,
  'the period can be shorter'
);

select * from finish();
rollback;
