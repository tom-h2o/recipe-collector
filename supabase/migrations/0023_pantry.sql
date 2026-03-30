-- Pantry: permanent items the user already has at home
create table if not exists public.pantry_items (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  item text not null,
  category text,
  created_at timestamptz default now()
);

alter table public.pantry_items enable row level security;

create policy "pantry_select" on public.pantry_items
  for select using (auth.uid() = user_id);

create policy "pantry_insert" on public.pantry_items
  for insert with check (auth.uid() = user_id);

create policy "pantry_delete" on public.pantry_items
  for delete using (auth.uid() = user_id);

create index if not exists pantry_items_user_id_idx on public.pantry_items (user_id);
