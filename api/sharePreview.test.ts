import { describe, it, expect, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { buildPreviewHtml, escapeAttribute, truncate, type PreviewRecipe } from './share-preview.js';

const base: PreviewRecipe = {
  title: 'Lentil Soup',
  description: 'Warming, cheap, and better the next day.',
  image_url: 'https://img.example/soup.jpg',
  servings: 4,
  prep_time_mins: 10,
  cook_time_mins: 25,
};

const URL_ = 'https://example.com/r/77777777-7777-7777-7777-777777777777';

describe('escapeAttribute', () => {
  it('neutralises the characters that would break out of an attribute', () => {
    expect(escapeAttribute('a "quote" & <tag>')).toBe('a &quot;quote&quot; &amp; &lt;tag&gt;');
    expect(escapeAttribute("it's")).toBe('it&#39;s');
  });

  it('escapes the ampersand first, so escapes are not double-encoded', () => {
    expect(escapeAttribute('&lt;')).toBe('&amp;lt;');
  });
});

describe('truncate', () => {
  it('collapses whitespace and leaves short text alone', () => {
    expect(truncate('a   b\n c')).toBe('a b c');
  });

  it('cuts long text to the limit, ellipsis included', () => {
    const out = truncate('x'.repeat(500));
    expect(out.length).toBe(200);
    expect(out.endsWith('…')).toBe(true);
  });
});

describe('buildPreviewHtml', () => {
  it('carries the title, description and photo a preview card needs', () => {
    const html = buildPreviewHtml(base, URL_, 'Speisekammer');
    expect(html).toContain('<meta property="og:title" content="Lentil Soup" />');
    expect(html).toContain('og:image" content="https://img.example/soup.jpg"');
    expect(html).toContain(`<meta property="og:url" content="${URL_}" />`);
    expect(html).toContain('summary_large_image');
  });

  it('mentions servings and total time, which is what makes a card useful', () => {
    const html = buildPreviewHtml(base, URL_, 'Speisekammer');
    expect(html).toMatch(/Serves 4/);
    expect(html).toMatch(/35 min/);
  });

  it('falls back to a plain summary card when there is no photo', () => {
    const html = buildPreviewHtml({ ...base, image_url: null }, URL_, 'Speisekammer');
    expect(html).not.toContain('og:image');
    expect(html).toContain('twitter:card" content="summary"');
  });

  it('still says something when the recipe has no description', () => {
    const html = buildPreviewHtml(
      { ...base, description: null, servings: null, prep_time_mins: null, cook_time_mins: null },
      URL_, 'Speisekammer',
    );
    expect(html).toMatch(/A recipe shared from Speisekammer/);
  });

  it('cannot be broken out of by a recipe title', () => {
    // The title is user-supplied and lands inside a double-quoted attribute.
    // Someone could name a recipe anything at all, including their own tags.
    const html = buildPreviewHtml(
      { ...base, title: '"><script>alert(1)</script>', description: '"><img onerror=x>' },
      URL_, 'Speisekammer',
    );
    // The payload survives as inert text; what matters is that no < or " of
    // theirs is still a < or " by the time it reaches the document.
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('"><');
    expect(html).toContain('&quot;&gt;&lt;script&gt;');
    expect(html).toContain('&quot;&gt;&lt;img onerror=x&gt;');
  });

  it('escapes a hostile image URL too', () => {
    const html = buildPreviewHtml({ ...base, image_url: 'https://x/"><script>y' }, URL_, 'Speisekammer');
    expect(html).not.toContain('<script>');
  });

  it('keeps shared recipes out of search results', () => {
    // A link is meant for the person it was sent to. noindex does not stop a
    // messenger drawing its card; it stops the recipe surfacing in a search.
    expect(buildPreviewHtml(base, URL_, 'Speisekammer'))
      .toContain('<meta name="robots" content="noindex" />');
  });

  it('exposes nothing beyond what a card shows', () => {
    const html = buildPreviewHtml(base, URL_, 'Speisekammer');
    for (const forbidden of ['notes', 'user_id', 'rating', 'instructions', 'ingredients']) {
      expect(html).not.toContain(forbidden);
    }
  });
});

describe('routing: only crawlers reach the renderer', () => {
  const cfg = JSON.parse(
    readFileSync(join(process.cwd(), 'vercel.json'), 'utf8'),
  ) as { rewrites: { source: string; destination: string; has?: { key: string; value: string }[] }[] };

  it('matches the crawler rule before the SPA catch-all', () => {
    // Rewrites are evaluated in order. Behind the catch-all this rule would
    // never fire and every preview would silently be the empty shell again.
    const crawlerIdx = cfg.rewrites.findIndex((r) => r.destination.startsWith('/api/share-preview'));
    const catchAllIdx = cfg.rewrites.findIndex((r) => r.destination === '/index.html');
    expect(crawlerIdx).toBeGreaterThanOrEqual(0);
    expect(crawlerIdx).toBeLessThan(catchAllIdx);
  });

  it('is conditional on the user agent, so people still get the real page', () => {
    const rule = cfg.rewrites.find((r) => r.destination.startsWith('/api/share-preview'))!;
    expect(rule.has?.[0].key).toBe('user-agent');
    expect(rule.source).toBe('/r/(.*)');
  });

  it('covers the messengers these links actually get pasted into', () => {
    const rule = cfg.rewrites.find((r) => r.destination.startsWith('/api/share-preview'))!;
    for (const bot of ['WhatsApp', 'Slackbot', 'Twitterbot', 'facebookexternalhit', 'TelegramBot', 'Discordbot']) {
      expect(rule.has![0].value).toContain(bot);
    }
  });

  it('passes the token through to the handler', () => {
    const rule = cfg.rewrites.find((r) => r.destination.startsWith('/api/share-preview'))!;
    expect(rule.destination).toBe('/api/share-preview?token=$1');
  });
});

describe('the Vercel function budget', () => {
  it('stays within the 12 the Hobby plan allows', () => {
    // CLAUDE.md calls this out: going over means the deploy fails, not that
    // something degrades.
    const fns = readdirSync(join(process.cwd(), 'api'))
      .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'));
    expect(fns.length).toBeLessThanOrEqual(12);
  });
});

describe('the handler', () => {
  function createResponse() {
    const res = {
      statusCode: 200,
      body: undefined as unknown,
      headers: {} as Record<string, string>,
      setHeader: vi.fn((k: string, v: string) => { res.headers[k] = v; }),
      status: vi.fn((c: number) => { res.statusCode = c; return res; }),
      send: vi.fn((b: unknown) => { res.body = b; return res; }),
      end: vi.fn(() => res),
      json: vi.fn((b: unknown) => { res.body = b; return res; }),
    };
    return res;
  }

  async function load(rpcResult: { data?: unknown; error?: unknown } | Error) {
    vi.resetModules();
    vi.doMock('./_lib/supabase.js', () => ({
      getServerSupabase: () => ({
        rpc: vi.fn(() => (rpcResult instanceof Error
          ? Promise.reject(rpcResult)
          : Promise.resolve(rpcResult))),
      }),
    }));
    const mod = await import('./share-preview.js');
    return mod.default;
  }

  const req = (token?: string) => ({
    query: token === undefined ? {} : { token },
    headers: { host: 'example.com' },
  });

  it('renders a card for a live token', async () => {
    const handler = await load({ data: [base], error: null });
    const res = createResponse();
    await handler(req('tok') as never, res as never);

    expect(res.statusCode).toBe(200);
    expect(res.headers['Content-Type']).toMatch(/text\/html/);
    expect(String(res.body)).toContain('og:title');
  });

  it('does not let a preview outlive a revoked link for long', async () => {
    const handler = await load({ data: [base], error: null });
    const res = createResponse();
    await handler(req('tok') as never, res as never);
    expect(res.headers['Cache-Control']).toMatch(/s-maxage=300/);
  });

  it('sends a revoked or unknown token to the real page rather than erroring', async () => {
    const handler = await load({ data: [], error: null });
    const res = createResponse();
    await handler(req('gone') as never, res as never);

    expect(res.statusCode).toBe(302);
    expect(res.headers.Location).toBe('https://example.com/r/gone');
  });

  it('survives the database being unreachable', async () => {
    // A preview is decoration. It must never be the reason a link looks broken.
    const handler = await load(new Error('connection refused'));
    const res = createResponse();
    await handler(req('tok') as never, res as never);

    expect(res.statusCode).toBe(302);
    expect(res.headers.Location).toBe('https://example.com/r/tok');
  });

  it('handles a missing token without throwing', async () => {
    const handler = await load({ data: [], error: null });
    const res = createResponse();
    await handler(req() as never, res as never);
    expect(res.statusCode).toBe(302);
  });
});
