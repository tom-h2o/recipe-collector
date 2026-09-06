import fs from 'node:fs';
import path from 'node:path';
import type { Page } from '@playwright/test';

/**
 * Puts the app into a signed-in state without a real account.
 *
 * Supabase Auth reads its session from localStorage under a key derived from the
 * project ref, and every data call goes through /rest/v1. Seeding that key and
 * intercepting those routes is enough to render the authenticated app against
 * fixture data — no credentials, no network, no test user to maintain.
 */

/**
 * The storage key is derived from the project ref, so it must match whatever
 * VITE_SUPABASE_URL the app was built with. CI sets it in the environment;
 * locally Vite reads .env.local, which takes precedence there.
 */
function resolveSupabaseUrl(): string {
  const envPath = path.resolve(process.cwd(), '.env.local');
  if (fs.existsSync(envPath)) {
    const line = fs.readFileSync(envPath, 'utf8')
      .split('\n')
      .find((l) => l.startsWith('VITE_SUPABASE_URL='));
    if (line) return line.split('=')[1].trim();
  }
  return process.env.VITE_SUPABASE_URL ?? 'https://placeholder.supabase.co';
}

const supabaseUrl = resolveSupabaseUrl();
const projectId = supabaseUrl.match(/https:\/\/([^.]+)\.supabase/)?.[1] ?? 'placeholder';
export const authStorageKey = `sb-${projectId}-auth-token`;

export const MOCK_USER = {
  id: 'mock-user-123',
  email: 'test@example.com',
  user_metadata: {},
  app_metadata: {},
  aud: 'authenticated',
  created_at: new Date().toISOString(),
};

export const MOCK_RECIPES = [
  {
    id: 'recipe-a',
    title: 'Classic Margherita Pizza',
    description: 'Simple and authentic Neapolitan pizza with tomatoes and mozzarella.',
    ingredients: [
      { amount: '300g', name: 'flour', details: 'type 00' },
      { amount: '200g', name: 'mozzarella', details: 'torn' },
      { amount: '1 can', name: 'plum tomatoes', details: 'crushed' },
    ],
    // The duration is load-bearing: cook mode offers a timer chip for it, and
    // "400C" alongside it must NOT become one. a11y.spec.ts matches on the
    // leading sentence only.
    instructions: 'Prepare dough. Add toppings. Bake at 400C for 12 minutes.',
    image_url: '',
    servings: 2,
    tags: ['Baking', 'Vegetarian', 'Italian'],
    is_favourite: true,
    nutrition: { calories: 850, protein_g: 28, carbs_g: 110, fat_g: 30, fiber_g: 4 },
    created_at: new Date().toISOString(),
    preferred_language: 'en',
  },
  {
    id: 'recipe-b',
    title: 'Avocado Toast',
    description: 'Quick toasted bread with smashed avocado.',
    ingredients: [
      { amount: '2 slices', name: 'sourdough bread', details: 'toasted' },
      { amount: '1', name: 'avocado', details: 'ripe' },
    ],
    instructions: 'Toast bread. Smashed avocado. Spread and serve.',
    image_url: '',
    servings: 1,
    tags: ['Quick (<30min)', 'Breakfast', 'Vegan'],
    is_favourite: false,
    nutrition: { calories: 350, protein_g: 8, carbs_g: 40, fat_g: 18, fiber_g: 10 },
    created_at: new Date(Date.now() - 3600000).toISOString(),
    preferred_language: 'en',
  },
];

interface Options {
  /** Log every intercepted call — useful when a spec is not getting the data it expects. */
  verbose?: boolean;
  /** Colour theme to seed before the app boots. */
  theme?: 'light' | 'dark';
}

export async function installMockBackend(page: Page, { verbose = false, theme }: Options = {}) {
  const log = (...args: unknown[]) => { if (verbose) console.log(...args); };

  await page.route('**/auth/v1/**', async (route) => {
    const url = route.request().url();
    log('Auth intercept:', url);
    const body = url.includes('/user')
      ? MOCK_USER
      : { access_token: 'mock-token-123', user: { id: MOCK_USER.id, email: MOCK_USER.email } };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });

  await page.route('**/rest/v1/**', async (route) => {
    const url = route.request().url();
    log('REST intercept:', url);
    const isRecipes = url.includes('/recipes') && !url.includes('recipe_collections');
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(isRecipes ? MOCK_RECIPES : []),
    });
  });

  // The admin panel and the AI endpoints go through the serverless functions,
  // which the Vite dev server does not run.
  await page.route('**/api/**', async (route) => {
    const url = route.request().url();
    log('API intercept:', url);
    let body: unknown = {};
    if (url.includes('tab=overview')) {
      body = { stats: { total_users: 1, total_recipes: MOCK_RECIPES.length, total_ai_calls: 3, calls_today: 1, calls_this_week: 3, model_breakdown: [{ model: 'gemini-3.7-flash', count: 3 }] } };
    } else if (url.includes('tab=users')) {
      body = { users: [{ id: MOCK_USER.id, email: MOCK_USER.email, created_at: MOCK_USER.created_at, last_sign_in_at: null, recipe_count: 2, ai_call_count: 3 }], total: 1 };
    } else if (url.includes('tab=recipes')) {
      body = { recipes: MOCK_RECIPES.map((r) => ({ ...r, user_email: MOCK_USER.email })), total: MOCK_RECIPES.length };
    } else if (url.includes('tab=logs')) {
      body = { logs: [], total: 0 };
    } else if (url.includes('/api/usage')) {
      body = { used: 3, limit: 100, remaining: 97, byEndpoint: {} };
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });

  await page.addInitScript(
    ({ storageKey, user, themeChoice }) => {
      window.localStorage.setItem(
        storageKey,
        JSON.stringify({
          access_token: 'mock-token-123',
          token_type: 'bearer',
          expires_in: 3600,
          refresh_token: 'mock-refresh-token',
          user,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
        }),
      );
      if (themeChoice) window.localStorage.setItem('theme', themeChoice);
    },
    { storageKey: authStorageKey, user: MOCK_USER, themeChoice: theme ?? null },
  );
}
