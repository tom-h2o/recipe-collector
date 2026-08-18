import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

// The Supabase project ID decides the auth storage key the app reads, so it has
// to match whatever VITE_SUPABASE_URL the app was started with. Prefer the
// environment (CI has no .env.local) and fall back to the local env file.
let supabaseUrl = 'https://placeholder.supabase.co';
if (process.env.VITE_SUPABASE_URL) {
  supabaseUrl = process.env.VITE_SUPABASE_URL;
} else {
  try {
    const envPath = path.resolve(process.cwd(), '.env.local');
    if (fs.existsSync(envPath)) {
      const lines = fs.readFileSync(envPath, 'utf8').split('\n');
      const urlLine = lines.find(line => line.startsWith('VITE_SUPABASE_URL='));
      if (urlLine) {
        supabaseUrl = urlLine.split('=')[1].trim();
      }
    }
  } catch {
    // ignore
  }
}

let projectId = 'placeholder';
const match = supabaseUrl.match(/https:\/\/([^.]+)\.supabase/);
if (match && match[1]) {
  projectId = match[1];
}
const authStorageKey = `sb-${projectId}-auth-token`;

test.describe('Recipe Vault E2E Flow', () => {
  test.beforeEach(async ({ page }) => {
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

    // Intercept all Supabase Auth API requests
    await page.route('**/auth/v1/**', async (route) => {
      const url = route.request().url();
      console.log('Playwright Auth Intercept:', url);
      if (url.includes('/user')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: 'mock-user-123',
            email: 'test@example.com',
            user_metadata: {},
            app_metadata: {},
            aud: 'authenticated',
            created_at: new Date().toISOString(),
          }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ access_token: 'mock-token-123', user: { id: 'mock-user-123', email: 'test@example.com' } }),
        });
      }
    });

    // Intercept all Supabase REST API requests under a single robust handler
    await page.route('**/rest/v1/**', async (route) => {
      const url = route.request().url();
      console.log('Playwright REST Intercept:', url);
      if (url.includes('/recipes') && !url.includes('recipe_collections')) {
        console.log('Playwright Fulfilling Mock Recipes Array');
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            {
              id: 'recipe-a',
              title: 'Classic Margherita Pizza',
              description: 'Simple and authentic Neapolitan pizza with tomatoes and mozzarella.',
              ingredients: [
                { amount: '300g', name: 'flour', details: 'type 00' },
                { amount: '200g', name: 'mozzarella', details: 'torn' },
                { amount: '1 can', name: 'plum tomatoes', details: 'crushed' }
              ],
              instructions: 'Prepare dough. Add toppings. Bake at 400C.',
              image_url: '',
              servings: 2,
              tags: ['Baking', 'Vegetarian', 'Italian'],
              is_favourite: true,
              nutrition: { calories: 850, protein_g: 28, carbs_g: 110, fat_g: 30, fiber_g: 4 },
              created_at: new Date().toISOString(),
              preferred_language: 'en'
            },
            {
              id: 'recipe-b',
              title: 'Avocado Toast',
              description: 'Quick toasted bread with smashed avocado.',
              ingredients: [
                { amount: '2 slices', name: 'sourdough bread', details: 'toasted' },
                { amount: '1', name: 'avocado', details: 'ripe' }
              ],
              instructions: 'Toast bread. Smashed avocado. Spread and serve.',
              image_url: '',
              servings: 1,
              tags: ['Quick (<30min)', 'Breakfast', 'Vegan'],
              is_favourite: false,
              nutrition: { calories: 350, protein_g: 8, carbs_g: 40, fat_g: 18, fiber_g: 10 },
              created_at: new Date(Date.now() - 3600000).toISOString(),
              preferred_language: 'en'
            }
          ]),
        });
      } else {
        console.log('Playwright Fulfilling Empty Array []');
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([]),
        });
      }
    });

    // Inject mock session storage item for Supabase Auth to bypass landing login gate
    await page.addInitScript(({ storageKey }) => {
      const mockSession = {
        access_token: 'mock-token-123',
        token_type: 'bearer',
        expires_in: 3600,
        refresh_token: 'mock-refresh-token',
        user: {
          id: 'mock-user-123',
          email: 'test@example.com',
          user_metadata: {},
          app_metadata: {},
          aud: 'authenticated',
          created_at: new Date().toISOString(),
        },
        expires_at: Math.floor(Date.now() / 1000) + 3600
      };
      window.localStorage.setItem(storageKey, JSON.stringify(mockSession));
    }, { storageKey: authStorageKey });
  });

  test('successfully renders main dashboard and lists recipes', async ({ page }) => {
    // Navigate to local server
    await page.goto('/');

    // Assert that we bypassed AuthGate and loaded layout
    await expect(page.locator('header')).toBeVisible();

    // Verify search input focuses and holds placeholder text
    const searchInput = page.locator('input[placeholder*="Search recipes"]');
    await expect(searchInput).toBeVisible();

    // Verify mock recipes from database are listed in cards
    await expect(page.locator('text=Classic Margherita Pizza')).toBeVisible();
    await expect(page.locator('text=Avocado Toast')).toBeVisible();

    // Verify correct servings details are present
    await expect(page.locator('text=Serves 2')).toBeVisible();
    await expect(page.locator('text=Serves 1')).toBeVisible();
  });

  test('verifies that no rendering infinite loops or fetch runaways happen', async ({ page }) => {
    let fetchCounter = 0;
    
    // Monitor all supabase fetch triggers
    await page.on('request', request => {
      if (request.url().includes('supabase.co')) {
        fetchCounter++;
      }
    });

    await page.goto('/');
    await page.waitForTimeout(500); // Wait for page to fully settle

    // An infinite loop would result in endless requests (>50). A healthy boot should require around 15–20 calls.
    expect(fetchCounter).toBeLessThan(25);
  });
});
