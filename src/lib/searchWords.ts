/**
 * Turns what a person typed into the vault's search field into the words the
 * database is asked for.
 *
 * The vault matches each word anywhere in `recipes.search_text` (title,
 * description, tags, ingredient names; migration 0076), and every word must
 * match. So "Kartoffel" finds "Kartoffeln" and "Kartoffelsuppe", "Kart" finds
 * them while it is still being typed, "Suppe" finds "Kartoffelsuppe", and
 * "Kartoffel Suppe" finds recipes with both.
 *
 * Characters that mean something in a LIKE pattern (`%`, `_`, `\`) or to
 * PostgREST (`*` is its spelling of `%`) are removed rather than escaped: a
 * search for them has no use here, and a pattern someone can write wildcards
 * into is a slow query waiting to happen.
 */
const MAX_WORDS = 8;
const MAX_WORD_LENGTH = 40;

export function searchWords(input: string): string[] {
  const words: string[] = [];
  for (const raw of input.split(/\s+/)) {
    const word = raw
      .replace(/[%_*\\]/g, '')
      // Punctuation around a word ("Suppe," or "(vegan)"), not inside it
      // ("Crème-fraîche", "d'Abruzzo").
      .replace(/^[\s,.;:!?"'()[\]{}]+|[\s,.;:!?"'()[\]{}]+$/g, '')
      .slice(0, MAX_WORD_LENGTH);
    if (word && !words.includes(word.toLowerCase())) words.push(word.toLowerCase());
    if (words.length === MAX_WORDS) break;
  }
  return words;
}
