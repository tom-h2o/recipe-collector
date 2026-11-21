import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

/**
 * Two rows are read: the user's own (temperature unit only) and the global row
 * id = 1 (the AI models, chosen by the admin for everyone). The mock answers
 * by which column the query filters on, so a hook that read models from the
 * user's row again would get the wrong answer here.
 */
const ownRow = vi.fn();
const globalRow = vi.fn();
const upsert = vi.fn();
const apiFetch = vi.fn();
const toastError = vi.fn();
const toastSuccess = vi.fn();

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: (column: string) => ({ single: () => (column === 'id' ? globalRow() : ownRow()) }),
      }),
      upsert,
    }),
  },
}));
vi.mock('@/lib/api', () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }));
vi.mock('sonner', () => ({ toast: { error: (m: string) => toastError(m), success: (m: string) => toastSuccess(m) } }));

import { useSettings } from './useSettings';
import { DEFAULT_MODEL } from '@/lib/constants';

const ok = (body: unknown = {}) => ({ ok: true, status: 200, json: async () => body });

beforeEach(() => {
  vi.clearAllMocks();
  upsert.mockResolvedValue({ error: null });
  ownRow.mockResolvedValue({ data: null });
  globalRow.mockResolvedValue({ data: null });
  apiFetch.mockResolvedValue(ok());
});

describe('useSettings defaults', () => {
  it('starts from code defaults, not a stored snapshot', () => {
    const { result } = renderHook(() => useSettings('u1'));
    expect(result.current.settings).toEqual({ gemini_model: DEFAULT_MODEL, task_models: {}, temperature_unit: 'C' });
  });

  it('only carries models and temperature unit', () => {
    // Regression guard: prompts used to live here. A non-empty seeded prompt was
    // written into the user's row on any save, pinning them to stale text that
    // had lost its language instructions. The list is pinned so anything else
    // added here has to be a deliberate decision.
    const { result } = renderHook(() => useSettings('u1'));
    expect(Object.keys(result.current.settings).sort()).toEqual(['gemini_model', 'task_models', 'temperature_unit']);
  });
});

describe('fetchSettings', () => {
  it('takes the models from the global row and the unit from the user\'s own', async () => {
    globalRow.mockResolvedValue({ data: { gemini_model: 'gemini-4-hydrogen', task_models: { tag: 'gemini-3.5-flash-lite' } } });
    ownRow.mockResolvedValue({ data: { temperature_unit: 'F' } });
    const { result } = renderHook(() => useSettings('u1'));
    await act(async () => { await result.current.fetchSettings(); });
    expect(result.current.settings).toEqual({
      gemini_model: 'gemini-4-hydrogen',
      task_models: { tag: 'gemini-3.5-flash-lite' },
      temperature_unit: 'F',
    });
  });

  it('does not read models from the user\'s own row', async () => {
    // Since migration 0068 a model left on someone's row is ignored by the
    // server; showing it here would claim a model that is not running.
    ownRow.mockResolvedValue({ data: { temperature_unit: 'C', gemini_model: 'gemini-4-carbon', task_models: { tag: 'gemini-4-carbon' } } });
    const { result } = renderHook(() => useSettings('u1'));
    await act(async () => { await result.current.fetchSettings(); });
    expect(result.current.settings.gemini_model).toBe(DEFAULT_MODEL);
    expect(result.current.settings.task_models).toEqual({});
  });

  it('falls back to defaults for blank or malformed columns', async () => {
    globalRow.mockResolvedValue({ data: { gemini_model: '', task_models: ['not', 'a', 'map'] } });
    ownRow.mockResolvedValue({ data: { temperature_unit: '' } });
    const { result } = renderHook(() => useSettings('u1'));
    await act(async () => { await result.current.fetchSettings(); });
    expect(result.current.settings).toEqual({ gemini_model: DEFAULT_MODEL, task_models: {}, temperature_unit: 'C' });
  });

  it('does not query at all when signed out', async () => {
    const { result } = renderHook(() => useSettings(null));
    await act(async () => { await result.current.fetchSettings(); });
    expect(ownRow).not.toHaveBeenCalled();
    expect(globalRow).not.toHaveBeenCalled();
  });
});

