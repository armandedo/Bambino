import type { Env } from '../config/env';
import { LocalStorageProvider, S3StorageProvider, type StorageProvider } from './storage';

/** Prefixes anyone may read: product images are public; inspection and evidence photos are not. */
export const PUBLIC_READ_PREFIXES = ['products/'] as const;

export function createStorageProvider(env: Env): StorageProvider {
  if (env.STORAGE_PROVIDER === 'local') return new LocalStorageProvider(env.STORAGE_PUBLIC_BASE_URL);
  return createS3Provider(env);
}

export function createS3Provider(env: Env): S3StorageProvider {
  if (
    !env.STORAGE_ENDPOINT ||
    !env.STORAGE_BUCKET ||
    !env.STORAGE_ACCESS_KEY_ID ||
    !env.STORAGE_SECRET_ACCESS_KEY
  ) {
    throw new Error('S3 storage is not fully configured');
  }
  return new S3StorageProvider({
    endpoint: env.STORAGE_ENDPOINT,
    region: env.STORAGE_REGION,
    bucket: env.STORAGE_BUCKET,
    ...(env.STORAGE_PRIVATE_BUCKET ? { privateBucket: env.STORAGE_PRIVATE_BUCKET } : {}),
    accessKeyId: env.STORAGE_ACCESS_KEY_ID,
    secretAccessKey: env.STORAGE_SECRET_ACCESS_KEY,
    publicBaseUrl: env.STORAGE_PUBLIC_BASE_URL,
  });
}
