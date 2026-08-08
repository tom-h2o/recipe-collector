-- URL-only extraction caching has been replaced by ai_cache entries keyed by
-- the effective Gemini input. Keeping url_cache would make it easy to reintroduce
-- stale URL-only extraction results.

DROP TABLE IF EXISTS public.url_cache;
