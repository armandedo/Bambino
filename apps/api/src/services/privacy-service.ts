import { PRIVACY_POLICY } from '@bambino/config';
import { type Database, type Executor, schema } from '@bambino/database';
import { and, desc, eq, inArray, isNotNull, lt, or, sql } from '@bambino/database/orm';
import { z } from 'zod';
import type { Logger } from '../infra/logger';
import type { EmailProvider } from '../providers/email';
import type { StorageProvider } from '../providers/storage';
import { type ServiceContext, requireUser } from './context';
import { AppError, parseInput } from './errors';
import type { OrderService } from './order-service';

export type DataRequestRow = typeof schema.dataRequests.$inferSelect;

const DAY_MS = 24 * 60 * 60_000;
/** Shown in place of a deleted person's details where a record must be kept. */
export const DELETED_NAME = 'Deleted customer';

export interface PrivacyServiceDependencies {
  db: Database;
  storage: StorageProvider;
  email: EmailProvider;
  orders: OrderService;
  logger: Logger;
  webOrigin: string;
  now: () => Date;
}

/**
 * Carries out data export and account deletion requests (Rwanda Law 058/2021; timings in PRIVACY_POLICY, open
 * question 14). Run by the background job. What deletion keeps, and why, is documented in
 * docs/03-auth-and-security.md.
 */
export class PrivacyService {
  constructor(private readonly deps: PrivacyServiceDependencies) {}

  /** One pass of the job: build waiting exports, delete expired export files, carry out due deletions. */
  async processRequests(): Promise<{ exported: number; deleted: number; expiredExports: number }> {
    const now = this.deps.now();
    const exports = await this.deps.db
      .select()
      .from(schema.dataRequests)
      .where(and(eq(schema.dataRequests.type, 'EXPORT'), eq(schema.dataRequests.status, 'REQUESTED')))
      .limit(20);
    let exported = 0;
    for (const request of exports) {
      try {
        await this.export(request);
        exported += 1;
      } catch (error) {
        this.deps.logger.error('data export failed; will retry', { dataRequestId: request.id, error });
      }
    }

    const graceCutoff = new Date(now.getTime() - PRIVACY_POLICY.deletionGraceDays * DAY_MS);
    const deletions = await this.deps.db
      .select()
      .from(schema.dataRequests)
      .where(
        and(
          eq(schema.dataRequests.type, 'DELETION'),
          inArray(schema.dataRequests.status, ['REQUESTED', 'PROCESSING']),
          lt(schema.dataRequests.requestedAt, graceCutoff),
        ),
      )
      .limit(20);
    let deleted = 0;
    for (const request of deletions) {
      try {
        await this.deleteAccount(request);
        deleted += 1;
      } catch (error) {
        this.deps.logger.error('account deletion failed; will retry', { dataRequestId: request.id, error });
      }
    }

    const expired = await this.deps.db
      .select()
      .from(schema.dataRequests)
      .where(
        and(
          eq(schema.dataRequests.type, 'EXPORT'),
          isNotNull(schema.dataRequests.resultObjectKey),
          lt(schema.dataRequests.expiresAt, now),
        ),
      );
    for (const request of expired) await this.removeExportFile(request);
    return { exported, deleted, expiredExports: expired.length };
  }

  /** A short-lived signed link to the customer's own export, while it is kept. */
  async exportDownloadUrl(
    context: ServiceContext,
    rawId: unknown,
  ): Promise<{ url: string; expiresAt: Date }> {
    const actor = requireUser(context);
    const id = parseInput(z.uuid(), rawId);
    const [request] = await this.deps.db
      .select()
      .from(schema.dataRequests)
      .where(and(eq(schema.dataRequests.id, id), eq(schema.dataRequests.userId, actor.userId)));
    if (!request || request.type !== 'EXPORT') throw new AppError('NOT_FOUND', 'Export not found.');
    if (request.status !== 'COMPLETED' || !request.resultObjectKey) {
      throw new AppError('CONFLICT', 'This export is not available.', 'EXPORT_NOT_AVAILABLE');
    }
    return this.deps.storage.signedDownloadUrl(
      request.resultObjectKey,
      PRIVACY_POLICY.exportLinkMinutes * 60,
    );
  }

