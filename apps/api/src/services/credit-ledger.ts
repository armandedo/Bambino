import { type Executor, schema } from '@bambino/database';
import { eq, sql } from '@bambino/database/orm';
import { type CurrencyCode, type Money, money } from '@bambino/utils';

/**
 * Reads and writes the exchange credit ledger. Callers that spend credit must hold the
 * customer's lock (OrderService.lockCustomer) so two checkouts cannot spend the same balance.
 */
export class CreditLedger {
  constructor(private readonly currency: CurrencyCode) {}

  async balance(db: Executor, userId: string): Promise<Money> {
    const [row] = await db
      .select({ total: sql<number>`coalesce(sum(${schema.exchangeCredits.amount}), 0)::bigint` })
      .from(schema.exchangeCredits)
      .where(eq(schema.exchangeCredits.userId, userId));
    return money(Number(row?.total ?? 0), this.currency);
  }

  async redeemForOrder(db: Executor, userId: string, orderId: string, amount: Money): Promise<void> {
    await db.insert(schema.exchangeCredits).values({
      userId,
      entryType: 'REDEEMED',
      amount: -amount.amount,
      currency: amount.currency,
      orderId,
    });
  }

  /** Gives back credit spent on an order that was cancelled. */
  async returnForCancelledOrder(
    db: Executor,
    userId: string,
    orderId: string,
    amount: Money,
    actorId: string | null,
  ) {
    await db.insert(schema.exchangeCredits).values({
      userId,
      entryType: 'ADJUSTMENT',
      amount: amount.amount,
      currency: amount.currency,
      orderId,
      actorId,
      note: 'Credit returned: order cancelled',
    });
  }
}
