import { randomUUID } from 'node:crypto';
import { type Database, type Executor, schema } from '@bambino/database';
import type { Permission, VerificationTokenPurpose } from '@bambino/types';
import {
  emailSchema,
  emailTokenSchema,
  loginSchema,
  passwordSchema,
  registerSchema,
} from '@bambino/validation';
import { and, eq, gt, isNull, sql } from '@bambino/database/orm';
import { z } from 'zod';
import type { PasswordHasher } from '../auth/passwords';
import { type AccessTokenIssuer, generateOpaqueToken, hashToken } from '../auth/tokens';
import type { Logger } from '../infra/logger';
import { RATE_LIMITS, type RateLimitPolicy, type RateLimiter } from '../infra/rate-limiter';
import type { EmailProvider, EmailTemplate } from '../providers/email';
import { recordAudit } from './audit-service';
import { ANONYMOUS, type Actor, type ServiceContext, requireUser } from './context';
import { AppError, isUniqueViolation, parseInput } from './errors';

export const MAX_FAILED_LOGINS = 5;
export const LOCKOUT_MINUTES = 15;
const EMAIL_VERIFICATION_TTL_HOURS = 24;
const PASSWORD_RESET_TTL_MINUTES = 60;

export interface AuthResult {
  userId: string;
  sessionId: string;
  accessToken: string;
  accessTokenExpiresAt: Date;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
}

export interface AuthServiceDependencies {
  db: Database;
  hasher: PasswordHasher;
  accessTokens: AccessTokenIssuer;
  email: EmailProvider;
  rateLimiter: RateLimiter;
  logger: Logger;
  now: () => Date;
  config: { refreshTokenTtlDays: number; webOrigin: string; marketCode: string };
}

const INVALID_CREDENTIALS = () =>
  new AppError('UNAUTHENTICATED', 'Email or password is incorrect.', 'INVALID_CREDENTIALS');
const INVALID_TOKEN = () =>
  new AppError('VALIDATION_FAILED', 'This link is invalid or has expired.', 'INVALID_OR_EXPIRED_TOKEN');
const SESSION_INVALID = () =>
  new AppError('UNAUTHENTICATED', 'Your session has ended. Please sign in again.', 'SESSION_INVALID');

/**
 * Accounts, sessions and credentials. Every public method is one use case and
 * takes the request context first.
 */
export class AuthService {
  /** Verified against when an email is unknown, so response time does not reveal which accounts exist. */
  private dummyHash: Promise<string> | undefined;

  constructor(private readonly deps: AuthServiceDependencies) {}

  async register(context: ServiceContext, rawInput: unknown): Promise<AuthResult> {
    this.limit(`register:${context.meta.ipAddress}`, RATE_LIMITS.register);
    const input = parseInput(registerSchema, rawInput);
    const passwordHash = await this.deps.hasher.hash(input.password);
    const { db, now } = this.deps;

    let result: { auth: AuthResult; verificationToken: string };
    try {
      result = await db.transaction(async (tx) => {
        const existing = await tx
          .select({ id: schema.users.id })
          .from(schema.users)
          .where(sql`lower(${schema.users.email}) = ${input.email}`);
        if (existing.length > 0) throw emailInUse();

        const [user] = await tx
          .insert(schema.users)
          .values({ email: input.email, phone: input.phone ?? null, passwordHash })
          .returning({ id: schema.users.id });
        if (!user) throw new Error('User insert returned no row');

        await tx.insert(schema.customerProfiles).values({
          userId: user.id,
          firstName: input.firstName,
          lastName: input.lastName,
          marketCode: this.deps.config.marketCode,
        });

        const [customerRole] = await tx.select().from(schema.roles).where(eq(schema.roles.key, 'CUSTOMER'));
        if (!customerRole) throw new Error('CUSTOMER role missing: run the system seed');
        await tx.insert(schema.userRoles).values({ userId: user.id, roleId: customerRole.id });

        await tx.insert(schema.consentRecords).values(
          input.consents.map((consent) => ({
            userId: user.id,
            consentType: consent.type,
            documentVersion: consent.documentVersion,
            granted: consent.granted,
            ipAddress: context.meta.ipAddress,
          })),
        );

        const verificationToken = await this.createVerificationToken(
          tx,
          user.id,
          'EMAIL_VERIFICATION',
          EMAIL_VERIFICATION_TTL_HOURS * 60,
        );
        await tx
          .insert(schema.analyticsEvents)
          .values({ eventName: 'USER_REGISTERED', userId: user.id, occurredAt: now() });
        const auth = await this.createSession(tx, user.id, context, randomUUID());
        return { auth, verificationToken };
      });
    } catch (error) {
      if (isUniqueViolation(error, 'users_email_lower_uq')) throw emailInUse();
      if (isUniqueViolation(error, 'users_phone_uq')) {
        throw new AppError(
          'CONFLICT',
          'This phone number is already used by another account.',
          'PHONE_IN_USE',
        );
      }
      throw error;
    }

    await this.sendEmail(input.email, 'auth.verify_email', `/verify-email?token=${result.verificationToken}`);
    return result.auth;
  }

