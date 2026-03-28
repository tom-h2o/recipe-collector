-- URL extraction cache: avoids calling Gemini twice for the same URL
-- Entries older than 7 days are treated as stale (handled in application logic)
create table if not exists public.url_cache (
  url_hash text primary key,
  extracted_data jsonb not null,
  created_at timestamp with time zone default now() not null
);

alter table public.url_cache enable row level security;

-- Only service role (used by API functions) can read/write the cache
create policy "Service role full access to url_cache"
  on public.url_cache
  for all
  using (true)
  with check (true);
