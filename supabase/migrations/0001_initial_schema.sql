-- Create a table for Recipes
create table public.recipes (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  description text,
  ingredients jsonb not null default '[]'::jsonb,
  instructions text,
  image_url text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Set up Row Level Security (RLS)
-- For the sake of this prototype, we'll allow public access to start with. Let's adjust later if needed.
alter table public.recipes enable row level security;

create policy "Enable read access for all users" on public.recipes for select using (true);
create policy "Enable insert access for all users" on public.recipes for insert with check (true);
create policy "Enable update access for all users" on public.recipes for update using (true);
create policy "Enable delete access for all users" on public.recipes for delete using (true);
