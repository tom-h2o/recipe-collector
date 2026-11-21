import { describe, expect, it, vi } from 'vitest';
import { generateJson, rejectsDisabledThinking } from './gemini';

describe('generateJson', () => {
  it('repairs malformed model JSON once before failing the request', async () => {
    const generateContent = vi.fn()
      .mockResolvedValueOnce({ text: '{"title":"Broken "quote""}' })
      .mockResolvedValueOnce({ text: '{"title":"Broken quote"}' });
    const client = { models: { generateContent } };
    const supabase = {
      from: vi.fn(() => ({
        insert: vi.fn(() => Promise.resolve({ error: null })),
      })),
    };

    await expect(generateJson(client as never, 'gemini-test', 'extract prompt', {
      supabase: supabase as never,
      endpoint: 'extract',
      userId: 'user-1',
    })).resolves.toEqual({ title: 'Broken quote' });

    expect(generateContent).toHaveBeenCalledTimes(2);
    expect(generateContent.mock.calls[1][0].contents).toContain('Repair the following invalid JSON');
  });
});

describe('thinking budget', () => {
  /** A client whose generateContent returns the given responses in order. */
  function makeClient(...responses: { text: string }[]) {
    const generateContent = vi.fn();
    for (const r of responses) generateContent.mockResolvedValueOnce(r);
    return {
      client: { models: { generateContent } } as never,
      configs: () => generateContent.mock.calls.map((c) => c[0].config),
      generateContent,
    };
  }

  it('leaves reasoning on by default', async () => {
    const { client, configs } = makeClient({ text: '{"ok":true}' });
    await generateJson(client, 'gemini-4-hydrogen', 'p');
    expect(configs()[0].thinkingConfig).toBeUndefined();
  });

  it('disables it when an endpoint opts out', async () => {
    // 0 is DISABLED per the SDK's ThinkingConfig docs; -1 would be automatic.
    const { client, configs } = makeClient({ text: '{"ok":true}' });
    await generateJson(client, 'gemini-4-hydrogen', 'p', undefined, { thinking: false });
    expect(configs()[0].thinkingConfig).toEqual({ thinkingBudget: 0 });
  });

  it('keeps it disabled on the JSON repair retry', async () => {
    // The repair path is a second billed call; it must not quietly cost the
    // latency the first one was configured to avoid.
    const { client, configs } = makeClient({ text: 'not json' }, { text: '{"ok":true}' });
    await generateJson(client, 'gemini-4-hydrogen', 'p', undefined, { thinking: false });
    expect(configs()).toHaveLength(2);
    expect(configs()[1].thinkingConfig).toEqual({ thinkingBudget: 0 });
  });

  it('still constrains the response shape when reasoning is off', async () => {
    const { client, configs } = makeClient({ text: '{"ok":true}' });
    await generateJson(client, 'gemini-4-hydrogen', 'p', undefined, {
      thinking: false,
      responseSchema: { type: 'OBJECT' },
    });
    expect(configs()[0].responseSchema).toEqual({ type: 'OBJECT' });
    expect(configs()[0].responseMimeType).toBe('application/json');
  });
});

