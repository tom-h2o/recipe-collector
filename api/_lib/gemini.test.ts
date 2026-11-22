import { beforeEach, describe, expect, it, vi } from 'vitest';
import { describeGeminiError, fallbackModelFor, forgetReasoningSteps, generateFromParts, generateJson, modelCannotServe, reducedReasoningSteps, refusesReasoningSetting, withModelFallback } from './gemini';
import { setClaudeClientForTests } from './claude';
import { OFFERED_MODELS } from './supabase';

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
    // Not a 400, so not a refusal of the setting; and a 403 blocks every
    // model alike, so there is no fallback either.
    const blocked = new Error('{"error":{"code":403,"message":"Your project has been denied access.","status":"PERMISSION_DENIED"}}');
    const { client, generateContent } = setup(blocked, { text: '{"ok":true}' });
    await expect(generateJson(client, 'gemini-4-hydrogen', 'p', undefined, { thinking: false })).rejects.toThrow('denied access');
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

/**
 * "Gemini is down" is usually one model: each has its own capacity and its own
 * free quota, and the System tab has shown Standard answering 503 while Lite
 * was fine. A call whose model cannot serve is asked once more on the other
 * free model, inside the same call: one log row, one unit of the allowance.
 */
describe('falling back to the other free model', () => {
  beforeEach(() => forgetReasoningSteps());

  const instant = { sleep: async () => {} };
  const overloaded = () => new Error('{"error":{"code":503,"message":"The model is overloaded.","status":"UNAVAILABLE"}}');
  const quota = () => new Error('{"error":{"code":429,"message":"Quota exceeded","status":"RESOURCE_EXHAUSTED"}}');
  const gone = () => new Error('{"error":{"code":404,"message":"models/x is not found","status":"NOT_FOUND"}}');
  const blocked = () => new Error('{"error":{"code":403,"message":"Your project has been denied access.","status":"PERMISSION_DENIED"}}');

  function client(...responses: ({ text: string; modelVersion?: string } | Error)[]) {
    const generateContent = vi.fn();
    for (const r of responses) {
      if (r instanceof Error) generateContent.mockRejectedValueOnce(r);
      else generateContent.mockResolvedValueOnce(r);
    }
    const insert = vi.fn<(row: Record<string, unknown>) => Promise<{ error: null }>>(() => Promise.resolve({ error: null }));
    return {
      client: { models: { generateContent } } as never,
      generateContent,
      insert,
      logCtx: { supabase: { from: () => ({ insert }) } as never, endpoint: 'extract', userId: 'user-1' },
    };
  }
  const modelsAsked = (fn: ReturnType<typeof vi.fn>) => fn.mock.calls.map((c) => (c[0] as { model: string }).model);

  it('pairs Standard and Lite, and never falls back to Frontier', () => {
    expect(fallbackModelFor('gemini-4-hydrogen')).toBe('gemini-3.5-flash-lite');
    expect(fallbackModelFor('gemini-3.5-flash-lite')).toBe('gemini-4-hydrogen');
    expect(fallbackModelFor('gemini-4-carbon')).toBe('gemini-4-hydrogen');
    expect(fallbackModelFor('gemini-something-custom')).toBe('gemini-4-hydrogen');
    // Every fallback is an offered Gemini model, and never Frontier.
    for (const target of OFFERED_MODELS.map(fallbackModelFor)) {
      expect(OFFERED_MODELS).toContain(target);
      expect(target).toMatch(/^gemini-/);
      expect(target).not.toBe('gemini-4-carbon');
    }
  });

  it('counts overload, used-up quota and a missing model as "cannot serve", not a blocked project', () => {
    expect(modelCannotServe(overloaded())).toBe(true);
    expect(modelCannotServe(quota())).toBe(true);
    expect(modelCannotServe(gone())).toBe(true);
    expect(modelCannotServe(blocked())).toBe(false);
    expect(modelCannotServe(new Error('{"error":{"code":400,"message":"bad","status":"INVALID_ARGUMENT"}}'))).toBe(false);
  });

  it('answers from the other model when the chosen one stays overloaded, and logs one row for it', async () => {
    const { client: c, generateContent, insert, logCtx } = client(overloaded(), overloaded(), overloaded(), { text: '{"ok":true}', modelVersion: 'lite-001' });
    await expect(generateJson(c, 'gemini-4-hydrogen', 'p', logCtx, instant)).resolves.toEqual({ ok: true });
    expect(modelsAsked(generateContent)).toEqual(['gemini-4-hydrogen', 'gemini-4-hydrogen', 'gemini-4-hydrogen', 'gemini-3.5-flash-lite']);
    expect(insert).toHaveBeenCalledTimes(1);
    expect(insert.mock.calls[0][0]).toMatchObject({ model: 'gemini-3.5-flash-lite', model_version: 'lite-001', attempts: 4, status: 'success' });
  });

  it('falls back when the chosen model has used up its quota', async () => {
    const { client: c, generateContent } = client(quota(), quota(), quota(), { text: '{"ok":true}' });
    await expect(generateJson(c, 'gemini-3.5-flash-lite', 'p', undefined, instant)).resolves.toEqual({ ok: true });
    expect(modelsAsked(generateContent).at(-1)).toBe('gemini-4-hydrogen');
  });

  it('falls back at once when the chosen model is gone, since retrying a 404 cannot help', async () => {
    const { client: c, generateContent } = client(gone(), { text: '{"ok":true}' });
    await expect(generateJson(c, 'gemini-3.5-flash-lite', 'p', undefined, instant)).resolves.toEqual({ ok: true });
    expect(modelsAsked(generateContent)).toEqual(['gemini-3.5-flash-lite', 'gemini-4-hydrogen']);
  });

  it('does not try another model for a blocked project', async () => {
    const { client: c, generateContent } = client(blocked(), { text: '{"ok":true}' });
    await expect(generateJson(c, 'gemini-4-hydrogen', 'p', undefined, instant)).rejects.toThrow('denied access');
    expect(generateContent).toHaveBeenCalledTimes(1);
  });

  it('lowers reasoning the way the fallback model accepts, and records that', async () => {
    // Standard is asked for LOW; Lite, being a Gemini 3 model, for MINIMAL first.
    const { client: c, generateContent, insert, logCtx } = client(overloaded(), overloaded(), overloaded(), { text: '{"ok":true}' });
    await generateJson(c, 'gemini-4-hydrogen', 'p', logCtx, { ...instant, thinking: false });
    const configs = generateContent.mock.calls.map((call) => (call[0] as { config: { thinkingConfig?: { thinkingLevel?: string } } }).config.thinkingConfig?.thinkingLevel);
    expect(configs).toEqual(['LOW', 'LOW', 'LOW', 'MINIMAL']);
    expect(insert.mock.calls[0][0]).toMatchObject({ model: 'gemini-3.5-flash-lite', thinking: 'minimal' });
  });

  it('sends the repair to the model that answered', async () => {
    const { client: c, generateContent } = client(overloaded(), overloaded(), overloaded(), { text: '{"ok":' }, { text: '{"ok":true}' });
    await expect(generateJson(c, 'gemini-4-hydrogen', 'p', undefined, instant)).resolves.toEqual({ ok: true });
    expect(modelsAsked(generateContent).slice(-2)).toEqual(['gemini-3.5-flash-lite', 'gemini-3.5-flash-lite']);
  });

  it('does not start a fallback the deadline cannot fit', async () => {
    let now = 0;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    const run = vi.fn(async (m: string) => {
      if (m === 'gemini-4-hydrogen') { now += 60_000; throw overloaded(); }
      return 'late';
    });
    await expect(withModelFallback('gemini-4-hydrogen', run, { deadlineMs: 110_000 })).rejects.toThrow('overloaded');
    expect(run).toHaveBeenCalledTimes(1);
    vi.restoreAllMocks();
  });

  it('gives the fallback only the time that is left', async () => {
    let now = 0;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    const budgets: number[] = [];
    const run = vi.fn(async (m: string, budgetMs: number) => {
      budgets.push(budgetMs);
      if (m === 'gemini-4-hydrogen') { now += 10_000; throw overloaded(); }
      return 'ok';
    });
    await expect(withModelFallback('gemini-4-hydrogen', run, { deadlineMs: 110_000 })).resolves.toEqual({ value: 'ok', model: 'gemini-3.5-flash-lite' });
    expect(budgets).toEqual([110_000, 100_000]);
    vi.restoreAllMocks();
  });

  it('retries and falls back for photo and PDF extraction too, reporting what it took', async () => {
    const { client: c, generateContent } = client(overloaded(), overloaded(), overloaded(), { text: '{"title":"x"}', modelVersion: 'lite-001' });
    const progress = { attempts: 0, model: '' };
    const out = await generateFromParts(c, 'gemini-4-hydrogen', [{ text: 'read this' }], instant, progress);
    expect(out).toEqual({ text: '{"title":"x"}', modelVersion: 'lite-001' });
    expect(progress).toEqual({ attempts: 4, model: 'gemini-3.5-flash-lite' });
    expect(modelsAsked(generateContent)).toEqual(['gemini-4-hydrogen', 'gemini-4-hydrogen', 'gemini-4-hydrogen', 'gemini-3.5-flash-lite']);
  });

  it('reports the attempts and the last model tried when photo extraction fails on both', async () => {
    const { client: c } = client(overloaded(), overloaded(), overloaded(), overloaded(), overloaded(), overloaded());
    const progress = { attempts: 0, model: '' };
    await expect(generateFromParts(c, 'gemini-4-hydrogen', [{ text: 'read this' }], instant, progress)).rejects.toThrow('overloaded');
    expect(progress).toEqual({ attempts: 6, model: 'gemini-3.5-flash-lite' });
  });
});