  /** Everything held about the account, as plain data. Secrets (password hash, tokens) are left out. */
  async buildExport(userId: string): Promise<Record<string, unknown>> {
    const { db } = this.deps;
    const [user] = await db
      .select({
        id: schema.users.id,
        email: schema.users.email,
        emailVerifiedAt: schema.users.emailVerifiedAt,
        phone: schema.users.phone,
        status: schema.users.status,
        createdAt: schema.users.createdAt,
        lastLoginAt: schema.users.lastLoginAt,
      })
      .from(schema.users)
      .where(eq(schema.users.id, userId));
    if (!user) throw new Error(`No user ${userId}`);
    const babies = await db.select().from(schema.babyProfiles).where(eq(schema.babyProfiles.userId, userId));
    const babyIds = babies.map((baby) => baby.id);
    const orders = await db.select().from(schema.orders).where(eq(schema.orders.userId, userId));
    const orderIds = orders.map((order) => order.id);
    const recommendations = babyIds.length
      ? await db
          .select()
          .from(schema.sizingRecommendations)
          .where(inArray(schema.sizingRecommendations.babyProfileId, babyIds))
      : [];
    return {
      format: 'bambino-data-export',
      version: 1,
      generatedAt: this.deps.now().toISOString(),
      note: 'Amounts are in minor units of the stated currency. Dates are ISO 8601 in UTC.',
      account: user,
      profile:
        (
          await db.select().from(schema.customerProfiles).where(eq(schema.customerProfiles.userId, userId))
        )[0] ?? null,
      addresses: await db.select().from(schema.addresses).where(eq(schema.addresses.userId, userId)),
      consents: await db.select().from(schema.consentRecords).where(eq(schema.consentRecords.userId, userId)),
      babies,
      measurements: babyIds.length
        ? await db
            .select()
            .from(schema.babyMeasurements)
            .where(inArray(schema.babyMeasurements.babyProfileId, babyIds))
        : [],
      sizeRecommendations: recommendations,
      subscriptions: await db
        .select()
        .from(schema.subscriptions)
        .where(eq(schema.subscriptions.userId, userId)),
      orders,
      orderItems: orderIds.length
        ? await db.select().from(schema.orderItems).where(inArray(schema.orderItems.orderId, orderIds))
        : [],
      payments: (await db.select().from(schema.payments).where(eq(schema.payments.userId, userId))).map(
        ({ idempotencyKey: _key, ...payment }) => payment,
      ),
      refunds: (await db.select().from(schema.refunds).where(eq(schema.refunds.userId, userId))).map(
        ({ idempotencyKey: _key, reason: _reason, ...refund }) => refund,
      ),
      paymentMethods: await db
        .select()
        .from(schema.paymentMethods)
        .where(eq(schema.paymentMethods.userId, userId)),
      returns: await db.select().from(schema.returnRequests).where(eq(schema.returnRequests.userId, userId)),
      exchanges: await db.select().from(schema.exchanges).where(eq(schema.exchanges.userId, userId)),
      exchangeCredit: await db
        .select()
        .from(schema.exchangeCredits)
        .where(eq(schema.exchangeCredits.userId, userId)),
      notifications: await db
        .select()
        .from(schema.notifications)
        .where(eq(schema.notifications.userId, userId)),
      dataRequests: await db
        .select({
          id: schema.dataRequests.id,
          type: schema.dataRequests.type,
          status: schema.dataRequests.status,
          requestedAt: schema.dataRequests.requestedAt,
          completedAt: schema.dataRequests.completedAt,
        })
        .from(schema.dataRequests)
        .where(eq(schema.dataRequests.userId, userId)),
      // Audit entries about the account or made by it (security log; staff names are not included).
      auditEntries: await db
        .select({
          action: schema.auditLogs.action,
          entityType: schema.auditLogs.entityType,
          entityId: schema.auditLogs.entityId,
          ipAddress: schema.auditLogs.ipAddress,
          createdAt: schema.auditLogs.createdAt,
        })
        .from(schema.auditLogs)
        .where(or(eq(schema.auditLogs.actorId, userId), eq(schema.auditLogs.entityId, userId)))
        .orderBy(desc(schema.auditLogs.createdAt)),
    };
  }

  // --- internals --------------------------------------------------------------

