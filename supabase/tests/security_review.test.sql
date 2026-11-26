-- The security review of 2026-11-26 (migration 0074), tried the way an
-- attacker would: as a signed-in user through the policies, or as anon.
--
-- rls.test.sql creates its account links as the superuser, which is why the
-- forged-link hole (B1) was never noticed. Every write here that matters is
-- made as `authenticated`.

begin;
select plan(47);

-- ── Fixtures ────────────────────────────────────────────────────────────────
-- Mallory attacks; Victor is the target; Wendy is an honest third party who
-- is invited by Mallory; Uma has signed up but never confirmed her address.
insert into auth.users (id, email, instance_id, aud, role, email_confirmed_at)
values
  ('a0000000-0000-0000-0000-00000000000a', 'mallory@example.com', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', now()),
  ('b0000000-0000-0000-0000-00000000000b', 'victor@example.com',  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', now()),
  ('c0000000-0000-0000-0000-00000000000c', 'wendy@example.com',   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', now()),
  ('d0000000-0000-0000-0000-00000000000d', 'uma@example.com',     '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', null);

insert into public.recipes (id, title, ingredients, instructions, user_id, notes, public_share_token)
values
  ('f0000000-0000-0000-0000-0000000000a1', 'Mallory toast', '[{"amount":"1","name":"bread"}]'::jsonb, 'toast', 'a0000000-0000-0000-0000-00000000000a', null, null),
  ('f0000000-0000-0000-0000-0000000000b1', 'Victor stew',   '[{"amount":"1","name":"beans"}]'::jsonb, 'stir',  'b0000000-0000-0000-0000-00000000000b', 'family secret', '88888888-8888-8888-8888-888888888888');

insert into public.recipe_images (id, recipe_id, user_id, url, source, sort_order)
values
  ('e1000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-0000000000b1', 'b0000000-0000-0000-0000-00000000000b', 'https://img.test/victor.jpg', 'upload', 0),
  ('e1000000-0000-0000-0000-000000000002', 'f0000000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-00000000000a', 'https://img.test/mallory.jpg', 'upload', 0);

-- A share Victor really sent Mallory, of a recipe that is not the stew.
insert into public.recipe_shares (id, recipe_id, recipe_title, sender_id, sender_email, recipient_email)
values ('e2000000-0000-0000-0000-000000000001', '99999999-0000-0000-0000-000000000099', 'Victor salad',
        'b0000000-0000-0000-0000-00000000000b', 'victor@example.com', 'mallory@example.com');

/** Impersonate a signed-in user, with the email claim Supabase puts in the token. */
create or replace function tests.sign_in(uid uuid, mail text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated', 'email', mail)::text, true);
  execute 'set local role authenticated';
end $$;

-- ── B1: forging a link ──────────────────────────────────────────────────────
select tests.sign_in('a0000000-0000-0000-0000-00000000000a', 'mallory@example.com');

select throws_ok(
  $$ insert into public.account_links (requester_id, requester_email, addressee_email, addressee_id, status, accepted_at)
     values ('a0000000-0000-0000-0000-00000000000a', 'mallory@example.com', 'victor@example.com',
             'b0000000-0000-0000-0000-00000000000b', 'accepted', now()) $$,
  '42501', null,
  'B1: an invitation cannot be created already accepted'
);

select throws_ok(
  $$ insert into public.account_links (requester_id, requester_email, addressee_email, addressee_id)
     values ('a0000000-0000-0000-0000-00000000000a', 'mallory@example.com', 'victor@example.com',
             'b0000000-0000-0000-0000-00000000000b') $$,
  '42501', null,
  'B1: nor pending but already pointing at somebody''s account'
);

select throws_ok(
  $$ insert into public.account_links (requester_id, requester_email, addressee_email)
     values ('a0000000-0000-0000-0000-00000000000a', 'wendy@example.com', 'victor@example.com') $$,
  '42501', null,
  'B1: nor in somebody else''s name'
);

select throws_ok(
  $$ insert into public.account_links (requester_id, requester_email, addressee_email)
     values ('a0000000-0000-0000-0000-00000000000a', 'mallory@example.com', 'MALLORY@example.com') $$,
  '42501', null,
  'B1: nor to yourself'
);

select throws_ok(
  $$ insert into public.account_links (requester_id, requester_email, addressee_email, addressee_label)
     values ('a0000000-0000-0000-0000-00000000000a', 'mallory@example.com', 'victor@example.com', 'Mum') $$,
  '42501', null,
  'B1: nor with a name chosen for the other side'
);

select lives_ok(
  $$ insert into public.account_links (id, requester_id, requester_email, addressee_email)
     values ('e3000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a',
             'mallory@example.com', 'victor@example.com') $$,
  'an honest invitation still works'
);

select throws_ok(
  $$ update public.account_links set status = 'accepted', addressee_id = 'b0000000-0000-0000-0000-00000000000b'
      where id = 'e3000000-0000-0000-0000-000000000001' $$,
  '42501', null,
  'B1: the requester cannot accept their own invitation by updating it'
);

select throws_ok(
  $$ update public.account_links set addressee_email = 'wendy@example.com'
      where id = 'e3000000-0000-0000-0000-000000000001' $$,
  '42501', null,
  'B1: nor readdress it'
);

select throws_ok(
  $$ select public.accept_account_link('e3000000-0000-0000-0000-000000000001') $$,
  'P0002', null,
  'B1: nor accept it through the function, as it was not sent to them'
);

select lives_ok(
  $$ update public.account_links set requester_label = 'Vic'
      where id = 'e3000000-0000-0000-0000-000000000001' $$,
  'the requester may still name the other side'
);

select throws_ok(
  $$ update public.account_links set addressee_label = 'Mum'
      where id = 'e3000000-0000-0000-0000-000000000001' $$,
  '42501', null,
  'B1: but not choose what the other side calls them'
);

select is(
  (select count(*)::int from public.recipes where user_id = 'b0000000-0000-0000-0000-00000000000b'),
  0,
  'B1: after all of that, Victor''s recipes are still invisible to Mallory'
);

select is(
  (select count(*)::int from public.recipe_images where user_id = 'b0000000-0000-0000-0000-00000000000b'),
  0,
  'B1: and so are his photos'
);
reset role;

-- An unconfirmed address proves nothing about who is signing in.
insert into public.account_links (id, requester_id, requester_email, addressee_email)
values ('e3000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-00000000000c', 'wendy@example.com', 'uma@example.com');

select tests.sign_in('d0000000-0000-0000-0000-00000000000d', 'uma@example.com');
select throws_ok(
  $$ select public.accept_account_link('e3000000-0000-0000-0000-000000000002') $$,
  '42501', null,
  'B1: an invitation cannot be accepted from an unconfirmed address'
);
reset role;

-- Victor accepts Mallory's real invitation: that is how a link is made now.
select tests.sign_in('b0000000-0000-0000-0000-00000000000b', 'victor@example.com');
select is(
  (select status from public.accept_account_link('e3000000-0000-0000-0000-000000000001')),
  'accepted',
  'the person invited accepts through accept_account_link'
);
select throws_ok(
  $$ select public.accept_account_link('e3000000-0000-0000-0000-000000000001') $$,
  'P0002', null,
  'an invitation can be accepted once'
);
select lives_ok(
  $$ update public.account_links set addressee_label = 'Mal'
      where id = 'e3000000-0000-0000-0000-000000000001' $$,
  'the invited side names the requester'
);
reset role;

select is(
  (select addressee_id::text || '/' || coalesce(accepted_at::text, 'none') <> 'none'
     from public.account_links where id = 'e3000000-0000-0000-0000-000000000001'),
  true,
  'accepting records who accepted and when'
);
select is(
  (select addressee_id from public.account_links where id = 'e3000000-0000-0000-0000-000000000001'),
  'b0000000-0000-0000-0000-00000000000b'::uuid,
  'and it is the account that accepted'
);

select tests.sign_in('a0000000-0000-0000-0000-00000000000a', 'mallory@example.com');
select is(
  (select count(*)::int from public.recipes where user_id = 'b0000000-0000-0000-0000-00000000000b'),
  1,
  'an accepted link still opens the other vault — linking itself is unchanged'
);
reset role;

-- ── N4: declining ────────────────────────────────────────────────────────────
insert into public.account_links (id, requester_id, requester_email, addressee_email)
values ('e3000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-00000000000a', 'mallory@example.com', 'wendy@example.com');

select tests.sign_in('b0000000-0000-0000-0000-00000000000b', 'victor@example.com');
delete from public.account_links where id = 'e3000000-0000-0000-0000-000000000003';
reset role;
select is(
  (select count(*)::int from public.account_links where id = 'e3000000-0000-0000-0000-000000000003'),
  1,
  'N4: a stranger cannot delete somebody else''s invitation'
);

select tests.sign_in('c0000000-0000-0000-0000-00000000000c', 'wendy@example.com');
delete from public.account_links where id = 'e3000000-0000-0000-0000-000000000003';
reset role;
select is(
  (select count(*)::int from public.account_links where id = 'e3000000-0000-0000-0000-000000000003'),
  0,
  'N4: the person invited can decline'
);

-- ── B2: repointing a received share ──────────────────────────────────────────
select tests.sign_in('a0000000-0000-0000-0000-00000000000a', 'mallory@example.com');
update public.recipe_shares
   set recipe_id = 'f0000000-0000-0000-0000-0000000000b1'
 where id = 'e2000000-0000-0000-0000-000000000001';
update public.recipe_shares
   set status = 'pending'
 where id = 'e2000000-0000-0000-0000-000000000001';
select is(
  (select count(*)::int from public.recipe_shares where id = 'e2000000-0000-0000-0000-000000000001'),
  1,
  'B2: the recipient still sees the share in their inbox'
);
reset role;
select is(
  (select recipe_id from public.recipe_shares where id = 'e2000000-0000-0000-0000-000000000001'),
  '99999999-0000-0000-0000-000000000099'::uuid,
  'B2: but cannot point it at another recipe'
);

-- ── S1: listing the photo bucket ─────────────────────────────────────────────
insert into storage.objects (bucket_id, name, owner)
values
  ('recipe-images', 'victor-private.jpg', 'b0000000-0000-0000-0000-00000000000b'),
  ('recipe-images', 'from-the-server.jpg', null);

set local role anon;
select is(
  (select count(*)::int from storage.objects where bucket_id = 'recipe-images'),
  0,
  'S1: anon cannot list the photo bucket'
);
reset role;

select tests.sign_in('c0000000-0000-0000-0000-00000000000c', 'wendy@example.com');
select is(
  (select count(*)::int from storage.objects where bucket_id = 'recipe-images'),
  0,
  'S1: nor can a signed-in stranger'
);
reset role;

select tests.sign_in('b0000000-0000-0000-0000-00000000000b', 'victor@example.com');
select is(
  (select count(*)::int from storage.objects where bucket_id = 'recipe-images'),
  1,
  'S1: an owner still sees their own upload, which deleting it needs'
);
reset role;

-- ── S2: pictures on somebody else's recipe ───────────────────────────────────
select tests.sign_in('c0000000-0000-0000-0000-00000000000c', 'wendy@example.com');
select throws_ok(
  $$ insert into public.recipe_images (recipe_id, user_id, url, source)
     values ('f0000000-0000-0000-0000-0000000000b1', 'c0000000-0000-0000-0000-00000000000c', 'https://evil.test/x.jpg', 'upload') $$,
  '42501', null,
  'S2: nobody can add a picture to somebody else''s recipe'
);
reset role;

select tests.sign_in('a0000000-0000-0000-0000-00000000000a', 'mallory@example.com');
select throws_ok(
  $$ insert into public.recipe_images (recipe_id, user_id, url, source)
     values ('f0000000-0000-0000-0000-0000000000b1', 'a0000000-0000-0000-0000-00000000000a', 'https://evil.test/x.jpg', 'upload') $$,
  '42501', null,
  'S2: not even a linked account, which can read the recipe'
);
select throws_ok(
  $$ update public.recipe_images set recipe_id = 'f0000000-0000-0000-0000-0000000000b1'
      where id = 'e1000000-0000-0000-0000-000000000002' $$,
  '42501', null,
  'S2: nor move one of their own pictures onto it'
);
select lives_ok(
  $$ insert into public.recipe_images (recipe_id, user_id, url, source)
     values ('f0000000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-00000000000a', 'https://img.test/m2.jpg', 'upload') $$,
  'adding a picture to your own recipe still works'
);
reset role;

-- A foreign picture that got in before 0074 must not reach the public page.
insert into public.recipe_images (recipe_id, user_id, url, source)
values ('f0000000-0000-0000-0000-0000000000b1', 'a0000000-0000-0000-0000-00000000000a', 'https://evil.test/old.jpg', 'upload');
set local role anon;
select is(
  (select count(*)::int from public.get_shared_recipe_images('88888888-8888-8888-8888-888888888888')),
  1,
  'S2: the public page shows only the owner''s pictures'
);

-- ── N1: no recipe id on the public page ──────────────────────────────────────
select is(
  (select title from public.get_shared_recipe('88888888-8888-8888-8888-888888888888')),
  'Victor stew',
  'N1: the public link still opens the recipe'
);
reset role;
select ok(
  pg_get_function_result('public.get_shared_recipe(uuid)'::regprocedure) not like '%id uuid%',
  'N1: but no longer returns its id'
);

-- ── S6: linked_user_ids ──────────────────────────────────────────────────────
select hasnt_function('public', 'linked_user_ids', array['uuid'],
  'S6: the version that answered for any user id is gone');
select ok(
  not has_function_privilege('anon', 'public.linked_user_ids()', 'execute'),
  'S6: anon may not call linked_user_ids()'
);
select tests.sign_in('c0000000-0000-0000-0000-00000000000c', 'wendy@example.com');
select is(
  (select count(*)::int from public.linked_user_ids()),
  0,
  'S6: it answers for the caller, who here is linked with nobody'
);
reset role;

-- ── N6: match_recipes ────────────────────────────────────────────────────────
update public.recipes
   set embedding = array_fill(0.1::real, array[768])::vector
 where id in ('f0000000-0000-0000-0000-0000000000a1', 'f0000000-0000-0000-0000-0000000000b1');

set local role service_role;
select is(
  (select count(*)::int from public.match_recipes(array_fill(0.1::real, array[768])::vector, 0.0, 5,
     'a0000000-0000-0000-0000-00000000000a')),
  2,
  'N6: match_recipes runs, and includes the linked account''s recipes'
);
select is(
  (select count(*)::int from public.match_recipes(array_fill(0.1::real, array[768])::vector, 0.0, 5,
     'c0000000-0000-0000-0000-00000000000c')),
  0,
  'N6: and nothing for someone linked with nobody'
);
reset role;
select ok(
  not has_function_privilege('anon', 'public.match_recipes(vector, double precision, integer, uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.match_recipes(vector, double precision, integer, uuid)', 'execute'),
  'N6: only the server may call match_recipes'
);

-- ── S3: consume_ai_call ──────────────────────────────────────────────────────
set local role service_role;
select is(
  (select array_agg(allowed order by n)
     from (select n, (public.consume_ai_call('c0000000-0000-0000-0000-00000000000c', 'tap-bucket', 2)).allowed
             from generate_series(1, 3) n) calls),
  array[true, true, false],
  'S3: the allowance is taken one call at a time and refused when used up'
);
select is(
  (select used from public.ai_usage where user_id = 'c0000000-0000-0000-0000-00000000000c' and bucket = 'tap-bucket'),
  2,
  'S3: a refused call takes nothing'
);
reset role;

-- The day this ships: what the log already counted today is carried over.
insert into public.gemini_logs (endpoint, model, status, user_id)
values
  ('tag',        'tap', 'success', 'b0000000-0000-0000-0000-00000000000b'),
  ('extract',    'tap', 'error',   'b0000000-0000-0000-0000-00000000000b'),
  ('find-image', 'tap', 'success', 'b0000000-0000-0000-0000-00000000000b');
set local role service_role;
select is(
  (select used from public.consume_ai_call('b0000000-0000-0000-0000-00000000000b', 'ai', 100, array['find-image', 'health-check'])),
  3,
  'S3: the first call of the day starts from the log''s count, without the excluded endpoints'
);
reset role;

select ok(
  not has_function_privilege('anon', 'public.consume_ai_call(uuid, text, integer, text[])', 'execute')
  and not has_function_privilege('authenticated', 'public.consume_ai_call(uuid, text, integer, text[])', 'execute'),
  'S3: only the server may take from the allowance'
);

select tests.sign_in('b0000000-0000-0000-0000-00000000000b', 'victor@example.com');
select is(
  (select count(*)::int from public.ai_usage),
  1,
  'S3: a person sees their own usage'
);
update public.ai_usage set used = 0;
reset role;
select is(
  (select used from public.ai_usage where user_id = 'b0000000-0000-0000-0000-00000000000b' and bucket = 'ai'),
  3,
  'S3: and cannot reset it'
);

-- ── N7: pantry items can be edited by their owner only ───────────────────────
insert into public.pantry_items (id, user_id, item)
values ('e4000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-00000000000b', 'salt');

select tests.sign_in('c0000000-0000-0000-0000-00000000000c', 'wendy@example.com');
update public.pantry_items set item = 'sugar' where id = 'e4000000-0000-0000-0000-000000000001';
reset role;
select tests.sign_in('b0000000-0000-0000-0000-00000000000b', 'victor@example.com');
update public.pantry_items set item = 'sea salt' where id = 'e4000000-0000-0000-0000-000000000001';
reset role;
select is(
  (select item from public.pantry_items where id = 'e4000000-0000-0000-0000-000000000001'),
  'sea salt',
  'N7: the owner can rename a pantry item, and nobody else could'
);

select * from finish();
rollback;
