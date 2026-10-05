import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ALL_STOCK_PHOTOS, PHOTO_CREDITS, productPhotoFor, stockSrc } from './stock-photos';

const publicDir = fileURLToPath(new URL('../public', import.meta.url));

describe('stock photos', () => {
  it('are all self-hosted (run `pnpm --filter @bambino/web stock-photos` if this fails)', () => {
    const missing = ALL_STOCK_PHOTOS.filter((photo) => !existsSync(`${publicDir}${stockSrc(photo)}`));
    expect(missing.map((p) => p.id)).toEqual([]);
  });

  it('are served from this site, never a third-party host', () => {
    for (const photo of ALL_STOCK_PHOTOS) expect(stockSrc(photo)).toMatch(/^\/images\/stock\/[\w-]+\.jpg$/);
  });

  it('keep their photographers’ credits', () => {
    expect(PHOTO_CREDITS).toContain('Lawrence Crayton');
    expect(PHOTO_CREDITS).not.toContain('Unsplash');
  });

  it('match a product placeholder by garment type', () => {
    expect(productPhotoFor('seed-footed-romper')?.alt).toMatch(/romper/);
    expect(productPhotoFor('seed-hat')).toBeUndefined();
  });
});
