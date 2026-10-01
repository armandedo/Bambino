import { schema } from '@bambino/database';
import { eq } from '@bambino/database/orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MemoryRateLimiter } from '../infra/rate-limiter';
import {
  CONSENTS,
  LOGIN,
  ME,
  PASSWORD,
  REFRESH,
  REGISTER,
  type TestApp,
  createTestApp,
  errorCode,
  errorReason,
} from '../testing/test-app';

let t: TestApp;

beforeAll(async () => {
  t = await createTestApp();
}, 60_000);

afterAll(async () => {
  await t.close();
});

const tokenFromLink = (link: string | undefined) =>
  new URL(link ?? 'http://x').searchParams.get('token') ?? '';

describe('registration', () => {
  it('creates a customer, returns tokens to mobile clients and sends a verification email', async () => {
    const response = await t.gql(REGISTER, {
      input: {
        email: '  New.Parent@Seed.Test ',
        password: PASSWORD,
        firstName: 'Aline',
        lastName: 'Uwase',
        consents: CONSENTS,
      },
    });
    expect(response.errors).toBeUndefined();
    const payload = response.data?.register as Record<string, unknown> & { user: Record<string, unknown> };
    expect(payload.accessToken).toEqual(expect.any(String));
    expect(payload.refreshToken).toEqual(expect.any(String));
    expect(payload.user).toMatchObject({
      email: 'new.parent@seed.test',
      emailVerified: false,
      roles: ['CUSTOMER'],
      permissions: [],
    });

    const userId = payload.user.id as string;
    const consents = await t.db
      .select()
      .from(schema.consentRecords)
      .where(eq(schema.consentRecords.userId, userId));
    expect(consents.map((consent) => consent.consentType).sort()).toEqual([
      'CHILD_DATA_PROCESSING',
      'PRIVACY_POLICY',
      'TERMS_OF_SERVICE',
    ]);
    expect(t.email.lastTo('new.parent@seed.test', 'auth.verify_email')?.params.link).toMatch(
      /^http:\/\/web\.test\/verify-email\?token=/,
    );

    const [user] = await t.db.select().from(schema.users).where(eq(schema.users.id, userId));
    expect(user?.passwordHash).toMatch(/^\$argon2id\$/);
  });

  it('rejects a duplicate email regardless of case', async () => {
    const { email } = await t.registerCustomer();
    const response = await t.gql(REGISTER, {
      input: {
        email: email.toUpperCase(),
        password: PASSWORD,
        firstName: 'A',
        lastName: 'B',
        consents: CONSENTS,
      },
    });
    expect(errorCode(response)).toBe('CONFLICT');
    expect(errorReason(response)).toBe('EMAIL_IN_USE');
  });

  it('requires the mandatory consents and a strong enough password, reporting field errors', async () => {
    const response = await t.gql(REGISTER, {
      input: {
        email: 'weak@seed.test',
        password: 'short',
        firstName: 'A',
        lastName: 'B',
        consents: CONSENTS.slice(0, 1),
      },
    });
    expect(errorCode(response)).toBe('VALIDATION_FAILED');
    const fieldErrors = response.errors?.[0]?.extensions?.fieldErrors as { path: string; message: string }[];
    expect(fieldErrors.map((error) => error.message)).toEqual(
      expect.arrayContaining(['validation.password.too_short', 'validation.consent.required.PRIVACY_POLICY']),
    );
  });
});

describe('login and lockout', () => {
  it('signs in with the right password and gives the same answer for a wrong password or unknown email', async () => {
    const { email } = await t.registerCustomer();
    const ok = await t.gql(LOGIN, { input: { email, password: PASSWORD } });
    expect(ok.errors).toBeUndefined();

    const wrong = await t.gql(LOGIN, { input: { email, password: 'not-the-password' } });
    const unknown = await t.gql(LOGIN, {
      input: { email: 'nobody@seed.test', password: 'not-the-password' },
    });
    expect(errorReason(wrong)).toBe('INVALID_CREDENTIALS');
    expect(unknown.errors?.[0]).toEqual({
      ...wrong.errors?.[0],
      extensions: { ...wrong.errors?.[0]?.extensions, requestId: expect.any(String) },
    });
  });

  it('locks the account for 15 minutes after 5 failures, even for the right password', async () => {
    const { email } = await t.registerCustomer();
    for (let attempt = 0; attempt < 5; attempt++) {
      expect(errorReason(await t.gql(LOGIN, { input: { email, password: 'wrong-password' } }))).toBe(
        'INVALID_CREDENTIALS',
      );
    }
    expect(errorReason(await t.gql(LOGIN, { input: { email, password: PASSWORD } }))).toBe(
      'INVALID_CREDENTIALS',
    );
    t.advanceClock(15 * 60_000 + 1_000);
    expect((await t.gql(LOGIN, { input: { email, password: PASSWORD } })).errors).toBeUndefined();
  });

  it('refuses a suspended account only after the password is proven', async () => {
    const { email, userId } = await t.registerCustomer();
    await t.db.update(schema.users).set({ status: 'SUSPENDED' }).where(eq(schema.users.id, userId));
    expect(errorReason(await t.gql(LOGIN, { input: { email, password: 'wrong-password' } }))).toBe(
      'INVALID_CREDENTIALS',
    );
    expect(errorReason(await t.gql(LOGIN, { input: { email, password: PASSWORD } }))).toBe(
      'ACCOUNT_INACTIVE',
    );
  });
});

