-- Portions per planned meal, and whether a meal goes on the shopping list.
--
-- The shopping list was built from every meal planned for the next seven
-- days, each at the recipe's own number of servings: cooking a four-serving
-- recipe for two put twice too much on the list, and a meal already shopped
-- for could not be left out. The shopping page now shows those meals as a
-- basket: each can be ticked off and given its own number of portions.
--
-- Both are kept on the plan entry, so they follow the person to every device
-- and the planner can show the portions too.
--
--   servings     how many portions to cook; null means the recipe's own number
--   in_shopping  false: planned, but left off the shopping list
--
-- The existing policies cover the new columns: an owner may update their own
-- plan entries (meal_plan_update, 0040).

alter table public.meal_plan
  add column if not exists servings integer,
  add column if not exists in_shopping boolean not null default true;

alter table public.meal_plan
  drop constraint if exists meal_plan_servings_range;
alter table public.meal_plan
  add constraint meal_plan_servings_range check (servings is null or servings between 1 and 99);

comment on column public.meal_plan.servings is
  'Portions to cook for this planned meal; null uses the recipe''s own servings. Scales what Generate puts on the shopping list.';
comment on column public.meal_plan.in_shopping is
  'False: the meal stays in the plan but Generate leaves it off the shopping list.';