/**
 * Claude is the main provider and Gemini the backup (migration 0069). A
 * `claude-*` id goes to Claude; any Claude failure goes to the Gemini model
 * fallbackModelFor names, inside the same call and on the same log row. That
 * includes no key at all, which is what makes deploying before the key exists
 * safe: every task simply runs on Gemini.
 */
describe('Claude first, Gemini as backup', () => {
  beforeEach(() => { forgetReasoningSteps(); setClaudeClientForTests(undefined); });

  const instant = { sleep: async () => {} };
  const providerError = (status: number, type: string) =>
    Object.assign(new Error(`${status} {"type":"error","error":{"type":"${type}","message":"x"}}`), { status });

  function setup(claudeAnswers: (Record<string, unknown> | Error)[], geminiAnswers: ({ text: string; modelVersion?: string } | Error)[] = []) {
    const create = vi.fn();
    for (const a of claudeAnswers) {
      if (a instanceof Error) create.mockRejectedValueOnce(a);
      else create.mockResolvedValueOnce({ model: 'claude-sonnet-5-5', stop_reason: 'end_turn', ...a });
    }
    setClaudeClientForTests({ messages: { create } } as never);
    const generateContent = vi.fn();
    for (const a of geminiAnswers) {
      if (a instanceof Error) generateContent.mockRejectedValueOnce(a);
      else generateContent.mockResolvedValueOnce(a);
    }
    const insert = vi.fn<(row: Record<string, unknown>) => Promise<{ error: null }>>(() => Promise.resolve({ error: null }));
    return {
      create,
      generateContent,
      insert,
      client: { models: { generateContent } } as never,
      logCtx: { supabase: { from: () => ({ insert }) } as never, endpoint: 'nutrition', userId: 'user-1' },
    };
  }
  const answer = (text: string, model = 'claude-sonnet-5-5') => ({ model, content: [{ type: 'text', text }] });

  it('sends a Claude model to Claude and logs what answered', async () => {
    const { create, generateContent, insert, client, logCtx } = setup([answer('{"ok":true}')]);
    await expect(generateJson(client, 'claude-sonnet-5-5', 'p', logCtx, { ...instant, thinking: false })).resolves.toEqual({ ok: true });
    expect(create).toHaveBeenCalledTimes(1);
    expect(generateContent).not.toHaveBeenCalled();
    expect(insert.mock.calls[0][0]).toMatchObject({ model: 'claude-sonnet-5-5', model_version: 'claude-sonnet-5-5', attempts: 1, status: 'success', thinking: 'low' });
  });

  it('records reasoning as on when the task keeps it', async () => {
    const { insert, client, logCtx } = setup([answer('{"ok":true}')]);
    await generateJson(client, 'claude-sonnet-5-5', 'p', logCtx, instant);
    expect(insert.mock.calls[0][0]).toMatchObject({ thinking: 'on' });
  });

  it('runs on Gemini when no Claude key is set, so deploying before the key exists is safe', async () => {
    const { generateContent, insert, client, logCtx } = setup([], [{ text: '{"ok":true}', modelVersion: 'hydrogen-001' }]);
    setClaudeClientForTests(null);
    await expect(generateJson(client, 'claude-sonnet-5-5', 'p', logCtx, instant)).resolves.toEqual({ ok: true });
    expect((generateContent.mock.calls[0][0] as { model: string }).model).toBe('gemini-4-hydrogen');
    expect(insert.mock.calls[0][0]).toMatchObject({ model: 'gemini-4-hydrogen', model_version: 'hydrogen-001', status: 'success' });
  });

  it('pairs Haiku with Gemini Lite and the larger models with Standard', () => {
    expect(fallbackModelFor('claude-haiku-5-5')).toBe('gemini-3.5-flash-lite');
    expect(fallbackModelFor('claude-sonnet-5-5')).toBe('gemini-4-hydrogen');
    expect(fallbackModelFor('claude-opus-5-5')).toBe('gemini-4-hydrogen');
  });

  it('retries an overloaded Claude, then hands over to Gemini', async () => {
    const overloaded = () => providerError(529, 'overloaded_error');
    const { create, generateContent, insert, client, logCtx } = setup([overloaded(), overloaded(), overloaded()], [{ text: '{"ok":true}' }]);
    await expect(generateJson(client, 'claude-haiku-5-5', 'p', logCtx, instant)).resolves.toEqual({ ok: true });
    expect(create).toHaveBeenCalledTimes(3);
    expect((generateContent.mock.calls[0][0] as { model: string }).model).toBe('gemini-3.5-flash-lite');
    expect(insert.mock.calls[0][0]).toMatchObject({ model: 'gemini-3.5-flash-lite', attempts: 4 });
  });

  it('hands over at once on a failure retrying cannot fix: out of credit, a bad key, a rejected request', async () => {
    for (const err of [providerError(402, 'billing_error'), providerError(401, 'authentication_error'), providerError(400, 'invalid_request_error')]) {
      const { create, generateContent, client } = setup([err], [{ text: '{"ok":true}' }]);
      await expect(generateJson(client, 'claude-sonnet-5-5', 'p', undefined, instant)).resolves.toEqual({ ok: true });
      expect(create).toHaveBeenCalledTimes(1);
      expect(generateContent).toHaveBeenCalledTimes(1);
    }
  });

  it('hands over when Claude declines or is cut off', async () => {
    const { generateContent, client } = setup([{ stop_reason: 'refusal', content: [] }], [{ text: '{"ok":true}' }]);
    await expect(generateJson(client, 'claude-sonnet-5-5', 'p', undefined, instant)).resolves.toEqual({ ok: true });
    expect(generateContent).toHaveBeenCalledTimes(1);
  });

  it('sends the repair to Claude when Claude answered first', async () => {
    const { create, generateContent, client } = setup([answer('{"ok":'), answer('{"ok":true}')]);
    await expect(generateJson(client, 'claude-sonnet-5-5', 'p', undefined, instant)).resolves.toEqual({ ok: true });
    expect(create).toHaveBeenCalledTimes(2);
    expect(generateContent).not.toHaveBeenCalled();
  });

  it('reads photos and PDFs with Claude, and falls back to Gemini for them too', async () => {
    const { create, client } = setup([answer('{"title":"x"}')]);
    const progress = { attempts: 0, model: '' };
    await expect(generateFromParts(client, 'claude-sonnet-5-5', [{ inlineData: { mimeType: 'image/png', data: 'AAA' } }, { text: 'read' }], instant, progress))
      .resolves.toEqual({ text: '{"title":"x"}', modelVersion: 'claude-sonnet-5-5' });
    const body = (create.mock.calls[0] as unknown as [{ messages: { content: unknown[] }[] }])[0];
    expect(body.messages[0].content).toEqual([
      { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAA' } },
      { type: 'text', text: 'read' },
    ]);
    expect(progress).toEqual({ attempts: 1, model: 'claude-sonnet-5-5' });

    const second = setup([providerError(529, 'overloaded_error'), providerError(529, 'overloaded_error'), providerError(529, 'overloaded_error')], [{ text: '{"title":"y"}' }]);
    const p2 = { attempts: 0, model: '' };
    await expect(generateFromParts(second.client, 'claude-sonnet-5-5', [{ text: 'read' }], instant, p2)).resolves.toMatchObject({ text: '{"title":"y"}' });
    expect(p2).toEqual({ attempts: 4, model: 'gemini-4-hydrogen' });
  });

  it('never shows a cook the text of an Anthropic error', () => {
    const fallback = 'Could not do that.';
    expect(describeGeminiError(providerError(400, 'invalid_request_error'), fallback)).toEqual({ status: 500, message: fallback, retryable: true });
    expect(describeGeminiError(providerError(529, 'overloaded_error'), fallback)).toMatchObject({ status: 503, retryable: true });
    expect(describeGeminiError(providerError(402, 'billing_error'), fallback)).toMatchObject({ status: 503, message: expect.stringContaining('usage limit') });
  });
});
