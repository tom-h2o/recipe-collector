import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';

function createResponse() {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    headers: {} as Record<string, string>,
    setHeader: vi.fn((key: string, value: string) => { res.headers[key] = value; }),
    status: vi.fn((code: number) => { res.statusCode = code; return res; }),
    json: vi.fn((body: unknown) => { res.body = body; return res; }),
    end: vi.fn(() => res),
  };
  return res as unknown as VercelResponse & typeof res;
}

const requestBody = {
  recipeId: '550e8400-e29b-41d4-a716-446655440000',
  targetLanguage: 'de',
  title: 'Cake',
  description: 'Simple cake',
  instructions: 'Mix.\nChill.',
  ingredients: [{ amount: '200g', name: 'cream cheese', details: '' }],
};

const honestAnswer = {
  detectedSourceLanguage: 'en-US',
  title: 'Kuchen',
  description: ['Einfacher Kuchen'],
  instructions: ['Mischen.', 'Kalt stellen.'],
  ingredients: ['200g Frischkaese'],
};

async function loadHandler(options: { upsertError?: Error; answers?: unknown[] } = {}) {
  vi.resetModules();
  const upsert = vi.fn().mockResolvedValue({ error: options.upsertError ?? null });
  const updateSecondEq = vi.fn().mockResolvedValue({ error: null });
  const updateFirstEq = vi.fn(() => ({ eq: updateSecondEq }));
  const update = vi.fn(() => ({ eq: updateFirstEq }));
  const userCanReadRecipe = vi.fn().mockResolvedValue(true);
  const supabase = {
    from: vi.fn((table: string) => {
      if (table === 'recipe_translations') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
              })),
            })),
          })),
          upsert,
        };
      }
      if (table === 'recipes') return { update };
      return {};
    }),
  };

  // Stands in for the real generateJson where it matters here: an answer the
  // endpoint's `validate` refuses is asked for once more, and a second refusal
  // is thrown. The real thing is covered in _lib/gemini.test.ts.
  const answers = [...(options.answers ?? [honestAnswer])];
  const modelCalls = vi.fn();
  const generateJson = vi.fn(async (_client: unknown, _model: string, _prompt: string, _ctx: unknown, opts?: { validate?: (v: unknown) => void }) => {
    const next = () => { modelCalls(); return answers.length > 1 ? answers.shift() : answers[0]; };
    const first = next();
    try {
      opts?.validate?.(first);
      return first;
    } catch {
      const second = next();
      opts?.validate?.(second);
      return second;
    }
  });

  vi.doMock('./_lib/supabase.js', () => ({
    getServerSupabase: () => supabase,
    // Mirrors the real modelFor: per-task override, else the single model.
    // Kept in the mock rather than importOriginal so these stay unit tests.
    modelFor: (s: { task_models?: Record<string, string>; gemini_model: string }, task: string) =>
      s.task_models?.[task] || s.gemini_model,
    getSettings: vi.fn().mockResolvedValue({
      gemini_model: 'gemini-test',
      temperature_unit: 'C',
    }),
    resolveApiKey: () => 'key',
    getUserId: vi.fn().mockResolvedValue('user-1'),
    userCanReadRecipe,
  }));
  vi.doMock('./_lib/rateLimit.js', () => ({
    checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, used: 0, limit: 100, remaining: 100 }),
  }));
  vi.doMock('./_lib/gemini.js', () => ({
    getGeminiClient: () => ({}),
    // Mirrors the real describeGeminiError closely enough for these tests:
    // our own error wording is preserved, a provider envelope is not.
    describeGeminiError: (err: unknown, fallback: string) => {
      const raw = err instanceof Error ? err.message : '';
      return raw && !raw.trimStart().startsWith('{')
        ? { status: 500, message: raw, retryable: true }
        : { status: 500, message: fallback, retryable: true };
    },
    generateJson,
  }));

  const mod = await import('./translate');
  return { handler: mod.default, upsert, userCanReadRecipe, modelCalls, generateJson };
}

