-- The shared iPhone Shortcut, as an iCloud link everyone can add from Settings.
--
-- The admin builds the "Send to Speisekammer" Shortcut once, gives it an
-- import question for the key (Apple clears that field when the Shortcut is
-- shared, so the admin's own key never travels with the link), and shares it
-- with "Copy iCloud Link". Pasting that link into Settings → iPhone Shortcut
-- stores it here, on the global row, and every user then gets an
-- "Add to Shortcuts" button instead of building the Shortcut by hand.
--
-- Read by everyone under settings_select (the global row is readable, 0012);
-- written only through POST /api/account?action=shortcut-url, admin only, with
-- the service key (settings_update keeps users off row 1, 0020). The format is
-- checked there, not by a constraint: CLAUDE.md keeps CHECK constraints off
-- this table after 0003's broke every insert until 0051.

alter table public.settings add column if not exists shortcut_url text;

comment on column public.settings.shortcut_url is
  'iCloud link of the shared "Send to Speisekammer" Shortcut. Global row (id = 1) only; set by the admin via POST /api/account?action=shortcut-url.';
