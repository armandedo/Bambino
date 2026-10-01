import { randomBytes } from 'node:crypto';

/** No 0/O, 1/I/L or U: easy to read aloud and to type from a phone screen. */
const ALPHABET = 'ABCDEFGHJKMNPQRSTVWXYZ23456789';

/**
 * Customer-facing references such as BMB-7KQ2M9XA (orders) or RET-... (returns).
 * Random rather than sequential, so they reveal nothing about volume. 30^8 ≈ 6.5e11 values;
 * the database's unique index catches the rare collision and the caller retries.
 */
export function generateReference(prefix: string, length = 8): string {
  const bytes = randomBytes(length);
  let body = '';
  for (const byte of bytes) body += ALPHABET[byte % ALPHABET.length];
  return `${prefix}-${body}`;
}
