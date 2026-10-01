import { describe, expect, it } from 'vitest';
import { encodeKeyPath, encodeRfc3986, presignUrl, signRequest } from './aws-sigv4';

// Credentials and expected signature from the AWS S3 documentation example
// "Authenticating Requests: Using Query Parameters (AWS Signature Version 4)".
const AWS_EXAMPLE = {
  accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
  secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
  region: 'us-east-1',
  service: 's3',
};

describe('AWS Signature V4', () => {
  it('matches the published presigned URL example', () => {
    const url = presignUrl({
      method: 'GET',
      url: new URL('https://examplebucket.s3.amazonaws.com/test.txt'),
      credentials: AWS_EXAMPLE,
      expiresSeconds: 86_400,
      now: new Date('2013-05-24T00:00:00Z'),
    });
    expect(url).toContain('X-Amz-Credential=AKIAIOSFODNN7EXAMPLE%2F20130524%2Fus-east-1%2Fs3%2Faws4_request');
    expect(url).toMatch(/X-Amz-Signature=aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404$/);
  });

  it('signs header-authenticated requests deterministically', () => {
    const now = new Date('2026-10-01T08:00:00Z');
    const input = {
      method: 'HEAD',
      url: new URL('http://127.0.0.1:9000/bucket/key.png'),
      credentials: AWS_EXAMPLE,
      now,
    };
    const headers = signRequest(input);
    expect(headers.authorization).toMatch(
      /^AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE\/20261001\/us-east-1\/s3\/aws4_request, SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature=[0-9a-f]{64}$/,
    );
    expect(headers['x-amz-date']).toBe('20261001T080000Z');
    expect(signRequest(input).authorization).toBe(headers.authorization);
    expect(signRequest({ ...input, body: 'x' }).authorization).not.toBe(headers.authorization);
  });

  it('encodes keys the way S3 expects', () => {
    expect(encodeRfc3986("a b!'()*")).toBe('a%20b%21%27%28%29%2A');
    expect(encodeKeyPath('products/abc/photo 1.png')).toBe('products/abc/photo%201.png');
  });
});
