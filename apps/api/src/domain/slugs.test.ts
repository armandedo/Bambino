import { describe, expect, it } from 'vitest';
import { firstFreeSlug, slugify } from './slugs';

describe('slugify', () => {
  it('makes a clean web address from a name', () => {
    expect(slugify('Newborn baby clothing gift')).toBe('newborn-baby-clothing-gift');
    expect(slugify('  Short-sleeve   bodysuit!  ')).toBe('short-sleeve-bodysuit');
    expect(slugify('Socks, 3 pairs (seed)')).toBe('socks-3-pairs-seed');
  });

  it('folds accents, spells out ampersands, and never produces an invalid slug', () => {
    expect(slugify('Crème & Sage')).toBe('creme-and-sage');
    expect(slugify('!!!')).toBe('product');
    expect(slugify('')).toBe('product');
    for (const name of ['A', 'a--b', '-x-', '日本語 shirt', 'x'.repeat(300)]) {
      expect(slugify(name)).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(slugify(name).length).toBeLessThanOrEqual(100);
    }
  });
});

describe('firstFreeSlug', () => {
  it('keeps the base when free and numbers it when taken', () => {
    expect(firstFreeSlug('romper', new Set())).toBe('romper');
    expect(firstFreeSlug('romper', new Set(['romper']))).toBe('romper-2');
    expect(firstFreeSlug('romper', new Set(['romper', 'romper-2', 'romper-3']))).toBe('romper-4');
  });
});
