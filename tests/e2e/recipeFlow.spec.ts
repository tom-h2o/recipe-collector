import { test, expect } from '@playwright/test';
import { installMockBackend } from './support/mockBackend';

test.describe('Recipe Vault E2E Flow', () => {
  test.beforeEach(async ({ page }) => {
    await installMockBackend(page);
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