describe('saveSettings', () => {
  it('writes only user_id and the unit to the user\'s own row', async () => {
    const { result } = renderHook(() => useSettings('u1'));
    await act(async () => {
      await result.current.saveSettings({ gemini_model: DEFAULT_MODEL, task_models: {}, temperature_unit: 'F' });
    });
    expect(upsert).toHaveBeenCalledTimes(1);
    const [payload, options] = upsert.mock.calls[0];
    expect(payload).toEqual({ user_id: 'u1', temperature_unit: 'F' });
    expect(options).toEqual({ onConflict: 'user_id' });
  });

  it('leaves the models alone when they did not change', async () => {
    const { result } = renderHook(() => useSettings('u1'));
    await act(async () => {
      await result.current.saveSettings({ gemini_model: DEFAULT_MODEL, task_models: {}, temperature_unit: 'F' });
    });
    expect(apiFetch).not.toHaveBeenCalled();
    expect(toastSuccess).toHaveBeenCalled();
  });

  it('sends changed models to the admin endpoint, never to the user\'s row', async () => {
    const { result } = renderHook(() => useSettings('u1'));
    const updated = { gemini_model: DEFAULT_MODEL, task_models: { tag: 'gemini-3.5-flash-lite' as const }, temperature_unit: 'C' as const };
    await act(async () => { await result.current.saveSettings(updated); });

    expect(apiFetch).toHaveBeenCalledTimes(1);
    const [url, init] = apiFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/account?action=models');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ gemini_model: DEFAULT_MODEL, task_models: { tag: 'gemini-3.5-flash-lite' } });
    expect(upsert.mock.calls[0][0]).not.toHaveProperty('task_models');
    expect(result.current.settings).toEqual(updated);
  });

  it('keeps the saved models, and says so, when the server refuses the change', async () => {
    apiFetch.mockResolvedValue({ ok: false, status: 403, json: async () => ({ error: 'Forbidden' }) });
    const { result } = renderHook(() => useSettings('u1'));
    await act(async () => {
      await result.current.saveSettings({ gemini_model: 'gemini-4-carbon', task_models: {}, temperature_unit: 'F' });
    });
    expect(result.current.settings).toEqual({ gemini_model: DEFAULT_MODEL, task_models: {}, temperature_unit: 'F' });
    expect(toastError).toHaveBeenCalledWith(expect.stringContaining('Forbidden'));
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it('refuses to save when signed out', async () => {
    const { result } = renderHook(() => useSettings(null));
    await act(async () => {
      await result.current.saveSettings({ gemini_model: DEFAULT_MODEL, task_models: {}, temperature_unit: 'F' });
    });
    expect(upsert).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalled();
  });

  it('keeps the previous settings when the write fails', async () => {
    upsert.mockResolvedValue({ error: { message: 'nope' } });
    const { result } = renderHook(() => useSettings('u1'));
    await act(async () => {
      await result.current.saveSettings({ gemini_model: DEFAULT_MODEL, task_models: {}, temperature_unit: 'F' });
    });
    expect(result.current.settings.temperature_unit).toBe('C');
    expect(apiFetch).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalled();
  });

  it('clears the saving flag even after a failure', async () => {
    upsert.mockResolvedValue({ error: { message: 'nope' } });
    const { result } = renderHook(() => useSettings('u1'));
    await act(async () => {
      await result.current.saveSettings({ gemini_model: DEFAULT_MODEL, task_models: {}, temperature_unit: 'C' });
    });
    await waitFor(() => expect(result.current.isSavingSettings).toBe(false));
  });
});
