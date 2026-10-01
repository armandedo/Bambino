import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  boolean,
  check,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { createdAt, deletedAt, id, tstz, updatedAt } from './columns';
import {
  consentType,
  dataRequestStatus,
  dataRequestType,
  userStatus,
  verificationTokenPurpose,
} from './enums';

export const users = pgTable(
  'users',
  {
    id: id(),
    email: text('email'),
    emailVerifiedAt: tstz('email_verified_at'),
    /** E.164. Phone sign-in is designed for but NOT YET INTEGRATED (no SMS provider). */
    phone: text('phone'),
    phoneVerifiedAt: tstz('phone_verified_at'),
    /** argon2id hash. Null for accounts that only sign in by phone. */
    passwordHash: text('password_hash'),
    status: userStatus('status').notNull().default('ACTIVE'),
    failedLoginCount: integer('failed_login_count').notNull().default(0),
    lockedUntil: tstz('locked_until'),
    lastLoginAt: tstz('last_login_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [
    uniqueIndex('users_email_lower_uq').on(sql`lower(${t.email})`),
    uniqueIndex('users_phone_uq').on(t.phone),
    // A deleted account is anonymised in place, so it is the only kind allowed to have neither.
    check(
      'users_has_identifier',
      sql`${t.email} IS NOT NULL OR ${t.phone} IS NOT NULL OR ${t.status} = 'DELETED'`,
    ),
  ],
);

export const roles = pgTable(
  'roles',
  {
    id: id(),
    key: text('key').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    /** System roles are seeded from @bambino/types and cannot be removed in the admin UI. */
    isSystem: boolean('is_system').notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('roles_key_uq').on(t.key)],
);

export const permissions = pgTable(
  'permissions',
  {
    id: id(),
    key: text('key').notNull(),
    description: text('description'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('permissions_key_uq').on(t.key)],
);

export const rolePermissions = pgTable(
  'role_permissions',
  {
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    permissionId: uuid('permission_id')
      .notNull()
      .references(() => permissions.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.roleId, t.permissionId] })],
);

export const userRoles = pgTable(
  'user_roles',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'restrict' }),
    grantedBy: uuid('granted_by').references(() => users.id, { onDelete: 'set null' }),
    grantedAt: tstz('granted_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.roleId] }), index('user_roles_role_idx').on(t.roleId)],
);

/**
 * One row per issued refresh token. Rotation creates a new row in the same family and
 * links the old one through replacedBySessionId; presenting an already-rotated token
 * revokes the whole family (reuse detection).
 */
export const sessions = pgTable(
  'sessions',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    familyId: uuid('family_id').notNull(),
    /** SHA-256 of the opaque refresh token; the token itself is never stored. */
    refreshTokenHash: text('refresh_token_hash').notNull(),
    userAgent: text('user_agent'),
    ipAddress: text('ip_address'),
    expiresAt: tstz('expires_at').notNull(),
    revokedAt: tstz('revoked_at'),
    replacedBySessionId: uuid('replaced_by_session_id').references((): AnyPgColumn => sessions.id, {
      onDelete: 'set null',
    }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('sessions_refresh_token_hash_uq').on(t.refreshTokenHash),
    index('sessions_user_idx').on(t.userId),
    index('sessions_family_idx').on(t.familyId),
  ],
);

/** Single-use, hashed, expiring tokens for email verification, password reset and phone OTP. */
export const verificationTokens = pgTable(
  'verification_tokens',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    purpose: verificationTokenPurpose('purpose').notNull(),
    tokenHash: text('token_hash').notNull(),
    expiresAt: tstz('expires_at').notNull(),
    consumedAt: tstz('consumed_at'),
    attempts: integer('attempts').notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('verification_tokens_hash_uq').on(t.tokenHash),
    index('verification_tokens_user_purpose_idx').on(t.userId, t.purpose),
  ],
);

export const customerProfiles = pgTable(
  'customer_profiles',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    firstName: text('first_name').notNull(),
    lastName: text('last_name').notNull(),
    marketCode: text('market_code').notNull(),
    preferredLocale: text('preferred_locale').notNull().default('en'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('customer_profiles_user_uq').on(t.userId)],
);

/**
 * Generic address columns; which are shown and required per country comes from
 * MarketConfig.addressFormat (Rwanda: province / district / sector / street / directions).
 */
export const addresses = pgTable(
  'addresses',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    label: text('label'),
    recipientName: text('recipient_name').notNull(),
    phone: text('phone').notNull(),
    countryCode: text('country_code').notNull(),
    region: text('region'),
    district: text('district'),
    sector: text('sector'),
    street: text('street'),
    directions: text('directions'),
    isDefault: boolean('is_default').notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [
    index('addresses_user_idx').on(t.userId),
    uniqueIndex('addresses_one_default_per_user_uq')
      .on(t.userId)
      .where(sql`${t.isDefault} AND ${t.deletedAt} IS NULL`),
  ],
);

/** Append-only evidence of what a user agreed to, and which document version. */
export const consentRecords = pgTable(
  'consent_records',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    consentType: consentType('consent_type').notNull(),
    documentVersion: text('document_version').notNull(),
    granted: boolean('granted').notNull(),
    ipAddress: text('ip_address'),
    createdAt: createdAt(),
  },
  (t) => [index('consent_records_user_type_idx').on(t.userId, t.consentType)],
);

/** Data export and account deletion requests, processed asynchronously by staff or a job. */
export const dataRequests = pgTable(
  'data_requests',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: dataRequestType('type').notNull(),
    status: dataRequestStatus('status').notNull().default('REQUESTED'),
    /** Object-storage key of the generated export, when type = EXPORT. */
    resultObjectKey: text('result_object_key'),
    requestedAt: tstz('requested_at').notNull().defaultNow(),
    completedAt: tstz('completed_at'),
  },
  (t) => [index('data_requests_user_idx').on(t.userId), index('data_requests_status_idx').on(t.status)],
);
