import { test, expect, type Page } from '@playwright/test';
import { MOCK_USER, authStorageKey, installMockBackend } from './support/mockBackend';

/**
 * Signing in, signing up and getting back into an account (AuthGate, useAuth).
 *
 * Every other spec starts with a session already in localStorage, so until
 * this file nothing tested the way in at all. Supabase Auth is answered here
 * the way GoTrue answers it (same paths, same bodies, errors as
 * `{ code, error_code, msg }`), so the real supabase-js client in the app does
 * the work: what is asserted is what a person sees, and what was sent.
 *
 * Errors must appear in the form they belong to, never only as a toast
 * (CLAUDE.md, AuthGate). The recovery link must open "Set New Password", not
 * the vault: useAuth deliberately does not clear recovery mode on the
 * SIGNED_IN that follows PASSWORD_RECOVERY.
 */

const EMAIL = 'cook@example.com';
const PASSWORD = 'correct horse battery';

interface AuthCall {
  method: string;
  path: string;
  query: URLSearchParams;
  body: Record<string, unknown> | null;
}

interface Behaviour {
  /** What a password sign-in answers. */
  signIn?: 'ok' | 'wrong-password' | 'unconfirmed';
  /** Whether sign-up needs the emailed link first (the project's setting). */
  signUpNeedsConfirmation?: boolean;
  /** What a password update answers. */
  updatePassword?: 'ok' | 'same-password';
}

const sessionFor = (accessToken: string) => ({
  access_token: accessToken,
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  refresh_token: `${accessToken}-refresh`,
  user: { ...MOCK_USER, email: EMAIL },
});

const gotrueError = (status: number, errorCode: string, msg: string) =>
  ({ status, contentType: 'application/json', body: JSON.stringify({ code: status, error_code: errorCode, msg }) });

/** Opens the app signed out, with Supabase Auth answering as `behaviour` says. */
async function signedOut(page: Page, behaviour: Behaviour = {}, startAt = '/') {
  await installMockBackend(page, { signedIn: false, email: EMAIL });
  const calls: AuthCall[] = [];
  // Registered after installMockBackend, so it answers first.
  await page.route('**/auth/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/^.*\/auth\/v1/, '');
    const body = request.postData() ? JSON.parse(request.postData()!) as Record<string, unknown> : null;
    calls.push({ method: request.method(), path, query: url.searchParams, body });
    const json = (value: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(value) });

    if (path === '/token' && url.searchParams.get('grant_type') === 'password') {
      const outcome = behaviour.signIn ?? 'ok';
      if (outcome === 'wrong-password') return route.fulfill(gotrueError(400, 'invalid_credentials', 'Invalid login credentials'));
      if (outcome === 'unconfirmed') return route.fulfill(gotrueError(400, 'email_not_confirmed', 'Email not confirmed'));
      return json(sessionFor('password-token'));
    }
    if (path === '/signup') {
      // With confirmation on, GoTrue answers with the user and no session.
      return behaviour.signUpNeedsConfirmation === false
        ? json(sessionFor('signup-token'))
        : json({ ...MOCK_USER, email: EMAIL, confirmation_sent_at: new Date().toISOString() });
    }
    if (path === '/user' && request.method() === 'PUT') {
      if (behaviour.updatePassword === 'same-password') {
        return route.fulfill(gotrueError(422, 'same_password', 'New password should be different from the old password.'));
      }
      return json({ ...MOCK_USER, email: EMAIL });
    }
    if (path === '/user') return json({ ...MOCK_USER, email: EMAIL });
    if (path === '/logout') return route.fulfill({ status: 204 });
    // otp (magic link), recover (password reset), resend: GoTrue answers {}.
    return json({});
  });
  await page.goto(startAt);
  return calls;
}

const vault = (page: Page) => page.getByText('Classic Margherita Pizza');
const signInScreen = (page: Page) => page.getByText('Sign in to access your recipes');

