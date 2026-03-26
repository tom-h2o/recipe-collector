-- Create settings table (single-row key-value store)
create table if not exists public.settings (
  id integer primary key default 1,
  gemini_model text not null default 'gemini-2.5-flash',
  gemini_prompt text not null default '',
  updated_at timestamp with time zone default timezone(''utc''::text, now()) not null,
  constraint settings_single_row check (id = 1)
);

-- Insert the default row
insert into public.settings (id, gemini_model, gemini_prompt)
values (1, 'gemini-2.5-flash', '')
on conflict (id) do nothing;

-- RLS
alter table public.settings enable row level security;
create policy "Allow all access to settings" on public.settings for all using (true) with check (true);
