import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { createElement } from 'react';
import { AVAILABLE_TAGS, DIRECT_FILTERS } from './constants';
import { NEW_FROM_IPHONE } from '@/store/recipeStore';
import { MENU_GROUPS, TagIcon, chipClass, chosenInGroup, setGroupFilter, tagClass, tagLabel, toggleFilter } from './tags';

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

  it('gives every filter and every non-cuisine tag an icon, and no label an emoji', () => {
    for (const f of [...DIRECT_FILTERS, NEW_FROM_IPHONE, ...AVAILABLE_TAGS.filter((t) => !['German', 'Italian', 'Mediterranean', 'Asian', 'Indian', 'Mexican', 'American'].includes(t))]) {
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

describe('combining filters', () => {
  it('keeps one choice per group, replacing the old one', () => {
    let f = toggleFilter([], 'Vegetarian');
    f = toggleFilter(f, 'Italian');
    expect(f).toEqual(['Vegetarian', 'Italian']);
    // Another diet replaces Vegetarian; the cuisine stays.
    f = toggleFilter(f, 'Vegan');
    expect(f.sort()).toEqual(['Italian', 'Vegan']);
    // Tapping the one that is on turns it off.
    expect(toggleFilter(f, 'Vegan')).toEqual(['Italian']);
  });

  it('lets the direct chips go with anything, Under 30 min included', () => {
    let f = toggleFilter([], '⭐ Favourites');
    f = toggleFilter(f, 'Quick (<30min)');
    f = toggleFilter(f, 'One-Pot');
    f = toggleFilter(f, '🔗 Shared');
    // One-Pot is in the same group as Under 30 min, but Under 30 min is a chip of its own.
    expect(f.sort()).toEqual(['One-Pot', 'Quick (<30min)', '⭐ Favourites', '🔗 Shared'].sort());
  });

  it('sets and clears a group from its menu without touching the rest', () => {
    const f = ['⭐ Favourites', 'Italian', 'Chicken'];
    expect(chosenInGroup(f, 'cuisine')).toBe('Italian');
    expect(setGroupFilter(f, 'cuisine', 'German').sort()).toEqual(['Chicken', 'German', '⭐ Favourites'].sort());
    expect(setGroupFilter(f, 'cuisine', null).sort()).toEqual(['Chicken', '⭐ Favourites'].sort());
    expect(chosenInGroup(['Quick (<30min)'], 'more')).toBeNull();
  });

  it('offers every tag in exactly one menu or chip', () => {
    const offered = [...MENU_GROUPS.flatMap((g) => g.tags), ...DIRECT_FILTERS.filter((f) => AVAILABLE_TAGS.includes(f))];
    expect([...offered].sort()).toEqual([...AVAILABLE_TAGS].sort());
    expect(new Set(offered).size).toBe(offered.length);
  });
});