describe('/api/translate', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('normalizes imperfect Gemini translation output before returning it', async () => {
    const { handler, upsert } = await loadHandler();
    const res = createResponse();

    await handler({ method: 'POST', headers: {}, body: requestBody } as VercelRequest, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      title: 'Kuchen',
      description: 'Einfacher Kuchen',
      instructions: 'Mischen.\nKalt stellen.',
      detectedSourceLanguage: 'en',
      cached: false,
    });
    expect((res.body as { ingredients: unknown }).ingredients).toEqual([
      { amount: '', name: '200g Frischkaese', details: '' },
    ]);
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ title: 'Kuchen' }), { onConflict: 'recipe_id,language_code' });
  });

  it('rejects recipes the user cannot even see', async () => {
    const { handler, userCanReadRecipe } = await loadHandler();
    userCanReadRecipe.mockResolvedValue(false);
    const res = createResponse();

    await handler({ method: 'POST', headers: {}, body: requestBody } as VercelRequest, res);

    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ error: 'Forbidden' });
  });

  it('fails when the translation cannot be persisted', async () => {
    const { handler } = await loadHandler({ upsertError: new Error('insert failed') });
    const res = createResponse();

    await handler({ method: 'POST', headers: {}, body: requestBody } as VercelRequest, res);

    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: 'insert failed' });
  });
});

describe('/api/translate: whose recipes can be translated', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('translates a recipe belonging to a linked account', async () => {
    // Regression: the endpoint gated on ownership while `recipes_select`
    // (migration 0049) lets a linked account read the recipe and RecipeDetail
    // offers it the language picker. Every such attempt came back 403, which
    // is what "the language feature is unreliable" looked like from outside.
    const { handler, userCanReadRecipe } = await loadHandler();
    userCanReadRecipe.mockResolvedValue(true);

    const res = createResponse();

    await handler({ method: 'POST', headers: {}, body: requestBody } as VercelRequest, res);

    expect(res.statusCode).toBe(200);
    expect(userCanReadRecipe).toHaveBeenCalled();
  });

  it('asks about read visibility, never about ownership', async () => {
    // Guards the fix itself: swapping back to an ownership check would make
    // every linked recipe fail again, and no other assertion here would notice.
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const src = readFileSync(join(process.cwd(), 'api', 'translate.ts'), 'utf8');
    expect(src).toMatch(/userCanReadRecipe\(/);
    expect(src).not.toMatch(/userOwnsRecipe\(/);
  });
});

describe('/api/translate: latency', () => {
  it('asks the model not to spend time reasoning', async () => {
    // Translating given text into a given shape leaves nothing to reason
    // about, and the thinking pass is what makes this the endpoint people
    // wait on. Guards against the option being dropped in a refactor.
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const src = readFileSync(join(process.cwd(), 'api', 'translate.ts'), 'utf8');
    expect(src).toMatch(/thinking:\s*false/);
  });
});

describe('/api/translate: what gets stored', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // What the model really returned for a stored translation: a valid string
  // in the right field, so the response schema had nothing to object to.
  const leaked = { ...honestAnswer, title: 'Kuchen``` Wait! I almost output extra text and markdown!...' };

  it('never stores a garbled translation', async () => {
    // A stored row is served from the cache on every later open, so letting
    // this through made the recipe unreadable in that language until someone
    // deleted the translation by hand.
    const { handler, upsert, modelCalls } = await loadHandler({ answers: [leaked] });
    const res = createResponse();

    await handler({ method: 'POST', headers: {}, body: requestBody } as VercelRequest, res);

    expect(upsert).not.toHaveBeenCalled();
    expect(modelCalls).toHaveBeenCalledTimes(2);
    expect(res.statusCode).toBe(500);
    expect((res.body as { error: string }).error).toBe(
      'The translation came back garbled (the title contains a code fence), so it was not saved. Please try again.',
    );
  });

  it('stores the second answer when only the first was garbled', async () => {
    const { handler, upsert } = await loadHandler({ answers: [leaked, honestAnswer] });
    const res = createResponse();

    await handler({ method: 'POST', headers: {}, body: requestBody } as VercelRequest, res);

    expect(res.statusCode).toBe(200);
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ title: 'Kuchen' }), { onConflict: 'recipe_id,language_code' });
  });

  it('refuses a translation that lost an ingredient', async () => {
    const body = { ...requestBody, ingredients: [...requestBody.ingredients, { amount: '2', name: 'eggs', details: '' }] };
    const { handler, upsert } = await loadHandler();
    const res = createResponse();

    await handler({ method: 'POST', headers: {}, body } as VercelRequest, res);

    expect(upsert).not.toHaveBeenCalled();
    expect((res.body as { error: string }).error).toMatch(/1 ingredients where the recipe has 2/);
  });
});

