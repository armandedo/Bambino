import { argon2idAsync } from '@noble/hashes/argon2.js';
import type { PasswordHasher } from './passwords';

/**
 * argon2id in plain JavaScript (@noble/hashes, audited), for runtimes without native modules or runtime
 * WebAssembly compilation (Cloudflare Workers). Same parameters and the same PHC string format as the native
 * hasher in passwords.ts, so hashes made by either verify with the other. Costs about a second of CPU per
 * password: the Workers Paid plan's CPU limit is needed.
 */
export function createPortableArgon2Hasher(
  options: { memoryCost?: number; timeCost?: number } = {},
): PasswordHasher {
  const m = options.memoryCost ?? 19_456;
  const t = options.timeCost ?? 2;
  return {
    async hash(password) {
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const digest = await argon2idAsync(password, salt, { m, t, p: 1, dkLen: 32 });
      return `$argon2id$v=19$m=${m},t=${t},p=1$${toB64(salt)}$${toB64(digest)}`;
    },
    async verify(passwordHash, password) {
      const parsed = parsePhc(passwordHash);
      if (!parsed) return false;
      const digest = await argon2idAsync(password, parsed.salt, {
        m: parsed.m,
        t: parsed.t,
        p: parsed.p,
        dkLen: parsed.hash.length,
      });
      return timingSafeEqual(digest, parsed.hash);
    },
  };
}

/** `$argon2id$v=19$m=…,t=…,p=…$<salt>$<hash>`, base64 without padding (the PHC string format). */
function parsePhc(encoded: string) {
  const match = /^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$([A-Za-z0-9+/]+)\$([A-Za-z0-9+/]+)$/.exec(
    encoded,
  );
  if (!match) return null;
  const [, m, t, p, salt, hash] = match;
  const params = { m: Number(m), t: Number(t), p: Number(p) };
  // Refuse absurd costs from a corrupted row rather than burning the CPU budget.
  if (params.m > 262_144 || params.t > 10 || params.p > 4) return null;
  return { ...params, salt: fromB64(salt ?? ''), hash: fromB64(hash ?? '') };
}

function toB64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/=+$/, '');
}

function fromB64(text: string): Uint8Array {
  const padded = text + '='.repeat((4 - (text.length % 4)) % 4);
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}
