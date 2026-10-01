import { type Database, type Executor, schema } from '@bambino/database';
import { and, desc, eq, sql } from '@bambino/database/orm';
import { PROMOTION_SCOPES, DISCOUNT_TYPES } from '@bambino/types';
import { z } from 'zod';
import type { PromotionUsage } from '../domain/pricing';
import { recordAudit } from './audit-service';
import { type ServiceContext, requirePermission } from './context';
import { AppError, isUniqueViolation, parseInput } from './errors';

export type PromotionRow = typeof schema.promotions.$inferSelect;

const promotionSchema = z
  .object({
    id: z.uuid().nullish(),
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9-]{3,30}$/, 'validation.promotion_code.invalid')
      .nullish(),
    name: z.string().trim().min(1).max(120),
    scope: z.enum(PROMOTION_SCOPES),
    discountType: z.enum(DISCOUNT_TYPES),
    percentBasisPoints: z.number().int().min(1).max(10_000).nullish(),
    fixedAmount: z.number().int().min(1).max(100_000_000).nullish(),
    minSubtotalAmount: z.number().int().min(0).nullish(),
    maxRedemptions: z.number().int().min(1).nullish(),
    maxRedemptionsPerUser: z.number().int().min(1).max(100).nullish(),
    startsAt: z.date(),
    endsAt: z.date().nullish(),
    isActive: z.boolean(),
  })
  .superRefine((input, context) => {
    const issue = (path: string, message: string) =>
      context.addIssue({ code: 'custom', path: [path], message });
    if (input.discountType === 'PERCENTAGE' && !input.percentBasisPoints)
      issue('percentBasisPoints', 'validation.required');
    if (input.discountType === 'FIXED_AMOUNT' && !input.fixedAmount)
      issue('fixedAmount', 'validation.required');
    if (input.endsAt && input.endsAt <= input.startsAt) issue('endsAt', 'validation.promotion.window');
  });

export class PromotionService {
  constructor(
    private readonly db: Database,
    private readonly currency: string,
  ) {}

  /** Locks the promotion row so concurrent checkouts count redemptions one at a time. */
  async findByCodeForUpdate(tx: Executor, code: string): Promise<PromotionRow | null> {
    const [row] = await tx
      .select()
      .from(schema.promotions)
      .where(sql`upper(${schema.promotions.code}) = ${code.trim().toUpperCase()}`)
      .for('update');
    return row ?? null;
  }

  async findByCode(db: Executor, code: string): Promise<PromotionRow | null> {
    const [row] = await db
      .select()
      .from(schema.promotions)
      .where(sql`upper(${schema.promotions.code}) = ${code.trim().toUpperCase()}`);
    return row ?? null;
  }

  async usage(db: Executor, promotionId: string, userId: string): Promise<PromotionUsage> {
    const [row] = await db
      .select({
        total: sql<number>`count(*)::int`,
        byCustomer: sql<number>`count(*) filter (where ${schema.discounts.userId} = ${userId})::int`,
      })
      .from(schema.discounts)
      .where(eq(schema.discounts.promotionId, promotionId));
    return { total: row?.total ?? 0, byCustomer: row?.byCustomer ?? 0 };
  }

  async list(context: ServiceContext): Promise<(PromotionRow & { redemptionCount: number })[]> {
    requirePermission(context, 'promotion:read');
    const rows = await this.db
      .select({
        promotion: schema.promotions,
        redemptionCount: sql<number>`(select count(*)::int from discounts d where d.promotion_id = ${schema.promotions.id})`,
      })
      .from(schema.promotions)
      .orderBy(desc(schema.promotions.startsAt));
    return rows.map((row) => ({ ...row.promotion, redemptionCount: row.redemptionCount }));
  }

  async upsert(
    context: ServiceContext,
    rawInput: unknown,
  ): Promise<PromotionRow & { redemptionCount: number }> {
    requirePermission(context, 'promotion:write');
    const input = parseInput(promotionSchema, rawInput);
    const values = {
      code: input.code ?? null,
      name: input.name,
      scope: input.scope,
      discountType: input.discountType,
      percentBasisPoints: input.discountType === 'PERCENTAGE' ? (input.percentBasisPoints ?? null) : null,
      fixedAmount: input.discountType === 'FIXED_AMOUNT' ? (input.fixedAmount ?? null) : null,
      currency: this.currency,
      minSubtotalAmount: input.minSubtotalAmount ?? 0,
      maxRedemptions: input.maxRedemptions ?? null,
      maxRedemptionsPerUser: input.maxRedemptionsPerUser ?? 1,
      startsAt: input.startsAt,
      endsAt: input.endsAt ?? null,
      isActive: input.isActive,
    };
    try {
      return await this.db.transaction(async (tx) => {
        const [row] = input.id
          ? await tx
              .update(schema.promotions)
              .set(values)
              .where(eq(schema.promotions.id, input.id))
              .returning()
          : await tx.insert(schema.promotions).values(values).returning();
        if (!row) throw new AppError('NOT_FOUND', 'Promotion not found.');
        await recordAudit(tx, context, {
          action: input.id ? 'promotion.updated' : 'promotion.created',
          entityType: 'promotion',
          entityId: row.id,
          newValue: values,
        });
        const usage = await this.usage(tx, row.id, '00000000-0000-0000-0000-000000000000');
        return { ...row, redemptionCount: usage.total };
      });
    } catch (error) {
      if (isUniqueViolation(error, 'promotions_code_upper_uq'))
        throw new AppError('CONFLICT', 'This code is already used.', 'CODE_IN_USE');
      throw error;
    }
  }

  /** Records a redemption against an order. The unique index makes a second one for the same order impossible. */
  async redeem(
    tx: Executor,
    input: { promotionId: string; userId: string; orderId: string; amount: number; currency: string },
  ) {
    await tx.insert(schema.discounts).values(input);
  }

  async redemptionsForOrder(db: Executor, orderId: string) {
    return db
      .select()
      .from(schema.discounts)
      .where(and(eq(schema.discounts.orderId, orderId)));
  }
}
