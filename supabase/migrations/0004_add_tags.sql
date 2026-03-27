-- Add tags column to recipes table
alter table public.recipes add column if not exists tags text[] not null default '{}';