describe('validate', () => {
  /** A client answering in order, and a log table that records what is inserted. */
  function setup(...responses: ({ text: string } | Error)[]) {
    const generateContent = vi.fn();
    for (const r of responses) {
      if (r instanceof Error) generateContent.mockRejectedValueOnce(r);
      else generateContent.mockResolvedValueOnce(r);
    }
    const insert = vi.fn(() => Promise.resolve({ error: null }));
    const supabase = { from: vi.fn(() => ({ insert })) };
    return {
      client: { models: { generateContent } } as never,
      generateContent,
      insert,
      logCtx: { supabase: supabase as never, endpoint: 'translate', userId: 'user-1' },
    };
  }
  const refuseGarbled = (value: unknown) => {
    if ((value as { title: string }).title.includes('```')) throw new Error('garbled');
  };

  it('returns an accepted answer without asking twice', async () => {
    const { client, generateContent, logCtx } = setup({ text: '{"title":"Kuchen"}' });
    await expect(generateJson(client, 'm', 'p', logCtx, { validate: refuseGarbled })).resolves.toEqual({ title: 'Kuchen' });
    expect(generateContent).toHaveBeenCalledTimes(1);
  });

  it('asks once more when the answer is refused, and returns the second', async () => {
    const { client, generateContent, logCtx } = setup({ text: '{"title":"Kuchen``` Wait!"}' }, { text: '{"title":"Kuchen"}' });
    await expect(generateJson(client, 'm', 'p', logCtx, { validate: refuseGarbled })).resolves.toEqual({ title: 'Kuchen' });
    expect(generateContent).toHaveBeenCalledTimes(2);
    // The same request again, not a repair of the refused text.
    expect(generateContent.mock.calls[1][0].contents).toBe('p');
  });

  it('charges one log row for the two calls', async () => {
    // checkRateLimit counts gemini_logs rows. A row per ask would cost the
    // user two of their hundred for one tap.
    const { client, insert, logCtx } = setup({ text: '{"title":"Kuchen```"}' }, { text: '{"title":"Kuchen"}' });
    await generateJson(client, 'm', 'p', logCtx, { validate: refuseGarbled });
    expect(insert).toHaveBeenCalledTimes(1);
    expect(insert.mock.calls[0][0]).toMatchObject({ attempts: 2, status: 'success', output: '{"title":"Kuchen"}' });
  });

  it('gives up after a second refusal, still with one row', async () => {
    const { client, generateContent, insert, logCtx } = setup({ text: '{"title":"a```"}' }, { text: '{"title":"b```"}' });
    await expect(generateJson(client, 'm', 'p', logCtx, { validate: refuseGarbled })).rejects.toThrow('garbled');
    expect(generateContent).toHaveBeenCalledTimes(2);
    expect(insert).toHaveBeenCalledTimes(1);
    expect(insert.mock.calls[0][0]).toMatchObject({ attempts: 2, status: 'error', error_message: 'garbled' });
  });
});

describe('a model that cannot switch reasoning off', () => {
  // The wording Google uses for it, as the SDK surfaces it.
  const thinkingOnly = new Error('{"error":{"code":400,"message":"Budget 0 is invalid. This model only works in thinking mode.","status":"INVALID_ARGUMENT"}}');

  function setup(...responses: ({ text: string } | Error)[]) {
    const generateContent = vi.fn();
    for (const r of responses) {
      if (r instanceof Error) generateContent.mockRejectedValueOnce(r);
      else generateContent.mockResolvedValueOnce(r);
    }
    return {
      client: { models: { generateContent } } as never,
      generateContent,
      configs: () => generateContent.mock.calls.map((c) => c[0].config),
    };
  }

  it('recognises the refusal and nothing else', () => {
    expect(rejectsDisabledThinking(thinkingOnly)).toBe(true);
    // Another 400: the request itself is wrong, and reasoning has nothing to do with it.
    expect(rejectsDisabledThinking(new Error('{"error":{"code":400,"message":"Invalid JSON payload","status":"INVALID_ARGUMENT"}}'))).toBe(false);
    // The word alone is not enough without the 400.
    expect(rejectsDisabledThinking(new Error('{"error":{"code":503,"message":"thinking is overloaded","status":"UNAVAILABLE"}}'))).toBe(false);
    expect(rejectsDisabledThinking(null)).toBe(false);
  });

  it('runs the request again with reasoning left on', async () => {
    // Which model a task uses is the user's choice in Settings. Without this,
    // picking a thinking-only model fails that task on every single call:
    // a 400 is permanent and callWithRetry rightly never retries it.
    const { client, configs } = setup(thinkingOnly, { text: '{"ok":true}' });
    await expect(generateJson(client, 'gemini-4-carbon', 'p', undefined, { thinking: false })).resolves.toEqual({ ok: true });
    expect(configs()[0].thinkingConfig).toEqual({ thinkingBudget: 0 });
    expect(configs()[1].thinkingConfig).toBeUndefined();
  });

  it('does not walk into the same refusal again on the repair', async () => {
    const { client, configs } = setup(thinkingOnly, { text: 'not json' }, { text: '{"ok":true}' });
    await generateJson(client, 'gemini-4-carbon', 'p', undefined, { thinking: false });
    expect(configs()).toHaveLength(3);
    expect(configs()[2].thinkingConfig).toBeUndefined();
  });

  it('leaves every other 400 alone', async () => {
    const bad = new Error('{"error":{"code":400,"message":"Invalid JSON payload","status":"INVALID_ARGUMENT"}}');
    const { client, generateContent } = setup(bad, { text: '{"ok":true}' });
    await expect(generateJson(client, 'm', 'p', undefined, { thinking: false })).rejects.toThrow('Invalid JSON payload');
    expect(generateContent).toHaveBeenCalledTimes(1);
  });

  it('does nothing when reasoning was never switched off', async () => {
    const { client, generateContent } = setup(thinkingOnly, { text: '{"ok":true}' });
    await expect(generateJson(client, 'm', 'p')).rejects.toThrow('thinking mode');
    expect(generateContent).toHaveBeenCalledTimes(1);
  });
});

