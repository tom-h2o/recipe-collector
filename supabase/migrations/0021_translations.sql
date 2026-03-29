-- Add detected original language to recipes
alter table public.recipes
  add column if not exists original_language text;

-- Store AI-generated translations per recipe per language
create table if not exists public.recipe_translations (
  id uuid default gen_random_uuid() primary key,
  recipe_id uuid references public.recipes(id) on delete cascade not null,
  language_code text not null,          -- 'en', 'de', 'pl', etc.
  title text not null,
  description text,
  instructions text not null,
  ingredients jsonb not null,           -- [{amount, name, details}] — amounts unchanged
  created_at timestamptz default now(),
  unique (recipe_id, language_code)
);

alter table public.recipe_translations enable row level security;

-- Anyone authenticated can read translations
create policy "translations_select"
  on public.recipe_translations for select
  using (true);

-- Service role handles inserts via API (bypasses RLS)
-- Frontend never inserts directly
