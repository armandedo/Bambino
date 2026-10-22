import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { connectDatabase } from '@bambino/database/client';
import { schema } from '@bambino/database';
import { asc, eq, inArray, notInArray, sql } from '@bambino/database/orm';
import { MAX_IMAGE_BYTES } from '../services/media-service';
import { loadEnv } from '../config/env';
import { altTextFor, buildBrief, parseImageFile } from '../domain/catalogue-images';
import { createStorageProvider } from '../providers/storage-factory';
import { loadLocalEnvFile } from '../server/env-file';

/**
 * Bulk product images, for a catalogue of many products.
 *
 *   pnpm --filter @bambino/api catalogue:images brief [out-dir]   writes a photo brief for every product with no image
 *   pnpm --filter @bambino/api catalogue:images import <dir>      uploads <slug>.jpg, <slug>-2.png ... and attaches them
 *
 * `import` writes to the database in DATABASE_URL and to the configured object storage, so run it deliberately,
 * against staging first. A file whose product does not exist, or an image that is already attached to the product
 * at that position, is skipped and reported. See docs/13-catalogue-and-images.md.
 */
loadLocalEnvFile();
const env = loadEnv();
const connection = connectDatabase(env.DATABASE_URL);
const [command, arg] = process.argv.slice(2);
const out = (text: string) => process.stdout.write(`${text}\n`);

try {
  if (command === 'brief') await brief(arg ?? 'catalogue-images');
  else if (command === 'import' && arg) await importImages(resolve(arg));
  else {
    out('Usage: catalogue:images brief [out-dir] | catalogue:images import <dir>');
    process.exitCode = 1;
  }
} finally {
  await connection.close();
}

async function brief(dir: string) {
  const db = connection.db;
  const withImages = db.select({ id: schema.productImages.productId }).from(schema.productImages);
  const products = await db
    .select({
      id: schema.products.id,
      slug: schema.products.slug,
      name: schema.products.name,
      description: schema.products.description,
      category: schema.categories.name,
    })
    .from(schema.products)
    .innerJoin(schema.categories, eq(schema.categories.id, schema.products.categoryId))
    .where(notInArray(schema.products.id, withImages))
    .orderBy(asc(schema.products.slug));
  const variants = products.length
    ? await db
        .select({
          productId: schema.productVariants.productId,
          color: schema.productVariants.color,
          size: schema.productVariants.sizeCode,
          order: schema.sizes.sortOrder,
        })
        .from(schema.productVariants)
        .innerJoin(schema.sizes, eq(schema.sizes.code, schema.productVariants.sizeCode))
        .where(
          inArray(
            schema.productVariants.productId,
            products.map((product) => product.id),
          ),
        )
    : [];

  const briefs = products.map((product) => {
    const own = variants.filter((variant) => variant.productId === product.id);
    const sizes = [...new Map(own.map((variant) => [variant.size, variant.order])).entries()]
      .sort((a, b) => a[1] - b[1])
      .map(([code]) => code);
    return buildBrief({
      slug: product.slug,
      name: product.name,
      category: product.category,
      description: product.description,
      colors: [...new Set(own.map((variant) => variant.color))],
      sizes,
    });
  });

  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'briefs.json'), JSON.stringify(briefs, null, 2));
  const lines = briefs.flatMap((entry) => [
    `## ${entry.name}  (${entry.slug})`,
    ...entry.prompts.map((prompt) => `- ${prompt.file} [${prompt.shot}]: ${prompt.prompt}`),
    '',
  ]);
  await writeFile(join(dir, 'briefs.md'), lines.join('\n'));
  out(
    `${briefs.length} products have no image. Briefs written to ${join(dir, 'briefs.md')} and briefs.json.`,
  );
  out('Make each image, save it with the file name shown, then run: catalogue:images import <dir>');
}

async function importImages(dir: string) {
  const db = connection.db;
  const storage = createStorageProvider(env);
  const names = (await readdir(dir)).sort();
  let attached = 0;
  const skipped: string[] = [];

  for (const fileName of names) {
    const parsed = parseImageFile(fileName);
    if (!parsed) {
      if (!fileName.startsWith('.') && !/\.(md|json|csv|txt)$/i.test(fileName))
        skipped.push(`${fileName}: not an image name`);
      continue;
    }
    const [product] = await db.select().from(schema.products).where(eq(schema.products.slug, parsed.slug));
    if (!product) {
      skipped.push(`${fileName}: no product with slug "${parsed.slug}"`);
      continue;
    }
    const path = join(dir, fileName);
    const { size } = await stat(path);
    if (size < 1 || size > MAX_IMAGE_BYTES) {
      skipped.push(`${fileName}: must be between 1 byte and 5 MB`);
      continue;
    }

    const existing = await db
      .select({ sortOrder: schema.productImages.sortOrder })
      .from(schema.productImages)
      .where(eq(schema.productImages.productId, product.id));
    const sortOrder = parsed.position - 1;
    if (existing.some((image) => image.sortOrder === sortOrder)) {
      skipped.push(`${fileName}: ${product.slug} already has an image at position ${parsed.position}`);
      continue;
    }

    const extension =
      parsed.contentType === 'image/png' ? 'png' : parsed.contentType === 'image/webp' ? 'webp' : 'jpg';
    const objectKey = `products/${product.id}/${randomUUID()}.${extension}`;
    const target = await storage.createUpload(objectKey, parsed.contentType);
    const response = await fetch(target.url, {
      method: target.method,
      headers: target.headers,
      body: await readFile(path),
    });
    if (!response.ok) {
      skipped.push(`${fileName}: upload failed (${response.status})`);
      continue;
    }
    const stored = await storage.stat(objectKey);
    if (!stored) {
      skipped.push(`${fileName}: storage does not show the file after upload`);
      continue;
    }

    await db.transaction(async (tx) => {
      const [asset] = await tx
        .insert(schema.mediaAssets)
        .values({
          storageProvider: storage.key,
          objectKey,
          contentType: parsed.contentType,
          byteSize: stored.byteSize,
          purpose: 'PRODUCT_IMAGE',
        })
        .returning({ id: schema.mediaAssets.id });
      if (!asset) throw new Error('Media asset insert returned no row');
      await tx.insert(schema.productImages).values({
        productId: product.id,
        mediaAssetId: asset.id,
        altText: altTextFor(product.name, parsed.position),
        sortOrder,
      });
    });
    attached++;
    out(`attached ${fileName}`);
  }

  const [total] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.productImages);
  out(
    `${attached} images attached, ${skipped.length} skipped. The database now holds ${total?.n ?? 0} product images.`,
  );
  for (const line of skipped) out(`  skipped ${line}`);
}
