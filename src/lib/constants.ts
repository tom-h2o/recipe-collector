import type { AiTask } from '../types';

/**
 * Newest stable Flash, addressed through Google's alias rather than a pinned id.
 *
 * The alias moves on its own when Google promotes a new release, so the app does
 * not need a code change every few months. That would be unsafe if we could not
 * tell what actually ran — but every generateContent response carries
 * `modelVersion`, and gemini.ts records it on each log row, so the concrete model
 * behind an alias is always visible after the fact.
 *
 * Must stay equal to DEFAULT_MODEL in api/_lib/supabase.ts; modelDefaults.test.ts
 * asserts that.
 */
export const DEFAULT_MODEL = 'gemini-flash-latest';

/**
 * The models offered in Settings.
 *
 * Deliberately short. The full Gemini catalogue has a dozen text models whose
 * names say nothing about which to pick; three tiers — cheap, balanced,
 * accurate — cover every real decision here.
 *
 * Each id is an alias that Google points at the current release in that tier, so
 * this list does not go stale. Aliases still have to be verified with a live
 * generateContent call before shipping: ListModels advertises models that no
 * longer serve requests, which is how a dead one reached this list before (see
 * migration 0044).
 *
 * `price` is the tier's pricing at the time of writing. An alias moving to a new
 * release can change it, which is why the UI labels it as approximate.
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
    id: 'gemini-flash-lite-latest',
    name: 'Lite',
    badge: 'Cheapest',
    description: 'Fastest and lowest cost. Fine for tagging, nutrition and clean recipe pages. Can miss detail in handwriting or multi-page photos.',
    price: '~$0.30 / $2.50 per 1M tokens',
  },
  {
    id: 'gemini-flash-latest',
    name: 'Flash',
    badge: 'Recommended',
    description: 'Best all-round choice, and the one used by default. Handles photo and multi-page extraction reliably.',
    price: '~$0.75 / $3.75 per 1M tokens',
  },
  {
    id: 'gemini-pro-latest',
    name: 'Pro',
    badge: 'Most accurate',
    description: 'Most accurate on messy handwriting and awkward scans. Slower, and roughly three times the cost of Flash. This tier currently resolves to a preview release, which can change or be withdrawn.',
    price: '~$2.00 / $12.00 per 1M tokens',
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
    description: 'Reading a recipe off a web page, a PDF or photographed pages. The hardest job in the app and the one where a weaker model visibly loses ingredients.',
    recommended: 'gemini-flash-latest',
  },
  {
    task: 'translate',
    label: 'Translation',
    description: 'Rewriting a recipe in another language. Wrong quantities or mistranslated techniques are hard to notice, so this is worth spending on.',
    recommended: 'gemini-flash-latest',
  },
  {
    task: 'suggest',
    label: 'Recipe suggestions',
    description: 'Picking recipes that match the ingredients you have. Most of the work is done by the embedding search; the model only ranks the shortlist.',
    recommended: 'gemini-flash-lite-latest',
  },
  {
    task: 'tag',
    label: 'Tagging',
    description: 'Assigning tags to a recipe whose text is already available. Short, structured, and forgiving of a cheaper model.',
    recommended: 'gemini-flash-lite-latest',
  },
  {
    task: 'nutrition',
    label: 'Nutrition estimates',
    description: 'Estimating calories and macros from the ingredient list. Already an approximation, so a cheaper model changes little.',
    recommended: 'gemini-flash-lite-latest',
  },
  {
    task: 'scale',
    label: 'Recipe scaling',
    description: 'Adjusting quantities for a different number of servings. Mostly arithmetic with unit conversions.',
    recommended: 'gemini-flash-lite-latest',
  },
  {
    task: 'shopping',
    label: 'Shopping list',
    description: 'Merging the meal plan into one list and grouping it by aisle. Repetitive and well within a cheap model.',
    recommended: 'gemini-flash-lite-latest',
  },
];

/** The recommended assignment as a plain map, used by the "use recommended" button. */
export const RECOMMENDED_TASK_MODELS: Record<AiTask, string> = Object.fromEntries(
  AI_TASKS.map((t) => [t.task, t.recommended]),
) as Record<AiTask, string>;

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