test.describe('signing in with a password', () => {
  test('opens the vault, with the email and password sent as typed', async ({ page }) => {
    const calls = await signedOut(page);
    await expect(signInScreen(page)).toBeVisible();
    await page.getByLabel('Email address').fill(EMAIL);
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();

    await expect(vault(page)).toBeVisible();
    const signIn = calls.find((c) => c.path === '/token');
    expect(signIn?.query.get('grant_type')).toBe('password');
    expect(signIn?.body).toMatchObject({ email: EMAIL, password: PASSWORD });
    // The session is kept, so a reload stays signed in.
    expect(await page.evaluate((key) => window.localStorage.getItem(key), authStorageKey)).toContain('password-token');
  });

  test('a wrong password is said in the form, with the way to reset it', async ({ page }) => {
    await signedOut(page, { signIn: 'wrong-password' });
    await page.getByLabel('Email address').fill(EMAIL);
    await page.getByLabel('Password', { exact: true }).fill('not it');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();

    const alert = page.getByRole('alert').filter({ hasText: 'Invalid login credentials' });
    await expect(alert).toBeVisible();
    await expect(vault(page)).toHaveCount(0);
    // Inline, not a toast that disappears while it is being read.
    await expect(page.locator('[data-sonner-toast]')).toHaveCount(0);

    await alert.getByRole('button', { name: /Reset password/ }).click();
    await expect(page.getByLabel('Email address')).toHaveValue(EMAIL);
    await expect(page.getByRole('button', { name: 'Send reset link' })).toBeVisible();
  });

  test('typing again clears the error', async ({ page }) => {
    await signedOut(page, { signIn: 'wrong-password' });
    await page.getByLabel('Email address').fill(EMAIL);
    await page.getByLabel('Password', { exact: true }).fill('not it');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await expect(page.getByRole('alert')).toHaveCount(0);
  });

  test('an unconfirmed account is told to confirm, and can have the email sent again', async ({ page }) => {
    const calls = await signedOut(page, { signIn: 'unconfirmed' });
    await page.getByLabel('Email address').fill(EMAIL);
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();

    await expect(page.getByText('Check your inbox')).toBeVisible();
    await expect(page.getByText(`We sent a confirmation link to ${EMAIL}`)).toBeVisible();
    // Not shown as a failed sign-in.
    await expect(page.getByRole('alert')).toHaveCount(0);

    await page.getByRole('button', { name: 'Resend confirmation email' }).click();
    await expect.poll(() => calls.find((c) => c.path === '/resend')?.body).toMatchObject({ type: 'signup', email: EMAIL });
  });
});

test.describe('creating an account', () => {
  test('with confirmation on: asks to check the inbox, and links back to the app', async ({ page }) => {
    const calls = await signedOut(page, { signUpNeedsConfirmation: true });
    await page.getByRole('button', { name: "Don't have an account? Sign up" }).click();
    await page.getByLabel('Email address').fill(EMAIL);
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Create account' }).click();

    await expect(page.getByText(`We sent a confirmation link to ${EMAIL}`)).toBeVisible();
    await expect(vault(page)).toHaveCount(0);
    const signUp = calls.find((c) => c.path === '/signup');
    expect(signUp?.body).toMatchObject({ email: EMAIL, password: PASSWORD });
    // The link in the email has to come back to this app, not Supabase's default.
    expect(signUp?.query.get('redirect_to')).toBe(new URL(page.url()).origin);
    // Back on the sign-in form, ready for after the link.
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  });

  test('with confirmation off: goes straight into the vault', async ({ page }) => {
    await signedOut(page, { signUpNeedsConfirmation: false });
    await page.getByRole('button', { name: "Don't have an account? Sign up" }).click();
    await page.getByLabel('Email address').fill(EMAIL);
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(vault(page)).toBeVisible();
  });

  test('a password under 8 characters is not sent', async ({ page }) => {
    const calls = await signedOut(page);
    await page.getByRole('button', { name: "Don't have an account? Sign up" }).click();
    await page.getByLabel('Email address').fill(EMAIL);
    await page.getByLabel('Password', { exact: true }).fill('short');
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByLabel('Password', { exact: true })).toHaveJSProperty('validity.tooShort', true);
    expect(calls.some((c) => c.path === '/signup')).toBe(false);
  });
});

test('a magic link is sent to the address given, pointing back to the app', async ({ page }) => {
  const calls = await signedOut(page);
  await page.getByRole('button', { name: 'Magic Link' }).click();
  await page.getByLabel('Email address').fill(EMAIL);
  await page.getByRole('button', { name: 'Send Magic Link' }).click();

  await expect(page.getByText(`We sent a magic link to ${EMAIL}`)).toBeVisible();
  const otp = calls.find((c) => c.path === '/otp');
  expect(otp?.body).toMatchObject({ email: EMAIL });
  expect(otp?.query.get('redirect_to')).toBe(new URL(page.url()).origin);

  await page.getByRole('button', { name: 'Use a different email' }).click();
  await expect(page.getByRole('button', { name: 'Send Magic Link' })).toBeVisible();
});

