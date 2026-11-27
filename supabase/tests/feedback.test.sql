-- Feedback (migration 0078): a person can send a report and read their own;
-- nobody can read another's, file one as someone else, set its status, or
-- change or delete one afterwards. Every write is made as `authenticated`.

create extension if not exists pgtap with schema extensions;

begin;
select plan(11);

insert into auth.users (id, email, instance_id, aud, role)
values
  ('e1000000-0000-0000-0000-0000000000e1', 'ann@example.com', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('e2000000-0000-0000-0000-0000000000e2', 'bob@example.com', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

-- ── Ann ─────────────────────────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"e1000000-0000-0000-0000-0000000000e1","role":"authenticated"}', true);
set local role authenticated;

select lives_ok(
  $$ insert into public.feedback (kind, message, context) values ('bug', 'The timer stops.', '{"view":"vault"}') $$,
  'a signed-in person can send a report');

select is((select count(*)::int from public.feedback), 1, 'and reads it back');
select is((select status from public.feedback), 'new', 'it starts as new');
select is((select user_id from public.feedback), 'e1000000-0000-0000-0000-0000000000e1'::uuid, 'and belongs to the sender');

select throws_ok(
  $$ insert into public.feedback (kind, message, user_id) values ('bug', 'as Bob', 'e2000000-0000-0000-0000-0000000000e2') $$,
  '42501', null, 'a report cannot be filed as someone else');

select throws_ok(
  $$ insert into public.feedback (kind, message, status) values ('bug', 'already done', 'done') $$,
  '42501', null, 'nor with a status of the sender''s choosing');

select throws_ok(
  $$ update public.feedback set status = 'done' $$,
  '42501', null, 'a sent report cannot be changed by its sender');

select throws_ok(
  $$ delete from public.feedback $$,
  '42501', null, 'nor deleted');

select throws_ok(
  $$ insert into public.feedback (kind, message) values ('bug', '   ') $$,
  '23514', null, 'an empty report is refused');

-- ── Bob ─────────────────────────────────────────────────────────────────────
reset role;
select set_config('request.jwt.claims', '{"sub":"e2000000-0000-0000-0000-0000000000e2","role":"authenticated"}', true);
set local role authenticated;

select is((select count(*)::int from public.feedback), 0, 'another person sees none of it');

-- The daily bound: twenty are taken, the twenty-first is refused.
insert into public.feedback (kind, message) select 'idea', 'idea ' || n from generate_series(1, 20) n;
select throws_ok(
  $$ insert into public.feedback (kind, message) values ('idea', 'one too many') $$,
  '42501', null, 'the twenty-first report in a day is refused');

reset role;
select * from finish();
rollback;
