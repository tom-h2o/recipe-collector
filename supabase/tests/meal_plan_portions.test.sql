-- Portions and the shopping tick on a planned meal (migration 0079): their
-- defaults, the range of portions, and that only the owner can change them.
-- The writes that matter are made as `authenticated`.

create extension if not exists pgtap with schema extensions;

begin;
select plan(8);

insert into auth.users (id, email, instance_id, aud, role)
values
  ('a7000000-0000-0000-0000-0000000000a7', 'cook@example.com',  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('b7000000-0000-0000-0000-0000000000b7', 'other@example.com', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

insert into public.recipes (id, title, ingredients, instructions, servings, user_id)
values ('c7000000-0000-0000-0000-000000000001', 'Stew', '[{"amount":"800 g","name":"potatoes"}]'::jsonb, 'cook', 4, 'a7000000-0000-0000-0000-0000000000a7');

insert into public.meal_plan (id, date, meal_type, recipe_id, user_id)
values ('d7000000-0000-0000-0000-000000000001', current_date, 'Dinner', 'c7000000-0000-0000-0000-000000000001', 'a7000000-0000-0000-0000-0000000000a7');

select is((select servings from public.meal_plan where id = 'd7000000-0000-0000-0000-000000000001'), null,
  'a planned meal starts with no portions of its own: the recipe''s number applies');
select is((select in_shopping from public.meal_plan where id = 'd7000000-0000-0000-0000-000000000001'), true,
  'and is on the shopping list');

-- ── The owner ───────────────────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"a7000000-0000-0000-0000-0000000000a7","role":"authenticated"}', true);
set local role authenticated;

select lives_ok(
  $$ update public.meal_plan set servings = 2, in_shopping = false where id = 'd7000000-0000-0000-0000-000000000001' $$,
  'the owner sets portions and takes the meal off the list');
select is((select servings from public.meal_plan where id = 'd7000000-0000-0000-0000-000000000001'), 2, 'the portions are kept');

select throws_ok(
  $$ update public.meal_plan set servings = 0 where id = 'd7000000-0000-0000-0000-000000000001' $$,
  '23514', null, 'no portions at all is refused');
select throws_ok(
  $$ update public.meal_plan set servings = 100 where id = 'd7000000-0000-0000-0000-000000000001' $$,
  '23514', null, 'and so is a hundred');

-- ── Someone else ────────────────────────────────────────────────────────────
reset role;
select set_config('request.jwt.claims', '{"sub":"b7000000-0000-0000-0000-0000000000b7","role":"authenticated"}', true);
set local role authenticated;

update public.meal_plan set servings = 9 where id = 'd7000000-0000-0000-0000-000000000001';

reset role;
select is((select servings from public.meal_plan where id = 'd7000000-0000-0000-0000-000000000001'), 2,
  'another person''s update changes nothing');
select is((select in_shopping from public.meal_plan where id = 'd7000000-0000-0000-0000-000000000001'), false,
  'and the tick stays as the owner left it');

select * from finish();
rollback;
