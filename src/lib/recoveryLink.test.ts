import { describe, expect, it } from 'vitest';
import { isInviteHash, isRecoveryHash } from './recoveryLink';

describe('isRecoveryHash', () => {
  it('recognises the link from a password-reset email', () => {
    expect(isRecoveryHash('#access_token=abc&expires_in=3600&refresh_token=r&token_type=bearer&type=recovery')).toBe(true);
    expect(isRecoveryHash('type=recovery&access_token=abc')).toBe(true);
  });

  it('is not fooled by other links or by an expired one', () => {
    expect(isRecoveryHash('')).toBe(false);
    expect(isRecoveryHash('#access_token=abc&type=magiclink')).toBe(false);
    expect(isRecoveryHash('#access_token=abc&type=signup')).toBe(false);
    // Supabase's error redirect for an expired link carries no session.
    expect(isRecoveryHash('#error=access_denied&error_code=otp_expired&type=recovery')).toBe(false);
  });
});

describe('isInviteHash', () => {
  it('recognises the link from an invitation email', () => {
    expect(isInviteHash('#access_token=abc&expires_in=3600&refresh_token=r&token_type=bearer&type=invite')).toBe(true);
  });

  it('is not a reset link, a magic link or an expired invitation', () => {
    expect(isInviteHash('#access_token=abc&type=recovery')).toBe(false);
    expect(isInviteHash('#access_token=abc&type=magiclink')).toBe(false);
    expect(isInviteHash('#error=access_denied&error_code=otp_expired&type=invite')).toBe(false);
    expect(isRecoveryHash('#access_token=abc&type=invite')).toBe(false);
  });
});
