import { createHash, createHmac } from 'node:crypto';

/**
 * AWS Signature Version 4 for S3-compatible storage (AWS S3, MinIO, Cloudflare R2, ...).
 * Written out here instead of pulling in the AWS SDK: the API needs only presigned URLs
 * and a handful of signed requests. Verified against AWS's published test vector.
 */

export interface SigV4Credentials {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  service: string;
}

const ALGORITHM = 'AWS4-HMAC-SHA256';
export const UNSIGNED_PAYLOAD = 'UNSIGNED-PAYLOAD';

const hmac = (key: Buffer | string, data: string) => createHmac('sha256', key).update(data).digest();
export const sha256Hex = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');

/** RFC 3986 encoding as SigV4 requires (encodeURIComponent leaves !'()* unencoded). */
export function encodeRfc3986(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

/** Encodes each path segment of an object key, keeping the slashes. */
export function encodeKeyPath(key: string): string {
  return key.split('/').map(encodeRfc3986).join('/');
}

function timestamps(now: Date) {
  const amzDate = now
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
  return { amzDate, date: amzDate.slice(0, 8) };
}

function signingKey(credentials: SigV4Credentials, date: string): Buffer {
  const kDate = hmac(`AWS4${credentials.secretAccessKey}`, date);
  const kRegion = hmac(kDate, credentials.region);
  const kService = hmac(kRegion, credentials.service);
  return hmac(kService, 'aws4_request');
}

function canonicalQuery(params: URLSearchParams): string {
  return [...params.entries()]
    .map(([key, value]) => [encodeRfc3986(key), encodeRfc3986(value)] as const)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join('&');
}

function signature(
  credentials: SigV4Credentials,
  amzDate: string,
  date: string,
  canonicalRequest: string,
): { signature: string; scope: string } {
  const scope = `${date}/${credentials.region}/${credentials.service}/aws4_request`;
  const stringToSign = [ALGORITHM, amzDate, scope, sha256Hex(canonicalRequest)].join('\n');
  return {
    signature: createHmac('sha256', signingKey(credentials, date)).update(stringToSign).digest('hex'),
    scope,
  };
}

/**
 * A URL that performs `method` on `url` without further credentials until it expires.
 * Only the host header is signed, so the caller may choose its own Content-Type; the
 * server checks the stored object afterwards.
 */
export function presignUrl(input: {
  method: string;
  url: URL;
  credentials: SigV4Credentials;
  expiresSeconds: number;
  now: Date;
}): string {
  const { amzDate, date } = timestamps(input.now);
  const url = new URL(input.url.toString());
  const scope = `${date}/${input.credentials.region}/${input.credentials.service}/aws4_request`;
  url.searchParams.set('X-Amz-Algorithm', ALGORITHM);
  url.searchParams.set('X-Amz-Credential', `${input.credentials.accessKeyId}/${scope}`);
  url.searchParams.set('X-Amz-Date', amzDate);
  url.searchParams.set('X-Amz-Expires', String(input.expiresSeconds));
  url.searchParams.set('X-Amz-SignedHeaders', 'host');

  const canonicalRequest = [
    input.method.toUpperCase(),
    url.pathname,
    canonicalQuery(url.searchParams),
    `host:${url.host}\n`,
    'host',
    UNSIGNED_PAYLOAD,
  ].join('\n');
  const signed = signature(input.credentials, amzDate, date, canonicalRequest);
  return `${url.origin}${url.pathname}?${canonicalQuery(url.searchParams)}&X-Amz-Signature=${signed.signature}`;
}

/** Headers (including Authorization) for a request signed with the payload hash. */
export function signRequest(input: {
  method: string;
  url: URL;
  credentials: SigV4Credentials;
  now: Date;
  body?: string;
  headers?: Record<string, string>;
}): Record<string, string> {
  const { amzDate, date } = timestamps(input.now);
  const payloadHash = sha256Hex(input.body ?? '');
  const headers: Record<string, string> = {
    ...Object.fromEntries(
      Object.entries(input.headers ?? {}).map(([key, value]) => [key.toLowerCase(), value.trim()]),
    ),
    host: input.url.host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
  };
  const names = Object.keys(headers).sort();
  const canonicalRequest = [
    input.method.toUpperCase(),
    input.url.pathname,
    canonicalQuery(input.url.searchParams),
    names.map((name) => `${name}:${headers[name]}\n`).join(''),
    names.join(';'),
    payloadHash,
  ].join('\n');
  const signed = signature(input.credentials, amzDate, date, canonicalRequest);
  // fetch sets Host itself from the URL, so it is signed but not sent explicitly.
  const rest = Object.fromEntries(Object.entries(headers).filter(([name]) => name !== 'host'));
  return {
    ...rest,
    authorization: `${ALGORITHM} Credential=${input.credentials.accessKeyId}/${signed.scope}, SignedHeaders=${names.join(';')}, Signature=${signed.signature}`,
  };
}
