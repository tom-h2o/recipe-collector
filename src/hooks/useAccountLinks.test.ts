import { describe, it, expect } from 'vitest';
import { toLinkedPerson } from './useAccountLinks';
import type { AccountLink } from '@/types';

/**
 * The link row is symmetric: which columns describe "you" depends on whether you
 * sent the invitation or received it. Getting that backwards would show a person
 * their own address as the other party, and write a nickname into the column the
 * other side owns.
 */
const ME = 'user-me';
const THEM = 'user-them';

const link = (over: Partial<AccountLink> = {}): AccountLink => ({
  id: 'link-1',
  requester_id: ME,
  requester_email: 'me@example.com',
  addressee_email: 'them@example.com',
  addressee_id: THEM,
  status: 'accepted',
  requester_label: null,
  addressee_label: null,
  created_at: '2026-01-01T00:00:00Z',
  accepted_at: '2026-01-02T00:00:00Z',
  ...over,
});

describe('toLinkedPerson, seen from the requester', () => {
  const p = () => toLinkedPerson(link(), ME, 'me@example.com');

  it('resolves the other party, not the viewer', () => {
    expect(p().email).toBe('them@example.com');
    expect(p().userId).toBe(THEM);
  });

  it('is not an incoming invitation', () => {
    expect(p().incoming).toBe(false);
  });

  it('owns the requester label column', () => {
    expect(p().myLabelColumn).toBe('requester_label');
  });
});

describe('toLinkedPerson, seen from the addressee', () => {
  const p = () => toLinkedPerson(link(), THEM, 'them@example.com');

  it('resolves the other party, not the viewer', () => {
    expect(p().email).toBe('me@example.com');
    expect(p().userId).toBe(ME);
  });

  it('owns the other label column', () => {
    expect(p().myLabelColumn).toBe('addressee_label');
  });
});

describe('nicknames', () => {
  it('falls back to the email until one is set', () => {
    expect(toLinkedPerson(link(), ME, 'me@example.com').label).toBe('them@example.com');
  });

  it('shows the viewer their own label, not the other side’s', () => {
    const l = link({ requester_label: 'Anna', addressee_label: 'Tom' });
    expect(toLinkedPerson(l, ME, 'me@example.com').label).toBe('Anna');
    expect(toLinkedPerson(l, THEM, 'them@example.com').label).toBe('Tom');
  });

  it('treats a blank label as unset', () => {
    expect(toLinkedPerson(link({ requester_label: '' }), ME, 'me@example.com').label)
      .toBe('them@example.com');
  });
});

describe('pending invitations', () => {
  const pending = link({ status: 'pending', addressee_id: null, accepted_at: null });

  it('is incoming for the person who was invited, matched by address', () => {
    // addressee_id is still null before acceptance, so the match is by email
    expect(toLinkedPerson(pending, 'someone-else', 'them@example.com').incoming).toBe(true);
  });

  it('is outgoing for the person who sent it', () => {
    expect(toLinkedPerson(pending, ME, 'me@example.com').incoming).toBe(false);
  });

  it('matches the invited address regardless of case', () => {
    const shouty = link({ status: 'pending', addressee_id: null, addressee_email: 'THEM@example.com' });
    expect(toLinkedPerson(shouty, 'someone-else', 'them@example.com').incoming).toBe(true);
  });
});
