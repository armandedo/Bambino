import { createHash, randomBytes } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';

const ISSUER = 'bambino-api';
const AUDIENCE = 'bambino-clients';

export interface AccessTokenClaims {
  userId: string;
  sessionId: string;
}

export interface AccessTokenIssuer {
  sign(claims: AccessTokenClaims): Promise<{ token: string; expiresAt: Date }>;
  /** Null for anything not a valid, unexpired token we issued. */
  verify(token: string): Promise<AccessTokenClaims | null>;
}

export function createAccessTokenIssuer(
  secret: string,
  ttlSeconds: number,
  now: () => Date,
): AccessTokenIssuer {
  const key = new TextEncoder().encode(secret);
  return {
    async sign({ userId, sessionId }) {
      const issuedAt = Math.floor(now().getTime() / 1000);
      const expiresAt = new Date((issuedAt + ttlSeconds) * 1000);
      const token = await new SignJWT({ sid: sessionId })
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject(userId)
        .setIssuer(ISSUER)
        .setAudience(AUDIENCE)
        .setIssuedAt(issuedAt)
        .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
        .sign(key);
      return { token, expiresAt };
    },
    async verify(token) {
      try {
        const { payload } = await jwtVerify(token, key, {
          issuer: ISSUER,
          audience: AUDIENCE,
          algorithms: ['HS256'],
          currentDate: now(),
        });
        if (typeof payload.sub !== 'string' || typeof payload.sid !== 'string') return null;
        return { userId: payload.sub, sessionId: payload.sid };
      } catch {
        return null;
      }
    },
  };
}

/** 256 random bits, base64url (43 characters). Used for refresh, verification and reset tokens. */
export function generateOpaqueToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Only this hash is stored; a database leak does not reveal usable tokens. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
