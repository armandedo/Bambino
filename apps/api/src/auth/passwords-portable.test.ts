import { describe, expect, it } from 'vitest';
import { createArgon2Hasher } from './passwords';
import { createPortableArgon2Hasher } from './passwords-portable';

// Cheap parameters keep the test fast; production uses 19 MiB and 2 iterations in both.
const native = createArgon2Hasher({ memoryCost: 1024, timeCost: 1 });
const portable = createPortableArgon2Hasher({ memoryCost: 1024, timeCost: 1 });

describe('portable argon2id hasher (Cloudflare Workers)', () => {
  it('produces standard argon2id strings that the native hasher verifies', async () => {
    const hash = await portable.hash('correct horse battery');
    expect(hash).toMatch(/^\$argon2id\$v=19\$m=1024,t=1,p=1\$/);
    expect(await native.verify(hash, 'correct horse battery')).toBe(true);
    expect(await native.verify(hash, 'wrong')).toBe(false);
  });

  it('verifies hashes made by the native hasher, so existing accounts keep working', async () => {
    const hash = await native.hash('correct horse battery');
    expect(await portable.verify(hash, 'correct horse battery')).toBe(true);
    expect(await portable.verify(hash, 'wrong')).toBe(false);
  });

  it('salts every hash and refuses malformed or absurdly expensive ones', async () => {
    expect(await portable.hash('same')).not.toBe(await portable.hash('same'));
    expect(await portable.verify('not-a-hash', 'x')).toBe(false);
    expect(await portable.verify('$argon2id$v=19$m=99999999,t=1,p=1$c2FsdHNhbHQ$aGFzaGhhc2g', 'x')).toBe(
      false,
    );
  });
});
