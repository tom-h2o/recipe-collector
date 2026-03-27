alter table public.settings add column if not exists api_key_1 text;
alter table public.settings add column if not exists api_key_2 text;
alter table public.settings add column if not exists active_api_key int default 1;
