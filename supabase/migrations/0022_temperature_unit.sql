-- Add temperature unit preference to user settings
alter table public.settings
  add column if not exists temperature_unit text not null default 'C'
    check (temperature_unit in ('C', 'F'));
