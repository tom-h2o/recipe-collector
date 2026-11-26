import { afterEach, describe, expect, it, vi } from 'vitest';
import type { VercelResponse } from '@vercel/node';
import { setCorsHeaders } from './cors';

function headersOf() {
  const headers: Record<string, string> = {};
  const res = { setHeader: (k: string, v: string) => { headers[k] = v; } } as unknown as VercelResponse;
  setCorsHeaders(res);
  return headers;
}

describe('setCorsHeaders', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('never allows credentials: sign-in is a header, not a cookie', () => {
    vi.stubEnv('ALLOWED_ORIGIN', '');
    expect(headersOf()).not.toHaveProperty('Access-Control-Allow-Credentials');
  });

  it('names the app\'s own origin when ALLOWED_ORIGIN is set', () => {
    vi.stubEnv('ALLOWED_ORIGIN', 'https://speisekammer.example');
    const headers = headersOf();
    expect(headers['Access-Control-Allow-Origin']).toBe('https://speisekammer.example');
    expect(headers).not.toHaveProperty('Access-Control-Allow-Credentials');
  });
});
