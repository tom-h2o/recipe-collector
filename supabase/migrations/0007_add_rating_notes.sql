-- Add rating and notes columns to recipes table
alter table public.recipes add column if not exists rating integer check (rating >= 1 and rating <= 5);
alter table public.recipes add column if not exists notes text;
