import { AppError } from '../services/errors';
import { type SigV4Credentials, encodeKeyPath, presignUrl, signRequest } from './aws-sigv4';

export interface UploadTarget {
  url: string;
  method: 'PUT';
  headers: Record<string, string>;
  expiresAt: Date;
}

export interface StoredObject {
  contentType: string | null;
  byteSize: number;
}

/**
 * Object storage. PostgreSQL holds only object keys (media_assets.object_key); the bytes
 * live in storage. Clients upload directly with a short-lived signed URL, so file data
 * never passes through the API.
 */
export interface StorageProvider {
  readonly key: string;
  /** URL clients use to display a public object (product images). */
  publicUrl(objectKey: string): string;
  createUpload(objectKey: string, contentType: string): Promise<UploadTarget>;
  /** Null when the object does not exist. */
  stat(objectKey: string): Promise<StoredObject | null>;
}

/**
 * Builds URLs under a configured base and supports no uploads. For environments without
 * object storage; uploads answer NOT_IMPLEMENTED rather than pretending to work.
 */
export class LocalStorageProvider implements StorageProvider {
  readonly key = 'local';

  constructor(private readonly publicBaseUrl: string) {}

  publicUrl(objectKey: string): string {
    return `${this.publicBaseUrl.replace(/\/$/, '')}/${encodeKeyPath(objectKey)}`;
  }

  async createUpload(): Promise<UploadTarget> {
    throw new AppError(
      'NOT_IMPLEMENTED',
      'File uploads need object storage to be configured.',
      'STORAGE_UPLOADS_UNAVAILABLE',
    );
  }

  async stat(): Promise<StoredObject | null> {
    return null;
  }
}

export interface S3StorageConfig {
  /** e.g. http://127.0.0.1:9000 for the Docker MinIO, or https://s3.<region>.amazonaws.com. */
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Base URL for public objects, e.g. http://127.0.0.1:9000/bambino-media or a CDN. */
  publicBaseUrl: string;
  now?: () => Date;
}

const UPLOAD_URL_TTL_SECONDS = 15 * 60;

/** Any S3-compatible service, addressed path-style (bucket in the path), which MinIO and AWS both accept. */
export class S3StorageProvider implements StorageProvider {
  readonly key = 's3';
  private readonly credentials: SigV4Credentials;
  private readonly now: () => Date;

  constructor(private readonly config: S3StorageConfig) {
    this.credentials = {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      region: config.region,
      service: 's3',
    };
    this.now = config.now ?? (() => new Date());
  }

  publicUrl(objectKey: string): string {
    return `${this.config.publicBaseUrl.replace(/\/$/, '')}/${encodeKeyPath(objectKey)}`;
  }

  async createUpload(objectKey: string, contentType: string): Promise<UploadTarget> {
    const now = this.now();
    return {
      url: presignUrl({
        method: 'PUT',
        url: this.objectUrl(objectKey),
        credentials: this.credentials,
        expiresSeconds: UPLOAD_URL_TTL_SECONDS,
        now,
      }),
      method: 'PUT',
      headers: { 'content-type': contentType },
      expiresAt: new Date(now.getTime() + UPLOAD_URL_TTL_SECONDS * 1000),
    };
  }

  async stat(objectKey: string): Promise<StoredObject | null> {
    const response = await this.send('HEAD', this.objectUrl(objectKey));
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`Storage HEAD failed with status ${response.status}`);
    return {
      contentType: response.headers.get('content-type'),
      byteSize: Number(response.headers.get('content-length') ?? 0),
    };
  }

  /** Creates the bucket if missing and makes the given key prefixes publicly readable (e.g. product images). */
  async ensureBucket(publicReadPrefixes: readonly string[]): Promise<{ created: boolean }> {
    const bucketUrl = new URL(`${this.config.endpoint.replace(/\/$/, '')}/${this.config.bucket}`);
    const head = await this.send('HEAD', bucketUrl);
    let created = false;
    if (head.status === 404) {
      const create = await this.send('PUT', bucketUrl);
      if (!create.ok)
        throw new Error(`Bucket creation failed with status ${create.status}: ${await create.text()}`);
      created = true;
    } else if (!head.ok) {
      throw new Error(`Bucket check failed with status ${head.status}`);
    }

    if (publicReadPrefixes.length > 0) {
      const policy = JSON.stringify({
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Principal: { AWS: ['*'] },
            Action: ['s3:GetObject'],
            Resource: publicReadPrefixes.map((prefix) => `arn:aws:s3:::${this.config.bucket}/${prefix}*`),
          },
        ],
      });
      const policyUrl = new URL(bucketUrl.toString());
      policyUrl.searchParams.set('policy', '');
      const response = await this.send('PUT', policyUrl, policy, { 'content-type': 'application/json' });
      if (!response.ok)
        throw new Error(
          `Bucket policy update failed with status ${response.status}: ${await response.text()}`,
        );
    }
    return { created };
  }

  private objectUrl(objectKey: string): URL {
    return new URL(
      `${this.config.endpoint.replace(/\/$/, '')}/${this.config.bucket}/${encodeKeyPath(objectKey)}`,
    );
  }

  private send(
    method: string,
    url: URL,
    body?: string,
    headers: Record<string, string> = {},
  ): Promise<Response> {
    const signed = signRequest({
      method,
      url,
      credentials: this.credentials,
      now: this.now(),
      ...(body ? { body } : {}),
      headers,
    });
    return fetch(url, { method, headers: signed, ...(body ? { body } : {}) });
  }
}
