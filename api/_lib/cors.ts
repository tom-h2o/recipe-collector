import type { VercelResponse } from '@vercel/node';

/**
 * CORS for the API. Sign-in travels as a Bearer token in a header, never as a
 * cookie, so no request needs credentials and the header that allowed them is
 * gone: combined with a wildcard origin it invited a cookie-based setup to
 * become readable from any website. Set ALLOWED_ORIGIN in Vercel to the app's
 * own address to narrow it further; unset, any origin may call, which sign-in
 * still protects.
 */
export function setCorsHeaders(res: VercelResponse): void {
  const origin = process.env.ALLOWED_ORIGIN || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  if (origin !== '*') res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST,DELETE,PATCH');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}
