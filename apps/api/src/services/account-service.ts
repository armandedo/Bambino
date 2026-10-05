import { LEGAL_DOCUMENT_VERSIONS } from '@bambino/config';
import { type Database, type Executor, schema } from '@bambino/database';
import type { DataRequestType } from '@bambino/types';
import { addressSchema, consentSchema, updateProfileSchema } from '@bambino/validation';
import { and, asc, desc, eq, inArray, isNull, sql } from '@bambino/database/orm';
import { z } from 'zod';
import type { AuthService } from './auth-service';
import { type ServiceContext, requireUser } from './context';
import { AppError, isUniqueViolation, parseInput } from './errors';

export const MAX_ADDRESSES = 20;

export interface UserView {
  id: string;
  email: string | null;
  emailVerified: boolean;
  phone: string | null;
  firstName: string;
  lastName: string;
  preferredLocale: string;
  roles: string[];
  createdAt: Date;
}

export type AddressRow = typeof schema.addresses.$inferSelect;
export type DataRequestRow = typeof schema.dataRequests.$inferSelect;

/** The signed-in customer's own account: profile, addresses, consents and data requests. */
export class AccountService {
  constructor(
    private readonly db: Database,
    private readonly auth: AuthService,
    /** The deletion grace period is counted from requestedAt, so it uses the service clock. */
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** Only ever called with the actor's own id; there is no way to ask for someone else's account. */
  async getOwnAccount(context: ServiceContext): Promise<UserView> {
    const actor = requireUser(context);
    return this.loadUserView(actor.userId);
  }

  async loadUserView(userId: string): Promise<UserView> {
    const [row] = await this.db
      .select({ user: schema.users, profile: schema.customerProfiles })
      .from(schema.users)
      .innerJoin(schema.customerProfiles, eq(schema.customerProfiles.userId, schema.users.id))
      .where(eq(schema.users.id, userId));
    if (!row) throw new AppError('NOT_FOUND', 'Account not found.');
    const roles = await this.db
      .select({ key: schema.roles.key })
      .from(schema.userRoles)
      .innerJoin(schema.roles, eq(schema.roles.id, schema.userRoles.roleId))
      .where(eq(schema.userRoles.userId, userId))
      .orderBy(asc(schema.roles.key));
    return {
      id: row.user.id,
      email: row.user.email,
      emailVerified: row.user.emailVerifiedAt !== null,
      phone: row.user.phone,
      firstName: row.profile.firstName,
      lastName: row.profile.lastName,
      preferredLocale: row.profile.preferredLocale,
      roles: roles.map((role) => role.key),
      createdAt: row.user.createdAt,
    };
  }

  /** Customer summaries for staff screens (callers have already checked a staff permission). */
  async customerSummaries(userIds: readonly string[]) {
    if (userIds.length === 0) return [];
    return this.db
      .select({ user: schema.users, profile: schema.customerProfiles })
      .from(schema.users)
      .innerJoin(schema.customerProfiles, eq(schema.customerProfiles.userId, schema.users.id))
      .where(inArray(schema.users.id, [...userIds]));
  }

  async updateProfile(context: ServiceContext, rawInput: unknown): Promise<UserView> {
    const actor = requireUser(context);
    const input = parseInput(updateProfileSchema, rawInput);
    try {
      await this.db.transaction(async (tx) => {
        const profileChanges = {
          ...(input.firstName ? { firstName: input.firstName } : {}),
          ...(input.lastName ? { lastName: input.lastName } : {}),
          ...(input.preferredLocale ? { preferredLocale: input.preferredLocale } : {}),
        };
        if (Object.keys(profileChanges).length > 0) {
          await tx
            .update(schema.customerProfiles)
            .set(profileChanges)
            .where(eq(schema.customerProfiles.userId, actor.userId));
        }
        if (input.phone !== undefined) {
          // A changed number is unverified again.
          await tx
            .update(schema.users)
            .set({ phone: input.phone, phoneVerifiedAt: null })
            .where(
              and(
                eq(schema.users.id, actor.userId),
                sql`${schema.users.phone} IS DISTINCT FROM ${input.phone}`,
              ),
            );
        }
      });
    } catch (error) {
      if (isUniqueViolation(error, 'users_phone_uq')) {
        throw new AppError(
          'CONFLICT',
          'This phone number is already used by another account.',
          'PHONE_IN_USE',
        );
      }
      throw error;
    }
    return this.loadUserView(actor.userId);
  }

  async listAddresses(context: ServiceContext): Promise<AddressRow[]> {
    const actor = requireUser(context);
    return this.listAddressesOf(actor.userId);
  }

  /**
   * For the User type's resolver, which is only reachable for the user's own account
   * (me, sign-in responses, updateProfile). Not exposed through any operation that takes an id.
   */
  async listAddressesOf(userId: string): Promise<AddressRow[]> {
    return this.db
      .select()
      .from(schema.addresses)
      .where(and(eq(schema.addresses.userId, userId), isNull(schema.addresses.deletedAt)))
      .orderBy(desc(schema.addresses.isDefault), asc(schema.addresses.createdAt));
  }

  async createAddress(context: ServiceContext, rawInput: unknown): Promise<AddressRow> {
    const actor = requireUser(context);
    const input = parseInput(addressSchema, rawInput);
    return this.db.transaction(async (tx) => {
      const [count] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(schema.addresses)
        .where(and(eq(schema.addresses.userId, actor.userId), isNull(schema.addresses.deletedAt)));
      const existing = count?.n ?? 0;
      if (existing >= MAX_ADDRESSES) throw new AppError('CONFLICT', 'Address book is full.', 'ADDRESS_LIMIT');
      // The first address becomes the default automatically.
      const isDefault = Boolean(input.isDefault) || existing === 0;
      if (isDefault) await this.clearDefault(tx, actor.userId);
      const [address] = await tx
        .insert(schema.addresses)
        .values({ ...toAddressColumns(input), userId: actor.userId, isDefault })
        .returning();
      if (!address) throw new Error('Address insert returned no row');
      return address;
    });
  }

  async updateAddress(context: ServiceContext, id: string, rawInput: unknown): Promise<AddressRow> {
    const actor = requireUser(context);
    const input = parseInput(addressSchema, rawInput);
    return this.db.transaction(async (tx) => {
      await this.findOwnAddress(tx, actor.userId, id);
      if (input.isDefault) await this.clearDefault(tx, actor.userId);
      const [address] = await tx
        .update(schema.addresses)
        .set({ ...toAddressColumns(input), ...(input.isDefault ? { isDefault: true } : {}) })
        .where(and(eq(schema.addresses.id, id), eq(schema.addresses.userId, actor.userId)))
        .returning();
      if (!address) throw addressNotFound();
      return address;
    });
  }

  async deleteAddress(context: ServiceContext, id: string): Promise<void> {
    const actor = requireUser(context);
    await this.db.transaction(async (tx) => {
      const address = await this.findOwnAddress(tx, actor.userId, id);
      await tx
        .update(schema.addresses)
        .set({ deletedAt: new Date(), isDefault: false })
        .where(eq(schema.addresses.id, id));
      if (address.isDefault) {
        // Promote the oldest remaining address so there is still a default.
        const [next] = await tx
          .select({ id: schema.addresses.id })
          .from(schema.addresses)
          .where(and(eq(schema.addresses.userId, actor.userId), isNull(schema.addresses.deletedAt)))
          .orderBy(asc(schema.addresses.createdAt))
          .limit(1);
        if (next)
          await tx.update(schema.addresses).set({ isDefault: true }).where(eq(schema.addresses.id, next.id));
      }
    });
  }

  async recordConsent(context: ServiceContext, rawInput: unknown): Promise<void> {
    const actor = requireUser(context);
    const input = parseInput(consentSchema, rawInput);
    if (input.documentVersion !== LEGAL_DOCUMENT_VERSIONS[input.type]) {
      throw new AppError(
        'VALIDATION_FAILED',
        'This document version is out of date.',
        'STALE_DOCUMENT_VERSION',
      );
    }
    await this.db.insert(schema.consentRecords).values({
      userId: actor.userId,
      consentType: input.type,
      documentVersion: input.documentVersion,
      granted: input.granted,
      ipAddress: context.meta.ipAddress,
    });
  }

  async listDataRequests(context: ServiceContext): Promise<DataRequestRow[]> {
    const actor = requireUser(context);
    return this.db
      .select()
      .from(schema.dataRequests)
      .where(eq(schema.dataRequests.userId, actor.userId))
      .orderBy(desc(schema.dataRequests.requestedAt));
  }

  /** Records the request. Producing the export file is a staff/job workflow (NOT YET BUILT). */
  async requestDataExport(context: ServiceContext): Promise<DataRequestRow> {
    const actor = requireUser(context);
    return this.openDataRequest(actor.userId, 'EXPORT');
  }

  /**
   * Records a deletion request after re-checking the password. Deletion itself waits
   * for subscriptions and outstanding garments to be settled (docs/01-architecture.md §1.10).
   */
  async requestAccountDeletion(context: ServiceContext, currentPassword: unknown): Promise<DataRequestRow> {
    const actor = requireUser(context);
    const password = parseInput(z.string().min(1).max(256), currentPassword);
    if (!(await this.auth.confirmPassword(actor.userId, password))) {
      throw new AppError(
        'VALIDATION_FAILED',
        'Your current password is incorrect.',
        'CURRENT_PASSWORD_INCORRECT',
      );
    }
    return this.openDataRequest(actor.userId, 'DELETION');
  }

  private async openDataRequest(userId: string, type: DataRequestType): Promise<DataRequestRow> {
    return this.db.transaction(async (tx) => {
      const [open] = await tx
        .select()
        .from(schema.dataRequests)
        .where(
          and(
            eq(schema.dataRequests.userId, userId),
            eq(schema.dataRequests.type, type),
            inArray(schema.dataRequests.status, ['REQUESTED', 'PROCESSING']),
          ),
        );
      if (open) return open;
      const [created] = await tx
        .insert(schema.dataRequests)
        .values({ userId, type, requestedAt: this.now() })
        .returning();
      if (!created) throw new Error('Data request insert returned no row');
      return created;
    });
  }

  private async findOwnAddress(db: Executor, userId: string, id: string): Promise<AddressRow> {
    if (!z.uuid().safeParse(id).success) throw addressNotFound();
    const [address] = await db
      .select()
      .from(schema.addresses)
      .where(
        and(
          eq(schema.addresses.id, id),
          eq(schema.addresses.userId, userId),
          isNull(schema.addresses.deletedAt),
        ),
      );
    if (!address) throw addressNotFound();
    return address;
  }

  private async clearDefault(db: Executor, userId: string): Promise<void> {
    await db
      .update(schema.addresses)
      .set({ isDefault: false })
      .where(and(eq(schema.addresses.userId, userId), eq(schema.addresses.isDefault, true)));
  }
}

function toAddressColumns(input: z.infer<typeof addressSchema>) {
  return {
    label: input.label ?? null,
    recipientName: input.recipientName,
    phone: input.phone,
    countryCode: input.countryCode,
    region: input.region ?? null,
    district: input.district ?? null,
    sector: input.sector ?? null,
    street: input.street ?? null,
    directions: input.directions ?? null,
  };
}

/** Another customer's address and a non-existent one look the same. */
function addressNotFound() {
  return new AppError('NOT_FOUND', 'Address not found.');
}
