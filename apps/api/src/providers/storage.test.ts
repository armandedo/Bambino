import { describe, expect, it } from 'vitest';
import { S3StorageProvider } from './storage';

const NOW = new Date('2026-10-12T10:00:00Z');

function provider(privateBucket?: string) {
  return new S3StorageProvider({
    endpoint: 'https://abc123.r2.cloudflarestorage.com',
    region: 'auto',
    bucket: 'bambino-media',
    ...(privateBucket ? { privateBucket } : {}),
    accessKeyId: 'AKIDEXAMPLE',
    secretAccessKey: 'secret',
    publicBaseUrl: 'https://media.example.com',
    now: () => NOW,
  });
}

describe('S3 storage bucket routing (no network)', () => {
  it('sends product image uploads to the public bucket', async () => {
    const target = await provider('bambino-private').createUpload('products/p1/a.png', 'image/png');
    expect(new URL(target.url).pathname).toBe('/bambino-media/products/p1/a.png');
  });

  it('keeps private downloads out of the public bucket when a private bucket is set', async () => {
    const { url } = await provider('bambino-private').signedDownloadUrl('exports/u1/data.json', 60);
    expect(new URL(url).pathname).toBe('/bambino-private/exports/u1/data.json');
  });

  it('falls back to the one bucket when no private bucket is set', async () => {
    const { url } = await provider().signedDownloadUrl('exports/u1/data.json', 60);
    expect(new URL(url).pathname).toBe('/bambino-media/exports/u1/data.json');
  });

  it('builds public image URLs from the public base, not the storage endpoint', () => {
    expect(provider().publicUrl('products/p1/a b.png')).toBe(
      'https://media.example.com/products/p1/a%20b.png',
    );
  });
});
