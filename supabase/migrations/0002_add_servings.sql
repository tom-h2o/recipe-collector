-- Add servings column to recipes table
alter table public.recipes add column if not exists servings integer;
