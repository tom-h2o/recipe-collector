import { describe, expect, it, vi } from 'vitest';
import { generateJson } from './gemini';

describe('generateJson', () => {
  it('repairs malformed model JSON once before failing the request', async () => {
    const generateContent = vi.fn()
      .mockResolvedValueOnce({ text: '{"title":"Broken "quote""}' })
      .mockResolvedValueOnce({ text: '{"title":"Broken quote"}' });
    const client = { models: { generateContent } };
    const supabase = {
      from: vi.fn(() => ({
        insert: vi.fn(() => Promise.resolve({ error: null })),
      })),
    };

    await expect(generateJson(client as never, 'gemini-test', 'extract prompt', {
      supabase: supabase as never,
      endpoint: 'extract',
      userId: 'user-1',
    })).resolves.toEqual({ title: 'Broken quote' });

    expect(generateContent).toHaveBeenCalledTimes(2);
    expect(generateContent.mock.calls[1][0].contents).toContain('Repair the following invalid JSON');
  });
});
