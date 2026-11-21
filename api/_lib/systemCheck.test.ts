import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  EXPECTED_SCHEMA, HEALTH_ENDPOINT, checkUnsplash, configReport, describeProbeFailure, modelsToProbe,
  probeEmbedding, probeModel, reasoningReport, runLiveCheck, schemaCheck, taskForEndpoint,
} from './systemCheck';
import { NON_AI_ENDPOINTS } from '../../shared/usage';
import { OFFERED_MODELS } from './supabase';

const settings = { gemini_model: 'gemini-4-hydrogen', task_models: { tag: 'gemini-3.5-flash-lite' }, temperature_unit: 'C' as const };

function logTable() {
  const insert = vi.fn<(row: Record<string, unknown>) => Promise<{ error: null }>>(() => Promise.resolve({ error: null }));
  return { supabase: { from: vi.fn(() => ({ insert })) } as never, insert };
}

describe('configuration', () => {
  const secrets = {
    VITE_SUPABASE_URL: 'https://secret-project.supabase.co',
    VITE_SUPABASE_ANON_KEY: 'anon-secret-value',
    SUPABASE_SERVICE_KEY: 'service-secret-value',
    GEMINI_API_KEY_1: 'gemini-secret-value',
    VITE_ADMIN_EMAIL: 'owner@private.example',
  };

  it('never returns the value of anything it reports on', () => {
    const json = JSON.stringify(configReport({ ...secrets, UNSPLASH_ACCESS_KEY: 'unsplash-secret', SENTRY_DSN: 'https://dsn-secret@sentry.io/1' }));
    for (const value of [...Object.values(secrets), 'unsplash-secret', 'dsn-secret']) {
      expect(json).not.toContain(value);
    }
  });

  it('names the variable that is set, and fails only what the app cannot run without', () => {
    const report = Object.fromEntries(configReport({ ...secrets }).map((r) => [r.id, r]));
    expect(report['gemini-key']).toMatchObject({ status: 'ok', detail: 'Set (GEMINI_API_KEY_1).' });
    expect(report['unsplash-key'].status).toBe('warn');
    expect(report['allowed-origin'].status).toBe('warn');
    expect(report['allowed-origin'].detail).toMatch(/Any website/);

    const missingGemini = Object.fromEntries(configReport({ ...secrets, GEMINI_API_KEY_1: '' }).map((r) => [r.id, r]));
    expect(missingGemini['gemini-key'].status).toBe('fail');
    expect(configReport({ ...secrets, GEMINI_API_KEY_1: '', GEMINI_API_KEY: 'x' }).find((r) => r.id === 'gemini-key')?.detail).toBe('Set (GEMINI_API_KEY).');
  });
});

describe('reasoning per task', () => {
  it('shows every task, how it is configured, and what the logs recorded', () => {
    const rows = reasoningReport(settings, [
      { endpoint: 'translate', model: 'gemini-4-hydrogen', thinking: 'off', call_count: '12' },
      { endpoint: 'translate', model: 'gemini-4-argon', thinking: 'refused', call_count: 1 },
      { endpoint: 'extract-text', model: 'gemini-4-hydrogen', thinking: 'on', call_count: 2 },
      { endpoint: 'extract-photo', model: 'gemini-4-hydrogen', thinking: 'unrecorded', call_count: 3 },
      { endpoint: 'health-check', model: 'gemini-4-hydrogen', thinking: 'off', call_count: 5 },
      { endpoint: 'find-image', model: 'unsplash', thinking: 'unrecorded', call_count: 9 },
    ]);
    expect(rows.map((r) => r.task).sort()).toEqual(['extract', 'nutrition', 'scale', 'shopping', 'suggest', 'tag', 'translate']);
    const byTask = Object.fromEntries(rows.map((r) => [r.task, r]));
    expect(byTask.translate.reasoning).toBe('off');
    expect(byTask.tag).toMatchObject({ reasoning: 'off', model: 'gemini-3.5-flash-lite' });
    expect(byTask.extract).toMatchObject({ reasoning: 'on', model: 'gemini-4-hydrogen' });
    expect(byTask.translate.usage).toEqual([
      { model: 'gemini-4-argon', on: 0, off: 0, refused: 1, unrecorded: 0 },
      { model: 'gemini-4-hydrogen', on: 0, off: 12, refused: 0, unrecorded: 0 },
    ]);
    // Every source of extraction counts as the one task.
    expect(byTask.extract.usage).toEqual([{ model: 'gemini-4-hydrogen', on: 2, off: 0, refused: 0, unrecorded: 3 }]);
    // The check's own probes and the image search are no task's.
    expect(rows.flatMap((r) => r.usage).reduce((n, u) => n + u.on + u.off + u.refused + u.unrecorded, 0)).toBe(18);
  });

  it('still lists the configuration when the logs cannot be read', () => {
    const rows = reasoningReport(settings, null);
    expect(rows).toHaveLength(7);
    expect(rows.every((r) => r.usage.length === 0)).toBe(true);
  });

  it('maps log endpoints to tasks', () => {
    expect(taskForEndpoint('extract-pdf')).toBe('extract');
    expect(taskForEndpoint('nutrition')).toBe('nutrition');
    expect(taskForEndpoint(HEALTH_ENDPOINT)).toBeNull();
  });
});

