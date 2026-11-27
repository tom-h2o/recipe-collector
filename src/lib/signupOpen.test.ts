import { afterEach, describe, expect, it, vi } from 'vitest';
import { describeClosedSignup, isSignupOpen } from './signupOpen';

afterEach(() => vi.unstubAllEnvs());

describe('isSignupOpen', () => {
  it('is closed unless switched on, so a deploy without the variable invites nobody', () => {
    expect(isSignupOpen()).toBe(false);
    vi.stubEnv('VITE_SIGNUP_OPEN', 'false');
    expect(isSignupOpen()).toBe(false);
    vi.stubEnv('VITE_SIGNUP_OPEN', '1');
    expect(isSignupOpen()).toBe(false);
  });

  it('opens with exactly "true"', () => {
    vi.stubEnv('VITE_SIGNUP_OPEN', 'true');
    expect(isSignupOpen()).toBe(true);
  });
});

describe('describeClosedSignup', () => {
  it('words Supabase\'s refusals for the person who has no account', () => {
    for (const raw of ['Signups not allowed for otp', 'Signups not allowed for this instance', 'Email signups are disabled']) {
      expect(describeClosedSignup(raw)).toMatch(/invitation only/);
    }
  });

  it('leaves every other message alone', () => {
    expect(describeClosedSignup('Invalid login credentials')).toBe('Invalid login credentials');
  });
});
