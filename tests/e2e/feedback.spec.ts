import { test, expect, type Page } from '@playwright/test';
import { installMockBackend } from './support/mockBackend';

/**
 * Feedback from inside the app: "Send feedback" in the account menu writes a
 * report (kind, text, and the context the form shows before sending), and the
 * admin reads it under Admin → Feedback and sets its status.
 */
interface Sent { kind: string; message: string; context: Record<string, unknown> }

async function openForm(page: Page, width = 390) {
  await page.setViewportSize({ width, height: 844 });
  await installMockBackend(page);
  const sent: Sent[] = [];
  let refuse = false;
  await page.route('**/rest/v1/feedback*', async (route) => {
    if (route.request().method() !== 'POST') return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    if (refuse) return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ code: '08006', message: 'connection failure' }) });
    sent.push(route.request().postDataJSON() as Sent);
    return route.fulfill({ status: 201, contentType: 'application/json', body: '' });
  });
  await page.goto('/');
  await expect(page.locator('.recipe-card').first()).toBeVisible();
  await page.getByRole('button', { name: /^Account menu/ }).click();
  await page.getByRole('button', { name: 'Send feedback' }).click();
  const form = page.getByRole('dialog', { name: 'Send feedback' });
  await expect(form).toBeVisible();
  return { form, sent, refuseNext: (value: boolean) => { refuse = value; } };
}

test('a report is sent with its kind, its text and the context shown in the form', async ({ page }) => {
  const { form, sent } = await openForm(page);

  // Nothing to send yet.
  await expect(form.getByRole('button', { name: 'Send', exact: true })).toBeDisabled();

  await form.getByRole('radio', { name: 'An idea' }).click();
  await form.getByLabel('Your message').fill('A timer that rings twice.');
  await form.getByText('Sent along with it').click();
  await expect(form.getByText('App version')).toBeVisible();
  await expect(form.getByText('None of your recipes are attached.')).toBeVisible();

  await form.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(form).toHaveCount(0);
  await expect(page.getByText('Thank you! Your feedback was sent.')).toBeVisible();

  expect(sent).toHaveLength(1);
  expect(sent[0]).toMatchObject({ kind: 'idea', message: 'A timer that rings twice.' });
  expect(sent[0].context).toMatchObject({ view: 'vault', path: '/', screen: '390×844' });
  // Only what a person may write: the database sets whose it is and its status.
  expect(Object.keys(sent[0]).sort()).toEqual(['context', 'kind', 'message']);
});

test('a failure is said in the form and the text is kept', async ({ page }) => {
  const { form, sent, refuseNext } = await openForm(page);
  refuseNext(true);
  await form.getByLabel(/What happened/).fill('The list is empty after a search.');
  await form.getByRole('button', { name: 'Send', exact: true }).click();

  await expect(form.getByRole('alert')).toContainText('could not be sent');
  await expect(form.getByRole('alert')).not.toContainText('connection failure');
  await expect(form.getByLabel(/What happened/)).toHaveValue('The list is empty after a search.');

  refuseNext(false);
  await form.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(form).toHaveCount(0);
  expect(sent).toHaveLength(1);
});

test('the form fits a 360 px phone and Escape closes only it', async ({ page }) => {
  const { form } = await openForm(page, 360);
  // Measured once the dialog has finished opening (see adminRecipes.spec.ts).
  await page.evaluate(() =>
    Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))).then(() => undefined));
  const box = await form.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(360);
  await page.keyboard.press('Escape');
  await expect(form).toHaveCount(0);
  await expect(page.locator('.recipe-card').first()).toBeVisible();
});

test('the admin reads reports and marks one as done', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installMockBackend(page);
  const rows = [
    { id: '11111111-1111-4111-8111-111111111111', created_at: '2026-11-27T10:00:00Z', user_id: 'u1', user_email: 'ann@example.com', kind: 'bug', message: 'The timer stops when the phone locks.', context: { build: 'abc123', view: 'vault', screen: '390×844' }, status: 'new' },
    { id: '22222222-2222-4222-8222-222222222222', created_at: '2026-11-26T09:00:00Z', user_id: 'u2', user_email: 'bob@example.com', kind: 'idea', message: 'Sort by cooking time.', context: {}, status: 'seen' },
  ];
  const updates: unknown[] = [];
  await page.route('**/api/account?tab=overview*', (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ stats: { total_users: 2, total_recipes: 2, total_ai_calls: 3, calls_today: 1, calls_this_week: 3, model_breakdown: [], new_feedback: 1 } }),
  }));
  await page.route('**/api/account?tab=feedback*', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ feedback: rows, total: rows.length }),
  }));
  await page.route('**/api/account?action=feedback-status', (route) => {
    updates.push(route.request().postDataJSON());
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Admin' }).last().click();
  const tab = page.getByRole('tab', { name: /Feedback/ });
  // One report nobody has looked at.
  await expect(tab).toContainText('1');
  await tab.click();

  const first = page.getByRole('listitem').filter({ hasText: 'The timer stops' });
  await expect(first).toContainText('ann@example.com');
  await expect(first.getByRole('button', { name: 'New' })).toHaveAttribute('aria-pressed', 'true');
  await first.getByText('Context').click();
  await expect(first.getByText('abc123')).toBeVisible();

  await first.getByRole('button', { name: 'Done' }).click();
  await expect(first.getByRole('button', { name: 'Done' })).toHaveAttribute('aria-pressed', 'true');
  // The button changes at once and the save follows it, so wait for the
  // request rather than reading the list the moment the button has changed.
  await expect.poll(() => updates).toEqual([{ id: rows[0].id, status: 'done' }]);
  // The badge follows: nothing new is left.
  await expect(tab).not.toContainText('1');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
