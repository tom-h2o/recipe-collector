/**
 * Decides whether a translation is fit to store.
 *
 * The response schema guarantees the *shape* of what the model returns and
 * nothing about its content. A title was stored as
 *
 *   Vegan Chocolate Mousse (Quick, Easy, Healthy)``` Wait! I almost output
 *   extra text and markdown!...
 *
 * — a perfectly valid string, in the right field. Once stored it is served
 * from the cache on every later open, so the only way out was to delete the
 * translation by hand. Turning reasoning off made that rarer; this is what
 * stops it reaching the table at all.
 *
 * The checks compare the result with the text that was sent, and are
 * deliberately coarse: each one describes something no real translation does,
 * so a false alarm should not be possible for an honest result. They are not
 * a quality judgement — a clumsy translation passes.
 */

export interface TranslatableText {
  title: string;
  description?: string;
  instructions: string;
  ingredients: { amount: string; name: string; details?: string }[];
}

const FENCE = '```';

/**
 * How much longer than its source a title may be. German runs about a third
 * longer than English; a short Chinese or Japanese title can grow several
 * times over in characters. Leaked reasoning runs to hundreds.
 */
function titleLimit(sourceLength: number): number {
  return Math.max(sourceLength * 4, sourceLength + 80);
}

/** Returns what is wrong with the translation, or null when it can be stored. */
export function findTranslationFault(source: TranslatableText, result: TranslatableText): string | null {
  // A code fence is markdown the model wraps *around* an answer. Inside a
  // field it means the wrapper, or whatever followed it, ended up in the data.
  const fields: [label: string, sent: string, received: string][] = [
    ['title', source.title, result.title],
    ['description', source.description ?? '', result.description ?? ''],
    ['instructions', source.instructions, result.instructions],
  ];
  for (const [label, sent, received] of fields) {
    if (received.includes(FENCE) && !sent.includes(FENCE)) return `the ${label} contains a code fence`;
  }
  for (const ing of result.ingredients) {
    if (`${ing.amount}${ing.name}${ing.details ?? ''}`.includes(FENCE)) return 'an ingredient contains a code fence';
  }

  if (/[\r\n]/.test(result.title) && !/[\r\n]/.test(source.title)) return 'the title runs over several lines';
  if (result.title.length > titleLimit(source.title.length)) return 'the title is far longer than the original';

  // One ingredient in, one ingredient out. A different count means lines were
  // merged, dropped or invented, and the table would no longer match the dish.
  if (result.ingredients.length !== source.ingredients.length) {
    return `it has ${result.ingredients.length} ingredients where the recipe has ${source.ingredients.length}`;
  }

  // Only the gross cases: several times the source means something other than
  // the steps is in there; a small fraction of a long source means it stopped
  // part-way through.
  const sent = source.instructions.length;
  const received = result.instructions.length;
  if (received > sent * 6 + 300) return 'the instructions are far longer than the original';
  if (sent >= 200 && received < sent / 6) return 'the instructions are cut short';

  return null;
}

/**
 * Thrown for a translation that was refused. The message is written for the
 * person who asked: describeGeminiError passes our own wording through, and
 * the same text lands in gemini_logs, so it names the fault as well.
 */
export class TranslationRejectedError extends Error {
  readonly fault: string;

  constructor(fault: string) {
    super(`The translation came back garbled (${fault}), so it was not saved. Please try again.`);
    this.name = 'TranslationRejectedError';
    this.fault = fault;
  }
}

export function assertPlausibleTranslation(source: TranslatableText, result: TranslatableText): void {
  const fault = findTranslationFault(source, result);
  if (fault) throw new TranslationRejectedError(fault);
}
