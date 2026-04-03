-- Update gemini_logs to store full input/output and add auto-cleanup for >30 days

-- Add new full-text columns
alter table public.gemini_logs
  add column input text,
  add column output text;

-- Backfill new columns from preview columns (if they exist)
update public.gemini_logs
set input = input_preview, output = output_preview
where input is null or output is null;

-- Create function to delete logs older than 30 days (runs on insert)
create or replace function public.cleanup_old_gemini_logs()
returns void as $$
begin
  delete from public.gemini_logs
  where created_at < now() - interval '30 days';
end;
$$ language plpgsql;

-- Trigger to run cleanup (fire-and-forget, don't block inserts)
create or replace function public.cleanup_gemini_logs_trigger()
returns trigger as $$
begin
  perform public.cleanup_old_gemini_logs();
  return new;
exception when others then
  return new;
end;
$$ language plpgsql;

drop trigger if exists gemini_logs_cleanup_trigger on public.gemini_logs;
create trigger gemini_logs_cleanup_trigger
  after insert on public.gemini_logs
  for each row
  execute function public.cleanup_gemini_logs_trigger();
