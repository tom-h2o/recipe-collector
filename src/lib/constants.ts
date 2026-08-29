/**
 * Newest stable Flash. Extraction quality — especially multi-page photo OCR —
 * is what this app lives on, and at the 100 calls/day cap the difference
 * against a lite model is roughly $1.40/month, so capability wins over cost.
 *
 * Must stay equal to DEFAULT_MODEL in api/_lib/supabase.ts; constants.test.ts
 * asserts that.
 */
export const DEFAULT_MODEL = 'gemini-3.7-flash';

/**
 * Verified against the live ListModels endpoint (v1beta) — every ID here is one
 * the API currently serves. Newest first within each group.
 *
 * Deliberately excluded: the `-latest` aliases (they re-point without warning,
 * so a saved setting would silently change model), image/TTS/live/omni variants
 * (not text generation), and gemini-3.1-flash-lite-preview (superseded by the
 * stable gemini-3.1-flash-lite).
 *
 * gemini-2.5-flash-lite was removed: it is still advertised by ListModels but
 * generateContent returns 404 "no longer available to new users", pointing at
 * gemini-3.5-flash-lite instead. Every ID here was smoke-tested with a real
 * generateContent call, not just read off the listing.
 */
export const MODEL_GROUPS = [
  {
    label: 'Gemini 3 — Stable',
    models: [
      'gemini-3.7-flash',
      'gemini-3.6-flash',
      'gemini-3.5-flash',
      'gemini-3.5-flash-lite',
      'gemini-3.1-flash-lite',
    ],
  },
  {
    label: 'Gemini 3 — Preview',
    models: ['gemini-3.1-pro-preview', 'gemini-3-flash-preview'],
  },
  {
    label: 'Gemini 2.5 — Stable',
    models: ['gemini-2.5-pro', 'gemini-2.5-flash'],
  },
] as const;

export const MODELS = MODEL_GROUPS.flatMap((g) => g.models);

export const FILTERS = [
  '⭐ Favourites',
  'Quick (<30min)',
  'Vegetarian',
  'Vegan',
  'High Protein',
  'Comfort Food',
  'Breakfast',
  'Dessert',
] as const;

export const AVAILABLE_TAGS = [
  'Vegetarian', 'Vegan', 'Gluten-Free', 'Dairy-Free',
  'High Protein', 'Low Carb', 'Quick (<30min)', 'Comfort Food',
  'Italian', 'Asian', 'Mexican', 'Mediterranean', 'Indian', 'American',
  'Breakfast', 'Lunch', 'Dinner', 'Dessert', 'Snack', 'Soup',
  'Baking', 'Grilling', 'One-Pot',
] as const;

export const MEAL_TYPES = ['Breakfast', 'Lunch', 'Dinner', 'Snack'] as const;
export const DEFAULT_MEAL_TYPE: typeof MEAL_TYPES[number] = 'Dinner';

export const PAGE_SIZE = 24;

export const LANGUAGES = [
  { code: 'en', label: 'English', flag: '🇬🇧' },
  { code: 'de', label: 'Deutsch', flag: '🇩🇪' },
  { code: 'fr', label: 'Français', flag: '🇫🇷' },
  { code: 'es', label: 'Español', flag: '🇪🇸' },
  { code: 'pl', label: 'Polski', flag: '🇵🇱' },
] as const;

export type LanguageCode = typeof LANGUAGES[number]['code'];

export const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'a-z', label: 'A → Z' },
  { value: 'z-a', label: 'Z → A' },
  { value: 'rating', label: 'Highest rated' },
  { value: 'favourites', label: 'Favourites first' },
] as const;

export type SortOption = typeof SORT_OPTIONS[number]['value'];
