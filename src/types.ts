export interface Nutrition {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
}

export interface Ingredient {
  amount: string;
  name: string;
  details?: string;
}

export interface Recipe {
  id: string;
  title: string;
  description: string;
  ingredients: Ingredient[] | string[];
  instructions: string;
  image_url: string;
  servings: number | null;
  created_at: string;
  tags: string[];
  is_favourite: boolean;
  nutrition: Nutrition | null;
  rating: number | null;
  notes: string | null;
  prep_time_mins: number | null;
  cook_time_mins: number | null;
  source_url: string | null;
  source_name: string | null;
  original_servings?: number | null;
  original_language?: string | null;
  preferred_language?: string | null;
  /** Set when this recipe was adopted from a linked account's copy. */
  copied_from_recipe_id?: string | null;
  user_id?: string | null;
  /**
   * Random token behind the public share link, or null/undefined when the
   * recipe is not shared. Never sent to a public viewer: the share page reads
   * through the get_shared_recipe RPC, which does not return this column.
   */
  public_share_token?: string | null;
}

export interface RecipeTranslation {
  id?: string;
  recipe_id: string;
  language_code: string;
  title: string;
  description: string | null;
  instructions: string;
  ingredients: Ingredient[];
  created_at?: string;
  cached?: boolean;
}

export interface MealPlan {
  id: string;
  date: string;
  recipe_id: string;
  meal_type: string;
  recipe?: Recipe;
  /** Portions to cook for this meal; null or absent: the recipe's own (migration 0079). */
  servings?: number | null;
  /** False: planned, but left off the shopping list. */
  in_shopping?: boolean;
  user_id?: string;
}

export interface ShoppingItem {
  id: string;
  item: string;
  category: string | null;
  is_checked: boolean;
  /** Made by "Generate" from the meal plan (migration 0077); false or absent: added by the person. */
  from_plan?: boolean;
}

export interface PantryItem {
  id: string;
  item: string;
  category: string | null;
  created_at: string;
}

/** Where a gallery image came from, shown as a badge. */
export type RecipeImageSource = 'upload' | 'website' | 'stock';

export interface RecipeImage {
  id: string;
  recipe_id: string;
  user_id: string;
  url: string;
  /** Set for files in the recipe-images bucket, null for external URLs. */
  storage_path: string | null;
  source: RecipeImageSource;
  sort_order: number;
  created_at: string;
}

/**
 * A standing, mutual link between two accounts. Either side sees the other's
 * recipes read-only; writes stay owner-only, enforced by RLS rather than the UI.
 */
export interface AccountLink {
  id: string;
  requester_id: string;
  requester_email: string;
  addressee_email: string;
  addressee_id: string | null;
  status: 'pending' | 'accepted';
  /** What the requester calls the addressee. */
  requester_label: string | null;
  /** What the addressee calls the requester. */
  addressee_label: string | null;
  created_at: string;
  accepted_at: string | null;
}

/** One link seen from the current user's side, with the other party resolved. */
export interface LinkedPerson {
  linkId: string;
  userId: string | null;
  email: string;
  /** Nickname if set, otherwise the email. */
  label: string;
  status: 'pending' | 'accepted';
  /** True when the current user received the invitation rather than sending it. */
  incoming: boolean;
  /** Which label column on the row belongs to the viewer. */
  myLabelColumn: 'requester_label' | 'addressee_label';
}

/**
 * The AI jobs the app runs. Each can be pointed at its own model — they differ
 * enormously in difficulty, so one setting for all of them means either
 * overpaying for the easy ones or losing quality on the hard ones.
 */
export type AiTask = 'extract' | 'photo' | 'tag' | 'nutrition' | 'translate' | 'suggest' | 'scale' | 'shopping';

export interface AppSettings {
  /** The model used by any task without its own entry in `task_models`. */
  gemini_model: string;
  /**
   * Per-task model overrides, keyed by AiTask. Sparse on purpose: a task with no
   * entry falls back to `gemini_model`, so an existing row keeps working
   * unchanged and a user who never opens this section sees no behaviour change.
   */
  task_models: Partial<Record<AiTask, string>>;
  temperature_unit: 'C' | 'F';
}

