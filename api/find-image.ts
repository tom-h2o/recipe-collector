import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ZodError } from 'zod';
import { setCorsHeaders } from './_lib/cors.js';
import { getServerSupabase, getUserId } from './_lib/supabase.js';
import { checkRateLimit } from './_lib/rateLimit.js';
import { captureException } from './_lib/sentry.js';
import { findImageSchema } from './_lib/schemas.js';

const UNSPLASH_API = 'https://api.unsplash.com';

/** Separate from the Gemini allowance — this endpoint costs no AI quota. */
const FIND_IMAGE_DAILY_LIMIT = 200;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { title, description } = findImageSchema.parse(req.body);
    const supabase = getServerSupabase();
    const userId = await getUserId(req.headers.authorization as string | undefined);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    // Unsplash, not Gemini. This used to consume the shared AI allowance, so a
    // cover lookup could be the reason an extraction was refused. It now has its
    // own generous budget, counted from its own log rows.
    const rl = await checkRateLimit(supabase, userId, { endpoint: 'find-image', limit: FIND_IMAGE_DAILY_LIMIT });
    if (!rl.allowed) return res.status(429).json({ error: `Daily image lookup limit reached (${rl.limit}/day). Resets at midnight UTC.` });

    const accessKey = process.env.UNSPLASH_ACCESS_KEY;
    if (!accessKey) return res.status(200).json({ imageUrl: '' });

    const queryTerms = [title, description ? description.split(' ').slice(0, 4).join(' ') : '', 'food recipe'].filter(Boolean).join(' ');
    const startTime = Date.now();
    const response = await fetch(`${UNSPLASH_API}/search/photos?query=${encodeURIComponent(queryTerms)}&per_page=1&orientation=landscape&content_filter=high`, { headers: { Authorization: `Client-ID ${accessKey}`, 'Accept-Version': 'v1' } });

    if (!response.ok) {
      console.warn('Unsplash request failed:', response.status, response.statusText);
      return res.status(200).json({ imageUrl: '' });
    }

    const data = await response.json() as { results?: { urls?: { regular?: string } }[] };
    const imageUrl = data.results?.[0]?.urls?.regular ?? '';

    // Logged so the lookup is visible in usage and its own limit can be counted.
    // model is 'unsplash' rather than a Gemini id, so AI spend stays separable.
    supabase.from('gemini_logs').insert({
      endpoint: 'find-image',
      model: 'unsplash',
      status: 'success',
      latency_ms: Date.now() - startTime,
      input_preview: queryTerms.substring(0, 300),
      output_preview: imageUrl.substring(0, 300),
      user_id: userId,
    }).then(() => {}, () => {});

    return res.status(200).json({ imageUrl });
  } catch (err: unknown) {
    if (err instanceof ZodError) return res.status(400).json({ error: err.issues[0]?.message ?? 'Invalid request' });
    captureException(err);
    console.error('Find image error:', err);
    return res.status(200).json({ imageUrl: '' });
  }
}
