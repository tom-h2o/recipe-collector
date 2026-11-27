-- "Generate" on the shopping list replaces only what it generated.
--
-- Generating a list from the meal plan deleted every row of the person's
-- list first: items they had put there themselves went with it. The list had
-- no way to tell the two kinds apart. Now each row says whether it came from
-- the meal plan, and generating deletes and rebuilds those rows only.
--
-- Rows that exist today are marked as generated: until now the only other way
-- onto the list was moving an item back from the pantry, and marking
-- everything as the person's own would make the next "Generate" keep the whole
-- previous list beside the new one.

alter table public.shopping_list
  add column if not exists from_plan boolean not null default false;

update public.shopping_list set from_plan = true;

comment on column public.shopping_list.from_plan is
  'True for items "Generate" made from the meal plan; generating again replaces these only. False for items the person added themselves.';
