import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ insert: vi.fn(), lastEventId: vi.fn<() => string | undefined>() }));

vi.mock('@/lib/supabase', () => ({
  supabase: { from: (table: string) => ({ insert: (row: unknown) => h.insert(table, row) }) },
}));
vi.mock('@sentry/react', () => ({ lastEventId: () => h.lastEventId() }));

import { collectFeedbackContext, describeFeedbackContext, submitFeedback } from './feedback';

beforeEach(() => {
  vi.clearAllMocks();
  h.insert.mockResolvedValue({ error: null });
  h.lastEventId.mockReturnValue(undefined);
});

describe('collectFeedbackContext', () => {
  it('says where the person is and on what, without the part of the address that can hold a token', () => {
    window.history.replaceState(null, '', '/recipe/abc?x=1#access_token=secret');
    const context = collectFeedbackContext('vault');
    expect(context).toMatchObject({ view: 'vault', path: '/recipe/abc', theme: 'light' });
    expect(context.screen).toMatch(/^\d+×\d+$/);
    expect(JSON.stringify(context)).not.toContain('secret');
    window.history.replaceState(null, '', '/');
  });

  it('adds the last error report\'s id when there is one', () => {
    expect(collectFeedbackContext('vault').lastErrorId).toBeUndefined();
    h.lastEventId.mockReturnValue('abc123');
    expect(collectFeedbackContext('vault').lastErrorId).toBe('abc123');
  });

  it('shows the person every field that is sent', () => {
    h.lastEventId.mockReturnValue('abc123');
    const context = collectFeedbackContext('vault', 'Failed to fetch dynamically imported module');
    const shown = describeFeedbackContext(context).map((l) => l.value).join(' ');
    for (const value of Object.values(context)) {
      if (typeof value === 'string') expect(shown).toContain(value);
    }
  });
});

describe('submitFeedback', () => {
  it('sends the three fields a person may write, trimmed, and nothing else', async () => {
    expect(await submitFeedback('idea', '  A dark mode for print  ', { view: 'vault' })).toBeNull();
    expect(h.insert).toHaveBeenCalledWith('feedback', { kind: 'idea', message: 'A dark mode for print', context: { view: 'vault' } });
  });

  it('sends nothing for an empty or over-long message', async () => {
    expect(await submitFeedback('bug', '   ', {})).toMatch(/few words/);
    expect(await submitFeedback('bug', 'x'.repeat(4001), {})).toMatch(/under 4000/);
    expect(h.insert).not.toHaveBeenCalled();
  });

  it('words the daily bound, and any other failure, for a person', async () => {
    h.insert.mockResolvedValue({ error: { code: '42501', message: 'new row violates row-level security policy' } });
    expect(await submitFeedback('bug', 'again', {})).toMatch(/tomorrow/);
    h.insert.mockResolvedValue({ error: { code: '08006', message: 'connection failure' } });
    const failure = await submitFeedback('bug', 'again', {});
    expect(failure).toMatch(/could not be sent/);
    expect(failure).not.toMatch(/connection failure/);
  });
});
