import { t } from '@/i18n';

/**
 * Whether strangers may create an account from inside the app.
 *
 * Closed unless `VITE_SIGNUP_OPEN=true`: for now the app is for invited people
 * only (accounts are made in Supabase → Authentication → Users), so the
 * sign-in screen offers no sign-up and the public pages do not ask for one.
 *
 * This only hides the invitations. What actually keeps strangers out is
 * Supabase's own "Allow new users to sign up" switch (see LAUNCH.md): the
 * anon key is public, so anyone can call the sign-up endpoint directly.
 *
 * A function, not a constant, so a test can stub the variable.
 */
export function isSignupOpen(): boolean {
  return import.meta.env.VITE_SIGNUP_OPEN === 'true';
}

/**
 * What Supabase answers when someone without an account asks for a magic link
 * or tries to sign up while sign-up is closed, in words for that person.
 */
export function describeClosedSignup(message: string): string {
  return /signups? not allowed|signup is disabled|signups are disabled/i.test(message)
    ? t('There is no account for this address. Speisekammer is invitation only for now: ask the person who told you about it.')
    : message;
}