describe('the check costs none of the daily allowance', () => {
  it('logs its probes under an endpoint the rate limit skips', () => {
    expect(NON_AI_ENDPOINTS).toContain(HEALTH_ENDPOINT);
  });
});

describe('database schema', () => {
  it('expects the newest migration in the repository', () => {
    // Bump EXPECTED_SCHEMA with every migration, or a deploy whose migration
    // job failed would read as healthy.
    const files = fs.readdirSync(path.resolve(process.cwd(), 'supabase/migrations')).filter((f) => /^\d+_.*\.sql$/.test(f)).sort();
    expect(EXPECTED_SCHEMA).toBe(files.at(-1)!.split('_')[0]);
  });

  it('fails behind, passes level or ahead, and warns when it cannot tell', () => {
    expect(schemaCheck({ latest_migration: '0066' }, null).status).toBe('fail');
    expect(schemaCheck({ latest_migration: EXPECTED_SCHEMA }, null).status).toBe('ok');
    expect(schemaCheck({ latest_migration: '9999' }, null).status).toBe('ok');
    expect(schemaCheck({ latest_migration: null }, null).status).toBe('warn');
    const missing = schemaCheck(null, { message: 'Could not find the function public.system_health' });
    expect(missing.status).toBe('fail');
    expect(missing.detail).toMatch(/Production Database Migration/);
  });
});

describe('a Gemini model', () => {
  const thinkingOnly = new Error('{"error":{"code":400,"message":"Budget 0 is invalid. This model only works in thinking mode.","status":"INVALID_ARGUMENT"}}');

  function client(...responses: ({ text: string; modelVersion?: string } | Error)[]) {
    const generateContent = vi.fn();
    for (const r of responses) {
      if (r instanceof Error) generateContent.mockRejectedValueOnce(r);
      else generateContent.mockResolvedValueOnce(r);
    }
    return { client: { models: { generateContent } } as never, generateContent };
  }

  it('answers and accepts reasoning off: one call, one log row', async () => {
    const { client: c, generateContent } = client({ text: '{"ok": true}', modelVersion: 'gemini-4-hydrogen-001' });
    const { supabase, insert } = logTable();
    const probe = await probeModel(c, 'gemini-4-hydrogen', { supabase, userId: 'admin' });
    expect(probe).toMatchObject({ status: 'ok', reasoning_off: 'accepted', model_version: 'gemini-4-hydrogen-001' });
    expect(generateContent).toHaveBeenCalledTimes(1);
    expect(generateContent.mock.calls[0][0].config.thinkingConfig).toEqual({ thinkingBudget: 0 });
    expect(insert).toHaveBeenCalledTimes(1);
    expect(insert.mock.calls[0][0]).toMatchObject({ endpoint: 'health-check', status: 'success', thinking: 'off', attempts: 1, user_id: 'admin' });
  });

  it('answers but refuses reasoning off: asked again with it on, still one row', async () => {
    const { client: c, generateContent } = client(thinkingOnly, { text: '{"ok":true}' });
    const { supabase, insert } = logTable();
    const probe = await probeModel(c, 'gemini-4-argon', { supabase, userId: 'admin' });
    expect(probe).toMatchObject({ status: 'ok', reasoning_off: 'refused' });
    expect(probe.detail).toMatch(/Refuses reasoning off/);
    expect(generateContent.mock.calls[1][0].config.thinkingConfig).toBeUndefined();
    expect(insert).toHaveBeenCalledTimes(1);
    expect(insert.mock.calls[0][0]).toMatchObject({ thinking: 'refused', attempts: 2 });
  });

  it('reports a model Google does not serve', async () => {
    const { client: c } = client(new Error('{"error":{"code":404,"message":"models/gemini-x is not found","status":"NOT_FOUND"}}'));
    const { supabase, insert } = logTable();
    const probe = await probeModel(c, 'gemini-x', { supabase, userId: 'admin' });
    expect(probe.status).toBe('fail');
    expect(probe.detail).toMatch(/does not serve this model id \(404\)/);
    expect(insert.mock.calls[0][0]).toMatchObject({ status: 'error' });
  });

  it('flags an answer that is not the JSON asked for', async () => {
    const { client: c } = client({ text: 'Sure! Here you go' });
    const probe = await probeModel(c, 'm', { ...logTable(), userId: null });
    expect(probe.status).toBe('warn');
  });

  it('says what each provider failure means', () => {
    expect(describeProbeFailure(new Error('{"error":{"code":403,"message":"Your project has been denied access.","status":"PERMISSION_DENIED"}}'))).toMatchObject({ status: 'fail' });
    expect(describeProbeFailure(new Error('{"error":{"code":429,"message":"limit: 0, Free Tier","status":"RESOURCE_EXHAUSTED"}}')).detail).toMatch(/billing/);
    expect(describeProbeFailure(new Error('{"error":{"code":503,"message":"overloaded","status":"UNAVAILABLE"}}')).status).toBe('warn');
    expect(describeProbeFailure(Object.assign(new Error('aborted'), { name: 'AbortError' })).detail).toMatch(/No answer within/);
  });

  it('checks the embedding model gives the 768 values recipe search stores', async () => {
    const ok = { models: { embedContent: vi.fn().mockResolvedValue({ embeddings: [{ values: new Array(768).fill(0) }] }) } } as never;
    expect((await probeEmbedding(ok, { ...logTable(), userId: null })).status).toBe('ok');
    const wrong = { models: { embedContent: vi.fn().mockResolvedValue({ embeddings: [{ values: [0.1] }] }) } } as never;
    expect((await probeEmbedding(wrong, { ...logTable(), userId: null })).status).toBe('fail');
  });
});