test.describe('a forgotten password', () => {
  test('sends a reset link to the address given', async ({ page }) => {
    const calls = await signedOut(page);
    await page.getByRole('button', { name: 'Forgot password?' }).click();
    await page.getByLabel('Email address').fill(EMAIL);
    await page.getByRole('button', { name: 'Send reset link' }).click();

    await expect(page.getByText(`We sent a password reset link to ${EMAIL}`)).toBeVisible();
    const recover = calls.find((c) => c.path === '/recover');
    expect(recover?.body).toMatchObject({ email: EMAIL });
    expect(recover?.query.get('redirect_to')).toBe(new URL(page.url()).origin);
  });

  test("the link from the email opens 'Set New Password', not the vault, and the new one is saved", async ({ page }) => {
    // What the email links to: the app, with the recovery session in the hash.
    const calls = await signedOut(page, {}, '/#access_token=recovery-token&expires_in=3600&refresh_token=recovery-refresh&token_type=bearer&type=recovery');

    await expect(page.getByRole('heading', { name: 'Set New Password' })).toBeVisible();
    await expect(vault(page)).toHaveCount(0);

    await page.getByLabel('New password').fill('a new long password');
    await page.getByRole('button', { name: 'Set new password' }).click();

    await expect(vault(page)).toBeVisible();
    const update = calls.find((c) => c.path === '/user' && c.method === 'PUT');
    expect(update?.body).toMatchObject({ password: 'a new long password' });
  });

  test('a refused new password is said in the form, and the form stays', async ({ page }) => {
    await signedOut(page, { updatePassword: 'same-password' }, '/#access_token=recovery-token&expires_in=3600&refresh_token=recovery-refresh&token_type=bearer&type=recovery');
    await page.getByLabel('New password').fill('the old password');
    await page.getByRole('button', { name: 'Set new password' }).click();

    await expect(page.getByRole('alert')).toContainText('New password should be different');
    await expect(page.getByRole('heading', { name: 'Set New Password' })).toBeVisible();
    await expect(vault(page)).toHaveCount(0);
  });
});

test('signing out ends the session and returns to the sign-in screen', async ({ page }) => {
  await installMockBackend(page);
  let loggedOut = false;
  await page.route('**/auth/v1/logout**', (route) => { loggedOut = true; return route.fulfill({ status: 204 }); });
  await page.goto('/');
  await expect(vault(page)).toBeVisible();

  await page.getByRole('button', { name: /^Account menu/ }).click();
  await page.getByRole('button', { name: 'Sign out' }).click();

  await expect(signInScreen(page)).toBeVisible();
  expect(loggedOut).toBe(true);
  expect(await page.evaluate((key) => window.localStorage.getItem(key), authStorageKey)).toBeNull();
});

test.describe('recipes from before accounts existed', () => {
  /** Answers the head-count for unowned recipes with `count`, and records every update. */
  async function withUnowned(page: Page, count: number) {
    await installMockBackend(page);
    const updates: { table: string; filter: string; body: unknown }[] = [];
    await page.route('**/rest/v1/**', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const table = url.pathname.split('/').pop() ?? '';
      if (request.method() === 'HEAD' && table === 'recipes' && url.searchParams.get('user_id') === 'is.null') {
        // Cross-origin: the count header must be exposed for the client to read it.
        return route.fulfill({
          status: 200,
          headers: { 'content-range': `*/${count}`, 'access-control-allow-origin': '*', 'access-control-expose-headers': 'content-range' },
          body: '',
        });
      }
      if (request.method() === 'PATCH') {
        updates.push({ table, filter: url.searchParams.get('user_id') ?? '', body: request.postDataJSON() });
        return route.fulfill({ status: 204 });
      }
      return route.fallback();
    });
    await page.goto('/');
    return updates;
  }

  test('are offered to the first account, and claimed for it', async ({ page }) => {
    const updates = await withUnowned(page, 3);
    await expect(page.getByText('We found existing recipes')).toBeVisible();
    await page.getByRole('button', { name: 'Claim all existing recipes' }).click();

    await expect(vault(page)).toBeVisible();
    expect(updates.map((u) => u.table).sort()).toEqual(['meal_plan', 'recipes', 'shopping_list']);
    for (const u of updates) {
      expect(u.filter).toBe('is.null');
      expect(u.body).toEqual({ user_id: MOCK_USER.id });
    }
  });

  test('can be skipped, and nothing is changed', async ({ page }) => {
    const updates = await withUnowned(page, 3);
    await page.getByRole('button', { name: /^Skip/ }).click();
    await expect(vault(page)).toBeVisible();
    expect(updates).toEqual([]);
  });

  test('are not mentioned when there are none', async ({ page }) => {
    await withUnowned(page, 0);
    await expect(vault(page)).toBeVisible();
    await expect(page.getByText('We found existing recipes')).toHaveCount(0);
  });
});
