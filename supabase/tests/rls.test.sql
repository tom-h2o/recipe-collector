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
select plan(18);

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

select * from finish();
rollback;
