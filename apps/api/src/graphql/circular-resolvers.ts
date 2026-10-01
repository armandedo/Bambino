import type { schema } from '@bambino/database';
import type { ExchangeStatus, GarmentStatus, ReturnStatus, SubscriptionStatus } from '@bambino/types';
import type { Money } from '@bambino/utils';
import { garmentLifecycle, subscriptionLifecycle } from '../domain/lifecycles';
import type { BabyProfileRow } from '../services/baby-service';
import { requirePermission } from '../services/context';
import type { CreditEntryRow, ExchangeItemRow, ExchangeRow } from '../services/exchange-service';
import type { GarmentEventRow, GarmentRow } from '../services/garment-service';
import type { PageRequest } from '../services/pagination';
import type { ReturnItemRow, ReturnRequestRow } from '../services/return-service';
import type { SizingRecommendationRow } from '../services/sizing-service';
import type { PlanRow, SubscriptionItemRow, SubscriptionRow } from '../services/subscription-service';
import type { GraphQLContext } from './context';

/** Thin resolvers for baby profiles, sizing, subscriptions, garments, returns, exchanges and credit. */

type Ctx = GraphQLContext;
type SizingReason = { key: string; params?: Record<string, string | number> };

const asMoney = (amount: number, currency: string): Money => ({ amount, currency: currency.trim() }) as Money;
const page = <T>(result: {
  items: T[];
  endCursor: string | null;
  hasNextPage: boolean;
  totalCount: number;
}) => ({
  pageInfo: { endCursor: result.endCursor, hasNextPage: result.hasNextPage },
  totalCount: result.totalCount,
});

async function variantAndProduct(context: Ctx, variantId: string) {
  const variant = await context.loaders.variant.load(variantId);
  if (!variant) throw new Error('Variant referenced but not found');
  const product = await context.loaders.product.load(variant.productId);
  if (!product) throw new Error('Product referenced but not found');
  return { variant, product };
}

async function customer(context: Ctx, userId: string) {
  const row = await context.loaders.customer.load(userId);
  if (!row) throw new Error('Customer referenced but not found');
  return row;
}

