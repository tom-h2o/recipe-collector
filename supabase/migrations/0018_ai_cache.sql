create table if not exists public.ai_cache (
  cache_key  text primary key,
  endpoint   text not null,
  result     jsonb not null,
  created_at timestamptz default now(),
  expires_at timestamptz not null
);

alter table public.ai_cache enable row level security;

-- Only service role can read/write (all API calls use service key)
create policy "ai_cache_service_all"
  on public.ai_cache for all
  using (true);

-- Index for fast expiry lookups
create index if not exists ai_cache_expires_at_idx on public.ai_cache (expires_at);
