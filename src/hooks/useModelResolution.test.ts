import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const rows = vi.fn();
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({ not: () => ({ order: () => ({ limit: () => rows() }) }) }),
      }),
    }),
  },
}));

import { useModelResolution } from './useModelResolution';

beforeEach(() => {
  vi.clearAllMocks();
  rows.mockResolvedValue({ data: [] });
});

describe('useModelResolution', () => {
  it('reports the newest resolution for each configured id', async () => {
    rows.mockResolvedValue({
      data: [
        { model: 'gemini-flash-lite-latest', model_version: 'gemini-3.5-flash-lite', created_at: '2026-11-18T10:00:00Z' },
        { model: 'gemini-flash-lite-latest', model_version: 'gemini-3.1-flash-lite', created_at: '2026-01-01T10:00:00Z' },
        { model: 'gemini-4-hydrogen', model_version: 'gemini-4-hydrogen', created_at: '2026-11-17T10:00:00Z' },
      ],
    });
    const { result } = renderHook(() => useModelResolution('u1'));

    await waitFor(() => expect(result.current.resolutions).toHaveLength(2));
    // Rows arrive newest first, so the stale January row must not win.
    expect(result.current.resolutionFor('gemini-flash-lite-latest')?.servedBy).toBe('gemini-3.5-flash-lite');
    expect(result.current.resolutionFor('gemini-4-hydrogen')?.servedBy).toBe('gemini-4-hydrogen');
  });

  it('returns null for an id that has never run, rather than guessing', async () => {
    // The whole point is reporting what happened. Inventing a resolution for a
    // model nobody has called would be exactly the false confidence an alias
    // already creates.
    const { result } = renderHook(() => useModelResolution('u1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.resolutionFor('gemini-4-carbon')).toBeNull();
  });

  it('skips rows with no recorded version', async () => {
    rows.mockResolvedValue({
      data: [{ model: 'gemini-4-carbon', model_version: null, created_at: '2026-11-18T10:00:00Z' }],
    });
    const { result } = renderHook(() => useModelResolution('u1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.resolutionFor('gemini-4-carbon')).toBeNull();
  });

  it('asks for nothing when signed out', async () => {
    const { result } = renderHook(() => useModelResolution(null));
    await waitFor(() => expect(result.current.resolutions).toEqual([]));
    expect(rows).not.toHaveBeenCalled();
  });
});
