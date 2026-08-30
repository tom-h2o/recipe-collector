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
 * The models offered in Settings.
 *
 * Deliberately short. The full Gemini catalogue has a dozen text models whose
 * names say nothing about which to pick; three tiers — cheap, balanced,
 * accurate — cover every real decision here.
 *
 * Every id was verified with a live generateContent call. ListModels advertises
 * models that no longer serve requests, which is how a dead one reached this
 * list before (see migration 0044).
 */
export interface ModelOption {
  id: string;
  /** Short tier name shown in the trigger. */
  name: string;
  /** One-word status shown beside the name. */
  badge?: string;
  /** When to pick this one. */
  description: string;
  /** Input / output per 1M tokens. */
  price: string;
}

export const MODEL_OPTIONS: ModelOption[] = [
  {
    id: 'gemini-3.5-flash-lite',
    name: 'Lite',
    badge: 'Cheapest',
    description: 'Fastest and lowest cost. Fine for tagging, nutrition and clean recipe pages. Can miss detail in handwriting or multi-page photos.',
    price: '$0.30 / $2.50 per 1M tokens',
  },
  {
    id: 'gemini-3.7-flash',
    name: 'Flash',
    badge: 'Recommended',
    description: 'Best all-round choice, and the one used by default. Handles photo and multi-page extraction reliably.',
    price: '$0.75 / $3.75 per 1M tokens',
  },
  {
    id: 'gemini-3.1-pro-preview',
    name: 'Pro',
    badge: 'Preview',
    description: 'Most accurate on messy handwriting and awkward scans. Slower, and roughly three times the cost of Flash. Preview models can change or be withdrawn.',
    price: '$2.00 / $12.00 per 1M tokens',
  },
];

export const MODELS = MODEL_OPTIONS.map((m) => m.id);

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
