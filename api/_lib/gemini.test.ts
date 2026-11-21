import { beforeEach, describe, expect, it, vi } from 'vitest';
import { forgetReasoningSteps, generateJson, reducedReasoningSteps, refusesReasoningSetting } from './gemini';

// Which reasoning step each model accepted is remembered per instance; every
// test starts without that memory.
beforeEach(() => forgetReasoningSteps());

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

describe('lowering reasoning', () => {
  /** A client whose generateContent returns the given responses in order. */
  function makeClient(...responses: ({ text: string } | Error)[]) {
    const generateContent = vi.fn();
    for (const r of responses) {
      if (r instanceof Error) generateContent.mockRejectedValueOnce(r);
      else generateContent.mockResolvedValueOnce(r);
    }
    return {
      client: { models: { generateContent } } as never,
      configs: () => generateContent.mock.calls.map((c) => c[0].config),
      generateContent,
    };
  }

  it('leaves reasoning at the default unless asked', async () => {
    const { client, configs } = makeClient({ text: '{"ok":true}' });
    await generateJson(client, 'gemini-4-hydrogen', 'p');
    expect(configs()[0].thinkingConfig).toBeUndefined();
  });

  it('switches it off on Gemini 2.5, the only family that can', async () => {
    // 0 is DISABLED per the SDK's ThinkingConfig docs; -1 would be automatic.
    const { client, configs } = makeClient({ text: '{"ok":true}' });
    await generateJson(client, 'gemini-2.5-flash', 'p', undefined, { thinking: false });
    expect(configs()[0].thinkingConfig).toEqual({ thinkingBudget: 0 });
  });

  it('asks a Gemini 3 model for minimal, and a Gemini 4 model for low', async () => {
    // A zero budget is legacy from Gemini 3 on; gemini-3.5-flash-lite answered
    // it with a bare 400, which is what the admin System tab found.
    expect(reducedReasoningSteps('gemini-3.5-flash-lite').map((s) => s.config)).toEqual([{ thinkingLevel: 'MINIMAL' }, { thinkingLevel: 'LOW' }]);
    expect(reducedReasoningSteps('gemini-4-hydrogen').map((s) => s.config)).toEqual([{ thinkingLevel: 'LOW' }]);
    expect(reducedReasoningSteps('gemini-3.1-pro-preview').map((s) => s.config)).toEqual([{ thinkingLevel: 'LOW' }]);
    expect(reducedReasoningSteps('gemini-3.8-flash').map((s) => s.config)).toEqual([{ thinkingLevel: 'LOW' }]);

    const lite = makeClient({ text: '{"ok":true}' });
    await generateJson(lite.client, 'gemini-3.5-flash-lite', 'p', undefined, { thinking: false });
    expect(lite.configs()[0].thinkingConfig).toEqual({ thinkingLevel: 'MINIMAL' });

    const standard = makeClient({ text: '{"ok":true}' });
    await generateJson(standard.client, 'gemini-4-hydrogen', 'p', undefined, { thinking: false });
    expect(standard.configs()[0].thinkingConfig).toEqual({ thinkingLevel: 'LOW' });
  });

  it('keeps the same setting on the JSON repair retry', async () => {
    // The repair path is a second billed call; it must not quietly cost the
    // latency the first one was configured to avoid.
    const { client, configs } = makeClient({ text: 'not json' }, { text: '{"ok":true}' });
    await generateJson(client, 'gemini-4-hydrogen', 'p', undefined, { thinking: false });
    expect(configs()).toHaveLength(2);
    expect(configs()[1].thinkingConfig).toEqual({ thinkingLevel: 'LOW' });
  });

  it('still constrains the response shape when reasoning is lowered', async () => {
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

describe('a model that refuses a lower reasoning setting', () => {
  // What gemini-3.5-flash-lite answered a zero budget: no mention of thinking.
  const invalid = new Error('{"error":{"code":400,"message":"Request contains an invalid argument.","status":"INVALID_ARGUMENT"}}');
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

  it('treats any 400 as a refusal, worded or not, and nothing else', () => {
    expect(refusesReasoningSetting(invalid)).toBe(true);
    expect(refusesReasoningSetting(thinkingOnly)).toBe(true);
    expect(refusesReasoningSetting(new Error('{"error":{"code":503,"message":"thinking is overloaded","status":"UNAVAILABLE"}}'))).toBe(false);
    expect(refusesReasoningSetting(new Error('{"error":{"code":404,"message":"not found","status":"NOT_FOUND"}}'))).toBe(false);
    expect(refusesReasoningSetting(null)).toBe(false);
  });

  it('steps down to the next setting, and then to the default', async () => {
    // Which model a task uses is the user's choice in Settings. Without this,
    // a model refusing the setting fails that task on every single call: a
    // 400 is permanent and callWithRetry rightly never retries it.
    const { client, configs } = setup(invalid, invalid, { text: '{"ok":true}' });
    await expect(generateJson(client, 'gemini-3.5-flash-lite', 'p', undefined, { thinking: false })).resolves.toEqual({ ok: true });
    expect(configs().map((c) => c.thinkingConfig)).toEqual([{ thinkingLevel: 'MINIMAL' }, { thinkingLevel: 'LOW' }, undefined]);
  });

  it('stops at the first setting accepted', async () => {
    const { client, configs } = setup(invalid, { text: '{"ok":true}' });
    await generateJson(client, 'gemini-3.5-flash-lite', 'p', undefined, { thinking: false });
    expect(configs().map((c) => c.thinkingConfig)).toEqual([{ thinkingLevel: 'MINIMAL' }, { thinkingLevel: 'LOW' }]);
  });

  it('remembers what the model accepted, so the next call does not walk into the same 400', async () => {
    const first = setup(invalid, { text: '{"ok":true}' });
    await generateJson(first.client, 'gemini-3.5-flash-lite', 'p', undefined, { thinking: false });
    const second = setup({ text: '{"ok":true}' });
    await generateJson(second.client, 'gemini-3.5-flash-lite', 'p', undefined, { thinking: false });
    expect(second.configs().map((c) => c.thinkingConfig)).toEqual([{ thinkingLevel: 'LOW' }]);
  });

  it('does not walk into the same refusal again on the repair', async () => {
    const { client, configs } = setup(thinkingOnly, { text: 'not json' }, { text: '{"ok":true}' });
    await generateJson(client, 'gemini-4-carbon', 'p', undefined, { thinking: false });
    expect(configs()).toHaveLength(3);
    expect(configs()[2].thinkingConfig).toBeUndefined();
  });

  it('fails as before when the request is wrong at every setting', async () => {
    const { client, generateContent } = setup(invalid, invalid, invalid);
    await expect(generateJson(client, 'gemini-3.5-flash-lite', 'p', undefined, { thinking: false })).rejects.toThrow('invalid argument');
    expect(generateContent).toHaveBeenCalledTimes(3);
  });

  it('leaves any other error alone', async () => {
    const gone = new Error('{"error":{"code":404,"message":"models/x is not found","status":"NOT_FOUND"}}');
    const { client, generateContent } = setup(gone, { text: '{"ok":true}' });
    await expect(generateJson(client, 'gemini-4-hydrogen', 'p', undefined, { thinking: false })).rejects.toThrow('not found');
    expect(generateContent).toHaveBeenCalledTimes(1);
  });

  it('does nothing when reasoning was never lowered', async () => {
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

  it("'off' when switched off on Gemini 2.5", async () => {
    const { client, insert, logCtx } = setup({ text: '{"ok":true}' });
    await generateJson(client, 'gemini-2.5-flash', 'p', logCtx, { thinking: false });
    await settle();
    expect(rows(insert)[0].thinking).toBe('off');
  });

  it("'minimal' or 'low', whichever a newer model accepted", async () => {
    const lite = setup({ text: '{"ok":true}' });
    await generateJson(lite.client, 'gemini-3.5-flash-lite', 'p', lite.logCtx, { thinking: false });
    const standard = setup({ text: '{"ok":true}' });
    await generateJson(standard.client, 'gemini-4-hydrogen', 'p', standard.logCtx, { thinking: false });
    await settle();
    expect(rows(lite.insert)[0].thinking).toBe('minimal');
    expect(rows(standard.insert)[0].thinking).toBe('low');
  });

  it("'refused' when every lower setting was refused, still one row", async () => {
    const { client, insert, logCtx } = setup(thinkingOnly, { text: '{"ok":true}' });
    await generateJson(client, 'gemini-4-carbon', 'p', logCtx, { thinking: false });
    await settle();
    expect(rows(insert)).toHaveLength(1);
    expect(rows(insert)[0].thinking).toBe('refused');
  });

  it('still writes the row before the column exists, without it', async () => {
    // Code reaches production minutes before the migration job runs. A lost
    // row is a free call against the daily allowance, which counts rows.
    const { client, insert, logCtx } = setup({ text: '{"ok":true}' });
    insert.mockResolvedValueOnce({ error: { message: "Could not find the 'thinking' column of 'gemini_logs' in the schema cache" } });
    await generateJson(client, 'gemini-2.5-flash', 'p', logCtx, { thinking: false });
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
