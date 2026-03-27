-- Add is_favourite column to recipes table
alter table public.recipes add column if not exists is_favourite boolean not null default false;
