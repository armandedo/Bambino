import { type Database, schema } from '@bambino/database';
import { queryRows } from '@bambino/database/query';
import { and, desc, eq, ilike, inArray, ne, or, sql } from '@bambino/database/orm';
import { type CurrencyCode, type Money, money } from '@bambino/utils';
import { z } from 'zod';
import { type ServiceContext, requirePermission } from './context';
import { AppError, parseInput } from './errors';
import { type Page, type PageRequest, decodeOffset, encodeOffset, pageSize } from './pagination';

export type CustomerRow = {
  user: typeof schema.users.$inferSelect;
  profile: typeof schema.customerProfiles.$inferSelect;
};

export interface AdminMetrics {
  periodStart: Date;
  periodEnd: Date;
  totalCustomers: number;
  newCustomers: number;
  activeSubscribers: number;
  monthlyRecurringRevenue: Money;
  subscriptionRevenue: Money;
  oneTimeRevenue: Money;
  averageRevenuePerSubscriber: Money | null;
  paymentSuccessRate: number | null;
  orders: number;
  pendingOrders: number;
  pendingReturns: number;
  openExchangeRequests: number;
  lowStockItems: number;
  garmentsInCirculation: number;
  garmentsReturned: number;
  garmentsRefurbished: number;
  garmentsReused: number;
  garmentsRecycled: number;
  averageGarmentLifecycleCount: number | null;
  subscriptionChurnRate: number | null;
  customerRetentionRate: number | null;
  onTimeDeliveryRate: number | null;
}

const periodSchema = z
  .object({ periodStart: z.coerce.date(), periodEnd: z.coerce.date() })
  .refine((p) => p.periodEnd > p.periodStart, 'periodEnd must be after periodStart')
  .refine((p) => p.periodEnd.getTime() - p.periodStart.getTime() <= 3 * 366 * 86_400_000, 'period too long');

/** Months per billing interval, to express every plan as a monthly amount for MRR. */
const MONTHS: Record<string, bigint> = { MONTHLY: 1n, QUARTERLY: 3n, ANNUAL: 12n };

/** A ratio, or null when the denominator is zero: no number is better than an invented one. */
function ratio(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null;
}

const count = (rows: { n: number }[]) => Number(rows[0]?.n ?? 0);

/**
 * Staff-facing reads that span the whole customer base: customer search and the metrics dashboard.
 * Every metric is counted from transactional rows; definitions are written next to each query.
 */
export class AdminService {
  constructor(
    private readonly db: Database,
    private readonly currency: CurrencyCode,
  ) {}

  /** Customers are accounts holding the CUSTOMER role that are not deleted. */
  private customerFilter() {
    return and(
      ne(schema.users.status, 'DELETED'),
      inArray(
        schema.users.id,
        this.db
          .select({ id: schema.userRoles.userId })
          .from(schema.userRoles)
          .innerJoin(schema.roles, eq(schema.roles.id, schema.userRoles.roleId))
          .where(eq(schema.roles.key, 'CUSTOMER')),
      ),
    );
  }

