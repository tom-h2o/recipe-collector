import type { Context } from 'hono';
import { ZodError } from 'zod';
import { captureException } from './_lib/sentry.js';
import { findImageSchema } from './_lib/schemas.js';

const UNSPLASH_API = 'https://api.unsplash.com';

export default async function handler(c: Context) {
  try {
    const body = await c.req.json().catch(() => ({}));
    const { title, description } = findImageSchema.parse(body);

    const accessKey = process.env.UNSPLASH_ACCESS_KEY;
    if (!accessKey) return c.json({ imageUrl: '' });

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
      return c.json({ imageUrl: '' });
    }

    const data = await response.json() as { results?: { urls?: { regular?: string } }[] };
    const imageUrl = data.results?.[0]?.urls?.regular ?? '';

    return c.json({ imageUrl });
  } catch (err: unknown) {
    if (err instanceof ZodError) return c.json({ error: err.errors[0]?.message ?? 'Invalid request' }, 400);
    captureException(err);
    console.error('Find image error:', err);
    return c.json({ imageUrl: '' });
  }
}
