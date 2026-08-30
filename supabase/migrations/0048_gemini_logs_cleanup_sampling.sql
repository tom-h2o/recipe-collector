-- Stop running the 30-day log purge on every single insert.
--
-- gemini_logs_cleanup_trigger fired AFTER INSERT FOR EACH ROW and ran a
-- DELETE across the table, so every AI call — extraction, tagging, nutrition,
-- translation — paid for a purge pass before returning. The retention window is
-- unchanged; it just no longer runs hundreds of times a day to delete the same
-- nothing.
--
-- Sampling rather than pg_cron so this needs no extension: roughly one insert in
-- a hundred does the work, which at any real volume keeps the table inside the
-- window while leaving the other 99% of calls untouched.

create or replace function public.cleanup_gemini_logs_trigger()
returns trigger as $$
begin
  if random() < 0.01 then
    perform public.cleanup_old_gemini_logs();
  end if;
  return new;
exception when others then
  -- never let housekeeping fail an insert
  return new;
end;
$$ language plpgsql;
