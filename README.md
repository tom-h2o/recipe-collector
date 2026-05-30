# Speisekammer

A personal recipe vault powered by Google Gemini AI. Import recipes from any URL, a photo, or a PDF; organise them with tags and collections; cook step-by-step; plan meals; and share with friends.

See [APP.md](APP.md) for a full feature list and [ARCHITECTURE.md](ARCHITECTURE.md) for technical details.

## Quick Start

```bash
cp .env.example .env.local   # fill in Supabase + Gemini keys
npm install
npm run dev                  # frontend only (Vite)
vercel dev                   # frontend + API routes
```

## Required environment variables

| Variable | Where to find it |
|---|---|
| `VITE_SUPABASE_URL` | Supabase dashboard → Project Settings → API |
| `VITE_SUPABASE_ANON_KEY` | same |
| `SUPABASE_SERVICE_KEY` | Supabase dashboard → Project Settings → API → service_role secret |
| `GEMINI_API_KEY_1` | [Google AI Studio](https://aistudio.google.com/apikey) |

Optional: `VITE_ADMIN_EMAIL`, `UNSPLASH_ACCESS_KEY`, `ALLOWED_ORIGIN`, Sentry DSN vars.

## Database migrations

```bash
npm run db:migrate   # pushes /supabase/migrations/ to the remote Supabase project
```

Requires `SUPABASE_DB_URL` to be set (Supabase dashboard → Project Settings → Database → Connection string → URI).

---

*Designed by Magical Apps · Thomas Holder*