  async login(context: ServiceContext, rawInput: unknown): Promise<AuthResult> {
    this.limit(`login:${context.meta.ipAddress}`, RATE_LIMITS.login);
    const input = parseInput(loginSchema, rawInput);
    const { db, now, hasher } = this.deps;

    const [user] = await db
      .select()
      .from(schema.users)
      .where(and(sql`lower(${schema.users.email}) = ${input.email}`, isNull(schema.users.deletedAt)));

    // Identical outcome for: unknown email, no password set, locked account, wrong password.
    if (!user?.passwordHash) {
      await hasher.verify(await this.getDummyHash(), input.password);
      throw INVALID_CREDENTIALS();
    }
    if (user.lockedUntil && user.lockedUntil > now()) {
      await hasher.verify(await this.getDummyHash(), input.password);
      throw INVALID_CREDENTIALS();
    }

    if (!(await hasher.verify(user.passwordHash, input.password))) {
      const failures = user.failedLoginCount + 1;
      const locked = failures >= MAX_FAILED_LOGINS;
      await db
        .update(schema.users)
        .set({
          failedLoginCount: locked ? 0 : failures,
          lockedUntil: locked ? new Date(now().getTime() + LOCKOUT_MINUTES * 60_000) : user.lockedUntil,
        })
        .where(eq(schema.users.id, user.id));
      if (locked)
        this.deps.logger.warn('account locked after repeated failed logins', {
          userId: user.id,
          requestId: context.meta.requestId,
        });
      throw INVALID_CREDENTIALS();
    }

    if (user.status !== 'ACTIVE') {
      throw new AppError(
        'FORBIDDEN',
        'This account is not active. Please contact support.',
        'ACCOUNT_INACTIVE',
      );
    }

    return db.transaction(async (tx) => {
      await tx
        .update(schema.users)
        .set({ failedLoginCount: 0, lockedUntil: null, lastLoginAt: now() })
        .where(eq(schema.users.id, user.id));
      return this.createSession(tx, user.id, context, randomUUID());
    });
  }