export type ActiveView = 'vault' | 'planner' | 'shopping' | 'inbox' | 'public_recipe' | 'admin';

export interface AdminUser {
  id: string;
  email: string;
  created_at: string;
  last_sign_in_at: string | null;
  recipe_count: number;
  ai_call_count: number;
}

export interface AdminStats {
  total_users: number;
  total_recipes: number;
  total_ai_calls: number;
  calls_today: number;
  calls_this_week: number;
  model_breakdown: { model: string; count: number }[];
  /** Reports nobody has looked at yet (Admin → Feedback). */
  new_feedback?: number;
}

export type FeedbackKind = 'bug' | 'idea' | 'other';
export type FeedbackStatus = 'new' | 'seen' | 'done';

/** What the app adds to a report, shown to the person before it is sent. */
export interface FeedbackContext {
  build?: string;
  view?: string;
  path?: string;
  screen?: string;
  installed?: boolean;
  theme?: string;
  language?: string;
  userAgent?: string;
  /** Sentry's id for the last error reported from this page, if any. */
  lastErrorId?: string;
  /** The message of the error the report was sent from (the failure screen). */
  error?: string;
}

/** GET /api/account?tab=feedback — one report as the admin sees it. */
export interface AdminFeedbackRow {
  id: string;
  created_at: string;
  user_id: string;
  user_email: string | null;
  kind: FeedbackKind;
  message: string;
  context: FeedbackContext;
  status: FeedbackStatus;
}

/** GET /api/account?tab=usage — admin_usage() (migration 0075). */
export interface AdminUsage {
  days: number;
  first_day: string;
  today: string;
  /** The first day app opens were recorded; null until anyone has opened the app since 0075. */
  tracking_since: string | null;
  totals: {
    active_people: number;
    recipes_added: number;
    ai_calls: number;
    iphone_imports: number;
    shares_sent: number;
    connections_made: number;
  };
  /** Eight Monday-to-Sunday weeks, oldest first, the current one last. */
  weeks: { week_start: string; active_people: number; recipes_added: number }[];
  /** gemini_logs endpoints in the period (at most the 30 days the log keeps). */
  features: { endpoint: string; calls: number; people: number; failed: number }[];
  imports: { source: string; count: number; failed: number }[];
  people: {
    id: string;
    email: string | null;
    created_at: string;
    last_sign_in_at: string | null;
    last_active: string | null;
    active_days: number;
    recipes_total: number;
    recipes_added: number;
    ai_calls: number;
  }[];
}

export interface AdminRecipe {
  id: string;
  title: string;
  description: string | null;
  image_url: string | null;
  tags: string[] | null;
  created_at: string;
  user_id: string | null;
  user_email: string | null;
  is_favourite: boolean;
  servings: number | null;
  prep_time_mins: number | null;
  cook_time_mins: number | null;
}

export interface AdminLog {
  id: string;
  created_at: string;
  endpoint: string;
  model: string;
  /** The concrete model that ran, when `model` was a -latest alias. */
  model_version?: string | null;
  status: string;
  latency_ms: number | null;
  user_id: string | null;
  user_email?: string | null;
  /** Whether the call ran with reasoning (migration 0067); null before that. */
  thinking?: ThinkingState | null;
}

/**
 * How much one AI call reasoned, from gemini_logs.thinking. Mirrors
 * ThinkingState in api/_lib/gemini.ts: 'off' (Gemini 2.5 only), 'minimal' or
 * 'low' (the lowest a Gemini 3 or 4 model offers), 'refused' (every lower
 * setting was refused, so it ran at the default), 'on' (the default, asked for).
 */
export type ThinkingState = 'on' | 'off' | 'minimal' | 'low' | 'refused';

export interface Collection {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
}

export interface RecipeCollection {
  collection_id: string;
  recipe_id: string;
}

export interface RecipeShare {
  id: string;
  recipe_id: string;
  recipe_title: string;
  recipe_description: string | null;
  recipe_image_url: string | null;
  sender_id: string;
  sender_email: string;
  recipient_email: string;
  status: 'pending' | 'accepted' | 'rejected';
  created_at: string;
}

export interface Contact {
  id: string;
  user_id: string;
  contact_email: string;
  created_at: string;
}
