-- How many model calls a logged request actually took.
--
-- Transient failures (503 "high demand", 429 throttling) are now retried with
-- backoff. Without recording this, a retried call is indistinguishable from a
-- clean one and there is no way to tell whether retrying is helping, or how
-- often Google is unavailable.
--
-- The retries deliberately stay inside a single log row. The daily allowance is
-- computed by counting gemini_logs rows for the day, so writing one row per
-- attempt would silently charge a user two or three of their hundred for one
-- action — the same mistake that once made find-image consume the AI budget.
alter table public.gemini_logs
  add column if not exists attempts smallint not null default 1;

comment on column public.gemini_logs.attempts is
  'Model calls made for this one logged request, including retries of transient errors and any JSON-repair call. Always >= 1. One row per request regardless, because rate limiting counts rows.';