  /**
   * Rotates a refresh token. Presenting a token that was already rotated or revoked means
   * it has been copied, so every session descended from the same login is revoked.
   */
  async refresh(context: ServiceContext, refreshToken: string | null | undefined): Promise<AuthResult> {
    this.limit(`refresh:${context.meta.ipAddress}`, RATE_LIMITS.refresh);
    if (!refreshToken) throw SESSION_INVALID();
    const { db, now } = this.deps;
    const tokenHash = hashToken(refreshToken);

    const outcome = await db.transaction(async (tx) => {
      const [session] = await tx
        .select()
        .from(schema.sessions)
        .where(eq(schema.sessions.refreshTokenHash, tokenHash))
        .for('update');
      if (!session) return { kind: 'invalid' as const };

      if (session.revokedAt || session.replacedBySessionId) {
        await tx
          .update(schema.sessions)
          .set({ revokedAt: now() })
          .where(and(eq(schema.sessions.familyId, session.familyId), isNull(schema.sessions.revokedAt)));
        return { kind: 'reused' as const, userId: session.userId };
      }
      if (session.expiresAt <= now()) return { kind: 'invalid' as const };

      const [user] = await tx
        .select({ status: schema.users.status })
        .from(schema.users)
        .where(eq(schema.users.id, session.userId));
      if (user?.status !== 'ACTIVE') return { kind: 'invalid' as const };

      const auth = await this.createSession(tx, session.userId, context, session.familyId);
      await tx
        .update(schema.sessions)
        .set({ revokedAt: now(), replacedBySessionId: auth.sessionId })
        .where(eq(schema.sessions.id, session.id));
      return { kind: 'rotated' as const, auth };
    });

    if (outcome.kind === 'reused') {
      this.deps.logger.warn('refresh token reuse detected; session family revoked', {
        userId: outcome.userId,
        requestId: context.meta.requestId,
      });
    }
    if (outcome.kind !== 'rotated') throw SESSION_INVALID();
    return outcome.auth;
  }

  async logout(context: ServiceContext, refreshToken: string | null | undefined): Promise<void> {
    const { db, now } = this.deps;
    if (refreshToken) {
      await db
        .update(schema.sessions)
        .set({ revokedAt: now() })
        .where(
          and(
            eq(schema.sessions.refreshTokenHash, hashToken(refreshToken)),
            isNull(schema.sessions.revokedAt),
          ),
        );
    }
    if (context.actor.kind === 'user') {
      await db
        .update(schema.sessions)
        .set({ revokedAt: now() })
        .where(and(eq(schema.sessions.id, context.actor.sessionId), isNull(schema.sessions.revokedAt)));
    }
  }

  /** Resolves an access token to an actor. Revoked sessions and inactive users get no access, immediately. */
  async authenticate(accessToken: string | null | undefined): Promise<Actor> {
    if (!accessToken) return ANONYMOUS;
    const claims = await this.deps.accessTokens.verify(accessToken);
    if (!claims) return ANONYMOUS;
    const { db, now } = this.deps;

    const [row] = await db
      .select({ status: schema.users.status })
      .from(schema.sessions)
      .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
      .where(
        and(
          eq(schema.sessions.id, claims.sessionId),
          eq(schema.sessions.userId, claims.userId),
          isNull(schema.sessions.revokedAt),
          gt(schema.sessions.expiresAt, now()),
        ),
      );
    if (row?.status !== 'ACTIVE') return ANONYMOUS;

    return {
      kind: 'user',
      userId: claims.userId,
      sessionId: claims.sessionId,
      permissions: new Set(await this.loadPermissions(claims.userId)),
    };
  }

  /** Permissions granted through all of a user's roles, read fresh so role changes apply at once. */
  async loadPermissions(userId: string): Promise<Permission[]> {
    const rows = await this.deps.db
      .selectDistinct({ key: schema.permissions.key })
      .from(schema.userRoles)
      .innerJoin(schema.rolePermissions, eq(schema.rolePermissions.roleId, schema.userRoles.roleId))
      .innerJoin(schema.permissions, eq(schema.permissions.id, schema.rolePermissions.permissionId))
      .where(eq(schema.userRoles.userId, userId))
      .orderBy(schema.permissions.key);
    return rows.map((row) => row.key as Permission);
  }