describe('sessions', () => {
  it('resolves `me` from a bearer token and returns null without one', async () => {
    const { accessToken, email } = await t.registerCustomer();
    expect((await t.gql(ME, {}, { token: accessToken })).data?.me).toMatchObject({ email });
    expect((await t.gql(ME)).data?.me).toBeNull();
    expect((await t.gql(ME, {}, { token: 'not-a-token' })).data?.me).toBeNull();
  });

  it('expires access tokens', async () => {
    const { accessToken } = await t.registerCustomer();
    t.advanceClock(901_000);
    expect((await t.gql(ME, {}, { token: accessToken })).data?.me).toBeNull();
  });

  it('rotates refresh tokens and revokes the whole family when an old one is replayed', async () => {
    const first = await t.registerCustomer();
    const rotated = await t.gql(REFRESH, { token: first.refreshToken });
    const second = rotated.data?.refreshSession as { accessToken: string; refreshToken: string };
    expect(second.refreshToken).not.toBe(first.refreshToken);
    // The access token from before rotation stops working immediately.
    expect((await t.gql(ME, {}, { token: first.accessToken })).data?.me).toBeNull();
    expect((await t.gql(ME, {}, { token: second.accessToken })).data?.me).not.toBeNull();

    const replay = await t.gql(REFRESH, { token: first.refreshToken });
    expect(errorReason(replay)).toBe('SESSION_INVALID');
    // The legitimate newer tokens are revoked too, because the family was compromised.
    expect((await t.gql(ME, {}, { token: second.accessToken })).data?.me).toBeNull();
    expect(errorReason(await t.gql(REFRESH, { token: second.refreshToken }))).toBe('SESSION_INVALID');
  });

  it('ends the session on logout', async () => {
    const { accessToken, refreshToken } = await t.registerCustomer();
    await t.gql(
      'mutation ($token: String) { logout(refreshToken: $token) }',
      { token: refreshToken },
      { token: accessToken },
    );
    expect((await t.gql(ME, {}, { token: accessToken })).data?.me).toBeNull();
    expect(errorReason(await t.gql(REFRESH, { token: refreshToken }))).toBe('SESSION_INVALID');
  });
});

describe('web clients (cookie sessions)', () => {
  const cookieHeader = (headers: Headers) =>
    headers
      .getSetCookie()
      .map((cookie) => cookie.split(';')[0])
      .join('; ');

  it('receive httpOnly cookies instead of tokens and must send the client header to use them', async () => {
    const response = await t.gql(
      REGISTER,
      {
        input: {
          email: 'web.parent@seed.test',
          password: PASSWORD,
          firstName: 'W',
          lastName: 'P',
          consents: CONSENTS,
        },
      },
      { client: 'web' },
    );
    const payload = response.data?.register as Record<string, unknown>;
    expect(payload.accessToken).toBeNull();
    expect(payload.refreshToken).toBeNull();
    const setCookies = response.headers.getSetCookie();
    expect(setCookies).toHaveLength(2);
    for (const cookie of setCookies) expect(cookie).toMatch(/HttpOnly; SameSite=Lax/);

    const cookie = cookieHeader(response.headers);
    expect((await t.gql(ME, {}, { client: 'web', cookie })).data?.me).toMatchObject({
      email: 'web.parent@seed.test',
    });
    // Without the custom header (as in a cross-site form post) the cookies are ignored.
    expect((await t.gql(ME, {}, { cookie })).data?.me).toBeNull();

    const refreshed = await t.gql(REFRESH, {}, { client: 'web', cookie });
    expect(refreshed.errors).toBeUndefined();
    const nextCookie = cookieHeader(refreshed.headers);
    expect(nextCookie).not.toBe(cookie);

    const logout = await t.gql('mutation { logout }', {}, { client: 'web', cookie: nextCookie });
    expect(logout.headers.getSetCookie().every((value) => value.includes('Max-Age=0'))).toBe(true);
    expect((await t.gql(ME, {}, { client: 'web', cookie: nextCookie })).data?.me).toBeNull();
  });
});

