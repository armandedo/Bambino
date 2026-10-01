import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { S3StorageProvider } from './storage';

/**
 * Runs against a real S3-compatible server, e.g. the Docker RustFS from docker-compose.yml:
 *   TEST_STORAGE_ENDPOINT=http://127.0.0.1:9000 TEST_STORAGE_ACCESS_KEY=... TEST_STORAGE_SECRET_KEY=...
 * Skipped when those variables are not set, so the default suite needs no server.
 */
const endpoint = process.env.TEST_STORAGE_ENDPOINT;
const accessKeyId = process.env.TEST_STORAGE_ACCESS_KEY;
const secretAccessKey = process.env.TEST_STORAGE_SECRET_KEY;
const configured = Boolean(endpoint && accessKeyId && secretAccessKey);

describe.skipIf(!configured)('S3 storage against a live server', () => {
  const bucket = `bambino-test-${randomUUID().slice(0, 8)}`;
  const storage = new S3StorageProvider({
    endpoint: endpoint ?? '',
    region: 'us-east-1',
    bucket,
    accessKeyId: accessKeyId ?? '',
    secretAccessKey: secretAccessKey ?? '',
    publicBaseUrl: `${endpoint}/${bucket}`,
  });

  it('creates the bucket idempotently with public read on product images only', async () => {
    expect(await storage.ensureBucket(['products/'])).toEqual({ created: true });
    expect(await storage.ensureBucket(['products/'])).toEqual({ created: false });
  });

  it('accepts a presigned upload, reports what was stored, and serves it publicly', async () => {
    const key = `products/${randomUUID()}/photo.png`;
    const bytes = Buffer.from('89504e470d0a1a0a-not-a-real-png-but-fine-for-storage', 'utf8');
    const target = await storage.createUpload(key, 'image/png');
    const put = await fetch(target.url, { method: target.method, headers: target.headers, body: bytes });
    expect(put.status).toBe(200);

    expect(await storage.stat(key)).toEqual({ contentType: 'image/png', byteSize: bytes.length });
    const anonymous = await fetch(storage.publicUrl(key));
    expect(anonymous.status).toBe(200);
    expect(Buffer.from(await anonymous.arrayBuffer()).equals(bytes)).toBe(true);
  });

  it('keeps everything outside the public prefix private', async () => {
    const key = `inspections/${randomUUID()}/photo.jpg`;
    const target = await storage.createUpload(key, 'image/jpeg');
    expect(
      (await fetch(target.url, { method: 'PUT', headers: target.headers, body: 'private' })).status,
    ).toBe(200);
    expect((await fetch(storage.publicUrl(key))).status).toBe(403);
    expect(await storage.stat(`products/${randomUUID()}/missing.png`)).toBeNull();
  });

  it('rejects a tampered upload URL', async () => {
    const target = await storage.createUpload(`products/${randomUUID()}/a.png`, 'image/png');
    const tampered = target.url.replace('/a.png', '/b.png');
    expect((await fetch(tampered, { method: 'PUT', body: 'x' })).status).toBe(403);
  });
});