  private async export(request: DataRequestRow): Promise<void> {
    const { db, now } = this.deps;
    await db
      .update(schema.dataRequests)
      .set({ status: 'PROCESSING' })
      .where(eq(schema.dataRequests.id, request.id));
    const archive = await this.buildExport(request.userId);
    const objectKey = `private/exports/${request.userId}/${request.id}.json`;
    await this.deps.storage.putPrivate(objectKey, JSON.stringify(archive, null, 2), 'application/json');
    const [user] = await db.select().from(schema.users).where(eq(schema.users.id, request.userId));
    await db
      .update(schema.dataRequests)
      .set({
        status: 'COMPLETED',
        resultObjectKey: objectKey,
        completedAt: now(),
        expiresAt: new Date(now().getTime() + PRIVACY_POLICY.exportRetentionDays * DAY_MS),
      })
      .where(eq(schema.dataRequests.id, request.id));
    // The email carries no data and no download link: the link is issued after signing in.
    if (user?.email) await this.sendEmail(user.email, 'privacy.export_ready', '/account#privacy');
  }

  private async removeExportFile(request: DataRequestRow): Promise<void> {
    if (!request.resultObjectKey) return;
    await this.deps.storage.deleteObject(request.resultObjectKey);
    await this.deps.db
      .update(schema.dataRequests)
      .set({ resultObjectKey: null })
      .where(eq(schema.dataRequests.id, request.id));
  }

  /**
   * Anonymises the account in place, so orders, payments, credit and garment history stay intact for the law and
   * accounting but no longer identify anyone. Safe to run again: every step only overwrites or deletes.
   */
  private async deleteAccount(request: DataRequestRow): Promise<void> {
    const { db, now } = this.deps;
    const userId = request.userId;
    const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
    const email = user?.email ?? null;

    // Export files are personal data too.
    const files = await db
      .select()
      .from(schema.dataRequests)
      .where(and(eq(schema.dataRequests.userId, userId), isNotNull(schema.dataRequests.resultObjectKey)));
    for (const file of files) await this.removeExportFile(file);

    await db.transaction(async (tx) => {
      await tx
        .update(schema.dataRequests)
        .set({ status: 'PROCESSING' })
        .where(eq(schema.dataRequests.id, request.id));

      // Open commitments end: unpaid orders are cancelled, subscriptions stop.
      const unpaid = await tx
        .select()
        .from(schema.orders)
        .where(and(eq(schema.orders.userId, userId), eq(schema.orders.status, 'PENDING_PAYMENT')));
      for (const order of unpaid) {
        const locked = await this.deps.orders.lockOrder(tx, order.id);
        if (locked?.status === 'PENDING_PAYMENT') {
          await this.deps.orders.cancelUnpaid(tx, locked, null, 'Account deleted');
        }
      }
      const live = await tx
        .select()
        .from(schema.subscriptions)
        .where(
          and(
            eq(schema.subscriptions.userId, userId),
            inArray(schema.subscriptions.status, ['PENDING', 'ACTIVE', 'PAUSED', 'PAST_DUE']),
          ),
        );
      for (const subscription of live) {
        await tx
          .update(schema.subscriptions)
          .set({
            status: 'CANCELLED',
            cancelledAt: now(),
            endedAt: now(),
            cancellationReason: 'Account deleted',
          })
          .where(eq(schema.subscriptions.id, subscription.id));
        await tx.insert(schema.subscriptionEvents).values({
          subscriptionId: subscription.id,
          eventType: 'CANCELLED',
          previousStatus: subscription.status,
          newStatus: 'CANCELLED',
          metadata: { reason: 'Account deleted' },
        });
      }

      await this.anonymise(tx, userId);
      await tx
        .update(schema.dataRequests)
        .set({ status: 'COMPLETED', completedAt: now() })
        .where(eq(schema.dataRequests.id, request.id));
      await tx.insert(schema.auditLogs).values({
        actorId: null,
        action: 'account.deleted',
        entityType: 'user',
        entityId: userId,
        newValue: { dataRequestId: request.id },
      });
    });
    if (email) await this.sendEmail(email, 'privacy.account_deleted', '/');
  }

