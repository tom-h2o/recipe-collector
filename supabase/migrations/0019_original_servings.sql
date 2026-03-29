-- Store the original serving count at import time so scaling always has a fixed reference point
alter table public.recipes
  add column if not exists original_servings integer;

-- Back-fill: use current servings as original for existing recipes
update public.recipes set original_servings = servings where original_servings is null and servings is not null;
