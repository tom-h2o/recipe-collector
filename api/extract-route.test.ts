import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const validRecipe = {
  title: 'Philadelphia-Torte',
  description: 'No bake cake',
  original_language: 'de',
  servings: 12,
  prep_time_mins: 30,
  cook_time_mins: 0,
  ingredients: [{ amount: '200 g', name: 'Kekse', details: '' }],
  instructions: 'Kekse zerkleinern.',
  image_url: 'https://example.com/torte.jpg',
  source_name: 'Emmi',
};

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

function recipeHtml() {
  return `
    <html lang="de-DE">
      <head>
        <title>Philadelphia-Torte</title>
        <script type="application/ld+json">
          {
            "@context": "https://schema.org",
            "@type": "Recipe",
            "name": "Philadelphia-Torte",
            "recipeYield": "12 Personen",
            "prepTime": "PT30M",
            "cookTime": "PT0M",
            "recipeIngredient": ["200 g Kekse"],
            "recipeInstructions": [{ "@type": "HowToStep", "text": "Kekse zerkleinern." }]
          }
        </script>
      </head>
      <body><main>Philadelphia-Torte Rezept Kekse zerkleinern.</main></body>
    </html>
  `;
}

async function loadHandler(overrides: {
  cached?: unknown;
  rateAllowed?: boolean;
  generated?: unknown;
} = {}) {
  vi.resetModules();
  const generateJson = vi.fn().mockResolvedValue(overrides.generated ?? validRecipe);
  const getCached = vi.fn().mockResolvedValue(overrides.cached ?? null);
  const setCached = vi.fn();
  const checkRateLimit = vi.fn().mockResolvedValue({ allowed: overrides.rateAllowed ?? true, used: 0, limit: 100, remaining: 100 });

  vi.doMock('./_lib/supabase.js', () => ({
    getServerSupabase: () => ({}),
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
  }));
  vi.doMock('./_lib/gemini.js', () => ({
    getGeminiClient: () => ({}),
    generateJson,
  }));
  vi.doMock('./_lib/cache.js', () => ({
    getCached,
    makeCacheKey: vi.fn(() => 'cache-key'),
    setCached,
  }));
  vi.doMock('./_lib/rateLimit.js', () => ({ checkRateLimit }));
  vi.doMock('./_lib/publicUrl.js', () => ({
    assertPublicHttpUrl: vi.fn((url: string) => Promise.resolve(new URL(url))),
    fetchPublicUrl: vi.fn((url: string, init?: RequestInit) => fetch(new URL(url), init)),
  }));
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    text: () => Promise.resolve(recipeHtml()),
  }));
  vi.spyOn(console, 'info').mockImplementation(() => undefined);

  const mod = await import('./extract');
  return { handler: mod.default, generateJson, getCached, setCached, checkRateLimit };
}

describe('/api/extract', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('returns a cached Gemini result only when the effective extraction input matches', async () => {
    const { handler, generateJson } = await loadHandler({ cached: validRecipe });
    const res = createResponse();

    await handler({ method: 'POST', body: { url: 'https://example.com/recipe' }, headers: {} } as VercelRequest, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ title: validRecipe.title, cached: true, structured_data_found: true });
    expect(generateJson).not.toHaveBeenCalled();
  });

  it('rate-limits uncached URL extraction before calling Gemini', async () => {
    const { handler, generateJson } = await loadHandler({ rateAllowed: false });
    const res = createResponse();

    await handler({ method: 'POST', body: { url: 'https://example.com/recipe' }, headers: {} } as VercelRequest, res);

    expect(res.statusCode).toBe(429);
    expect(generateJson).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid URL extraction bodies', async () => {
    const { handler } = await loadHandler();
    const res = createResponse();

    await handler({ method: 'POST', body: { url: 'not-a-url' }, headers: {} } as VercelRequest, res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: 'A valid URL is required' });
  });
});
