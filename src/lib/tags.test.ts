import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { createElement } from 'react';
import { AVAILABLE_TAGS, FILTERS } from './constants';
import { NEW_FROM_IPHONE } from '@/store/recipeStore';
import { TagIcon, chipClass, tagClass, tagLabel } from './tags';

describe('tag and filter labels', () => {
  it('drops the emoji from the filters, keeping their keys', () => {
    expect(tagLabel('⭐ Favourites')).toBe('Favourites');
    expect(tagLabel('🔗 Shared')).toBe('Shared');
    expect(tagLabel(NEW_FROM_IPHONE)).toBe('New from iPhone');
    expect(tagLabel('Quick (<30min)')).toBe('Under 30 min');
    // Anything else, including tags the AI invents, reads as it is.
    expect(tagLabel('Italian')).toBe('Italian');
    expect(tagLabel('🍝 Pasta night')).toBe('Pasta night');
  });

  it('gives every filter an icon, and no label an emoji', () => {
    for (const f of [...FILTERS, NEW_FROM_IPHONE]) {
      const { container } = render(createElement(TagIcon, { tag: f }));
      expect(container.querySelector('svg'), f).not.toBeNull();
      expect(tagLabel(f), f).not.toMatch(/\p{Extended_Pictographic}/u);
    }
    for (const t of AVAILABLE_TAGS) expect(tagLabel(t)).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('draws nothing for a tag without an icon', () => {
    const { container } = render(createElement(TagIcon, { tag: 'Italian' }));
    expect(container.innerHTML).toBe('');
  });

  it('keeps chips and tags apart: chips are outlined controls, tags tonal labels', () => {
    expect(chipClass(false)).toContain('ring-1');
    expect(chipClass(false)).toContain('h-8');
    expect(chipClass(true)).toContain('bg-sk-primary-fixed');
    expect(tagClass()).toContain('bg-sk-primary/[0.08]');
    expect(tagClass()).not.toContain('ring-1');
  });
});