describe('password reset and email verification', () => {
  it('answers the same for unknown emails and resets with a single-use token that ends other sessions', async () => {
    const before = t.email.sent.length;
    const unknown = await t.gql('mutation { requestPasswordReset(email: "ghost@seed.test") }');
    expect(unknown.data?.requestPasswordReset).toBe(true);
    expect(t.email.sent.length).toBe(before);

    const { email, accessToken } = await t.registerCustomer();
    await t.gql('mutation ($email: String!) { requestPasswordReset(email: $email) }', { email });
    const token = tokenFromLink(t.email.lastTo(email, 'auth.password_reset')?.params.link);

    const reset =
      'mutation ($token: String!, $password: String!) { resetPassword(token: $token, newPassword: $password) }';
    expect((await t.gql(reset, { token, password: 'a-brand-new-password' })).data?.resetPassword).toBe(true);
    expect(errorReason(await t.gql(reset, { token, password: 'another-new-password' }))).toBe(
      'INVALID_OR_EXPIRED_TOKEN',
    );
    expect((await t.gql(ME, {}, { token: accessToken })).data?.me).toBeNull();
    expect(
      (await t.gql(LOGIN, { input: { email, password: 'a-brand-new-password' } })).errors,
    ).toBeUndefined();
    expect(errorReason(await t.gql(LOGIN, { input: { email, password: PASSWORD } }))).toBe(
      'INVALID_CREDENTIALS',
    );
  });

  it('rejects an expired reset token', async () => {
    const { email } = await t.registerCustomer();
    await t.gql('mutation ($email: String!) { requestPasswordReset(email: $email) }', { email });
    const token = tokenFromLink(t.email.lastTo(email, 'auth.password_reset')?.params.link);
    t.advanceClock(61 * 60_000);
    const response = await t.gql(
      'mutation ($token: String!) { resetPassword(token: $token, newPassword: "a-brand-new-password") }',
      { token },
    );
    expect(errorReason(response)).toBe('INVALID_OR_EXPIRED_TOKEN');
  });

  it('verifies email once', async () => {
    const { email, accessToken } = await t.registerCustomer();
    const token = tokenFromLink(t.email.lastTo(email, 'auth.verify_email')?.params.link);
    const verify = 'mutation ($token: String!) { verifyEmail(token: $token) }';
    expect((await t.gql(verify, { token })).data?.verifyEmail).toBe(true);
    expect(errorReason(await t.gql(verify, { token }))).toBe('INVALID_OR_EXPIRED_TOKEN');
    expect((await t.gql(ME, {}, { token: accessToken })).data?.me).toMatchObject({ emailVerified: true });
  });
});

describe('changing password', () => {
  it('needs the current password and signs out every other session', async () => {
    const { email, accessToken } = await t.registerCustomer();
    const other = (await t.gql(LOGIN, { input: { email, password: PASSWORD } })).data?.login as {
      accessToken: string;
    };
    const change =
      'mutation ($current: String!, $next: String!) { changePassword(currentPassword: $current, newPassword: $next) }';

    expect(
      errorReason(
        await t.gql(
          change,
          { current: 'wrong-password', next: 'a-brand-new-password' },
          { token: accessToken },
        ),
      ),
    ).toBe('CURRENT_PASSWORD_INCORRECT');
    expect(
      (await t.gql(change, { current: PASSWORD, next: 'a-brand-new-password' }, { token: accessToken })).data
        ?.changePassword,
    ).toBe(true);
    expect((await t.gql(ME, {}, { token: accessToken })).data?.me).not.toBeNull();
    expect((await t.gql(ME, {}, { token: other.accessToken })).data?.me).toBeNull();
    expect(t.email.lastTo(email, 'auth.password_changed')).toBeDefined();
  });

  it('is unavailable when signed out', async () => {
    const response = await t.gql('mutation { changePassword(currentPassword: "x", newPassword: "y") }');
    expect(errorCode(response)).toBe('UNAUTHENTICATED');
  });
});

describe('rate limiting', () => {
  it('limits login attempts per address', async () => {
    const limited = await createTestApp({ rateLimiter: new MemoryRateLimiter() });
    try {
      const attempts = [];
      for (let attempt = 0; attempt < 11; attempt++) {
        attempts.push(
          await limited.gql(LOGIN, { input: { email: 'nobody@seed.test', password: 'whatever-password' } }),
        );
      }
      expect(attempts.slice(0, 10).every((response) => errorReason(response) === 'INVALID_CREDENTIALS')).toBe(
        true,
      );
      expect(errorCode(attempts[10] as never)).toBe('RATE_LIMITED');
    } finally {
      await limited.close();
    }
  }, 60_000);
});
