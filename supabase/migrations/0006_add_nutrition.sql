-- Add nutrition column to recipes table (jsonb: calories, protein, carbs, fat per serving)
alter table public.recipes add column if not exists nutrition jsonb;
