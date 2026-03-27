create table if not exists public.meal_plan (
  id uuid default gen_random_uuid() primary key,
  date date not null,
  recipe_id uuid references public.recipes(id) on delete cascade not null,
  meal_type text not null check (meal_type in ('Breakfast', 'Lunch', 'Dinner', 'Snack')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);
