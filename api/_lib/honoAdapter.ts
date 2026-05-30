/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Context } from 'hono';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export function adaptHandler(handler: (req: VercelRequest, res: VercelResponse) => Promise<any> | any) {
  return async (c: Context) => {
    let statusCode = 200;
    let responseData: any = null;
    let isEnded = false;
    const responseHeaders: Record<string, string> = {};

    // Parse body based on request content type
    let body: any = {};
    try {
      if (c.req.header('content-type')?.includes('application/json')) {
        body = await c.req.json();
      }
    } catch {
      // Body might be empty or invalid, fallback to empty object
    }

    // Lowercase headers for Node.js compatibility
    const headers: Record<string, string> = {};
    for (const [key, val] of Object.entries(c.req.header())) {
      headers[key.toLowerCase()] = val;
    }

    // Parse query string from URL
    const url = new URL(c.req.url);
    const query: Record<string, string> = {};
    url.searchParams.forEach((val, key) => { query[key] = val; });

    // Mock VercelRequest
    const req = {
      method: c.req.method,
      headers,
      body,
      query,
    } as unknown as VercelRequest;

    // Mock VercelResponse
    const res = {
      status(code: number) {
        statusCode = code;
        return this;
      },
      json(data: any) {
        responseData = data;
        return this;
      },
      end() {
        isEnded = true;
        return this;
      },
      setHeader(name: string, value: string) {
        responseHeaders[name] = value;
        return this;
      },
    } as unknown as VercelResponse;

    try {
      await handler(req, res);

      const honoRes = isEnded
        ? c.body(null, statusCode as any)
        : c.json(responseData, statusCode as any);

      for (const [name, value] of Object.entries(responseHeaders)) {
        c.header(name, value);
      }
      return honoRes;
    } catch (err: any) {
      console.error('API adapter uncaught error:', err);
      return c.json({ error: err?.message || 'Internal Server Error' }, 500);
    }
  };
}
