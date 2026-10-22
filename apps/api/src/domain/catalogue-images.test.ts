import { describe, expect, it } from 'vitest';
import { altTextFor, buildBrief, cleanName, parseImageFile } from './catalogue-images';

describe('image file names', () => {
  it('reads the product, the position and the type', () => {
    expect(parseImageFile('seed-ext-bod.jpg')).toEqual({
      slug: 'seed-ext-bod',
      position: 1,
      contentType: 'image/jpeg',
    });
    expect(parseImageFile('seed-ext-bod-2.PNG')).toEqual({
      slug: 'seed-ext-bod',
      position: 2,
      contentType: 'image/png',
    });
    expect(parseImageFile('everyday-trousers-3.webp')?.position).toBe(3);
  });

  it('ignores files that are not images or do not look like a product slug', () => {
    expect(parseImageFile('notes.txt')).toBeNull();
    expect(parseImageFile('.DS_Store')).toBeNull();
    expect(parseImageFile('Not A Slug.jpg')).toBeNull();
    expect(parseImageFile('photo.gif')).toBeNull();
  });
});

describe('image briefs', () => {
  const input = {
    slug: 'seed-ext-bod',
    name: 'Short-sleeve bodysuit (seed)',
    category: 'bodysuits',
    colors: ['White', 'Cream'],
    sizes: ['0-3M', '9-12M'],
    description: 'x',
  };

  it('describes the product without the placeholder wording, and never asks for brands or text', () => {
    const brief = buildBrief(input);
    expect(brief.name).toBe('Short-sleeve bodysuit');
    expect(brief.prompts.map((p) => p.file)).toEqual([
      'seed-ext-bod.jpg',
      'seed-ext-bod-2.jpg',
      'seed-ext-bod-3.jpg',
    ]);
    for (const { prompt } of brief.prompts) {
      expect(prompt).not.toMatch(/seed/i);
      expect(prompt).toMatch(/no text, no logos, no brand names/);
    }
    expect(brief.prompts[0]?.prompt).toMatch(/white baby short-sleeve bodysuit/);
  });

  it('adds a worn shot only for clothes, not for accessories', () => {
    expect(
      buildBrief({ ...input, name: 'Socks, 3 pairs (seed)', slug: 'seed-ext-soc' }).prompts,
    ).toHaveLength(2);
    expect(buildBrief({ ...input, name: 'Soft cap (seed)', slug: 'seed-ext-hat' }).prompts).toHaveLength(2);
  });

  it('keeps safety wording on shots that show a baby', () => {
    const lifestyle = buildBrief(input).prompts.find((p) => p.shot === 'lifestyle');
    expect(lifestyle?.prompt).toMatch(/safely/);
    expect(lifestyle?.prompt).toMatch(/unsafe sleep setup/);
  });
});

describe('alt text', () => {
  it('names the product, and the view for further images', () => {
    expect(cleanName('Romper (seed)')).toBe('Romper');
    expect(altTextFor('Romper (seed)', 1)).toBe('Romper');
    expect(altTextFor('Romper (seed)', 2)).toBe('Romper, view 2');
  });
});