  async searchCustomers(
    context: ServiceContext,
    rawSearch: unknown,
    request: PageRequest,
  ): Promise<Page<CustomerRow> & { totalCount: number }> {
    requirePermission(context, 'customer:read');
    const search = parseInput(z.string().trim().max(100).nullish(), rawSearch);
    const size = pageSize(request);
    const offset = decodeOffset(request.after);
    // LIKE wildcards in the search text are removed, so a search for "%" cannot match everything.
    const term = search ? `%${search.replace(/[\\%_]/g, '')}%` : null;
    const where = and(
      this.customerFilter(),
      term
        ? or(
            ilike(schema.users.email, term),
            ilike(schema.users.phone, term),
            ilike(schema.customerProfiles.firstName, term),
            ilike(schema.customerProfiles.lastName, term),
            ilike(
              sql`${schema.customerProfiles.firstName} || ' ' || ${schema.customerProfiles.lastName}`,
              term,
            ),
          )
        : undefined,
    );
    const rows = await this.db
      .select({ user: schema.users, profile: schema.customerProfiles })
      .from(schema.users)
      .innerJoin(schema.customerProfiles, eq(schema.customerProfiles.userId, schema.users.id))
      .where(where)
      .orderBy(desc(schema.users.createdAt), desc(schema.users.id))
      .limit(size + 1)
      .offset(offset);
    const total = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.users)
      .innerJoin(schema.customerProfiles, eq(schema.customerProfiles.userId, schema.users.id))
      .where(where);
    const items = rows.slice(0, size);
    return {
      items,
      hasNextPage: rows.length > size,
      endCursor: items.length ? encodeOffset(offset + items.length) : null,
      totalCount: count(total),
    };
  }

  async getCustomer(context: ServiceContext, rawId: unknown): Promise<CustomerRow | null> {
    requirePermission(context, 'customer:read');
    const parsed = z.uuid().safeParse(rawId);
    if (!parsed.success) return null;
    const [row] = await this.db
      .select({ user: schema.users, profile: schema.customerProfiles })
      .from(schema.users)
      .innerJoin(schema.customerProfiles, eq(schema.customerProfiles.userId, schema.users.id))
      .where(and(eq(schema.users.id, parsed.data), this.customerFilter()));
    return row ?? null;
  }

  async metrics(context: ServiceContext, rawStart: unknown, rawEnd: unknown): Promise<AdminMetrics> {
    requirePermission(context, 'report:read');
    const parsed = periodSchema.safeParse({ periodStart: rawStart, periodEnd: rawEnd });
    if (!parsed.success)
      throw new AppError(
        'VALIDATION_FAILED',
        'Choose a valid period of at most three years.',
        'INVALID_PERIOD',
      );
    const { periodStart: start, periodEnd: end } = parsed.data;
    const db = this.db;
    const cur = this.currency;

    const [
      totalCustomers,
      newCustomers,
      subscriberRows,
      revenueRows,
      paymentOutcomes,
      orderCount,
      pendingOrders,
      pendingReturns,
      openExchanges,
      lowStock,
      inCirculation,
      garmentMovements,
      lifecycle,
      churn,
      retention,
      delivery,
    ] = await Promise.all([
      // Customers who existed at the end of the period.
      queryRows<{ n: number }>(
        db,
        sql`
        SELECT count(*)::int AS n FROM users u
        JOIN user_roles ur ON ur.user_id = u.id JOIN roles r ON r.id = ur.role_id AND r.key = 'CUSTOMER'
        WHERE u.status <> 'DELETED' AND u.created_at < ${end}`,
      ),
      queryRows<{ n: number }>(
        db,
        sql`
        SELECT count(*)::int AS n FROM users u
        JOIN user_roles ur ON ur.user_id = u.id JOIN roles r ON r.id = ur.role_id AND r.key = 'CUSTOMER'
        WHERE u.status <> 'DELETED' AND u.created_at >= ${start} AND u.created_at < ${end}`,
      ),
      // Current snapshot: subscriptions ACTIVE now, with their plan interval for MRR.
      queryRows<{ user_id: string; price_amount: string; billing_interval: string }>(
        db,
        sql`
        SELECT s.user_id, s.price_amount::text AS price_amount, p.billing_interval
        FROM subscriptions s JOIN subscription_plans p ON p.id = s.plan_id
        WHERE s.status = 'ACTIVE' AND s.currency = ${cur}`,
      ),
      // Money actually collected in the period: SUCCEEDED payments by order type.
      queryRows<{ type: string; total: string; payers: number }>(
        db,
        sql`
        SELECT o.type, coalesce(sum(pay.amount), 0)::text AS total, count(DISTINCT pay.user_id)::int AS payers
        FROM payments pay JOIN orders o ON o.id = pay.order_id
        WHERE pay.status = 'SUCCEEDED' AND pay.currency = ${cur}
          AND pay.completed_at >= ${start} AND pay.completed_at < ${end}
        GROUP BY o.type`,
      ),
      // Payments that reached a final answer in the period.
      queryRows<{ succeeded: number; settled: number }>(
        db,
        sql`
        SELECT count(*) FILTER (WHERE status = 'SUCCEEDED')::int AS succeeded,
               count(*) FILTER (WHERE status IN ('SUCCEEDED', 'FAILED', 'EXPIRED', 'CANCELLED'))::int AS settled
        FROM payments WHERE completed_at >= ${start} AND completed_at < ${end}`,
      ),
      queryRows<{ n: number }>(
        db,
        sql`
        SELECT count(*)::int AS n FROM orders WHERE placed_at >= ${start} AND placed_at < ${end}`,
      ),
      // Current snapshot: paid orders not yet handed to delivery.
      queryRows<{ n: number }>(
        db,
        sql`
        SELECT count(*)::int AS n FROM orders WHERE status IN ('PAID', 'PROCESSING', 'PACKED', 'READY_FOR_DISPATCH')`,
      ),
      // Current snapshot: returns still being handled.
      queryRows<{ n: number }>(
        db,
        sql`
        SELECT count(*)::int AS n FROM return_requests
        WHERE status IN ('REQUESTED', 'APPROVED', 'IN_TRANSIT', 'RECEIVED', 'INSPECTING')`,
      ),
      queryRows<{ n: number }>(db, sql`SELECT count(*)::int AS n FROM exchanges WHERE status = 'REQUESTED'`),
      queryRows<{ n: number }>(
        db,
        sql`
        SELECT count(*)::int AS n FROM inventory_items
        WHERE quantity_on_hand - quantity_reserved <= reorder_threshold`,
      ),
      // Current snapshot: garments allocated to, with, or coming back from a family.
      queryRows<{ n: number }>(
        db,
        sql`
        SELECT count(*)::int AS n FROM garments WHERE status IN ('RESERVED', 'WITH_CUSTOMER', 'RETURN_REQUESTED')`,
      ),
      // Movements in the period, counted from the append-only lifecycle history.
      queryRows<{ new_status: string; n: number }>(
        db,
        sql`
        SELECT new_status, count(DISTINCT garment_id)::int AS n FROM garment_lifecycle_events
        WHERE occurred_at >= ${start} AND occurred_at < ${end}
          AND new_status IN ('RETURNED', 'REFURBISHING', 'AVAILABLE_FOR_REUSE', 'RECYCLE')
        GROUP BY new_status`,
      ),
      // Completed customer cycles per garment, over garments that have been worn at least once.
      queryRows<{ average: string | null }>(
        db,
        sql`
        SELECT avg(lifecycle_count)::text AS average FROM garments WHERE lifecycle_count > 0`,
      ),
      // Churn: of subscriptions active at the start (activated before, not ended before), how many ended in the period.
      queryRows<{ active_at_start: number; churned: number }>(
        db,
        sql`
        WITH bounds AS (
          SELECT subscription_id,
                 min(created_at) FILTER (WHERE event_type = 'ACTIVATED') AS activated_at,
                 min(created_at) FILTER (WHERE event_type IN ('CANCELLED', 'EXPIRED')) AS ended_at
          FROM subscription_events GROUP BY subscription_id
        )
        SELECT count(*) FILTER (WHERE activated_at < ${start} AND (ended_at IS NULL OR ended_at >= ${start}))::int AS active_at_start,
               count(*) FILTER (WHERE activated_at < ${start} AND ended_at >= ${start} AND ended_at < ${end})::int AS churned
        FROM bounds`,
      ),
      // Retention: customers who paid before the period and paid again during it.
      queryRows<{ before: number; returned: number }>(
        db,
        sql`
        WITH earlier AS (
          SELECT DISTINCT user_id FROM payments WHERE status = 'SUCCEEDED' AND completed_at < ${start}
        )
        SELECT (SELECT count(*) FROM earlier)::int AS before,
               (SELECT count(DISTINCT p.user_id) FROM payments p JOIN earlier e ON e.user_id = p.user_id
                WHERE p.status = 'SUCCEEDED' AND p.completed_at >= ${start} AND p.completed_at < ${end})::int AS returned`,
      ),
      // On time: delivered on or before the promised date (Kigali calendar day), among deliveries that had one.
      queryRows<{ delivered: number; on_time: number }>(
        db,
        sql`
        SELECT count(*)::int AS delivered,
               count(*) FILTER (WHERE (delivered_at AT TIME ZONE 'Africa/Kigali')::date <= estimated_delivery_date)::int AS on_time
        FROM deliveries
        WHERE direction = 'OUTBOUND' AND status = 'DELIVERED' AND estimated_delivery_date IS NOT NULL
          AND delivered_at >= ${start} AND delivered_at < ${end}`,
      ),
    ]);

    // MRR in exact integer arithmetic: sum yearly equivalents, then divide by 12 rounding half up.
    let yearly = 0n;
    for (const row of subscriberRows)
      yearly += BigInt(row.price_amount) * (12n / (MONTHS[row.billing_interval] ?? 1n));
    const mrr = (yearly * 2n + 12n) / 24n;

    const revenueOf = (types: string[]) =>
      revenueRows.filter((r) => types.includes(r.type)).reduce((sum, r) => sum + BigInt(r.total), 0n);
    const subscriptionRevenue = revenueOf(['SUBSCRIPTION_CYCLE']);
    const oneTimeRevenue = revenueOf(['ONE_TIME', 'EXCHANGE_REPLACEMENT']);
    const subscriptionPayers = revenueRows.find((r) => r.type === 'SUBSCRIPTION_CYCLE')?.payers ?? 0;
    const arps =
      subscriptionPayers > 0
        ? (subscriptionRevenue * 2n + BigInt(subscriptionPayers)) / (2n * BigInt(subscriptionPayers))
        : null;
    const movement = (status: string) => garmentMovements.find((r) => r.new_status === status)?.n ?? 0;
    const outcomes = paymentOutcomes[0] ?? { succeeded: 0, settled: 0 };
    const churnRow = churn[0] ?? { active_at_start: 0, churned: 0 };
    const retentionRow = retention[0] ?? { before: 0, returned: 0 };
    const deliveryRow = delivery[0] ?? { delivered: 0, on_time: 0 };
    const averageLifecycle = lifecycle[0]?.average;

    return {
      periodStart: start,
      periodEnd: end,
      totalCustomers: count(totalCustomers),
      newCustomers: count(newCustomers),
      activeSubscribers: new Set(subscriberRows.map((r) => r.user_id)).size,
      monthlyRecurringRevenue: money(Number(mrr), cur),
      subscriptionRevenue: money(Number(subscriptionRevenue), cur),
      oneTimeRevenue: money(Number(oneTimeRevenue), cur),
      averageRevenuePerSubscriber: arps === null ? null : money(Number(arps), cur),
      paymentSuccessRate: ratio(outcomes.succeeded, outcomes.settled),
      orders: count(orderCount),
      pendingOrders: count(pendingOrders),
      pendingReturns: count(pendingReturns),
      openExchangeRequests: count(openExchanges),
      lowStockItems: count(lowStock),
      garmentsInCirculation: count(inCirculation),
      garmentsReturned: movement('RETURNED'),
      garmentsRefurbished: movement('REFURBISHING'),
      garmentsReused: movement('AVAILABLE_FOR_REUSE'),
      garmentsRecycled: movement('RECYCLE'),
      averageGarmentLifecycleCount: averageLifecycle ? Number(averageLifecycle) : null,
      subscriptionChurnRate: ratio(churnRow.churned, churnRow.active_at_start),
      customerRetentionRate: ratio(retentionRow.returned, retentionRow.before),
      onTimeDeliveryRate: ratio(deliveryRow.on_time, deliveryRow.delivered),
    };
  }
}
