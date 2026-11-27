import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

/**
 * The sign-in screen while accounts are by invitation (the default) and once
 * sign-up is opened. The flows themselves are in tests/e2e/authFlows.spec.ts,
 * which runs with sign-up open; this holds the closed state it cannot reach.
 */
const auth = vi.hoisted(() => ({
  state: { user: null as null | { id: string }, loading: false, isPasswordRecovery: false, isInvite: false },
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    ...auth.state,
    signInWithEmail: vi.fn(), signInWithPassword: vi.fn(), signUpWithPassword: vi.fn(),
    sendPasswordReset: vi.fn(), updatePassword: vi.fn(), resendConfirmation: vi.fn(), signOut: vi.fn(),
  }),
}));
vi.mock('@/hooks/useDarkMode', () => ({ useDarkMode: () => ({ isDark: false, toggle: vi.fn() }) }));

import { AuthGate } from './AuthGate';

afterEach(() => {
  vi.unstubAllEnvs();
  auth.state = { user: null, loading: false, isPasswordRecovery: false, isInvite: false };
});

describe('AuthGate', () => {
  it('offers no sign-up while accounts are by invitation', () => {
    render(<AuthGate><p>vault</p></AuthGate>);
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /sign up/i })).toBeNull();
    expect(screen.getByText(/by invitation/i)).toBeInTheDocument();
  });

  it('offers sign-up once it is opened', () => {
    vi.stubEnv('VITE_SIGNUP_OPEN', 'true');
    render(<AuthGate><p>vault</p></AuthGate>);
    expect(screen.getByRole('button', { name: /sign up/i })).toBeInTheDocument();
    expect(screen.queryByText(/by invitation/i)).toBeNull();
  });

  it('says before sign-in where recipes are sent, with a link to the rest', () => {
    render(<AuthGate><p>vault</p></AuthGate>);
    expect(screen.getByText(/sent to Anthropic and Google/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /what happens to your data/i })).toHaveAttribute('href', '/about#your-data');
  });

  it('welcomes an invited person with a password to choose, not the vault', () => {
    auth.state = { user: { id: 'u1' }, loading: false, isPasswordRecovery: true, isInvite: true };
    render(<AuthGate><p>vault</p></AuthGate>);
    expect(screen.getByRole('heading', { name: 'Welcome to Speisekammer' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Set password' })).toBeInTheDocument();
    expect(screen.queryByText('vault')).toBeNull();
  });
});
