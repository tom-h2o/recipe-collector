import { describe, expect, it } from 'vitest';
import { displayNameOf, initialsOf } from './displayName';

const user = (email: string, meta: Record<string, unknown> = {}) => ({ email, user_metadata: meta });

describe('displayNameOf', () => {
  it('is the name the person set, trimmed', () => {
    expect(displayNameOf(user('a@b.de', { full_name: '  Anna Schmidt ' }))).toBe('Anna Schmidt');
  });

  it('falls back to the name a Google sign-in brought, and to nothing', () => {
    expect(displayNameOf(user('a@b.de', { name: 'Anna' }))).toBe('Anna');
    expect(displayNameOf(user('a@b.de'))).toBe('');
    expect(displayNameOf(user('a@b.de', { full_name: '   ' }))).toBe('');
  });
});

describe('initialsOf', () => {
  it('uses the name, not the email address, once there is one', () => {
    expect(initialsOf(user('zoe@example.com', { full_name: 'Anna Schmidt' }))).toBe('AS');
    expect(initialsOf(user('zoe@example.com', { full_name: 'anna' }))).toBe('A');
  });

  it('takes the first and the last word of a longer name', () => {
    expect(initialsOf(user('x@y.de', { full_name: 'Anna Maria von Schmidt' }))).toBe('AS');
  });

  it('handles umlauts', () => {
    expect(initialsOf(user('x@y.de', { full_name: 'özlem ünal' }))).toBe('ÖÜ');
  });

  it('falls back to the first letter of the email address', () => {
    expect(initialsOf(user('tom@example.com'))).toBe('T');
    expect(initialsOf(user(''))).toBe('?');
  });
});
