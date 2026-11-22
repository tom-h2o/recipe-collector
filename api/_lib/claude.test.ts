import { AVAILABLE_TAGS } from '../../shared/tags';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Type, type Schema } from '@google/genai';
import * as responseSchemas from './responseSchemas';
import {
  CLAUDE_MAX_TOKENS, ClaudeAnswerError, ClaudeNotConfiguredError, askClaude, claudeFormat,
  isClaudeModel, setClaudeClientForTests, toClaudeContent, toJsonSchema,
} from './claude';

afterEach(() => setClaudeClientForTests(undefined));

/** Every object in a JSON Schema, however deeply nested. */
function objects(node: unknown, out: Record<string, unknown>[] = []): Record<string, unknown>[] {
  if (Array.isArray(node)) node.forEach((n) => objects(n, out));
  else if (node && typeof node === 'object') {
    const o = node as Record<string, unknown>;
    if (o.type === 'object') out.push(o);
    Object.values(o).forEach((v) => objects(v, out));
  }
  return out;
}

describe('the answer formats sent to Claude', () => {
  const all = Object.entries(responseSchemas).filter(([, v]) => v && typeof v === 'object' && 'type' in (v as object)) as [string, Schema][];

  it('converts every response schema the app has', () => {
    expect(all.length).toBeGreaterThanOrEqual(7);
    for (const [, schema] of all) expect(() => claudeFormat(schema)).not.toThrow();
  });

  it('closes every object, as structured outputs require', () => {
    for (const [name, schema] of all) {
      for (const o of objects(claudeFormat(schema).schema)) {
        expect(o.additionalProperties, `${name}: an object without additionalProperties: false`).toBe(false);
      }
    }
  });

  it('carries nothing structured outputs reject', () => {
    const text = JSON.stringify(all.map(([, s]) => claudeFormat(s).schema));
    for (const word of ['propertyOrdering', 'nullable', 'minLength', 'maxLength', 'minimum', 'maximum', 'minItems', 'maxItems']) {
      expect(text).not.toContain(word);
    }
    // Gemini's upper-case type names must not leak through.
    expect(text).not.toMatch(/"type":"(OBJECT|ARRAY|STRING|INTEGER|NUMBER|BOOLEAN)"/);
  });

  it('keeps the required fields and turns nullable into a union with null', () => {
    const json = toJsonSchema(responseSchemas.extractedRecipeResponseSchema) as { required: string[]; properties: Record<string, unknown> };
    expect(json.required).toEqual(responseSchemas.extractedRecipeResponseSchema.required);
    expect(json.properties.servings).toEqual({ anyOf: [{ type: 'integer' }, { type: 'null' }] });
    expect(json.properties.title).toEqual({ type: 'string' });
  });

  it('keeps an enum', () => {
    expect(toJsonSchema({ type: Type.STRING, enum: ['a', 'b'] })).toEqual({ type: 'string', enum: ['a', 'b'] });
  });

  it('wraps a bare list in an object, and leaves an object alone', () => {
    // The tag list travels as an enum: Claude can answer only with tags on it.
    expect(claudeFormat(responseSchemas.tagResponseSchema)).toEqual({
      schema: { type: 'object', properties: { result: { type: 'array', items: { type: 'string', enum: [...AVAILABLE_TAGS] } } }, required: ['result'], additionalProperties: false },
      wrapped: true,
    });
    expect(claudeFormat(responseSchemas.nutritionResponseSchema).wrapped).toBe(false);
  });
});

describe('files sent to Claude', () => {
  it('turns photos, a PDF and text into the matching blocks, in order', () => {
    expect(toClaudeContent([
      { inlineData: { mimeType: 'image/jpeg', data: 'AAA' } },
      { inlineData: { mimeType: 'application/pdf', data: 'BBB' } },
      { text: 'read this' },
    ])).toEqual([
      { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'AAA' } },
      { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: 'BBB' } },
      { type: 'text', text: 'read this' },
    ]);
  });

  it('refuses a type Claude cannot read, which sends the request to Gemini instead', () => {
    expect(() => toClaudeContent([{ inlineData: { mimeType: 'image/heic', data: 'x' } }])).toThrow('image/heic');
  });
});

