import { describe, it, expect, vi } from 'vitest';
import { isTransientGeminiError, callWithRetry } from './gemini.js';

/** No real waiting: the backoff maths is asserted separately via the recorded delays. */
const instant = { baseDelayMs: 10, sleep: async () => {} };

describe('isTransientGeminiError', () => {
  it('retries the 503 that actually reached a user', () => {
    // Verbatim from gemini_logs, 2026-09-05, endpoint=suggest.
    const err = new Error(
      '{"error":{"code":503,"message":"This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.","status":"UNAVAILABLE"}}',
    );
    expect(isTransientGeminiError(err)).toBe(true);
  });

  it('retries throttling and transient backend faults', () => {
    expect(isTransientGeminiError({ status: 429 })).toBe(true);
    expect(isTransientGeminiError({ code: 500 })).toBe(true);
    expect(isTransientGeminiError({ status: 'RESOURCE_EXHAUSTED' })).toBe(true);
  });

  it('does not retry errors that will fail identically every time', () => {
    // A retired model id 404s forever; retrying only delays the same message.
    expect(isTransientGeminiError(new Error('{"error":{"code":404,"status":"NOT_FOUND"}}'))).toBe(false);
    expect(isTransientGeminiError({ status: 400 })).toBe(false);
    expect(isTransientGeminiError({ status: 403 })).toBe(false);
    expect(isTransientGeminiError(new Error('Gemini returned an empty response.'))).toBe(false);
    expect(isTransientGeminiError(null)).toBe(false);
  });
});

describe('callWithRetry', () => {
  it('returns the value and one attempt when nothing fails', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    await expect(callWithRetry(fn, instant)).resolves.toEqual({ value: 'ok', attempts: 1 });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('recovers from a transient failure and reports the attempt count', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce({ status: 503 })
      .mockResolvedValue('ok');
    await expect(callWithRetry(fn, instant)).resolves.toEqual({ value: 'ok', attempts: 2 });
  });

  it('gives up after the attempt limit and rethrows the original error', async () => {
    const fn = vi.fn().mockRejectedValue({ status: 503 });
    await expect(callWithRetry(fn, instant)).rejects.toEqual({ status: 503 });
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('does not retry a permanent error', async () => {
    const fn = vi.fn().mockRejectedValue({ status: 400 });
    await expect(callWithRetry(fn, instant)).rejects.toEqual({ status: 400 });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('backs off further on each attempt', async () => {
    const delays: number[] = [];
    const fn = vi.fn().mockRejectedValue({ status: 503 });
    await callWithRetry(fn, {
      baseDelayMs: 100,
      sleep: async (ms) => { delays.push(ms); },
    }).catch(() => {});
    expect(delays).toHaveLength(2);
    expect(delays[1]).toBeGreaterThan(delays[0]);
  });

  it('stops rather than starting a retry that would outlast the function', async () => {
    // Vercel kills the function at its execution ceiling; a retry begun too late
    // is dead time that returns nothing to the user.
    const fn = vi.fn().mockRejectedValue({ status: 503 });
    await expect(
      callWithRetry(fn, { baseDelayMs: 10_000, deadlineMs: 100, sleep: async () => {} }),
    ).rejects.toEqual({ status: 503 });
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('generateJson logging under retry', () => {
  function fakeLogCtx() {
    const inserted: Record<string, unknown>[] = [];
    const supabase = {
      from: () => ({
        insert: (row: Record<string, unknown>) => {
          inserted.push(row);
          return { then: (res: (v: unknown) => unknown) => Promise.resolve(null).then(res) };
        },
      }),
    };
    return { inserted, ctx: { supabase, endpoint: 'suggest', userId: 'u1' } };
  }

  it('writes exactly one row for a call that needed a retry', async () => {
    // The daily allowance counts gemini_logs rows. One row per attempt would
    // charge a user two of their hundred for a single action — the mistake that
    // once let find-image eat the AI budget.
    const { inserted, ctx } = fakeLogCtx();
    const generateContent = vi.fn()
      .mockRejectedValueOnce({ status: 503 })
      .mockResolvedValue({ text: '{"ok":true}', modelVersion: 'gemini-3.8-flash' });

    const { generateJson } = await import('./gemini.js');
    const result = await generateJson(
      { models: { generateContent } } as never,
      'gemini-flash-latest',
      'prompt',
      ctx as never,
      instant,
    );

    expect(result).toEqual({ ok: true });
    expect(generateContent).toHaveBeenCalledTimes(2);
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({ status: 'success', attempts: 2 });
  });

  it('records a single attempt when nothing was retried', async () => {
    const { inserted, ctx } = fakeLogCtx();
    const generateContent = vi.fn().mockResolvedValue({ text: '{"ok":true}', modelVersion: 'gemini-3.8-flash' });

    const { generateJson } = await import('./gemini.js');
    await generateJson({ models: { generateContent } } as never, 'm', 'p', ctx as never, instant);

    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({ attempts: 1 });
  });

  it('still writes one row when every retry fails', async () => {
    const { inserted, ctx } = fakeLogCtx();
    const generateContent = vi.fn().mockRejectedValue({ status: 503, message: 'overloaded' });

    const { generateJson } = await import('./gemini.js');
    await expect(
      generateJson({ models: { generateContent } } as never, 'm', 'p', ctx as never, instant),
    ).rejects.toBeTruthy();

    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({ status: 'error', attempts: 3 });
  });
});
