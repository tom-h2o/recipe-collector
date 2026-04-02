-- Migrate any settings rows still using the deprecated gemini-2.0-flash model
-- (Google sunset date: June 1 2026) to the stable gemini-2.5-flash.
update public.settings
set gemini_model = 'gemini-2.5-flash'
where gemini_model = 'gemini-2.0-flash';