describe('askClaude', () => {
  function fakeClient(message: Record<string, unknown>) {
    const create = vi.fn(async () => ({ model: 'claude-sonnet-5-5', stop_reason: 'end_turn', content: [], ...message }));
    setClaudeClientForTests({ messages: { create } } as never);
    return create;
  }
  const textAnswer = (text: string) => ({ content: [{ type: 'thinking', thinking: '', signature: 's' }, { type: 'text', text }] });

  it('recognises Claude model ids', () => {
    expect(isClaudeModel('claude-haiku-5-5')).toBe(true);
    expect(isClaudeModel('gemini-4-hydrogen')).toBe(false);
  });

  it('fails at once, before any request, when no key is set', async () => {
    setClaudeClientForTests(null);
    await expect(askClaude({ model: 'claude-sonnet-5-5', content: 'p', reasoning: true })).rejects.toBeInstanceOf(ClaudeNotConfiguredError);
  });

  it('sends the format, never a temperature, and asks for low effort when reasoning is off', async () => {
    const create = fakeClient(textAnswer('{"calories":1,"protein_g":1,"carbs_g":1,"fat_g":1,"fiber_g":1}'));
    await askClaude({ model: 'claude-haiku-5-5', content: 'p', schema: responseSchemas.nutritionResponseSchema, reasoning: false, timeoutMs: 5000 });
    const [body, options] = create.mock.calls[0] as unknown as [Record<string, unknown>, Record<string, unknown>];
    expect(body).toMatchObject({ model: 'claude-haiku-5-5', max_tokens: CLAUDE_MAX_TOKENS, messages: [{ role: 'user', content: 'p' }] });
    expect(body).not.toHaveProperty('temperature');
    expect(body.output_config).toEqual({ format: { type: 'json_schema', schema: claudeFormat(responseSchemas.nutritionResponseSchema).schema }, effort: 'low' });
    expect(options).toEqual({ timeout: 5000 });
  });

  it('leaves effort to the model when reasoning is on', async () => {
    const create = fakeClient(textAnswer('{}'));
    await askClaude({ model: 'claude-sonnet-5-5', content: 'p', reasoning: true });
    expect(create.mock.calls[0] as unknown[]).not.toContainEqual(expect.objectContaining({ output_config: expect.anything() }));
  });

  it('reads the answer from the text blocks, past any thinking block', async () => {
    fakeClient(textAnswer('{"ok":true}'));
    await expect(askClaude({ model: 'claude-sonnet-5-5', content: 'p', reasoning: true })).resolves.toEqual({ text: '{"ok":true}', modelVersion: 'claude-sonnet-5-5' });
  });

  it('unwraps a bare list, so callers see the shape Gemini would return', async () => {
    fakeClient(textAnswer('{"result":["Vegan","Quick (<30min)"]}'));
    const out = await askClaude({ model: 'claude-haiku-5-5', content: 'p', schema: responseSchemas.tagResponseSchema, reasoning: false });
    expect(JSON.parse(out.text)).toEqual(['Vegan', 'Quick (<30min)']);
  });

  it('treats a refusal or a cut-off answer as a failure, not as an answer', async () => {
    fakeClient({ stop_reason: 'refusal', ...textAnswer('{}') });
    await expect(askClaude({ model: 'claude-sonnet-5-5', content: 'p', reasoning: true })).rejects.toBeInstanceOf(ClaudeAnswerError);
    fakeClient({ stop_reason: 'max_tokens', ...textAnswer('{"title":"Pa') });
    await expect(askClaude({ model: 'claude-sonnet-5-5', content: 'p', reasoning: true })).rejects.toThrow('ran out of room');
  });
});
