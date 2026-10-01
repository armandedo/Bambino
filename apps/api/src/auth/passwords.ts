import { hash, verify } from '@node-rs/argon2';

export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(passwordHash: string, password: string): Promise<boolean>;
}

/**
 * argon2id (the library default) with OWASP's minimum recommended parameters:
 * 19 MiB memory, 2 iterations, 1 lane. Tests may pass cheaper parameters.
 */
export function createArgon2Hasher(options: { memoryCost?: number; timeCost?: number } = {}): PasswordHasher {
  const params = {
    memoryCost: options.memoryCost ?? 19_456,
    timeCost: options.timeCost ?? 2,
    parallelism: 1,
  };
  return {
    hash: (password) => hash(password, params),
    async verify(passwordHash, password) {
      try {
        return await verify(passwordHash, password);
      } catch {
        return false;
      }
    },
  };
}
