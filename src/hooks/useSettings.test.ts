import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const single = vi.fn();
const upsert = vi.fn();
const toastError = vi.fn();
const toastSuccess = vi.fn();

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ single }) }),
      upsert,
    }),
  },
}));
vi.mock('sonner', () => ({ toast: { error: (m: string) => toastError(m), success: (m: string) => toastSuccess(m) } }));

import { useSettings } from './useSettings';
import { DEFAULT_MODEL } from '@/lib/constants';

beforeEach(() => {
  vi.clearAllMocks();
  upsert.mockResolvedValue({ error: null });
  single.mockResolvedValue({ data: null });
});

describe('useSettings defaults', () => {
  it('starts from code defaults, not a stored snapshot', () => {
    const { result } = renderHook(() => useSettings('u1'));
    expect(result.current.settings).toEqual({ gemini_model: DEFAULT_MODEL, temperature_unit: 'C' });
  });

  it('only carries model and temperature unit', () => {
    // Regression guard: prompts used to live here. A non-empty seeded prompt was
    // written into the user's row on any save, pinning them to stale text that
    // had lost its language instructions.
    const { result } = renderHook(() => useSettings('u1'));
    expect(Object.keys(result.current.settings).sort()).toEqual(['gemini_model', 'temperature_unit']);
  });
});

describe('fetchSettings', () => {
  it('applies the stored row', async () => {
    single.mockResolvedValue({ data: { gemini_model: 'gemini-pro', temperature_unit: 'F' } });
    const { result } = renderHook(() => useSettings('u1'));
    await act(async () => { await result.current.fetchSettings(); });
    expect(result.current.settings).toEqual({ gemini_model: 'gemini-pro', temperature_unit: 'F' });
  });

  it('falls back to defaults for blank columns', async () => {
    single.mockResolvedValue({ data: { gemini_model: '', temperature_unit: '' } });
    const { result } = renderHook(() => useSettings('u1'));
    await act(async () => { await result.current.fetchSettings(); });
    expect(result.current.settings).toEqual({ gemini_model: DEFAULT_MODEL, temperature_unit: 'C' });
  });

  it('does not query at all when signed out', async () => {
    const { result } = renderHook(() => useSettings(null));
    await act(async () => { await result.current.fetchSettings(); });
    expect(single).not.toHaveBeenCalled();
  });
});

describe('saveSettings', () => {
  it('writes exactly user_id, model and unit — nothing else', async () => {
    const { result } = renderHook(() => useSettings('u1'));
    await act(async () => {
      await result.current.saveSettings({ gemini_model: 'gemini-pro', temperature_unit: 'F' });
    });
    expect(upsert).toHaveBeenCalledTimes(1);
    const [payload, options] = upsert.mock.calls[0];
    expect(Object.keys(payload).sort()).toEqual(['gemini_model', 'temperature_unit', 'user_id']);
    expect(payload).toEqual({ user_id: 'u1', gemini_model: 'gemini-pro', temperature_unit: 'F' });
    expect(options).toEqual({ onConflict: 'user_id' });
  });

  it('refuses to save when signed out', async () => {
    const { result } = renderHook(() => useSettings(null));
    await act(async () => {
      await result.current.saveSettings({ gemini_model: 'gemini-pro', temperature_unit: 'F' });
    });
    expect(upsert).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalled();
  });

  it('keeps the previous settings when the write fails', async () => {
    upsert.mockResolvedValue({ error: { message: 'nope' } });
    const { result } = renderHook(() => useSettings('u1'));
    await act(async () => {
      await result.current.saveSettings({ gemini_model: 'gemini-pro', temperature_unit: 'F' });
    });
    expect(result.current.settings.gemini_model).toBe(DEFAULT_MODEL);
    expect(toastError).toHaveBeenCalled();
  });

  it('clears the saving flag even after a failure', async () => {
    upsert.mockResolvedValue({ error: { message: 'nope' } });
    const { result } = renderHook(() => useSettings('u1'));
    await act(async () => {
      await result.current.saveSettings({ gemini_model: 'gemini-pro', temperature_unit: 'C' });
    });
    await waitFor(() => expect(result.current.isSavingSettings).toBe(false));
  });
});
