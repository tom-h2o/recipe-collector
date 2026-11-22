import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * Photos and screenshots run on different models. A camera photo (curved
 * page, bad light, handwriting) is the `photo` task, Opus by default; a
 * screenshot holds clean digital text and is ordinary `extract`, Sonnet. The
 * browser says which (src/lib/imageKind.ts), since it re-encodes everything as
 * JPEG before upload and the server cannot tell afterwards.
 */

const h = vi.hoisted(() => ({
  generateFromParts: vi.fn(),
  inserted: [] as Record<string, unknown>[],
}));

vi.mock('./_lib/supabase.js', () => ({
  getServerSupabase: () => ({
    from: () => ({ insert: (row: Record<string, unknown>) => { h.inserted.push(row); return Promise.resolve({ error: null }); } }),
  }),
  getSettings: vi.fn().mockResolvedValue({
    gemini_model: 'claude-sonnet-5-5',
    task_models: { extract: 'claude-sonnet-5-5', photo: 'claude-opus-5-5' },
    temperature_unit: 'C',
  }),
  // Mirrors the real modelFor.
  modelFor: (s: { task_models?: Record<string, string>; gemini_model: string }, task: string) => s.task_models?.[task] || s.gemini_model,
  thinkingFor: (task: string) => !['translate', 'tag', 'nutrition'].includes(task),
  resolveApiKey: () => 'key',
  getUserId: vi.fn().mockResolvedValue('user-1'),
}));
vi.mock('./_lib/gemini.js', () => ({
  getGeminiClient: () => ({}),
  generateJson: vi.fn(),
  generateFromParts: h.generateFromParts,
  describeGeminiError: (_err: unknown, fallback: string) => ({ status: 500, message: fallback, retryable: true }),
}));
vi.mock('./_lib/rateLimit.js', () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, used: 0, limit: 100, remaining: 100 }),
}));

import handler from './extract';

const recipe = {
  title: 'Grandma\'s soup', description: '', original_language: 'de', servings: 4, prep_time_mins: null,
  cook_time_mins: null, ingredients: [{ amount: '1', name: 'onion', details: '' }], instructions: 'Cook.', image_url: '', source_name: '',
};

async function send(body: Record<string, unknown>) {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    setHeader: vi.fn(),
    status(code: number) { this.statusCode = code; return this; },
    json(payload: unknown) { this.body = payload; return this; },
    end() { return this; },
  };
  await handler({ method: 'POST', headers: { authorization: 'Bearer t' }, body } as unknown as VercelRequest, res as unknown as VercelResponse);
  return res;
}

const image = { data: 'AAAA', mimeType: 'image/jpeg' };

beforeEach(() => {
  h.inserted.length = 0;
  h.generateFromParts.mockReset();
  h.generateFromParts.mockImplementation(async (_client, model: string, _parts, _options, progress: { attempts: number; model: string }) => {
    progress.model = model;
    progress.attempts = 1;
    return { text: JSON.stringify(recipe), modelVersion: model };
  });
});

describe('photo and screenshot extraction', () => {
  it('reads a camera photo with the photo task\'s model, and logs it as extract-photo', async () => {
    const res = await send({ images: [image], kind: 'photo' });
    expect(res.statusCode).toBe(200);
    expect(h.generateFromParts.mock.calls[0][1]).toBe('claude-opus-5-5');
    expect(h.inserted[0]).toMatchObject({ endpoint: 'extract-photo', model: 'claude-opus-5-5', status: 'success' });
  });

  it('reads a screenshot with the extraction model, and logs it as extract-screenshot', async () => {
    const res = await send({ images: [image], kind: 'screenshot' });
    expect(res.statusCode).toBe(200);
    expect(h.generateFromParts.mock.calls[0][1]).toBe('claude-sonnet-5-5');
    expect(h.inserted[0]).toMatchObject({ endpoint: 'extract-screenshot', model: 'claude-sonnet-5-5' });
  });

  it('treats a client that does not say as sending photos, the harder case', async () => {
    await send({ images: [image] });
    expect(h.generateFromParts.mock.calls[0][1]).toBe('claude-opus-5-5');
    await send({ imageBase64: 'AAAA', mimeType: 'image/jpeg' });
    expect(h.generateFromParts.mock.calls[1][1]).toBe('claude-opus-5-5');
  });

  it('refuses a kind it does not know', async () => {
    const res = await send({ images: [image], kind: 'painting' });
    expect(res.statusCode).toBe(400);
    expect(h.generateFromParts).not.toHaveBeenCalled();
  });
});
