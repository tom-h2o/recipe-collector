import { QUICK_TAG } from '../../shared/tags';
import type { AiTask } from '../types';

/**
 * Claude Sonnet 5.5: the main model since migration 0069, and what any task
 * without a model of its own runs on.
 *
 * Claude became the main provider because the app's credit comes with the
 * admin's Claude plan, and because so much of api/_lib/gemini.ts exists to work
 * around Gemini: per-family reasoning settings, aliases that moved without
 * notice, an id Google never served. Gemini stays as the automatic backup
 * (withModelFallback) and for embeddings, which Anthropic does not offer.
 *
 * Must stay equal to DEFAULT_MODEL in api/_lib/supabase.ts; modelDefaults.test.ts
 * asserts that.
 */
export const DEFAULT_MODEL = 'claude-sonnet-5-5';

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
    id: 'claude-haiku-5-5',
    name: 'Claude Haiku',
    badge: 'Fast',
    description: 'Anthropic\'s fast, low-cost model. Plenty for tagging, scaling, shopping lists and suggestions. If it fails, the task runs on Gemini Lite instead.',
    price: '~$0.10 / $0.50 per 1M tokens, paid from the Claude plan\'s monthly API credit',
  },
  {
    id: 'claude-sonnet-5-5',
    name: 'Claude Sonnet',
    badge: 'Recommended',
    description: 'Anthropic\'s everyday model and the main one here. Reads photos, PDFs and messy web pages reliably and translates well. If it fails, the task runs on Gemini Standard instead.',
    price: '~$2 / $10 per 1M tokens, paid from the Claude plan\'s monthly API credit',
  },
  {
    id: 'claude-opus-5-5',
    name: 'Claude Opus',
    badge: 'Strongest',
    description: 'Anthropic\'s most capable model of the three, for handwriting and awkward scans. Slower and twice the price of Sonnet. If it fails, the task runs on Gemini Standard instead.',
    price: '~$4 / $20 per 1M tokens, paid from the Claude plan\'s monthly API credit',
  },
  {
    // Pinned, not an alias. `gemini-flash-lite-latest` is not a model the API
    // serves — it is absent from Google's own model list, which is why every
    // call on this tier failed. The Gemini 4 family (hydrogen, argon, carbon,
    // neon) has no lite member at all: argon is a *reasoning* model, cheaper
    // per turn than carbon but nothing like a flash-lite. The cheapest model
    // Google still serves is this one, and the price below was always its.
    id: 'gemini-3.5-flash-lite',
    name: 'Gemini Lite',
    badge: 'Backup',
    description: 'Google\'s fastest and cheapest model, and the backup for Claude Haiku. Fine for tagging, nutrition and clean recipe pages. Can miss detail in handwriting or multi-page photos.',
    price: '~$0.30 / $2.50 per 1M tokens',
  },
  {
    // Gemini 4 Hydrogen. Pinned rather than an alias: Google shipped Gemini 4
    // under new names and left gemini-flash-latest on the 3.x tier, so an alias
    // does not carry across a generation.
    id: 'gemini-4-hydrogen',
    name: 'Gemini Standard',
    badge: 'Backup',
    description: 'Google\'s current everyday model, and the backup for Claude Sonnet and Opus. Handles photo and multi-page extraction reliably.',
    price: '~$1.50 / $7.50 per 1M tokens',
  },
  {
    id: 'gemini-4-carbon',
    name: 'Gemini Frontier',
    badge: 'Paid plan',
    description: 'Google\'s strongest reasoning model, for messy handwriting and awkward scans. Google gives this model no free allowance at all, so it returns a quota error unless billing is enabled on the API key.',
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
    description: 'Reading a recipe off a web page, a PDF, a screenshot or pasted text. The text is already digital and clean, so Sonnet reads it reliably and quickly.',
    recommended: 'claude-sonnet-5-5',
  },
  {
    task: 'photo',
    label: 'Photographed pages',
    description: 'Reading photos taken with a camera: cookbook pages, handwritten cards, a recipe on the fridge. The hardest reading job here (curved pages, bad light, handwriting), so it runs on Opus. A screenshot is not a photo and counts as recipe extraction.',
    recommended: 'claude-opus-5-5',
  },
  {
    task: 'translate',
    label: 'Translation',
    description: 'Rewriting a recipe in another language. Wrong quantities or mistranslated techniques are hard to notice, so this is worth a stronger model.',
    recommended: 'claude-sonnet-5-5',
  },
  {
    task: 'suggest',
    label: 'Recipe suggestions',
    description: 'Picking recipes that match the ingredients you have. Most of the work is done by the embedding search; the model only ranks the shortlist.',
    recommended: 'claude-haiku-5-5',
  },
  {
    task: 'tag',
    label: 'Tagging',
    description: 'Assigning tags to a recipe whose text is already available. Short, structured, and forgiving of a cheaper model.',
    recommended: 'claude-haiku-5-5',
  },
  {
    task: 'nutrition',
    label: 'Nutrition estimates',
    description: 'Estimating calories and macros from the ingredient list. An approximation either way, but quantities and portion sizes need some judgement, so it runs on Sonnet.',
    recommended: 'claude-sonnet-5-5',
  },
  {
    task: 'scale',
    label: 'Recipe scaling',
    description: 'Adjusting quantities for a different number of servings. Mostly arithmetic with unit conversions.',
    recommended: 'claude-haiku-5-5',
  },
  {
    task: 'shopping',
    label: 'Shopping list',
    description: 'Merging the meal plan into one list and grouping it by aisle. Repetitive and well within a cheap model.',
    recommended: 'claude-haiku-5-5',
  },
];

/** The recommended assignment as a plain map, used by the "use recommended" button. */
export const RECOMMENDED_TASK_MODELS: Record<AiTask, string> = Object.fromEntries(
  AI_TASKS.map((t) => [t.task, t.recommended]),
) as Record<AiTask, string>;

export const MODELS = MODEL_OPTIONS.map((m) => m.id);

/**
 * The vault's direct filter chips: one tap each, independent of one another.
 * Every other tag is chosen from its group's menu (TAG_GROUPS). Favourites and
 * Shared are properties of the row, not tags (applyTagFilter in recipeStore).
 */
/** Filter keys that are not tags: properties of the row (recipeStore's applyTagFilter). */
export const FAVOURITES_FILTER = '⭐ Favourites';
export const SHARED_FILTER = '🔗 Shared';
export { QUICK_TAG };
/** The chips with a place of their own in the vault's filter row, in its order: Shared comes last. */
export const DIRECT_FILTERS = [FAVOURITES_FILTER, QUICK_TAG, SHARED_FILTER] as const;

/** The one tag list, shared with the server's tagging prompt: shared/tags.ts. */
export { AVAILABLE_TAGS, TAG_GROUPS } from '../../shared/tags';

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