export const circularResolvers = {
  Query: {
    myBabyProfiles: (_: unknown, __: unknown, context: Ctx) => context.services.babies.listOwn(context),
    babyProfile: (_: unknown, args: { id: string }, context: Ctx) =>
      context.services.babies.getOwn(context, args.id),
    sizingRecommendation: (_: unknown, args: { babyProfileId: string }, context: Ctx) =>
      context.services.sizing.latestFor(context, args.babyProfileId),
    subscriptionPlans: (_: unknown, __: unknown, context: Ctx) => context.services.subscriptions.listPlans(),
    mySubscriptions: (_: unknown, __: unknown, context: Ctx) =>
      context.services.subscriptions.listOwn(context),
    subscription: (_: unknown, args: { id: string }, context: Ctx) =>
      context.services.subscriptions.getOwn(context, args.id),
    myGarments: (_: unknown, __: unknown, context: Ctx) => context.services.garments.listHeldBy(context),
    myReturns: (_: unknown, __: unknown, context: Ctx) => context.services.returns.listOwn(context),
    returnRequest: (_: unknown, args: { id: string }, context: Ctx) =>
      context.services.returns.getOwn(context, args.id),
    myExchanges: (_: unknown, __: unknown, context: Ctx) => context.services.exchanges.listOwn(context),
    myExchangeCredits: async (_: unknown, __: unknown, context: Ctx) => {
      const summary = await context.services.exchanges.creditSummary(context);
      return { balance: asMoney(summary.balance, context.services.marketCurrency), entries: summary.entries };
    },

    adminMetrics: (_: unknown, args: { periodStart: unknown; periodEnd: unknown }, context: Ctx) =>
      context.services.admin.metrics(context, args.periodStart, args.periodEnd),
    adminCustomers: async (
      _: unknown,
      args: { search?: string | null; page?: PageRequest | null },
      context: Ctx,
    ) => {
      const page = await context.services.admin.searchCustomers(context, args.search, args.page ?? {});
      return {
        items: page.items,
        pageInfo: { endCursor: page.endCursor, hasNextPage: page.hasNextPage },
        totalCount: page.totalCount,
      };
    },
    adminCustomer: (_: unknown, args: { id: string }, context: Ctx) =>
      context.services.admin.getCustomer(context, args.id),
    adminBabyProfiles: (_: unknown, args: { customerId: string }, context: Ctx) =>
      context.services.babies.listForCustomerAsStaff(context, args.customerId),
    adminGarments: async (
      _: unknown,
      args: { status?: GarmentStatus | null; variantId?: string | null; page?: PageRequest | null },
      context: Ctx,
    ) => {
      const result = await context.services.garments.listForStaff(context, args, args.page ?? {});
      return { items: result.items, ...page(result) };
    },
    adminGarment: (_: unknown, args: { id?: string | null; tagCode?: string | null }, context: Ctx) =>
      context.services.garments.findForStaff(context, args),
    adminSubscriptions: async (
      _: unknown,
      args: { status?: SubscriptionStatus | null; page?: PageRequest | null },
      context: Ctx,
    ) => {
      const result = await context.services.subscriptions.listForStaff(context, args.status, args.page ?? {});
      return { items: result.items.map((subscription) => ({ subscription })), ...page(result) };
    },
    adminSubscriptionPlans: (_: unknown, __: unknown, context: Ctx) =>
      context.services.subscriptions.listAllPlans(context),
    adminReturns: async (
      _: unknown,
      args: { status?: ReturnStatus | null; page?: PageRequest | null },
      context: Ctx,
    ) => {
      const result = await context.services.returns.listForStaff(context, args.status, args.page ?? {});
      return { items: result.items.map((returnRequest) => ({ returnRequest })), ...page(result) };
    },
    adminReturn: async (_: unknown, args: { id: string }, context: Ctx) => {
      const returnRequest = await context.services.returns.getForStaff(context, args.id);
      return returnRequest ? { returnRequest } : null;
    },
    adminExchanges: async (
      _: unknown,
      args: { status?: ExchangeStatus | null; page?: PageRequest | null },
      context: Ctx,
    ) => {
      const result = await context.services.exchanges.listForStaff(context, args.status, args.page ?? {});
      return { items: result.items.map((exchange) => ({ exchange })), ...page(result) };
    },
  },

  Mutation: {
    createBabyProfile: (_: unknown, args: { input: unknown }, context: Ctx) =>
      context.services.babies.create(context, args.input),
    updateBabyProfile: (_: unknown, args: { id: string; input: unknown }, context: Ctx) =>
      context.services.babies.update(context, args.id, args.input),
    deleteBabyProfile: async (_: unknown, args: { id: string }, context: Ctx) => {
      await context.services.babies.remove(context, args.id);
      return true;
    },
    addBabyMeasurement: (_: unknown, args: { babyProfileId: string; input: unknown }, context: Ctx) =>
      context.services.babies.addMeasurement(context, args.babyProfileId, args.input),
    createSizingRecommendation: (_: unknown, args: { babyProfileId: string }, context: Ctx) =>
      context.services.sizing.recommend(context, args.babyProfileId),
    submitFitFeedback: async (
      _: unknown,
      args: { recommendationId: string; sizeCode: string; outcome: string },
      context: Ctx,
    ) => {
      await context.services.sizing.submitFeedback(context, args);
      return true;
    },
    createSubscription: (_: unknown, args: { input: unknown }, context: Ctx) =>
      context.services.subscriptions.create(context, args.input),
    pauseSubscription: (_: unknown, args: { id: string; resumeAt?: Date | null }, context: Ctx) =>
      context.services.subscriptions.pause(context, args.id, args.resumeAt),
    resumeSubscription: (_: unknown, args: { id: string }, context: Ctx) =>
      context.services.subscriptions.resume(context, args.id),
    cancelSubscription: (
      _: unknown,
      args: { id: string; reason?: string | null; immediately?: boolean | null },
      context: Ctx,
    ) => context.services.subscriptions.cancel(context, args.id, args.reason, args.immediately),
    changeSubscriptionPlan: (_: unknown, args: { id: string; planId: string }, context: Ctx) =>
      context.services.subscriptions.changePlan(context, args.id, args.planId),
    selectSubscriptionItems: (_: unknown, args: { id: string; variantIds: string[] }, context: Ctx) =>
      context.services.subscriptions.selectItems(context, args.id, args.variantIds),
    requestReturn: (_: unknown, args: { input: unknown }, context: Ctx) =>
      context.services.returns.request(context, args.input),
    createExchange: (_: unknown, args: { input: unknown }, context: Ctx) =>
      context.services.exchanges.create(context, args.input),

    adminRegisterGarments: (_: unknown, args: { variantId: string; quantity: number }, context: Ctx) =>
      context.services.garments.register(context, args.variantId, args.quantity),
    adminTransitionGarment: (_: unknown, args: { input: unknown }, context: Ctx) =>
      context.services.garments.transitionAsStaff(context, args.input),
    adminUpsertSubscriptionPlan: (_: unknown, args: { input: unknown }, context: Ctx) =>
      context.services.subscriptions.upsertPlan(context, args.input),
    adminCancelSubscription: (_: unknown, args: { id: string; reason: string }, context: Ctx) =>
      context.services.subscriptions.cancelAsStaff(context, args.id, args.reason),
    adminApproveReturn: (_: unknown, args: { id: string }, context: Ctx) =>
      context.services.returns.approve(context, args.id),
    adminRejectReturn: (_: unknown, args: { id: string; reason: string }, context: Ctx) =>
      context.services.returns.reject(context, args.id, args.reason),
    adminMarkReturnReceived: (_: unknown, args: { id: string }, context: Ctx) =>
      context.services.returns.markReceived(context, args.id),
    adminRecordInspection: (_: unknown, args: { input: unknown }, context: Ctx) =>
      context.services.returns.recordInspection(context, args.input),
    adminCompleteReturn: (_: unknown, args: { id: string }, context: Ctx) =>
      context.services.returns.complete(context, args.id),
    adminApproveExchange: (_: unknown, args: { id: string }, context: Ctx) =>
      context.services.exchanges.approve(context, args.id),
    adminRejectExchange: (_: unknown, args: { id: string; reason: string }, context: Ctx) =>
      context.services.exchanges.reject(context, args.id, args.reason),
    adminAdjustExchangeCredit: (_: unknown, args: Record<string, unknown>, context: Ctx) =>
      context.services.exchanges.adjustCredit(context, args),
  },

  BabyProfile: {
    ageInDays: (parent: BabyProfileRow, _: unknown, context: Ctx) =>
      context.services.babies.ageInDays(parent),
    currentSize: (parent: BabyProfileRow, _: unknown, context: Ctx) =>
      parent.currentSizeCode ? context.loaders.size.load(parent.currentSizeCode) : null,
    measurements: async (parent: BabyProfileRow, _: unknown, context: Ctx) =>
      (await context.loaders.babyMeasurements.load(parent.id)) ?? [],
    latestMeasurement: async (parent: BabyProfileRow, _: unknown, context: Ctx) =>
      (await context.loaders.babyMeasurements.load(parent.id))?.[0] ?? null,
    sizingHistory: async (parent: BabyProfileRow, _: unknown, context: Ctx) =>
      (await context.loaders.sizingHistory.load(parent.id)) ?? [],
    latestRecommendation: async (parent: BabyProfileRow, _: unknown, context: Ctx) =>
      (await context.loaders.sizingHistory.load(parent.id))?.[0] ?? null,
  },

  SizingRecommendation: {
    recommendedSize: (parent: SizingRecommendationRow, _: unknown, context: Ctx) =>
      context.loaders.size.load(parent.recommendedSizeCode),
    nextSize: (parent: SizingRecommendationRow, _: unknown, context: Ctx) =>
      parent.nextSizeCode ? context.loaders.size.load(parent.nextSizeCode) : null,
    confidence: (parent: SizingRecommendationRow) => parent.confidenceBasisPoints / 10_000,
    explanation: (parent: SizingRecommendationRow) =>
      (parent.explanation as SizingReason[]).map((reason) => ({
        key: reason.key,
        params: Object.entries(reason.params ?? {}).map(([name, value]) => ({ name, value: String(value) })),
      })),
  },

  SubscriptionPlan: {
    price: (parent: PlanRow) => asMoney(parent.priceAmount, parent.currency),
    allowedCategories: async (parent: PlanRow, _: unknown, context: Ctx) =>
      (await context.loaders.planCategories.load(parent.id)) ?? [],
    exchangesPerCycle: (parent: PlanRow) => parent.exchangePolicy.exchangesPerCycle,
  },

  Subscription: {
    plan: (parent: SubscriptionRow, _: unknown, context: Ctx) => context.loaders.plan.load(parent.planId),
    pendingPlan: (parent: SubscriptionRow, _: unknown, context: Ctx) =>
      parent.pendingPlanId ? context.loaders.plan.load(parent.pendingPlanId) : null,
    babyProfile: (parent: SubscriptionRow, _: unknown, context: Ctx) =>
      context.loaders.baby.load(parent.babyProfileId),
    price: (parent: SubscriptionRow) => asMoney(parent.priceAmount, parent.currency),
    items: async (parent: SubscriptionRow, _: unknown, context: Ctx) =>
      (await context.loaders.subscriptionItems.load(parent.id)) ?? [],
    orderAwaitingPayment: (parent: SubscriptionRow, _: unknown, context: Ctx) =>
      context.loaders.subscriptionOrderAwaiting.load(parent.id),
    history: async (parent: SubscriptionRow, _: unknown, context: Ctx) =>
      ((await context.loaders.subscriptionEvents.load(parent.id)) ?? []).map((event) => ({
        type: event.eventType,
        status: event.newStatus,
        occurredAt: event.createdAt,
      })),
    canPause: (parent: SubscriptionRow) => subscriptionLifecycle.canTransition(parent.status, 'PAUSED'),
    canResume: (parent: SubscriptionRow) => parent.status === 'PAUSED',
    canCancel: (parent: SubscriptionRow) =>
      subscriptionLifecycle.canTransition(parent.status, 'CANCELLED') && !parent.cancelAtPeriodEnd,
  },

  SubscriptionItem: {
    variant: async (parent: SubscriptionItemRow, _: unknown, context: Ctx) =>
      (await variantAndProduct(context, parent.variantId)).variant,
    product: async (parent: SubscriptionItemRow, _: unknown, context: Ctx) =>
      (await variantAndProduct(context, parent.variantId)).product,
    garmentTagCode: async (parent: SubscriptionItemRow, _: unknown, context: Ctx) =>
      parent.garmentId ? ((await context.loaders.garment.load(parent.garmentId))?.tagCode ?? null) : null,
  },

  CustomerGarment: {
    product: async (parent: GarmentRow, _: unknown, context: Ctx) =>
      (await variantAndProduct(context, parent.variantId)).product,
    size: async (parent: GarmentRow, _: unknown, context: Ctx) => {
      const { variant } = await variantAndProduct(context, parent.variantId);
      return context.loaders.size.load(variant.sizeCode);
    },
    color: async (parent: GarmentRow, _: unknown, context: Ctx) =>
      (await variantAndProduct(context, parent.variantId)).variant.color,
    receivedAt: (parent: GarmentRow, _: unknown, context: Ctx) =>
      context.loaders.garmentDeliveredAt.load(parent.id),
  },

  ReturnRequest: {
    items: async (parent: ReturnRequestRow, _: unknown, context: Ctx) =>
      (await context.loaders.returnItems.load(parent.id)) ?? [],
    pickup: (parent: ReturnRequestRow, _: unknown, context: Ctx) =>
      context.loaders.returnPickup.load(parent.id),
    createdAt: (parent: ReturnRequestRow) => parent.createdAt,
  },

  ReturnItem: {
    garment: (parent: ReturnItemRow, _: unknown, context: Ctx) =>
      context.loaders.garment.load(parent.garmentId),
    creditEarned: async (parent: ReturnItemRow, _: unknown, context: Ctx) => {
      const amount = await context.loaders.returnCredit.load(parent.id);
      return amount === undefined ? null : asMoney(amount, context.services.marketCurrency);
    },
  },

  Exchange: {
    returnRequest: (parent: ExchangeRow, _: unknown, context: Ctx) =>
      parent.returnRequestId ? context.loaders.returnRequest.load(parent.returnRequestId) : null,
    items: async (parent: ExchangeRow, _: unknown, context: Ctx) =>
      (await context.loaders.exchangeItems.load(parent.id)) ?? [],
    replacementOrder: (parent: ExchangeRow, _: unknown, context: Ctx) =>
      parent.replacementOrderId ? context.loaders.order.load(parent.replacementOrderId) : null,
  },

  ExchangeItem: {
    returnItem: (parent: ExchangeItemRow, _: unknown, context: Ctx) =>
      parent.returnItemId ? context.loaders.returnItem.load(parent.returnItemId) : null,
    requestedVariant: async (parent: ExchangeItemRow, _: unknown, context: Ctx) =>
      (await variantAndProduct(context, parent.requestedVariantId)).variant,
    product: async (parent: ExchangeItemRow, _: unknown, context: Ctx) =>
      (await variantAndProduct(context, parent.requestedVariantId)).product,
  },

  ExchangeCreditEntry: {
    type: (parent: CreditEntryRow) => parent.entryType,
    amount: (parent: CreditEntryRow) => asMoney(parent.amount, parent.currency),
  },

  Garment: {
    variant: async (parent: GarmentRow, _: unknown, context: Ctx) =>
      (await variantAndProduct(context, parent.variantId)).variant,
    product: async (parent: GarmentRow, _: unknown, context: Ctx) =>
      (await variantAndProduct(context, parent.variantId)).product,
    currentCustomer: (parent: GarmentRow, _: unknown, context: Ctx) =>
      parent.currentCustomerId ? customer(context, parent.currentCustomerId) : null,
    allowedNextStatuses: (parent: GarmentRow) => garmentLifecycle.next(parent.status),
    events: async (parent: GarmentRow, _: unknown, context: Ctx) =>
      (await context.loaders.garmentEvents.load(parent.id)) ?? [],
  },

  GarmentLifecycleEvent: {
    actorName: async (parent: GarmentEventRow, _: unknown, context: Ctx) => {
      if (!parent.actorId) return null;
      const actor = await context.loaders.customer.load(parent.actorId);
      return actor ? `${actor.profile.firstName} ${actor.profile.lastName}` : null;
    },
  },

  AdminSubscription: {
    customer: (parent: { subscription: SubscriptionRow }, _: unknown, context: Ctx) =>
      customer(context, parent.subscription.userId),
    renewalAttempts: (parent: { subscription: SubscriptionRow }) => parent.subscription.renewalAttempts,
  },

  AdminReturn: {
    customer: (parent: { returnRequest: ReturnRequestRow }, _: unknown, context: Ctx) =>
      customer(context, parent.returnRequest.userId),
  },

  AdminExchange: {
    customer: (parent: { exchange: ExchangeRow }, _: unknown, context: Ctx) =>
      customer(context, parent.exchange.userId),
  },

  AdminCustomer: {
    /** Child data: needs its own permission, even where the customer itself is visible. Access is audited. */
    babyProfiles: (parent: { user: typeof schema.users.$inferSelect }, _: unknown, context: Ctx) =>
      context.services.babies.listForCustomerAsStaff(context, parent.user.id),
    subscriptions: async (parent: { user: typeof schema.users.$inferSelect }, _: unknown, context: Ctx) => {
      requirePermission(context, 'subscription:read');
      return (await context.loaders.customerSubscriptions.load(parent.user.id)) ?? [];
    },
  },
};