  /** Always succeeds from the caller's point of view, so it cannot be used to discover accounts. */
  async requestPasswordReset(context: ServiceContext, rawEmail: unknown): Promise<void> {
    this.limit(`password-reset:${context.meta.ipAddress}`, RATE_LIMITS.passwordReset);
    const parsed = emailSchema.safeParse(rawEmail);
    if (!parsed.success) return;
    this.limit(`password-reset:${parsed.data}`, RATE_LIMITS.passwordReset);
    const { db, now } = this.deps;

    const [user] = await db
      .select({ id: schema.users.id, email: schema.users.email })
      .from(schema.users)
      .where(
        and(
          sql`lower(${schema.users.email}) = ${parsed.data}`,
          eq(schema.users.status, 'ACTIVE'),
          isNull(schema.users.deletedAt),
        ),
      );
    if (!user?.email) return;

    const token = await db.transaction(async (tx) => {
      await tx
        .update(schema.verificationTokens)
        .set({ consumedAt: now() })
        .where(
          and(
            eq(schema.verificationTokens.userId, user.id),
            eq(schema.verificationTokens.purpose, 'PASSWORD_RESET'),
            isNull(schema.verificationTokens.consumedAt),
          ),
        );
      return this.createVerificationToken(tx, user.id, 'PASSWORD_RESET', PASSWORD_RESET_TTL_MINUTES);
    });
    await this.sendEmail(user.email, 'auth.password_reset', `/reset-password?token=${token}`);
  }

  /** Sets a new password from an emailed token and signs the account out everywhere. */
  async resetPassword(context: ServiceContext, rawToken: unknown, rawPassword: unknown): Promise<void> {
    const token = parseInput(emailTokenSchema, rawToken);
    const password = parseInput(passwordSchema, rawPassword);
    const passwordHash = await this.deps.hasher.hash(password);
    const { db, now } = this.deps;

    await db.transaction(async (tx) => {
      const userId = await this.consumeVerificationToken(tx, token, 'PASSWORD_RESET');
      await tx
        .update(schema.users)
        .set({ passwordHash, failedLoginCount: 0, lockedUntil: null })
        .where(eq(schema.users.id, userId));
      await tx
        .update(schema.sessions)
        .set({ revokedAt: now() })
        .where(and(eq(schema.sessions.userId, userId), isNull(schema.sessions.revokedAt)));
      await recordAudit(tx, context, { action: 'user.password_reset', entityType: 'user', entityId: userId });
    });
  }

  /** Changes the password and signs out every other session; the current one stays signed in. */
  async changePassword(
    context: ServiceContext,
    currentPassword: unknown,
    rawNewPassword: unknown,
  ): Promise<void> {
    const actor = requireUser(context);
    const current = parseInput(z.string().min(1).max(256), currentPassword);
    const next = parseInput(passwordSchema, rawNewPassword);
    const { db, now, hasher } = this.deps;

    const [user] = await db.select().from(schema.users).where(eq(schema.users.id, actor.userId));
    if (!user?.passwordHash || !(await hasher.verify(user.passwordHash, current))) {
      throw new AppError(
        'VALIDATION_FAILED',
        'Your current password is incorrect.',
        'CURRENT_PASSWORD_INCORRECT',
      );
    }
    const passwordHash = await hasher.hash(next);

    await db.transaction(async (tx) => {
      await tx.update(schema.users).set({ passwordHash }).where(eq(schema.users.id, actor.userId));
      await tx
        .update(schema.sessions)
        .set({ revokedAt: now() })
        .where(
          and(
            eq(schema.sessions.userId, actor.userId),
            isNull(schema.sessions.revokedAt),
            sql`${schema.sessions.id} <> ${actor.sessionId}`,
          ),
        );
      await recordAudit(tx, context, {
        action: 'user.password_changed',
        entityType: 'user',
        entityId: actor.userId,
      });
    });
    if (user.email) await this.sendEmail(user.email, 'auth.password_changed', '/account/settings');
  }

  async requestEmailVerification(context: ServiceContext): Promise<void> {
    const actor = requireUser(context);
    this.limit(`email-verification:${actor.userId}`, RATE_LIMITS.emailVerification);
    const { db } = this.deps;
    const [user] = await db.select().from(schema.users).where(eq(schema.users.id, actor.userId));
    if (!user?.email || user.emailVerifiedAt) return;
    const token = await this.createVerificationToken(
      db,
      user.id,
      'EMAIL_VERIFICATION',
      EMAIL_VERIFICATION_TTL_HOURS * 60,
    );
    await this.sendEmail(user.email, 'auth.verify_email', `/verify-email?token=${token}`);
  }

