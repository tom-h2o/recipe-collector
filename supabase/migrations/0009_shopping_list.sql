create table if not exists public.shopping_list (
  id uuid default gen_random_uuid() primary key,
  item text not null,
  category text,
  is_checked boolean not null default false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);
