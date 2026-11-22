/**
 * The tags a recipe can carry, in the groups the vault filters by. The one
 * list: the server's tagging prompt and the AI's allowed answers
 * (api/_lib/prompts.ts, api/_lib/responseSchemas.ts) and the app's filters and
 * tag editor (src/lib/constants.ts, src/lib/tags.ts) all read it from here.
 * There used to be two hand-kept copies, one on each side, with nothing
 * holding them equal.
 *
 * The values are what is stored in recipes.tags, so renaming one orphans it on
 * every recipe that has it: add, do not rename. What a tag is called on
 * screen is tagLabel() in src/lib/tags.ts.
 */

export const TAG_GROUPS = [
  { id: 'diet', label: 'Diet', tags: ['Vegetarian', 'Vegan', 'Gluten-Free', 'Dairy-Free', 'High Protein', 'Low Carb'] },
  { id: 'cuisine', label: 'Cuisine', tags: ['German', 'Italian', 'Mediterranean', 'Asian', 'Indian', 'Mexican', 'American'] },
  { id: 'meal', label: 'Meal', tags: ['Breakfast', 'Lunch', 'Dinner', 'Dessert', 'Snack', 'Soup', 'Salad', 'Pasta', 'Casserole'] },
  { id: 'main', label: 'Main ingredient', tags: ['Chicken', 'Meat', 'Fish & Seafood'] },
  { id: 'more', label: 'More', tags: ['Quick (<30min)', 'One-Pot', 'Baking', 'Grilling', 'Meal Prep', 'Comfort Food'] },
] as const;

export type TagGroupId = typeof TAG_GROUPS[number]['id'];
export type RecipeTag = typeof TAG_GROUPS[number]['tags'][number];

// Typed as plain strings so `AVAILABLE_TAGS.includes(anyString)` checks an answer.
export const AVAILABLE_TAGS: readonly string[] = TAG_GROUPS.flatMap((g) => g.tags);

/** Shown as a chip of its own in the vault, not in the "More" menu. */
export const QUICK_TAG: RecipeTag = 'Quick (<30min)';

/** The group a tag belongs to, or undefined for anything not on the list. */
export function groupOfTag(tag: string): TagGroupId | undefined {
  return TAG_GROUPS.find((g) => (g.tags as readonly string[]).includes(tag))?.id;
}