describe('which models are probed', () => {
  it('every offered tier, then any other id a user has configured', () => {
    expect(modelsToProbe(['gemini-4-hydrogen', 'gemini-custom', '', 'gemini-custom'])).toEqual([...OFFERED_MODELS, 'gemini-custom']);
    expect(modelsToProbe(null)).toEqual([...OFFERED_MODELS]);
  });
});

describe('Unsplash', () => {
  const res = (status: number, headers: Record<string, string> = {}) =>
    ({ status, ok: status >= 200 && status < 300, headers: new Headers(headers) }) as Response;

  it('is skipped without a key, and calls nothing', async () => {
    const fetchImpl = vi.fn();
    expect((await checkUnsplash({}, fetchImpl as never)).status).toBe('skipped');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('reports the hourly allowance left, or a refused key', async () => {
    const okFetch = vi.fn().mockResolvedValue(res(200, { 'x-ratelimit-remaining': '48', 'x-ratelimit-limit': '50' }));
    expect((await checkUnsplash({ UNSPLASH_ACCESS_KEY: 'k' }, okFetch as never)).detail).toMatch(/48 of 50/);
    const refused = vi.fn().mockResolvedValue(res(401));
    expect((await checkUnsplash({ UNSPLASH_ACCESS_KEY: 'k' }, refused as never)).status).toBe('fail');
  });
});

describe('the live check as a whole', () => {
  function supabaseFor(health: unknown) {
    const { insert } = logTable();
    return {
      from: vi.fn((table: string) => table === 'gemini_logs'
        ? { insert }
        : { select: () => Promise.resolve({ count: 3, error: null }) }),
      rpc: vi.fn(() => Promise.resolve({ data: health, error: null })),
      auth: { admin: { listUsers: () => Promise.resolve({ data: { users: [], total: 2 }, error: null }) } },
      storage: { getBucket: () => Promise.resolve({ data: { public: true, file_size_limit: 5242880 }, error: null }) },
    } as never;
  }

  it('without a Gemini key, makes no Gemini call and says why', async () => {
    const report = await runLiveCheck({
      supabase: supabaseFor({ latest_migration: EXPECTED_SCHEMA, realtime_recipes: true, configured_models: ['gemini-custom'] }),
      client: null, userId: 'admin', env: {},
    });
    expect(report.models.map((m) => m.model)).toEqual([...OFFERED_MODELS, 'gemini-custom', 'gemini-embedding-2']);
    expect(report.models.every((m) => m.status === 'skipped')).toBe(true);
    expect(Object.fromEntries(report.services.map((s) => [s.id, s.status]))).toEqual({
      database: 'ok', schema: 'ok', realtime: 'ok', auth: 'ok', storage: 'ok', unsplash: 'skipped',
    });
  });
});
