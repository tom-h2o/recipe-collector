-- The Safari Shortcut: recipes sent from a web page the person has open.
--
-- Sites such as rewe.de and edeka.de refuse their pages to servers (bot
-- protection), so a pasted link cannot be imported. A second Shortcut,
-- "Save page to Speisekammer", runs in Safari's share sheet, reads the page
-- the person is looking at with "Run JavaScript on Web Page", and sends it to
-- POST /api/extract?via=shortcut with the same personal key as the photo
-- Shortcut (0070).
--
-- 1. Its shared iCloud link, beside the photo Shortcut's (0071): global row
--    only, readable by everyone, written by the admin through
--    POST /api/account?action=shortcut-url with kind 'safari'. No CHECK
--    constraint on this table (CLAUDE.md); the format is checked there.
alter table public.settings add column if not exists safari_shortcut_url text;

comment on column public.settings.safari_shortcut_url is
  'iCloud link of the shared "Save page to Speisekammer" Safari Shortcut. Global row (id = 1) only; set by the admin via POST /api/account?action=shortcut-url.';

-- 2. Where an import came from, so the app can say "a page from Safari" rather
--    than "a picture". Existing rows all came from the photo Shortcut. Owners
--    read it through the existing table-wide select grant; only the server
--    writes it.
alter table public.recipe_imports
  add column if not exists source text not null default 'photos'
  check (source in ('photos', 'page'));

comment on column public.recipe_imports.source is
  'photos: sent from the Photos app; page: a web page sent from Safari.';
