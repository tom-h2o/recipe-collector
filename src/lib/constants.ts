import type { AiTask } from '../types';

/**
 * Gemini 4 Hydrogen: Google's everyday model in the generation that replaced 3.x.
 *
 * A pinned id, not an alias, and that is a deliberate partial reversal of the
 * policy set in PR #23. Aliases track releases *within* a tier — they did move
 * gemini-flash-latest from 3.7 to 3.8 without a code change — but Google shipped
 * Gemini 4 under entirely new names (hydrogen, carbon, argon) and left
 * gemini-flash-latest pointed at the 3.x Flash tier. So an alias does not carry
 * you across a generation, which is what that PR claimed it would.
 *
 * Verified against generateContent, which is the only test that counts here:
 * gemini-4-hydrogen answers 200 while the whole 3.x Flash tier — the alias and
 * gemini-3.8-flash directly — was returning 503 and timing out.
 *
 * Must stay equal to DEFAULT_MODEL in api/_lib/supabase.ts; modelDefaults.test.ts
 * asserts that.
 */
export const DEFAULT_MODEL = 'gemini-4-hydrogen';

/**
 * The models offered in Settings.
 *
 * Three tiers — cheap, everyday, frontier — because the full catalogue is dozens
 * of ids whose names say nothing about which to pick.
 *
 * Each id is verified against generateContent before shipping. ListModels
 * advertises models that no longer serve requests, which is how a dead one
 * reached this list once before (see migration 0044), and it also advertises
 * models your billing plan cannot call at all (see the Frontier tier below).
 */
export interface ModelOption {
  id: string;
  /** Short tier name shown in the trigger. */
  name: string;
  /** One-word status shown beside the name. */
  badge?: string;
  /** When to pick this one. */
  description: string;
  /** Input / output per 1M tokens, approximate. */
  price: string;
}

export const MODEL_OPTIONS: ModelOption[] = [
  {
    // Pinned, not an alias. `gemini-flash-lite-latest` is not a model the API
    // serves — it is absent from Google's own model list, which is why every
    // call on this tier failed. The Gemini 4 family (hydrogen, argon, carbon,
    // neon) has no lite member at all: argon is a *reasoning* model, cheaper
    // per turn than carbon but nothing like a flash-lite. The cheapest model
    // Google still serves is this one, and the price below was always its.
    id: 'gemini-3.5-flash-lite',
    name: 'Lite',
    badge: 'Cheapest',
    description: 'Fastest and lowest cost. Fine for tagging, nutrition and clean recipe pages. Can miss detail in handwriting or multi-page photos.',
    price: '~$0.30 / $2.50 per 1M tokens',
  },
  {
    id: 'gemini-4-hydrogen',
    name: 'Standard',
    badge: 'Recommended',
    description: 'Google\'s current everyday model and the one used by default. Handles photo and multi-page extraction reliably.',
    price: '~$1.50 / $7.50 per 1M tokens',
  },
  {
    id: 'gemini-4-carbon',
    name: 'Frontier',
    badge: 'Paid plan',
    description: 'Strongest reasoning, for messy handwriting and awkward scans. Google gives this model no free allowance at all, so it returns a quota error unless billing is enabled on the API key.',
    price: '~$2.00 / $10.00 per 1M tokens, rising to ~$4.00 / $20.00 after 30 Nov 2026',
  },
];

/**
 * The AI jobs the app runs, each independently assignable to a model.
 *
 * They differ enormously in difficulty: reading a photographed cookbook page is
 * OCR under bad lighting, while tagging a recipe whose text we already have is
 * near-trivial. Running both on the same model means either overpaying for the
 * easy ones or losing extractions on the hard ones, so each picks its own.
 *
 * `recommended` is the tier this task is expected to need. It is a starting
 * point offered by a "use recommended" button, never enforced.
 */
export interface AiTaskInfo {
  task: AiTask;
  label: string;
  description: string;
  recommended: string;
}

export const AI_TASKS: AiTaskInfo[] = [
  {
    task: 'extract',
    label: 'Recipe extraction',
    description: 'Reading a recipe off a web page, a PDF or photographed pages. Lite handles a normal web page perfectly well and is far quicker; move this to Standard if you mostly extract from photos or handwriting.',
    recommended: 'gemini-3.5-flash-lite',
  },
  {
    task: 'translate',
    label: 'Translation',
    description: 'Rewriting a recipe in another language. Wrong quantities or mistranslated techniques are hard to notice, so this is the one task worth spending on by default.',
    recommended: 'gemini-4-hydrogen',
  },
  {
    task: 'suggest',
    label: 'Recipe suggestions',
    description: 'Picking recipes that match the ingredients you have. Most of the work is done by the embedding search; the model only ranks the shortlist.',
    recommended: 'gemini-3.5-flash-lite',
  },
  {
    task: 'tag',
    label: 'Tagging',
    description: 'Assigning tags to a recipe whose text is already available. Short, structured, and forgiving of a cheaper model.',
    recommended: 'gemini-3.5-flash-lite',
  },
  {
    task: 'nutrition',
    label: 'Nutrition estimates',
    description: 'Estimating calories and macros from the ingredient list. Already an approximation, so a cheaper model changes little.',
    recommended: 'gemini-3.5-flash-lite',
  },
  {
    task: 'scale',
    label: 'Recipe scaling',
    description: 'Adjusting quantities for a different number of servings. Mostly arithmetic with unit conversions.',
    recommended: 'gemini-3.5-flash-lite',
  },
  {
    task: 'shopping',
    label: 'Shopping list',
    description: 'Merging the meal plan into one list and grouping it by aisle. Repetitive and well within a cheap model.',
    recommended: 'gemini-3.5-flash-lite',
  },
];

/** The recommended assignment as a plain map, used by the "use recommended" button. */
export const RECOMMENDED_TASK_MODELS: Record<AiTask, string> = Object.fromEntries(
  AI_TASKS.map((t) => [t.task, t.recommended]),
) as Record<AiTask, string>;

export const MODELS = MODEL_OPTIONS.map((m) => m.id);

export const FILTERS = [
  '⭐ Favourites',
  '🔗 Shared',
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

/**
 * `label` is the language's own name for itself and is what a language picker
 * shows: someone looking for German looks for "Deutsch". `name` is the English
 * name, for use inside an English sentence. The interface is English, and
 * "Delete Deutsch translation" mixed the two.
 */
export const LANGUAGES = [
  { code: 'en', label: 'English', name: 'English', flag: '🇬🇧' },
  { code: 'de', label: 'Deutsch', name: 'German', flag: '🇩🇪' },
  { code: 'fr', label: 'Français', name: 'French', flag: '🇫🇷' },
  { code: 'es', label: 'Español', name: 'Spanish', flag: '🇪🇸' },
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
