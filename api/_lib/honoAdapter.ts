/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Context } from 'hono';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export function adaptHandler(handler: (req: VercelRequest, res: VercelResponse) => Promise<any> | any) {
  return async (c: Context) => {
    let statusCode = 200;
    let responseData: any = null;
    let isEnded = false;

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

    // Mock VercelRequest
    const req = {
      method: c.req.method,
      headers,
      body,
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
      }
    } as unknown as VercelResponse;

    try {
      await handler(req, res);

      if (isEnded) {
        return c.body(null, statusCode as any);
      }
      return c.json(responseData, statusCode as any);
    } catch (err: any) {
      console.error('API adapter uncaught error:', err);
      return c.json({ error: err?.message || 'Internal Server Error' }, 500);
    }
  };
}
