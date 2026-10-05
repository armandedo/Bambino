/**
 * Downloads the stock photos listed in lib/stock-photos.ts into public/images/stock/, skipping files already
 * there. Run with `pnpm --filter @bambino/web stock-photos` (Node strips the types).
 */
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { ALL_STOCK_PHOTOS, stockSrc, unsplashDownloadUrl } from '../lib/stock-photos.ts';

const publicDir = fileURLToPath(new URL('../public', import.meta.url));
await mkdir(`${publicDir}/images/stock`, { recursive: true });

let failed = 0;
for (const photo of ALL_STOCK_PHOTOS) {
  const target = `${publicDir}${stockSrc(photo)}`;
  if (existsSync(target)) continue;
  const response = await fetch(unsplashDownloadUrl(photo));
  if (!response.ok) {
    console.error(`✗ ${photo.id} (${photo.alt}): HTTP ${response.status}`);
    failed += 1;
    continue;
  }
  await writeFile(target, Buffer.from(await response.arrayBuffer()));
  console.log(`✓ ${photo.id} (${photo.alt})`);
}
if (failed > 0) process.exit(1);
