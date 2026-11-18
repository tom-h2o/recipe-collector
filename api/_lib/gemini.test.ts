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

describe('thinking budget', () => {
  /** A client whose generateContent returns the given responses in order. */
  function makeClient(...responses: { text: string }[]) {
    const generateContent = vi.fn();
    for (const r of responses) generateContent.mockResolvedValueOnce(r);
    return {
      client: { models: { generateContent } } as never,
      configs: () => generateContent.mock.calls.map((c) => c[0].config),
      generateContent,
    };
  }

  it('leaves reasoning on by default', async () => {
    const { client, configs } = makeClient({ text: '{"ok":true}' });
    await generateJson(client, 'gemini-4-hydrogen', 'p');
    expect(configs()[0].thinkingConfig).toBeUndefined();
  });

  it('disables it when an endpoint opts out', async () => {
    // 0 is DISABLED per the SDK's ThinkingConfig docs; -1 would be automatic.
    const { client, configs } = makeClient({ text: '{"ok":true}' });
    await generateJson(client, 'gemini-4-hydrogen', 'p', undefined, { thinking: false });
    expect(configs()[0].thinkingConfig).toEqual({ thinkingBudget: 0 });
  });

  it('keeps it disabled on the JSON repair retry', async () => {
    // The repair path is a second billed call; it must not quietly cost the
    // latency the first one was configured to avoid.
    const { client, configs } = makeClient({ text: 'not json' }, { text: '{"ok":true}' });
    await generateJson(client, 'gemini-4-hydrogen', 'p', undefined, { thinking: false });
    expect(configs()).toHaveLength(2);
    expect(configs()[1].thinkingConfig).toEqual({ thinkingBudget: 0 });
  });

  it('still constrains the response shape when reasoning is off', async () => {
    const { client, configs } = makeClient({ text: '{"ok":true}' });
    await generateJson(client, 'gemini-4-hydrogen', 'p', undefined, {
      thinking: false,
      responseSchema: { type: 'OBJECT' },
    });
    expect(configs()[0].responseSchema).toEqual({ type: 'OBJECT' });
    expect(configs()[0].responseMimeType).toBe('application/json');
  });
});
