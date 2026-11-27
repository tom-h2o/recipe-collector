import { describe, expect, it } from 'vitest';
import { searchWords } from './searchWords';

describe('searchWords', () => {
  it('gives one word per word typed, so several words can all be required', () => {
    expect(searchWords('Kartoffel Suppe')).toEqual(['kartoffel', 'suppe']);
    expect(searchWords('  Kartoffel \t Suppe\n')).toEqual(['kartoffel', 'suppe']);
  });

  it('is empty for nothing typed', () => {
    expect(searchWords('')).toEqual([]);
    expect(searchWords('   ')).toEqual([]);
  });

  it('keeps umlauts, accents and hyphens inside a word', () => {
    expect(searchWords('Käse Spätzle')).toEqual(['käse', 'spätzle']);
    expect(searchWords('Crème-fraîche')).toEqual(['crème-fraîche']);
    expect(searchWords("d'Abruzzo")).toEqual(["d'abruzzo"]);
  });

  it('removes what would act as a wildcard in the pattern', () => {
    expect(searchWords('100% _ * \\')).toEqual(['100']);
    expect(searchWords('sup%pe')).toEqual(['suppe']);
    expect(searchWords('%')).toEqual([]);
  });

  it('drops punctuation around a word', () => {
    expect(searchWords('Suppe, (vegan) "schnell"!')).toEqual(['suppe', 'vegan', 'schnell']);
  });

  it('does not ask for the same word twice', () => {
    expect(searchWords('Suppe suppe SUPPE')).toEqual(['suppe']);
  });

  it('is bounded, however much is pasted in', () => {
    const many = Array.from({ length: 30 }, (_, i) => `w${i}`).join(' ');
    expect(searchWords(many)).toHaveLength(8);
    expect(searchWords('x'.repeat(500))[0]).toHaveLength(40);
  });
});
