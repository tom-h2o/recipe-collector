import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ZodError } from 'zod';
import { setCorsHeaders } from './_lib/cors.js';
import { captureException } from './_lib/sentry.js';
import { findImageSchema } from './_lib/schemas.js';

const UNSPLASH_API = 'https://api.unsplash.com';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { title, description } = findImageSchema.parse(req.body);

    const accessKey = process.env.UNSPLASH_ACCESS_KEY;
    if (!accessKey) {
      // Graceful degradation — image search is optional
      return res.status(200).json({ imageUrl: '' });
    }

    // Build a focused food-photography search query
    const queryTerms = [title, description ? description.split(' ').slice(0, 4).join(' ') : '', 'food recipe']
      .filter(Boolean)
      .join(' ');
    const query = encodeURIComponent(queryTerms);

    const response = await fetch(
      `${UNSPLASH_API}/search/photos?query=${query}&per_page=1&orientation=landscape&content_filter=high`,
      {
        headers: {
          Authorization: `Client-ID ${accessKey}`,
          'Accept-Version': 'v1',
        },
      },
    );

    if (!response.ok) {
      console.warn('Unsplash request failed:', response.status, response.statusText);
      return res.status(200).json({ imageUrl: '' });
    }

    const data = await response.json() as { results?: { urls?: { regular?: string } }[] };
    const imageUrl = data.results?.[0]?.urls?.regular ?? '';

    return res.status(200).json({ imageUrl });
  } catch (err: unknown) {
    if (err instanceof ZodError) {
      return res.status(400).json({ error: err.errors[0]?.message ?? 'Invalid request' });
    }
    captureException(err);
    console.error('Find image error:', err);
    // Never fail a recipe save because of image search
    return res.status(200).json({ imageUrl: '' });
  }
}
