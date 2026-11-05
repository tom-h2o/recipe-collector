import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { describeGeminiError } from './gemini.js';

/** Verbatim from gemini_logs, 15 September 2026 — three calls failed with this. */
const PROJECT_DENIED = new Error(
  '{"error":{"code":403,"message":"Your project has been denied access. Please contact support.","status":"PERMISSION_DENIED"}}',
);

describe('describeGeminiError', () => {
  it('never hands the provider envelope to the user', () => {
    const out = describeGeminiError(PROJECT_DENIED, 'Failed to tag recipe');
    expect(out.message).not.toContain('PERMISSION_DENIED');
    expect(out.message).not.toContain('{');
    expect(out.message).not.toContain('contact support');
  });

  it('says a configuration fault is not the user\'s recipe', () => {
    const out = describeGeminiError(PROJECT_DENIED, 'Failed to tag recipe');
    expect(out.message).toMatch(/configuration problem/i);
    expect(out.message).toMatch(/nothing is wrong with your recipe/i);
    // 503, not 500: nothing about the request was wrong.
    expect(out.status).toBe(503);
    expect(out.retryable).toBe(false);
  });

  it('distinguishes Google running out of quota from a transient outage', () => {
    const quota = describeGeminiError(new Error('{"error":{"code":429,"status":"RESOURCE_EXHAUSTED"}}'), 'x');
    expect(quota.message).toMatch(/usage limit/i);
    expect(quota.retryable).toBe(false);

    const busy = describeGeminiError(new Error('{"error":{"code":503,"status":"UNAVAILABLE"}}'), 'x');
    expect(busy.message).toMatch(/busy/i);
    expect(busy.retryable).toBe(true);
  });

  it('treats a retired model id as our configuration problem', () => {
    // How gemini-2.5-flash-lite behaved — see migration 0044.
    const out = describeGeminiError(new Error('{"error":{"code":404,"status":"NOT_FOUND"}}'), 'x');
    expect(out.message).toMatch(/configuration problem/i);
    expect(out.retryable).toBe(false);
  });

  it('keeps our own validation wording, which says more than a fallback', () => {
    // Zod messages about the model's output are ours and are genuinely useful;
    // sanitising them too would have thrown away information for no gain.
    const out = describeGeminiError(
      new Error('Invalid Gemini nutrition output: expected number, received NaN'),
      'Failed to estimate nutrition',
    );
    expect(out.message).toBe('Invalid Gemini nutrition output: expected number, received NaN');
    expect(out.status).toBe(500);
  });

  it('still refuses anything shaped like the provider envelope', () => {
    // An unrecognised provider error with a JSON body must not slip through the
    // branch above just because no code or status could be parsed out of it.
    const out = describeGeminiError(new Error('{"error":{"weird":"shape"}}'), 'Failed to tag recipe');
    expect(out.message).toBe('Failed to tag recipe');
  });

  it('reads the status off the error object as well as the message body', () => {
    expect(describeGeminiError({ status: 403 }, 'x').retryable).toBe(false);
    expect(describeGeminiError({ status: 'UNAVAILABLE' }, 'x').retryable).toBe(true);
  });

  it('copes with junk', () => {
    expect(describeGeminiError(null, 'fallback').message).toBe('fallback');
    expect(describeGeminiError(undefined, 'fallback').message).toBe('fallback');
    expect(describeGeminiError('a string', 'fallback').message).toBe('fallback');
  });
});

/**
 * The frontend renders the response's `error` field verbatim, so an endpoint
 * that passes err.message through shows the raw provider JSON to a cook.
 */
describe('no AI endpoint returns a raw provider message', () => {
  const apiDir = path.resolve(process.cwd(), 'api');
  const aiEndpoints = ['tag', 'nutrition', 'suggest', 'scale', 'shopping', 'translate', 'extract'];

  for (const name of aiEndpoints) {
    it(`${name}.ts maps its failure`, () => {
      const src = fs.readFileSync(path.join(apiDir, `${name}.ts`), 'utf8');
      expect(src, `${name}.ts still returns err.message to the client`)
        .not.toMatch(/json\(\{\s*error:\s*err instanceof Error \? err\.message/);
      expect(src).toMatch(/describeGeminiError/);
    });
  }
});
