import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { Hono } from 'hono';

/**
 * hono/vercel's built-in `handle()` is designed for the Edge Runtime and passes
 * the raw IncomingMessage to app.fetch(), which expects a Fetch API Request.
 * Hono then calls new URL(req.url) on a bare path string, throwing Invalid URL
 * and causing FUNCTION_INVOCATION_FAILED on every request.
 *
 * This adapter properly converts the Node.js request to a Fetch API Request
 * before handing off to Hono.
 */
export function handle(app: Hono) {
  return async (req: VercelRequest, res: VercelResponse) => {
    const proto = (req.headers['x-forwarded-proto'] as string | undefined)?.split(',')[0]?.trim() ?? 'https';
    const host = (req.headers['x-forwarded-host'] as string | undefined) ?? (req.headers.host as string | undefined) ?? 'localhost';
    const url = new URL(req.url ?? '/', `${proto}://${host}`);

    // Vercel pre-parses JSON bodies into req.body; re-serialise for the Fetch Request.
    // For non-JSON bodies (file uploads sent as base64 JSON) this path also works
    // because the client always sends Content-Type: application/json.
    const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
    const rawBody = hasBody && req.body != null
      ? JSON.stringify(req.body)
      : hasBody
      ? await readStream(req)
      : undefined;

    const headers = new Headers();
    for (const [key, val] of Object.entries(req.headers)) {
      if (val == null) continue;
      if (Array.isArray(val)) val.forEach((v) => headers.append(key, v));
      else headers.set(key, val);
    }

    const request = new Request(url.toString(), {
      method: req.method,
      headers,
      body: rawBody ?? undefined,
    });

    const response = await app.fetch(request);

    res.status(response.status);
    response.headers.forEach((val, key) => res.setHeader(key, val));
    const buf = Buffer.from(await response.arrayBuffer());
    res.end(buf);
  };
}

async function readStream(req: VercelRequest): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf8');
}