  async verifyEmail(_context: ServiceContext, rawToken: unknown): Promise<void> {
    const token = parseInput(emailTokenSchema, rawToken);
    const { db, now } = this.deps;
    await db.transaction(async (tx) => {
      const userId = await this.consumeVerificationToken(tx, token, 'EMAIL_VERIFICATION');
      await tx.update(schema.users).set({ emailVerifiedAt: now() }).where(eq(schema.users.id, userId));
    });
  }

  /** Confirms the signed-in user's password; used before sensitive account actions. */
  async confirmPassword(userId: string, password: string): Promise<boolean> {
    const [user] = await this.deps.db
      .select({ passwordHash: schema.users.passwordHash })
      .from(schema.users)
      .where(eq(schema.users.id, userId));
    return Boolean(user?.passwordHash) && (await this.deps.hasher.verify(user?.passwordHash ?? '', password));
  }

  // --- internals --------------------------------------------------------------

  private async createSession(
    db: Executor,
    userId: string,
    context: ServiceContext,
    familyId: string,
  ): Promise<AuthResult> {
    const refreshToken = generateOpaqueToken();
    const refreshTokenExpiresAt = new Date(
      this.deps.now().getTime() + this.deps.config.refreshTokenTtlDays * 86_400_000,
    );
    const [session] = await db
      .insert(schema.sessions)
      .values({
        userId,
        familyId,
        refreshTokenHash: hashToken(refreshToken),
        userAgent: context.meta.userAgent?.slice(0, 300) ?? null,
        ipAddress: context.meta.ipAddress,
        expiresAt: refreshTokenExpiresAt,
      })
      .returning({ id: schema.sessions.id });
    if (!session) throw new Error('Session insert returned no row');
    const access = await this.deps.accessTokens.sign({ userId, sessionId: session.id });
    return {
      userId,
      sessionId: session.id,
      accessToken: access.token,
      accessTokenExpiresAt: access.expiresAt,
      refreshToken,
      refreshTokenExpiresAt,
    };
  }

  private async createVerificationToken(
    db: Executor,
    userId: string,
    purpose: VerificationTokenPurpose,
    ttlMinutes: number,
  ): Promise<string> {
    const token = generateOpaqueToken();
    await db.insert(schema.verificationTokens).values({
      userId,
      purpose,
      tokenHash: hashToken(token),
      expiresAt: new Date(this.deps.now().getTime() + ttlMinutes * 60_000),
    });
    return token;
  }

  /** Marks a token used and returns its user, or fails if it is unknown, used, expired or for another purpose. */
  private async consumeVerificationToken(
    db: Executor,
    token: string,
    purpose: VerificationTokenPurpose,
  ): Promise<string> {
    const now = this.deps.now();
    const [row] = await db
      .update(schema.verificationTokens)
      .set({ consumedAt: now })
      .where(
        and(
          eq(schema.verificationTokens.tokenHash, hashToken(token)),
          eq(schema.verificationTokens.purpose, purpose),
          isNull(schema.verificationTokens.consumedAt),
          gt(schema.verificationTokens.expiresAt, now),
        ),
      )
      .returning({ userId: schema.verificationTokens.userId });
    if (!row) throw INVALID_TOKEN();
    return row.userId;
  }

  private async sendEmail(to: string, template: EmailTemplate, path: string): Promise<void> {
    try {
      await this.deps.email.send({
        to,
        template,
        locale: 'en',
        params: { link: `${this.deps.config.webOrigin}${path}` },
      });
    } catch (error) {
      // The account change has already committed; a failed email is retried by the user, not rolled back.
      this.deps.logger.error('email send failed', { template, error });
    }
  }

  private limit(key: string, policy: RateLimitPolicy): void {
    if (!this.deps.rateLimiter.consume(key, policy)) {
      throw new AppError('RATE_LIMITED', 'Too many attempts. Please wait a few minutes and try again.');
    }
  }

  private getDummyHash(): Promise<string> {
    this.dummyHash ??= this.deps.hasher.hash(generateOpaqueToken());
    return this.dummyHash;
  }
}

function emailInUse() {
  return new AppError('CONFLICT', 'An account with this email already exists.', 'EMAIL_IN_USE');
}