describe('the log row records whether reasoning was off', () => {
  // gemini_logs.thinking (migration 0067) is what the admin System tab counts.
  // Without it nothing shows that a model refused "off" and quietly reasoned.
  const thinkingOnly = new Error('{"error":{"code":400,"message":"Budget 0 is invalid. This model only works in thinking mode.","status":"INVALID_ARGUMENT"}}');

  function setup(...responses: ({ text: string } | Error)[]) {
    const generateContent = vi.fn();
    for (const r of responses) {
      if (r instanceof Error) generateContent.mockRejectedValueOnce(r);
      else generateContent.mockResolvedValueOnce(r);
    }
    const insert = vi.fn<(row: Record<string, unknown>) => Promise<{ error: null | { message: string } }>>(() => Promise.resolve({ error: null }));
    const supabase = { from: vi.fn(() => ({ insert })) };
    return {
      client: { models: { generateContent } } as never,
      insert,
      logCtx: { supabase: supabase as never, endpoint: 'tag', userId: 'user-1' },
    };
  }
  const rows = (insert: { mock: { calls: unknown[][] } }) => insert.mock.calls.map((c) => c[0] as Record<string, unknown>);
  const settle = () => new Promise((r) => setTimeout(r, 0));

  it("'on' by default", async () => {
    const { client, insert, logCtx } = setup({ text: '{"ok":true}' });
    await generateJson(client, 'm', 'p', logCtx);
    await settle();
    expect(rows(insert)[0].thinking).toBe('on');
  });

  it("'off' when switched off and the model accepts it", async () => {
    const { client, insert, logCtx } = setup({ text: '{"ok":true}' });
    await generateJson(client, 'm', 'p', logCtx, { thinking: false });
    await settle();
    expect(rows(insert)[0].thinking).toBe('off');
  });

  it("'refused' when the model will only run with it on", async () => {
    const { client, insert, logCtx } = setup(thinkingOnly, { text: '{"ok":true}' });
    await generateJson(client, 'm', 'p', logCtx, { thinking: false });
    await settle();
    expect(rows(insert)).toHaveLength(1);
    expect(rows(insert)[0].thinking).toBe('refused');
  });

  it('still writes the row before the column exists, without it', async () => {
    // Code reaches production minutes before the migration job runs. A lost
    // row is a free call against the daily allowance, which counts rows.
    const { client, insert, logCtx } = setup({ text: '{"ok":true}' });
    insert.mockResolvedValueOnce({ error: { message: "Could not find the 'thinking' column of 'gemini_logs' in the schema cache" } });
    await generateJson(client, 'm', 'p', logCtx, { thinking: false });
    await settle();
    expect(rows(insert)).toHaveLength(2);
    expect(rows(insert)[1]).not.toHaveProperty('thinking');
    expect(rows(insert)[1]).toMatchObject({ endpoint: 'tag', status: 'success' });
  });

  it('does not write twice for any other refusal', async () => {
    const { client, insert, logCtx } = setup({ text: '{"ok":true}' });
    insert.mockResolvedValueOnce({ error: { message: 'new row violates row-level security policy' } });
    await generateJson(client, 'm', 'p', logCtx);
    await settle();
    expect(rows(insert)).toHaveLength(1);
  });
});
