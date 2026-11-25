-- RLS policy tests.
--
-- Every other test in this repo mocks Supabase away. Account linking is nothing
-- *but* policies — `recipes_select` widened by `linked_user_ids()` — so none of
-- it was covered, and it shipped with two bugs. This is the only kind of test
-- that can catch a policy that grants too much or too little.
--
-- Run with `supabase test db` (needs Docker). The service key used elsewhere
-- bypasses RLS entirely and is therefore blind to exactly what is tested here.

create extension if not exists pgtap with schema extensions;
create schema if not exists tests;

begin;
select plan(60);

-- ── Fixtures ────────────────────────────────────────────────────────────────
-- Three accounts: two that will be linked, and a third that must stay isolated.
insert into auth.users (id, email, instance_id, aud, role)
values
  ('11111111-1111-1111-1111-111111111111', 'ana@example.com',   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('22222222-2222-2222-2222-222222222222', 'ben@example.com',   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('33333333-3333-3333-3333-333333333333', 'clara@example.com', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

insert into public.recipes (id, title, ingredients, instructions, user_id)
values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Ana pasta',   '[{"amount":"1","name":"pasta"}]'::jsonb, 'boil', '11111111-1111-1111-1111-111111111111'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'Ben bread',   '[{"amount":"1","name":"flour"}]'::jsonb, 'bake', '22222222-2222-2222-2222-222222222222'),
  ('cccccccc-0000-0000-0000-000000000003', 'Clara cake',  '[{"amount":"1","name":"sugar"}]'::jsonb, 'mix',  '33333333-3333-3333-3333-333333333333');

-- A photo and a translation on each of two recipes. Without rows here, the
-- "anon reads none of this" assertions below would pass against empty tables
-- and prove nothing at all.
insert into public.recipe_images (recipe_id, user_id, url, source, sort_order)
values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'https://img.test/ana.jpg', 'upload', 1),
  ('bbbbbbbb-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'https://img.test/ben.jpg', 'upload', 1);

insert into public.recipe_translations (recipe_id, language_code, title, instructions, ingredients)
values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'de', 'Ana Nudeln', 'kochen', '[]'::jsonb),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'de', 'Ben Brot',   'backen', '[]'::jsonb);

/** Impersonate a signed-in user, the way PostgREST does per request. */
create or replace function tests.as_user(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

-- ── Before any link exists ──────────────────────────────────────────────────
select tests.as_user('11111111-1111-1111-1111-111111111111');

select is(
  (select count(*)::int from public.recipes),
  1,
  'unlinked: a user sees only their own recipes'
);
select is(
  (select count(*)::int from public.recipes where user_id = '22222222-2222-2222-2222-222222222222'),
  0,
  'unlinked: another account''s recipes are invisible'
);

reset role;

-- ── A pending invitation grants nothing ─────────────────────────────────────
insert into public.account_links (requester_id, requester_email, addressee_email, addressee_id, status)
values ('11111111-1111-1111-1111-111111111111', 'ana@example.com', 'ben@example.com', '22222222-2222-2222-2222-222222222222', 'pending');

select tests.as_user('11111111-1111-1111-1111-111111111111');
select is(
  (select count(*)::int from public.recipes),
  1,
  'pending link: still only own recipes — an unaccepted invitation must not grant access'
);
reset role;

-- ── Accepted ────────────────────────────────────────────────────────────────
update public.account_links
   set status = 'accepted', accepted_at = now()
 where requester_id = '11111111-1111-1111-1111-111111111111';

select tests.as_user('11111111-1111-1111-1111-111111111111');
select is(
  (select count(*)::int from public.recipes),
  2,
  'accepted: the requester sees their own recipes and the addressee''s'
);
select is(
  (select count(*)::int from public.recipes where user_id = '33333333-3333-3333-3333-333333333333'),
  0,
  'accepted: an unrelated third account stays invisible'
);
reset role;

select tests.as_user('22222222-2222-2222-2222-222222222222');
select is(
  (select count(*)::int from public.recipes),
  2,
  'accepted: the link is symmetric — the addressee sees the requester''s recipes too'
);
reset role;

select tests.as_user('33333333-3333-3333-3333-333333333333');
select is(
  (select count(*)::int from public.recipes),
  1,
  'accepted: the third account sees nothing new'
);
reset role;

-- ── Reading is not writing ──────────────────────────────────────────────────
select tests.as_user('11111111-1111-1111-1111-111111111111');

update public.recipes set title = 'hijacked' where id = 'bbbbbbbb-0000-0000-0000-000000000002';
select is(
  (select title from public.recipes where id = 'bbbbbbbb-0000-0000-0000-000000000002'),
  'Ben bread',
  'a linked account cannot edit the other''s recipe — the update matches no rows'
);

delete from public.recipes where id = 'bbbbbbbb-0000-0000-0000-000000000002';
select is(
  (select count(*)::int from public.recipes where id = 'bbbbbbbb-0000-0000-0000-000000000002'),
  1,
  'a linked account cannot delete the other''s recipe'
);
reset role;

-- ── Per-person ratings ──────────────────────────────────────────────────────
select tests.as_user('11111111-1111-1111-1111-111111111111');

insert into public.recipe_ratings (recipe_id, user_id, rating)
values ('bbbbbbbb-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 4);
select is(
  (select rating::int from public.recipe_ratings
    where recipe_id = 'bbbbbbbb-0000-0000-0000-000000000002'
      and user_id = '11111111-1111-1111-1111-111111111111'),
  4,
  'you may rate a linked account''s recipe — that is the point of per-person ratings'
);

select throws_ok(
  $$insert into public.recipe_ratings (recipe_id, user_id, rating)
    values ('aaaaaaaa-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 1)$$,
  '42501',
  null,
  'you cannot write a rating attributed to somebody else'
);

select throws_ok(
  $$insert into public.recipe_ratings (recipe_id, user_id, rating)
    values ('cccccccc-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 5)$$,
  '42501',
  null,
  'you cannot rate a recipe you cannot even see'
);
reset role;

-- Ben rates his own recipe; Ana is linked and should see it.
select tests.as_user('22222222-2222-2222-2222-222222222222');
insert into public.recipe_ratings (recipe_id, user_id, rating)
values ('bbbbbbbb-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 2);
reset role;

select tests.as_user('11111111-1111-1111-1111-111111111111');
select is(
  (select count(*)::int from public.recipe_ratings where recipe_id = 'bbbbbbbb-0000-0000-0000-000000000002'),
  2,
  'a linked account''s rating is visible alongside your own'
);
reset role;

select tests.as_user('33333333-3333-3333-3333-333333333333');
select is(
  (select count(*)::int from public.recipe_ratings),
  0,
  'an unlinked account sees nobody else''s ratings'
);
reset role;

-- ── Settings stay private ───────────────────────────────────────────────────
insert into public.settings (user_id, gemini_model, temperature_unit)
values ('22222222-2222-2222-2222-222222222222', 'gemini-flash-latest', 'C');

select tests.as_user('11111111-1111-1111-1111-111111111111');
select is(
  (select count(*)::int from public.settings where user_id = '22222222-2222-2222-2222-222222222222'),
  0,
  'linking shares recipes, not settings — a linked account''s settings row stays hidden'
);

-- Settings shows every user which model each task runs on, read from the
-- global row (migration 0068; Claude since 0069). Reading it is all a user
-- may do with it.
select is(
  (select task_models->>'tag' from public.settings where id = 1),
  'claude-haiku-5-5',
  'every user can read the AI models the admin chose for everyone'
);

update public.settings set gemini_model = 'tampered' where id = 1;
reset role;
select isnt(
  (select gemini_model from public.settings where id = 1),
  'tampered',
  'the global fallback settings row cannot be edited by a user'
);
select tests.as_user('11111111-1111-1111-1111-111111111111');
reset role;

-- ── Disconnecting revokes access ────────────────────────────────────────────
delete from public.account_links where requester_id = '11111111-1111-1111-1111-111111111111';

select tests.as_user('11111111-1111-1111-1111-111111111111');
select is(
  (select count(*)::int from public.recipes),
  1,
  'after disconnecting, the other account''s recipes are invisible again'
);
select is(
  (select count(*)::int from public.recipe_ratings where user_id = '22222222-2222-2222-2222-222222222222'),
  0,
  'after disconnecting, their ratings are hidden too — a recipe can outlive a link'
);
reset role;

-- ── Public share links (migration 0061) ─────────────────────────────────────
-- The one read path that an account-less stranger can reach. It must open
-- exactly one recipe, only while its owner wants it open, and it must never
-- carry the owner's private columns.
update public.recipes
   set public_share_token = '77777777-7777-7777-7777-777777777777',
       notes = 'ana''s private note',
       rating = 5
 where id = 'aaaaaaaa-0000-0000-0000-000000000001';

set local role anon;

-- Zero rows, not an error. Supabase grants `anon` SELECT on public tables as
-- part of its standard setup, so what keeps an anonymous visitor out is RLS,
-- not a missing grant: every policy on these tables is `to authenticated`, so
-- none applies to anon and row-level security denies by default. An earlier
-- version of this test asserted a 42501 and passed only against a hand-built
-- local Postgres where `anon` had no grants at all — which tested the fixture,
-- not the product. Do not change it back.
select is(
  (select count(*)::int from public.recipes),
  0,
  'anon reads no recipes directly, share link or not'
);

select is(
  (select count(*)::int from public.recipe_images),
  0,
  'anon reads no recipe photos directly'
);

select is(
  (select count(*)::int from public.recipe_translations),
  0,
  'anon reads no translations directly'
);

select is(
  (select count(*)::int from public.get_shared_recipe_images('77777777-7777-7777-7777-777777777777')),
  1,
  'a share token opens the photos of that recipe, and only that recipe'
);

select is(
  (select count(*)::int from public.get_shared_recipe_translations('77777777-7777-7777-7777-777777777777')),
  1,
  'and its cached translations, and only its own'
);

select is(
  (select count(*)::int from public.get_shared_recipe('77777777-7777-7777-7777-777777777777')),
  1,
  'a valid share token opens exactly one recipe for an anonymous reader'
);

select is(
  (select title from public.get_shared_recipe('77777777-7777-7777-7777-777777777777')),
  'Ana pasta',
  'and it is the recipe the token belongs to'
);

select is(
  (select count(*)::int from public.get_shared_recipe(null)),
  0,
  'a null token opens nothing — revoking must not publish every unshared recipe'
);

select is(
  (select count(*)::int from public.get_shared_recipe('99999999-9999-9999-9999-999999999999')),
  0,
  'an unknown or stale token opens nothing'
);

reset role;

-- Revocation: the owner sets the token back to null.
update public.recipes
   set public_share_token = null
 where id = 'aaaaaaaa-0000-0000-0000-000000000001';

set local role anon;
select is(
  (select count(*)::int from public.get_shared_recipe('77777777-7777-7777-7777-777777777777')),
  0,
  'once revoked, the old link opens nothing'
);
reset role;

-- ── Deleting a translation (migration 0064) ─────────────────────────────────
-- recipe_translations had no delete policy at all, so a delete from the
-- browser matched zero rows and PostgREST reported no error: the row survived
-- and the UI would have called it a success.
select tests.as_user('11111111-1111-1111-1111-111111111111');

select is(
  (select count(*)::int from public.recipe_translations
    where recipe_id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  1,
  'the owner can see their own translation before deleting it'
);

delete from public.recipe_translations
 where recipe_id = 'aaaaaaaa-0000-0000-0000-000000000001'
   and language_code = 'de';

select is(
  (select count(*)::int from public.recipe_translations
    where recipe_id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  0,
  'an owner can delete a translation of their own recipe'
);
reset role;

-- Ben's recipe is linked to Ana, so she can read its translation. Reading is
-- not writing: linked recipes are read-only everywhere else in the app, and
-- deleting a cached translation would make its owner pay to rebuild it.
-- requester_email and addressee_email are NOT NULL: the link can be created
-- before the addressee has an account, so the address is what identifies them.
-- The earlier "disconnecting revokes access" block deleted Ana's link, so this
-- re-establishes it rather than updating one.
insert into public.account_links (requester_id, requester_email, addressee_email, addressee_id, status)
values (
  '11111111-1111-1111-1111-111111111111', 'ana@example.com',
  'ben@example.com', '22222222-2222-2222-2222-222222222222', 'accepted'
);

select tests.as_user('11111111-1111-1111-1111-111111111111');

select is(
  (select count(*)::int from public.recipe_translations
    where recipe_id = 'bbbbbbbb-0000-0000-0000-000000000002'),
  1,
  'a linked account can read the other person''s translation'
);

delete from public.recipe_translations
 where recipe_id = 'bbbbbbbb-0000-0000-0000-000000000002';

select is(
  (select count(*)::int from public.recipe_translations
    where recipe_id = 'bbbbbbbb-0000-0000-0000-000000000002'),
  1,
  'but cannot delete it — the row is still there'
);
reset role;

-- ── Admin model usage (migration 0066) ───────────────────────────────────────
-- Counted in the database because the API returns at most 1000 rows, which
-- silently truncated the tally api/account.ts used to do in JavaScript.
-- Model names here are ones no other row can have, so whatever else is in the
-- table does not matter.
insert into public.gemini_logs (endpoint, model, model_version, status)
values
  ('tag', 'tap-alias', 'tap-resolved-1', 'success'),
  ('tag', 'tap-alias', 'tap-resolved-1', 'error'),
  ('tag', 'tap-alias', null,             'success'),
  ('tag', 'tap-alias', '',               'success');

select results_eq(
  $$ select model, call_count::int from public.gemini_model_usage()
      where model like 'tap-%' order by model $$,
  $$ values ('tap-alias', 2), ('tap-resolved-1', 2) $$,
  'model usage groups by the model that ran, falling back to the id that was requested'
);

-- A revoked EXECUTE really is a permission error, unlike a table read that
-- row level security answers with zero rows. Supabase grants EXECUTE to both
-- of these roles by default privilege, so this fails if the revoke is dropped.
select ok(
  not has_function_privilege('anon', 'public.gemini_model_usage()', 'execute')
  and not has_function_privilege('authenticated', 'public.gemini_model_usage()', 'execute'),
  'neither anon nor a signed-in user may call the admin model usage function'
);

select ok(
  has_function_privilege('service_role', 'public.gemini_model_usage()', 'execute'),
  'the service key, which the admin endpoint uses, may'
);

-- ── System check (migration 0067) ────────────────────────────────────────────
-- Whether reasoning was off, counted per endpoint, model and state for the
-- admin System tab; and what only the database can say about its own health.
insert into public.gemini_logs (endpoint, model, status, thinking)
values
  ('translate', 'tap-think', 'success', 'off'),
  ('translate', 'tap-think', 'success', 'off'),
  ('translate', 'tap-think', 'success', 'refused'),
  ('extract',   'tap-think', 'success', 'on'),
  ('extract',   'tap-think', 'success', null);

select results_eq(
  $$ select endpoint, thinking, call_count::int
       from public.gemini_thinking_usage(now() - interval '1 hour')
      where model = 'tap-think' order by endpoint, thinking $$,
  $$ values ('extract', 'on', 1), ('extract', 'unrecorded', 1), ('translate', 'off', 2), ('translate', 'refused', 1) $$,
  'reasoning usage counts each state per endpoint, and rows from before 0067 as unrecorded'
);

select ok(
  not has_function_privilege('anon', 'public.gemini_thinking_usage(timestamptz)', 'execute')
  and not has_function_privilege('authenticated', 'public.gemini_thinking_usage(timestamptz)', 'execute'),
  'neither anon nor a signed-in user may call the reasoning usage function'
);

select ok(
  has_function_privilege('service_role', 'public.gemini_thinking_usage(timestamptz)', 'execute'),
  'the service key may'
);

-- security definer, so it can read supabase_migrations; all the more reason
-- that nobody but the service key may call it.
select ok(
  not has_function_privilege('anon', 'public.system_health()', 'execute')
  and not has_function_privilege('authenticated', 'public.system_health()', 'execute')
  and has_function_privilege('service_role', 'public.system_health()', 'execute'),
  'only the service key may call system_health'
);

select ok(
  public.system_health() ?& array['postgres_version', 'pgvector_version', 'realtime_recipes', 'latest_migration', 'configured_models'],
  'system_health reports every fact the System tab shows'
);

-- The tab compares this with the migration the deployed code expects, so it
-- must be the file-name prefix the CLI recorded: '0067', not 67 or a timestamp.
select ok(
  (public.system_health()->>'latest_migration') >= '0067',
  'system_health reads the newest applied migration as its file-name prefix'
);

-- Only the global row's models run (0068), so only they are probed. The
-- linked account's row above still names gemini-flash-latest.
select ok(
  (public.system_health()->'configured_models') ? 'claude-haiku-5-5',
  'system_health lists the models the global row assigns'
);
select ok(
  not ((public.system_health()->'configured_models') ? 'gemini-flash-latest'),
  'a model left on someone''s own settings row is not reported as configured'
);

-- ── Shortcut imports (migration 0070) ───────────────────────────────────────
-- Keys are hashes nobody reads through the API; imports are each person's own,
-- and the only thing they may change about one is when they saw it.
insert into public.shortcut_keys (user_id, key_hash)
values ('11111111-1111-1111-1111-111111111111', 'sha256-of-anas-key');

insert into public.recipe_imports (id, user_id, status, page_count, recipe_id)
values
  ('dddddddd-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'saved', 2, 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('dddddddd-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'failed', 1, null);

select tests.as_user('11111111-1111-1111-1111-111111111111');
select is(
  (select count(*)::int from public.recipe_imports),
  1,
  'a person sees only their own imports'
);
select throws_ok(
  $$ select count(*) from public.shortcut_keys $$,
  '42501', null,
  'nobody reads shortcut keys through the API, not even their own'
);
update public.recipe_imports set seen_at = now() where id = 'dddddddd-0000-0000-0000-000000000001';
select isnt(
  (select seen_at from public.recipe_imports where id = 'dddddddd-0000-0000-0000-000000000001'),
  null,
  'a person can mark their own import as seen'
);
select throws_ok(
  $$ update public.recipe_imports set status = 'failed' where id = 'dddddddd-0000-0000-0000-000000000001' $$,
  '42501', null,
  'but cannot change anything else about it'
);
select throws_ok(
  $$ insert into public.recipe_imports (user_id, status) values ('11111111-1111-1111-1111-111111111111', 'saved') $$,
  '42501', null,
  'nor create one: only the server does'
);
update public.recipe_imports set seen_at = now() where id = 'dddddddd-0000-0000-0000-000000000002';
reset role;
select is(
  (select seen_at from public.recipe_imports where id = 'dddddddd-0000-0000-0000-000000000002'),
  null,
  'nor mark someone else''s import as seen'
);

delete from public.recipes where id = 'aaaaaaaa-0000-0000-0000-000000000001';
select is(
  (select count(*)::int from public.recipe_imports where id = 'dddddddd-0000-0000-0000-000000000001'),
  0,
  'deleting a recipe deletes its import row, so no banner or badge outlives it'
);

-- ── The shared Shortcut link (migration 0071) ───────────────────────────────
update public.settings set shortcut_url = 'https://www.icloud.com/shortcuts/abc123' where id = 1;
select tests.as_user('33333333-3333-3333-3333-333333333333');
select is(
  (select shortcut_url from public.settings where id = 1),
  'https://www.icloud.com/shortcuts/abc123',
  'every user can read the shared Shortcut link'
);
update public.settings set shortcut_url = 'https://evil.example/shortcut' where id = 1;
reset role;
select is(
  (select shortcut_url from public.settings where id = 1),
  'https://www.icloud.com/shortcuts/abc123',
  'and no user can change it: only the admin, through the server'
);

-- ── The Safari Shortcut (migration 0072) ────────────────────────────────────
update public.settings set safari_shortcut_url = 'https://www.icloud.com/shortcuts/def456' where id = 1;
insert into public.recipe_imports (id, user_id, status, source)
values ('dddddddd-0000-0000-0000-000000000003', '33333333-3333-3333-3333-333333333333', 'saved', 'page');
select tests.as_user('33333333-3333-3333-3333-333333333333');
select is(
  (select safari_shortcut_url from public.settings where id = 1),
  'https://www.icloud.com/shortcuts/def456',
  'every user can read the Safari Shortcut link'
);
update public.settings set safari_shortcut_url = 'https://evil.example/shortcut' where id = 1;
select is(
  (select source from public.recipe_imports where id = 'dddddddd-0000-0000-0000-000000000003'),
  'page',
  'a person can see where their import came from'
);
select throws_ok(
  $$ update public.recipe_imports set source = 'photos' where id = 'dddddddd-0000-0000-0000-000000000003' $$,
  '42501', null,
  'but cannot change it'
);
reset role;
select is(
  (select safari_shortcut_url from public.settings where id = 1),
  'https://www.icloud.com/shortcuts/def456',
  'and no user can change the Safari Shortcut link'
);

-- ── The link Shortcut (migration 0073) ──────────────────────────────────────
update public.settings set link_shortcut_url = 'https://www.icloud.com/shortcuts/ghi789' where id = 1;
select lives_ok(
  $$ insert into public.recipe_imports (id, user_id, status, source)
     values ('dddddddd-0000-0000-0000-000000000004', '33333333-3333-3333-3333-333333333333', 'processing', 'link') $$,
  'an import can come from a link'
);
select tests.as_user('33333333-3333-3333-3333-333333333333');
select is(
  (select link_shortcut_url from public.settings where id = 1),
  'https://www.icloud.com/shortcuts/ghi789',
  'every user can read the link Shortcut link'
);
update public.settings set link_shortcut_url = 'https://evil.example/shortcut' where id = 1;
reset role;
select is(
  (select link_shortcut_url from public.settings where id = 1),
  'https://www.icloud.com/shortcuts/ghi789',
  'and no user can change the link Shortcut link'
);

select * from finish();
rollback;
