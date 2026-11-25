-- The link Shortcut: recipes sent as a link from any app's share sheet.
--
-- Instagram's share button hands a Shortcut the post's address and nothing
-- else. A third Shortcut, "Send link to Speisekammer", takes that link (or one
-- from any other app) and POSTs `{ url }` to /api/extract?via=shortcut with the
-- same personal key as the other two (0070). The server fetches the page, as
-- for a link pasted into the app: Instagram puts a public post's caption in
-- the page's og:description, which is where a recipe in a post usually is.
--
-- 1. Its shared iCloud link, beside the other two (0071, 0072): global row
--    only, readable by everyone, written by the admin through
--    POST /api/account?action=shortcut-url with kind 'link'. No CHECK
--    constraint on this table (CLAUDE.md); the format is checked there.
alter table public.settings add column if not exists link_shortcut_url text;

comment on column public.settings.link_shortcut_url is
  'iCloud link of the shared "Send link to Speisekammer" Shortcut. Global row (id = 1) only; set by the admin via POST /api/account?action=shortcut-url.';

-- 2. A third source for an import, so the app can say "a link" rather than
--    "a page from Safari". 0072 declared the check inline, so Postgres named it
--    recipe_imports_source_check.
alter table public.recipe_imports drop constraint if exists recipe_imports_source_check;
alter table public.recipe_imports
  add constraint recipe_imports_source_check check (source in ('photos', 'page', 'link'));

comment on column public.recipe_imports.source is
  'photos: sent from the Photos app; page: a web page sent from Safari; link: a link sent from any app''s share sheet.';