describe('/api/translate: one step stays one step', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const fourSteps = {
    ...requestBody,
    instructions: 'Melt the butter.\nStir in the flour.\n\nAdd the milk slowly.\nSimmer for 5 minutes.',
  };
  const german = ['Butter schmelzen.', 'Mehl einrühren.', 'Milch langsam zugeben.', '5 Minuten köcheln lassen.'];

  it('sends the steps as a list and says how many there are', async () => {
    const { handler, generateJson } = await loadHandler({ answers: [{ ...honestAnswer, instructions: german }] });
    const res = createResponse();

    await handler({ method: 'POST', headers: {}, body: fourSteps } as VercelRequest, res);

    const prompt = generateJson.mock.calls[0][2] as string;
    // An array, not one string with line breaks in it. The blank line between
    // two steps is not a step.
    expect(prompt).toContain('"instructions": ["Melt the butter.","Stir in the flour.","Add the milk slowly.","Simmer for 5 minutes."]');
    expect(prompt).toContain('must have exactly 4 entries');
  });

  it('stores four translated steps as four steps', async () => {
    const { handler, upsert } = await loadHandler({ answers: [{ ...honestAnswer, instructions: german }] });
    const res = createResponse();

    await handler({ method: 'POST', headers: {}, body: fourSteps } as VercelRequest, res);

    expect(res.statusCode).toBe(200);
    expect((res.body as { instructions: string }).instructions).toBe(german.join('\n'));
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ instructions: german.join('\n') }), expect.anything());
  });

  it('never stores a translation that ran the steps together', async () => {
    // The reported fault: steps 1 to 4 came back as a single point.
    const merged = { ...honestAnswer, instructions: german.join(' ') };
    const { handler, upsert, modelCalls } = await loadHandler({ answers: [merged] });
    const res = createResponse();

    await handler({ method: 'POST', headers: {}, body: fourSteps } as VercelRequest, res);

    expect(upsert).not.toHaveBeenCalled();
    expect(modelCalls).toHaveBeenCalledTimes(2);            // asked once more, then given up
    expect((res.body as { error: string }).error).toMatch(/it has 1 step where the recipe has 4/);
  });

  it('accepts the second answer when the first ran the steps together', async () => {
    const merged = { ...honestAnswer, instructions: [german.join(' ')] };
    const { handler, upsert } = await loadHandler({ answers: [merged, { ...honestAnswer, instructions: german }] });
    const res = createResponse();

    await handler({ method: 'POST', headers: {}, body: fourSteps } as VercelRequest, res);

    expect(res.statusCode).toBe(200);
    expect(upsert).toHaveBeenCalledTimes(1);
  });

  it('does not let a line break inside one step turn it into two', async () => {
    const wrapped = { ...honestAnswer, instructions: ['Butter\nschmelzen.', 'Mehl einrühren.', 'Milch langsam zugeben.', '5 Minuten köcheln lassen.'] };
    const { handler } = await loadHandler({ answers: [wrapped] });
    const res = createResponse();

    await handler({ method: 'POST', headers: {}, body: fourSteps } as VercelRequest, res);

    expect(res.statusCode).toBe(200);
    expect((res.body as { instructions: string }).instructions.split('\n')).toEqual(german);
  });
});

