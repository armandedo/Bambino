import { randomUUID } from 'node:crypto';
import { type Database, schema } from '@bambino/database';
import { and, eq, sql } from '@bambino/database/orm';
import { z } from 'zod';
import type { StorageProvider, UploadTarget } from '../providers/storage';
import { recordAudit } from './audit-service';
import { type ServiceContext, requirePermission } from './context';
import { AppError, parseInput } from './errors';

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const IMAGE_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const uploadSchema = z.object({
  productId: z.uuid(),
  contentType: z.enum(Object.keys(IMAGE_TYPES) as [string, ...string[]], 'validation.image.unsupported_type'),
  byteSize: z.number().int().min(1).max(MAX_IMAGE_BYTES, 'validation.image.too_large'),
});

const attachSchema = z.object({
  productId: z.uuid(),
  mediaAssetId: z.uuid(),
  altText: z.string().trim().min(1).max(200),
  sortOrder: z.number().int().min(0).max(1_000).nullish(),
});

/**
 * Product images in two steps: the API hands out a signed upload URL, the client uploads
 * straight to object storage, then the API checks what actually arrived before attaching it.
 */
export class MediaService {
  constructor(
    private readonly db: Database,
    private readonly storage: StorageProvider,
  ) {}

  async createProductImageUpload(
    context: ServiceContext,
    raw: { productId: unknown; contentType: unknown; byteSize: unknown },
  ): Promise<UploadTarget & { mediaAssetId: string }> {
    const actor = requirePermission(context, 'product:write');
    const input = parseInput(uploadSchema, raw);
    const [product] = await this.db
      .select({ id: schema.products.id })
      .from(schema.products)
      .where(eq(schema.products.id, input.productId));
    if (!product) throw new AppError('NOT_FOUND', 'Product not found.');

    const objectKey = `products/${input.productId}/${randomUUID()}.${IMAGE_TYPES[input.contentType]}`;
    const target = await this.storage.createUpload(objectKey, input.contentType);
    const [asset] = await this.db
      .insert(schema.mediaAssets)
      .values({
        storageProvider: this.storage.key,
        objectKey,
        contentType: input.contentType,
        byteSize: input.byteSize,
        purpose: 'PRODUCT_IMAGE',
        uploadedBy: actor.userId,
      })
      .returning({ id: schema.mediaAssets.id });
    if (!asset) throw new Error('Media asset insert returned no row');
    return { ...target, mediaAssetId: asset.id };
  }

  async addProductImage(context: ServiceContext, raw: Record<string, unknown>): Promise<string> {
    requirePermission(context, 'product:write');
    const input = parseInput(attachSchema, raw);
    const [asset] = await this.db
      .select()
      .from(schema.mediaAssets)
      .where(eq(schema.mediaAssets.id, input.mediaAssetId));
    if (
      !asset ||
      asset.purpose !== 'PRODUCT_IMAGE' ||
      !asset.objectKey.startsWith(`products/${input.productId}/`)
    ) {
      throw new AppError('NOT_FOUND', 'Upload not found for this product.');
    }

    // Trust what storage holds, not what the client declared.
    const stored = await this.storage.stat(asset.objectKey);
    if (!stored)
      throw new AppError('VALIDATION_FAILED', 'The file has not been uploaded yet.', 'UPLOAD_MISSING');
    if (stored.byteSize > MAX_IMAGE_BYTES)
      throw new AppError('VALIDATION_FAILED', 'The image is larger than 5 MB.', 'UPLOAD_TOO_LARGE');
    if (stored.contentType?.split(';')[0]?.trim() !== asset.contentType) {
      throw new AppError(
        'VALIDATION_FAILED',
        'The uploaded file type does not match.',
        'UPLOAD_TYPE_MISMATCH',
      );
    }

    return this.db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ id: schema.productImages.id })
        .from(schema.productImages)
        .where(eq(schema.productImages.mediaAssetId, asset.id));
      if (existing)
        throw new AppError('CONFLICT', 'This image is already attached.', 'IMAGE_ALREADY_ATTACHED');
      await tx
        .update(schema.mediaAssets)
        .set({ byteSize: stored.byteSize })
        .where(eq(schema.mediaAssets.id, asset.id));
      const [next] = await tx
        .select({ order: sql<number>`coalesce(max(${schema.productImages.sortOrder}) + 1, 0)::int` })
        .from(schema.productImages)
        .where(eq(schema.productImages.productId, input.productId));
      const [image] = await tx
        .insert(schema.productImages)
        .values({
          productId: input.productId,
          mediaAssetId: asset.id,
          altText: input.altText,
          sortOrder: input.sortOrder ?? next?.order ?? 0,
        })
        .returning({ id: schema.productImages.id });
      await recordAudit(tx, context, {
        action: 'product.image_added',
        entityType: 'product',
        entityId: input.productId,
        newValue: { imageId: image?.id, objectKey: asset.objectKey },
      });
      return input.productId;
    });
  }

  async removeProductImage(context: ServiceContext, rawImageId: unknown): Promise<string> {
    requirePermission(context, 'product:write');
    const imageId = parseInput(z.uuid(), rawImageId);
    return this.db.transaction(async (tx) => {
      const [image] = await tx
        .delete(schema.productImages)
        .where(and(eq(schema.productImages.id, imageId)))
        .returning();
      if (!image) throw new AppError('NOT_FOUND', 'Image not found.');
      await recordAudit(tx, context, {
        action: 'product.image_removed',
        entityType: 'product',
        entityId: image.productId,
        previousValue: { imageId, mediaAssetId: image.mediaAssetId },
      });
      return image.productId;
    });
  }
}
