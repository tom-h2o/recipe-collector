create table if not exists public.gemini_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamp with time zone default now() not null,
  endpoint text not null,
  model text not null,
  status text not null check (status in ('success', 'error')),
  latency_ms integer,
  input_preview text,
  output_preview text,
  error_message text,
  recipe_id uuid references public.recipes(id) on delete set null
);

create index if not exists gemini_logs_created_at_idx
  on public.gemini_logs (created_at desc);

alter table public.gemini_logs enable row level security;

-- Service role (API functions) can insert — bypasses RLS automatically
-- Authenticated users can read all logs (personal app, single owner)
create policy "gemini_logs_select"
  on public.gemini_logs for select
  using (auth.role() = 'authenticated');

create policy "gemini_logs_insert"
  on public.gemini_logs for insert
  with check (true);
