import type { StorageProvider, StoredObject, UploadTarget } from '../providers/storage';

/** In-memory stand-in for object storage. Tests "upload" by calling `put`. */
export class FakeStorageProvider implements StorageProvider {
  readonly key = 'fake';
  readonly objects = new Map<string, StoredObject>();
  readonly uploads: string[] = [];

  publicUrl(objectKey: string): string {
    return `http://storage.test/${objectKey}`;
  }

  async createUpload(objectKey: string, contentType: string): Promise<UploadTarget> {
    this.uploads.push(objectKey);
    return {
      url: `http://storage.test/${objectKey}?signed=1`,
      method: 'PUT',
      headers: { 'content-type': contentType },
      expiresAt: new Date('2026-10-01T08:15:00Z'),
    };
  }

  async stat(objectKey: string): Promise<StoredObject | null> {
    return this.objects.get(objectKey) ?? null;
  }

  put(objectKey: string, object: StoredObject): void {
    this.objects.set(objectKey, object);
  }
}