  private async anonymise(tx: Executor, userId: string): Promise<void> {
    const now = this.deps.now();
    // Sign-in: identifiers, password and sessions gone; the row stays so kept records still point somewhere.
    await tx
      .update(schema.users)
      .set({
        email: null,
        phone: null,
        passwordHash: null,
        emailVerifiedAt: null,
        phoneVerifiedAt: null,
        lockedUntil: null,
        lastLoginAt: null,
        failedLoginCount: 0,
        status: 'DELETED',
        deletedAt: now,
      })
      .where(eq(schema.users.id, userId));
    await tx.delete(schema.sessions).where(eq(schema.sessions.userId, userId));
    await tx.delete(schema.verificationTokens).where(eq(schema.verificationTokens.userId, userId));
    await tx.delete(schema.userRoles).where(eq(schema.userRoles.userId, userId));
    await tx.delete(schema.idempotencyKeys).where(eq(schema.idempotencyKeys.userId, userId));
    await tx
      .update(schema.customerProfiles)
      .set({ firstName: 'Deleted', lastName: 'customer' })
      .where(eq(schema.customerProfiles.userId, userId));

    // Addresses and the copies kept on orders and deliveries: only the district-level location stays.
    await tx
      .update(schema.addresses)
      .set({
        recipientName: DELETED_NAME,
        phone: '',
        street: null,
        directions: null,
        sector: null,
        deletedAt: now,
      })
      .where(eq(schema.addresses.userId, userId));
    await tx.execute(sql`
      UPDATE orders SET shipping_address = ${snapshotSql('shipping_address')}
      WHERE user_id = ${userId}`);
    await tx.execute(sql`
      UPDATE deliveries SET address = ${snapshotSql('address')}, phone = ''
      WHERE order_id IN (SELECT id FROM orders WHERE user_id = ${userId})
         OR return_request_id IN (SELECT id FROM return_requests WHERE user_id = ${userId})`);

    // Wallet numbers.
    await tx
      .update(schema.paymentMethods)
      .set({ msisdn: null, label: null, isDefault: false, deletedAt: now })
      .where(eq(schema.paymentMethods.userId, userId));
    await tx.update(schema.payments).set({ payerMsisdn: null }).where(eq(schema.payments.userId, userId));

    // Children: names, birth dates, preferences and every measurement.
    const babies = await tx
      .select({ id: schema.babyProfiles.id })
      .from(schema.babyProfiles)
      .where(eq(schema.babyProfiles.userId, userId));
    const babyIds = babies.map((baby) => baby.id);
    if (babyIds.length > 0) {
      await tx.delete(schema.babyMeasurements).where(inArray(schema.babyMeasurements.babyProfileId, babyIds));
      // Recommendations hold the measurements they were computed from (and their fit feedback cascades).
      await tx
        .delete(schema.sizingRecommendations)
        .where(inArray(schema.sizingRecommendations.babyProfileId, babyIds));
      await tx
        .update(schema.babyProfiles)
        .set({
          nickname: 'Deleted',
          dateOfBirth: '1900-01-01',
          sex: null,
          clothingPreferences: null,
          currentSizeCode: null,
          deletedAt: now,
        })
        .where(inArray(schema.babyProfiles.id, babyIds));
    }

    // Messages and tracking.
    await tx.delete(schema.notifications).where(eq(schema.notifications.userId, userId));
    await tx
      .update(schema.analyticsEvents)
      .set({ userId: null })
      .where(eq(schema.analyticsEvents.userId, userId));
    await tx
      .update(schema.consentRecords)
      .set({ ipAddress: null })
      .where(eq(schema.consentRecords.userId, userId));
    const carts = await tx
      .select({ id: schema.carts.id })
      .from(schema.carts)
      .where(eq(schema.carts.userId, userId));
    if (carts.length > 0) {
      await tx.delete(schema.cartItems).where(
        inArray(
          schema.cartItems.cartId,
          carts.map((cart) => cart.id),
        ),
      );
    }
  }

  private async sendEmail(
    to: string,
    template: 'privacy.export_ready' | 'privacy.account_deleted',
    path: string,
  ) {
    try {
      await this.deps.email.send({
        to,
        template,
        locale: 'en',
        params: { link: `${this.deps.webOrigin}${path}` },
      });
    } catch (error) {
      this.deps.logger.error('email send failed', { template, error });
    }
  }
}

/** An address snapshot (jsonb) with the name, phone, street, sector and directions removed. */
function snapshotSql(column: 'shipping_address' | 'address') {
  const col = sql.raw(column);
  return sql`(${col} || jsonb_build_object('recipientName', ${DELETED_NAME}::text, 'phone', '', 'street', null, 'sector', null, 'directions', null))`;
}
