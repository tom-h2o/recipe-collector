import Anthropic from '@anthropic-ai/sdk';
import { Type, type Part, type Schema } from '@google/genai';

/**
 * Claude, the app's main AI provider since migration 0069; Gemini is the
 * backup and still does the embeddings (Anthropic has no embedding model).
 *
 * Endpoints never call this directly. generateJson() and generateFromParts()
 * in gemini.ts send any `claude-*` model id here and fall back to a Gemini
 * model when Claude fails for any reason (withModelFallback), so a missing or
 * exhausted key, an outage or a request Claude rejects costs one fast failure
 * and the user still gets an answer.
 *
 * Three rules from the API reference shape every request:
 *  - No temperature. Claude Haiku 5.5 rejects any sampling parameter.
 *  - "Reasoning off" is `effort: 'low'`. Each model switches thinking off its
 *    own way (Sonnet 5.5 rejects `disabled`, Opus 5.5 cannot switch it off at
 *    all); low effort is the one setting all three accept, and at it the model
 *    skips thinking on most simple requests.
 *  - Answers are constrained by `output_config.format`, built from the same
 *    response schemas Gemini gets (responseSchemas.ts), so there is still one
 *    definition of each answer's shape; Zod checks the result as before.
 */

/** Room for the answer and any thinking, which counts toward the cap. */
export const CLAUDE_MAX_TOKENS = 16_000;

export function isClaudeModel(model: string): boolean {
  return model.startsWith('claude-');
}

/** No key is configured. Thrown before any network call, so the fallback is immediate. */
export class ClaudeNotConfiguredError extends Error {
  constructor() {
    super('ANTHROPIC_API_KEY is not set.');
    this.name = 'ClaudeNotConfiguredError';
  }
}

/** Claude answered, but not with something usable: a refusal or a cut-off answer. */
export class ClaudeAnswerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ClaudeAnswerError';
  }
}

type MessagesClient = Pick<Anthropic, 'messages'>;

let override: MessagesClient | null | undefined;
let cached: { key: string; client: Anthropic } | null = null;

/** The client for ANTHROPIC_API_KEY, or null when no key is set. */
export function getClaudeClient(): MessagesClient | null {
  if (override !== undefined) return override;
  const key = process.env.ANTHROPIC_API_KEY ?? '';
  if (!key) return null;
  if (!cached || cached.key !== key) {
    // Retries are done by callWithRetry, which counts them for the log row and
    // keeps them inside the serverless deadline; the SDK's own would do neither.
    cached = { key, client: new Anthropic({ apiKey: key, maxRetries: 0 }) };
  }
  return cached.client;
}

/** Tests only: replace the client (null = no key), or `undefined` to restore. */
export function setClaudeClientForTests(client: MessagesClient | null | undefined): void {
  override = client;
}

/**
 * A Gemini response schema as JSON Schema, in the subset Claude's structured
 * outputs accept: every object closed with `additionalProperties: false`,
 * `nullable` as a union with null, and nothing else carried over.
 */
export function toJsonSchema(schema: Schema): Record<string, unknown> {
  let out: Record<string, unknown>;
  switch (schema.type) {
    case Type.OBJECT: {
      const properties: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(schema.properties ?? {})) properties[key] = toJsonSchema(value);
      out = { type: 'object', properties, required: schema.required ?? [], additionalProperties: false };
      break;
    }
    case Type.ARRAY:
      if (!schema.items) throw new Error('An array schema needs items.');
      out = { type: 'array', items: toJsonSchema(schema.items) };
      break;
    case Type.STRING:
      out = { type: 'string', ...(schema.enum ? { enum: schema.enum } : {}) };
      break;
    case Type.INTEGER:
      out = { type: 'integer' };
      break;
    case Type.NUMBER:
      out = { type: 'number' };
      break;
    case Type.BOOLEAN:
      out = { type: 'boolean' };
      break;
    default:
      throw new Error(`No JSON Schema equivalent for Gemini type ${String(schema.type)}.`);
  }
  if (schema.description) out.description = schema.description;
  return schema.nullable ? { anyOf: [out, { type: 'null' }] } : out;
}

/**
 * The format to send, and whether the answer must be unwrapped. Several
 * answers are bare lists (tags, the shopping list); they are sent wrapped in
 * an object, which every structured-output request accepts, and unwrapped on
 * the way back so callers see exactly the shape Gemini would have returned.
 */
export function claudeFormat(schema: Schema): { schema: Record<string, unknown>; wrapped: boolean } {
  const json = toJsonSchema(schema);
  if (json.type === 'object') return { schema: json, wrapped: false };
  return {
    schema: { type: 'object', properties: { result: json }, required: ['result'], additionalProperties: false },
    wrapped: true,
  };
}

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

/** Gemini request parts (text, inline photos, an inline PDF) as Claude content blocks. */
export function toClaudeContent(parts: Part[]): Anthropic.ContentBlockParam[] {
  return parts.map((part): Anthropic.ContentBlockParam => {
    if (typeof part.text === 'string') return { type: 'text', text: part.text };
    const inline = part.inlineData;
    if (inline?.data && inline.mimeType === 'application/pdf') {
      return { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: inline.data } };
    }
    if (inline?.data && inline.mimeType && IMAGE_TYPES.has(inline.mimeType)) {
      return {
        type: 'image',
        source: { type: 'base64', media_type: inline.mimeType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp', data: inline.data },
      };
    }
    throw new Error(`Claude cannot take a part of type ${inline?.mimeType ?? 'unknown'}.`);
  });
}

export interface ClaudeRequest {
  model: string;
  content: string | Anthropic.ContentBlockParam[];
  /** The Gemini response schema for the answer; converted by claudeFormat(). */
  schema?: Schema;
  /** false asks for low effort: the app's "reasoning off" (thinkingFor). */
  reasoning: boolean;
  /** Abandon the request after this long, so it ends inside the caller's deadline. */
  timeoutMs?: number;
}

/** One request to Claude. Returns the answer text and the model that gave it. */
export async function askClaude(request: ClaudeRequest): Promise<{ text: string; modelVersion: string }> {
  const client = getClaudeClient();
  if (!client) throw new ClaudeNotConfiguredError();

  const format = request.schema ? claudeFormat(request.schema) : null;
  const outputConfig: Anthropic.OutputConfig = {
    ...(format ? { format: { type: 'json_schema' as const, schema: format.schema } } : {}),
    ...(request.reasoning ? {} : { effort: 'low' as const }),
  };

  const message = await client.messages.create(
    {
      model: request.model,
      max_tokens: CLAUDE_MAX_TOKENS,
      messages: [{ role: 'user', content: request.content }],
      ...(Object.keys(outputConfig).length ? { output_config: outputConfig } : {}),
    },
    request.timeoutMs !== undefined ? { timeout: request.timeoutMs } : undefined,
  );

  // Neither answer matches the schema, so neither may reach the caller as one.
  if (message.stop_reason === 'refusal') throw new ClaudeAnswerError('Claude declined to answer this request.');
  if (message.stop_reason === 'max_tokens') throw new ClaudeAnswerError('Claude ran out of room before finishing the answer.');

  // Read by block type, not position: a response may begin with a thinking block.
  const text = message.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('');

  if (!format?.wrapped) return { text, modelVersion: message.model };
  try {
    return { text: JSON.stringify((JSON.parse(text) as { result: unknown }).result), modelVersion: message.model };
  } catch {
    // Leave it to generateJson's repair path, which asks again with the same format.
    return { text, modelVersion: message.model };
  }
}
