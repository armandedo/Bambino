import type { schema } from '@bambino/database';
import type { DeliveryStatus, OrderStatus, PaymentStatus } from '@bambino/types';
import type { Money } from '@bambino/utils';
import type { CartLine, CartView } from '../services/cart-service';
import type {
  CategoryRow,
  DeliveryOptionRow,
  ProductFilter,
  ProductRow,
  ProductSort,
  VariantRow,
} from '../services/catalogue-service';
import type { DeliveryRow } from '../services/delivery-service';
import { AppError } from '../services/errors';
import type { InventoryItemRow } from '../services/inventory-service';
import type { NotificationRow } from '../services/notification-service';
import type { OrderItemRow, OrderRow } from '../services/order-service';
import { type PageRequest, decodeOffset, encodeKeyset, encodeOffset } from '../services/pagination';
import {
  type PaymentMethodRow,
  type PaymentRow,
  type PaymentTransactionRow,
  customerFailureMessage,
} from '../services/payment-service';
import type { RefundRow } from '../services/refund-service';
import { REFUND_POLICY } from '@bambino/config';
import type { RefundStatus } from '@bambino/types';
import { requirePermission } from '../services/context';
import type { PromotionRow } from '../services/promotion-service';
import type { GraphQLContext } from './context';

/** Thin resolvers for catalogue, cart, checkout, orders, payments, delivery and notifications. */

type Ctx = GraphQLContext;
type CustomerRow = {
  user: typeof schema.users.$inferSelect;
  profile: typeof schema.customerProfiles.$inferSelect;
};

const asMoney = (amount: number, currency: string): Money => ({ amount, currency: currency.trim() }) as Money;

function maskMsisdn(msisdn: string | null): string | null {
  if (!msisdn) return null;
  return msisdn.length <= 7
    ? '•••'
    : `${msisdn.slice(0, 6)}${'•'.repeat(msisdn.length - 9)}${msisdn.slice(-3)}`;
}

function offsetEdges<T>(items: T[], after: string | null | undefined) {
  const start = decodeOffset(after);
  return items.map((node, index) => ({ node, cursor: encodeOffset(start + index + 1) }));
}

async function requireLoaded<T>(value: Promise<T | undefined>, what: string): Promise<T> {
  const loaded = await value;
  if (loaded === undefined) throw new Error(`${what} referenced but not found`);
  return loaded;
}

async function customer(context: Ctx, userId: string): Promise<CustomerRow> {
  return requireLoaded(context.loaders.customer.load(userId), 'Customer');
}

export const commerceResolvers = {
  Query: {
    sizes: (_: unknown, __: unknown, context: Ctx) => context.services.catalogue.listSizes(),
    categories: (_: unknown, __: unknown, context: Ctx) => context.services.catalogue.listCategories(),
    deliveryOptions: (_: unknown, __: unknown, context: Ctx) =>
      context.services.catalogue.listDeliveryOptions(),
    products: async (
      _: unknown,
      args: {
        filter?: ProductFilter | null;
        sort?: ProductSort | null;
        first?: number | null;
        after?: string | null;
      },
      context: Ctx,
    ) => {
      const page = await context.services.catalogue.listProducts(
        args.filter ?? {},
        args.sort ?? 'NEWEST',
        args,
      );
      return {
        edges: offsetEdges(page.items, args.after),
        pageInfo: { endCursor: page.endCursor, hasNextPage: page.hasNextPage },
        totalCount: page.totalCount,
      };
    },
    product: (_: unknown, args: { slug: string }, context: Ctx) =>
      context.services.catalogue.getProductBySlug(args.slug),
    myCart: (_: unknown, __: unknown, context: Ctx) => context.services.cart.getCart(context),
    checkoutPreview: (_: unknown, args: { input: unknown }, context: Ctx) =>
      context.services.orders.preview(context, args.input),
    myOrders: async (_: unknown, args: PageRequest, context: Ctx) => {
      const page = await context.services.orders.listOwn(context, args);
      return {
        edges: page.items.map((node) => ({ node, cursor: encodeKeyset(node.placedAt, node.id) })),
        pageInfo: { endCursor: page.endCursor, hasNextPage: page.hasNextPage },
      };
    },
    order: (_: unknown, args: { id: string }, context: Ctx) =>
      context.services.orders.getOwn(context, args.id),
    payment: (_: unknown, args: { id: string }, context: Ctx) =>
      context.services.payments.getOwn(context, args.id),
    myPaymentMethods: (_: unknown, __: unknown, context: Ctx) =>
      context.services.payments.listMethods(context),
    myNotifications: async (_: unknown, args: PageRequest, context: Ctx) => {
      const page = await context.services.notifications.listOwn(context, args);
      return {
        edges: page.items.map((node) => ({ node, cursor: encodeKeyset(node.createdAt, node.id) })),
        pageInfo: { endCursor: page.endCursor, hasNextPage: page.hasNextPage },
        unreadCount: page.unreadCount,
      };
    },

    adminProduct: async (_: unknown, args: { id: string }, context: Ctx) => {
      if (!/^[0-9a-f-]{36}$/i.test(args.id)) return null;
      const [product] = await context.services.catalogue.productsByIds([args.id]);
      return product ?? null;
    },
    adminProducts: async (
      _: unknown,
      args: { filter?: ProductFilter | null; page?: PageRequest | null },
      context: Ctx,
    ) => {
      const page = await context.services.catalogue.listProducts(
        args.filter ?? {},
        'NEWEST',
        args.page ?? {},
        { includeInactive: true },
      );
      return {
        edges: offsetEdges(page.items, args.page?.after),
        pageInfo: { endCursor: page.endCursor, hasNextPage: page.hasNextPage },
        totalCount: page.totalCount,
      };
    },
    adminInventory: async (
      _: unknown,
      args: { belowThresholdOnly?: boolean | null; page?: PageRequest | null },
      context: Ctx,
    ) => {
      const page = await context.services.inventory.list(
        context,
        args.belowThresholdOnly ?? false,
        args.page ?? {},
      );
      return {
        items: page.items,
        pageInfo: { endCursor: page.endCursor, hasNextPage: page.hasNextPage },
        totalCount: page.totalCount,
      };
    },
    adminOrders: async (
      _: unknown,
      args: { status?: OrderStatus | null; search?: string | null; page?: PageRequest | null },
      context: Ctx,
    ) => {
      const page = await context.services.orders.listForStaff(context, args, args.page ?? {});
      return {
        items: page.items.map((order) => ({ order })),
        pageInfo: { endCursor: page.endCursor, hasNextPage: page.hasNextPage },
        totalCount: page.totalCount,
      };
    },
    adminPayments: async (
      _: unknown,
      args: { status?: PaymentStatus | null; page?: PageRequest | null },
      context: Ctx,
    ) => {
      const page = await context.services.payments.listForStaff(context, args.status, args.page ?? {});
      return {
        items: page.items.map((payment) => ({ payment })),
        pageInfo: { endCursor: page.endCursor, hasNextPage: page.hasNextPage },
        totalCount: page.totalCount,
      };
    },
    adminRefunds: async (
      _: unknown,
      args: { status?: RefundStatus | null; page?: PageRequest | null },
      context: Ctx,
    ) => {
      const page = await context.services.refunds.listForStaff(context, args.status, args.page ?? {});
      return {
        items: page.items,
        pageInfo: { endCursor: page.endCursor, hasNextPage: page.hasNextPage },
        totalCount: page.totalCount,
      };
    },
    adminOrder: async (_: unknown, args: { id: string }, context: Ctx) => {
      const order = await context.services.orders.getForStaff(context, args.id);
      return order ? { order } : null;
    },
    adminDeliveries: async (
      _: unknown,
      args: { status?: DeliveryStatus | null; page?: PageRequest | null },
      context: Ctx,
    ) => {
      const page = await context.services.delivery.listForStaff(context, args.status, args.page ?? {});
      return {
        items: page.items.map((delivery) => ({ delivery, orderNumber: delivery.orderNumber })),
        pageInfo: { endCursor: page.endCursor, hasNextPage: page.hasNextPage },
        totalCount: page.totalCount,
      };
    },
    adminPromotions: (_: unknown, __: unknown, context: Ctx) => context.services.promotions.list(context),
  },

  Mutation: {
    createCart: (_: unknown, __: unknown, context: Ctx) => context.services.cart.createCart(context),
    addToCart: (_: unknown, args: { variantId: string; quantity?: number | null }, context: Ctx) =>
      context.services.cart.addToCart(context, args.variantId, args.quantity),
    updateCartItem: (_: unknown, args: { itemId: string; quantity: number }, context: Ctx) =>
      context.services.cart.updateCartItem(context, args.itemId, args.quantity),
    removeFromCart: (_: unknown, args: { itemId: string }, context: Ctx) =>
      context.services.cart.removeFromCart(context, args.itemId),
    createOrder: (_: unknown, args: { input: unknown }, context: Ctx) =>
      context.services.orders.createOrder(context, args.input),
    cancelOrder: (_: unknown, args: { id: string }, context: Ctx) =>
      context.services.orders.cancelOrder(context, args.id),
    applyExchangeCredit: (_: unknown, args: { orderId: string }, context: Ctx) =>
      context.services.orders.applyExchangeCredit(context, args.orderId),
    initiatePayment: (_: unknown, args: { input: unknown }, context: Ctx) =>
      context.services.payments.initiate(context, args.input),
    addPaymentMethod: (_: unknown, args: { input: unknown }, context: Ctx) =>
      context.services.payments.addMethod(context, args.input),
    removePaymentMethod: async (_: unknown, args: { id: string }, context: Ctx) => {
      await context.services.payments.removeMethod(context, args.id);
      return true;
    },
    markNotificationRead: (_: unknown, args: { id: string }, context: Ctx) =>
      context.services.notifications.markRead(context, args.id),
    markAllNotificationsRead: (_: unknown, __: unknown, context: Ctx) =>
      context.services.notifications.markAllRead(context),

    adminUpsertCategory: (_: unknown, args: { input: unknown }, context: Ctx) =>
      context.services.catalogue.upsertCategory(context, args.input),
    adminCreateProduct: (_: unknown, args: { input: unknown }, context: Ctx) =>
      context.services.catalogue.createProduct(context, args.input),
    adminUpdateProduct: (_: unknown, args: { id: string; input: unknown }, context: Ctx) =>
      context.services.catalogue.updateProduct(context, args.id, args.input),
    adminUpsertVariant: (_: unknown, args: { input: unknown }, context: Ctx) =>
      context.services.catalogue.upsertVariant(context, args.input),
    adminCreateProductImageUpload: async (
      _: unknown,
      args: { productId: string; contentType: string; byteSize: number },
      context: Ctx,
    ) => {
      const upload = await context.services.media.createProductImageUpload(context, args);
      return {
        mediaAssetId: upload.mediaAssetId,
        uploadUrl: upload.url,
        method: upload.method,
        headers: Object.entries(upload.headers).map(([name, value]) => ({ name, value })),
        expiresAt: upload.expiresAt,
      };
    },
    adminAddProductImage: async (_: unknown, args: Record<string, unknown>, context: Ctx) =>
      productForStaff(context, await context.services.media.addProductImage(context, args)),
    adminRemoveProductImage: async (_: unknown, args: { imageId: string }, context: Ctx) =>
      productForStaff(context, await context.services.media.removeProductImage(context, args.imageId)),
    adminAdjustInventory: (_: unknown, args: { input: unknown }, context: Ctx) =>
      context.services.inventory.adjust(context, args.input),
    adminUpdateOrderStatus: (
      _: unknown,
      args: { orderId: string; status: string; note?: string | null },
      context: Ctx,
    ) => context.services.orders.updateStatusAsStaff(context, args.orderId, args.status, args.note),
    adminUpdateDelivery: (_: unknown, args: { input: unknown }, context: Ctx) =>
      context.services.delivery.updateAsStaff(context, args.input),
    adminReconcilePayment: (_: unknown, args: { id: string }, context: Ctx) =>
      context.services.payments.reconcileOne(context, args.id),
    adminRequestRefund: (_: unknown, args: { input: unknown }, context: Ctx) =>
      context.services.refunds.request(context, args.input),
    adminApproveRefund: (_: unknown, args: { id: string }, context: Ctx) =>
      context.services.refunds.approve(context, args.id),
    adminRejectRefund: (_: unknown, args: { id: string; note?: string | null }, context: Ctx) =>
      context.services.refunds.reject(context, args.id, args.note),
    adminUpsertPromotion: (_: unknown, args: { input: unknown }, context: Ctx) =>
      context.services.promotions.upsert(context, args.input),
  },

  Category: {
    parent: (parent: CategoryRow, _: unknown, context: Ctx) =>
      parent.parentId ? context.loaders.category.load(parent.parentId) : null,
    children: async (parent: CategoryRow, _: unknown, context: Ctx) =>
      (await context.loaders.childCategories.load(parent.id)) ?? [],
  },

  Product: {
    category: (parent: ProductRow, _: unknown, context: Ctx) =>
      requireLoaded(context.loaders.category.load(parent.categoryId), 'Category'),
    images: async (parent: ProductRow, _: unknown, context: Ctx) =>
      ((await context.loaders.productImages.load(parent.id)) ?? []).map((row) => ({
        id: row.image.id,
        url: context.services.storage.publicUrl(row.objectKey),
        altText: row.image.altText,
      })),
    variants: async (parent: ProductRow, _: unknown, context: Ctx) =>
      (await context.loaders.productVariants.load(parent.id)) ?? [],
    priceFrom: async (parent: ProductRow, _: unknown, context: Ctx) => {
      const variants = (await context.loaders.productVariants.load(parent.id)) ?? [];
      const cheapest = variants.reduce<VariantRow | null>(
        (best, variant) => (!best || variant.priceAmount < best.priceAmount ? variant : best),
        null,
      );
      return cheapest ? asMoney(cheapest.priceAmount, cheapest.currency) : null;
    },
  },

  ProductVariant: {
    size: (parent: VariantRow, _: unknown, context: Ctx) =>
      requireLoaded(context.loaders.size.load(parent.sizeCode), 'Size'),
    price: (parent: VariantRow) => asMoney(parent.priceAmount, parent.currency),
    inStock: async (parent: VariantRow, _: unknown, context: Ctx) =>
      ((await context.loaders.availability.load(parent.id)) ?? 0) > 0,
    availableForSubscription: async (parent: VariantRow, _: unknown, context: Ctx) =>
      ((await context.loaders.garmentAvailability.load(parent.id)) ?? 0) > 0,
  },

  Cart: {
    items: (parent: CartView) => parent.items,
  },

  CartItem: {
    variant: (parent: CartLine, _: unknown, context: Ctx) =>
      requireLoaded(context.loaders.variant.load(parent.variantId), 'Variant'),
    product: (parent: CartLine, _: unknown, context: Ctx) =>
      requireLoaded(context.loaders.product.load(parent.productId), 'Product'),
  },

  DeliveryOption: {
    fee: (parent: DeliveryOptionRow) => asMoney(parent.feeAmount, parent.currency),
  },

  Order: {
    items: async (parent: OrderRow, _: unknown, context: Ctx) =>
      (await context.loaders.orderItems.load(parent.id)) ?? [],
    totals: (parent: OrderRow) => ({
      subtotal: asMoney(parent.subtotalAmount, parent.currency),
      discount: asMoney(parent.discountAmount, parent.currency),
      creditApplied: asMoney(parent.creditAppliedAmount, parent.currency),
      shipping: asMoney(parent.shippingAmount, parent.currency),
      tax: asMoney(parent.taxAmount, parent.currency),
      total: asMoney(parent.totalAmount, parent.currency),
    }),
    deliveryOption: (parent: OrderRow, _: unknown, context: Ctx) =>
      context.loaders.deliveryOption.load(parent.deliveryOptionCode),
    delivery: (parent: OrderRow, _: unknown, context: Ctx) => context.loaders.orderDelivery.load(parent.id),
    payments: async (parent: OrderRow, _: unknown, context: Ctx) =>
      (await context.loaders.orderPayments.load(parent.id)) ?? [],
    refunds: async (parent: OrderRow, _: unknown, context: Ctx) =>
      (await context.loaders.orderRefunds.load(parent.id)) ?? [],
    statusHistory: async (parent: OrderRow, _: unknown, context: Ctx) =>
      ((await context.loaders.orderEvents.load(parent.id)) ?? []).map((event) => ({
        status: event.newStatus,
        occurredAt: event.createdAt,
      })),
  },

  OrderItem: {
    unitPrice: (parent: OrderItemRow, _: unknown, context: Ctx) =>
      asMoney(parent.unitPriceAmount, currencyOf(context)),
    lineTotal: (parent: OrderItemRow, _: unknown, context: Ctx) =>
      asMoney(parent.lineTotalAmount, currencyOf(context)),
    product: async (parent: OrderItemRow, _: unknown, context: Ctx) => {
      const variant = await context.loaders.variant.load(parent.variantId);
      return variant ? context.loaders.product.load(variant.productId) : null;
    },
  },

  Delivery: {
    provider: (parent: DeliveryRow) => parent.deliveryProvider,
    events: async (parent: DeliveryRow, _: unknown, context: Ctx) =>
      (await context.loaders.deliveryEvents.load(parent.id)) ?? [],
  },

  Payment: {
    amount: (parent: PaymentRow) => asMoney(parent.amount, parent.currency),
    failureMessage: (parent: PaymentRow) => customerFailureMessage(parent.failureCode),
  },

  Refund: {
    amount: (parent: RefundRow) => asMoney(parent.amount, parent.currency),
    requestedAt: (parent: RefundRow) => parent.createdAt,
  },

  AdminRefund: {
    refund: (parent: RefundRow) => parent,
    customer: (parent: RefundRow, _: unknown, context: Ctx) => customer(context, parent.userId),
    orderNumber: async (parent: RefundRow, _: unknown, context: Ctx) =>
      parent.orderId ? ((await context.loaders.order.load(parent.orderId))?.orderNumber ?? null) : null,
  },

  PaymentMethod: {
    maskedMsisdn: (parent: PaymentMethodRow) => maskMsisdn(parent.msisdn),
  },

  Notification: {
    params: (parent: NotificationRow) =>
      Object.entries(parent.params ?? {}).map(([name, value]) => ({ name, value: String(value) })),
    read: (parent: NotificationRow) => parent.readAt !== null,
  },

  InventoryItem: {
    variant: (parent: InventoryItemRow, _: unknown, context: Ctx) =>
      requireLoaded(context.loaders.variant.load(parent.variantId), 'Variant'),
    product: async (parent: InventoryItemRow, _: unknown, context: Ctx) => {
      const variant = await requireLoaded(context.loaders.variant.load(parent.variantId), 'Variant');
      return requireLoaded(context.loaders.product.load(variant.productId), 'Product');
    },
    quantityAvailable: (parent: InventoryItemRow) => parent.quantityOnHand - parent.quantityReserved,
    belowThreshold: (parent: InventoryItemRow) =>
      parent.quantityOnHand - parent.quantityReserved <= parent.reorderThreshold,
  },

  AdminOrder: {
    customer: (parent: { order: OrderRow }, _: unknown, context: Ctx) =>
      customer(context, parent.order.userId),
    payments: async (parent: { order: OrderRow }, _: unknown, context: Ctx) =>
      ((await context.loaders.orderPayments.load(parent.order.id)) ?? []).map((payment) => ({ payment })),
  },

  AdminPayment: {
    customer: (parent: { payment: PaymentRow }, _: unknown, context: Ctx) =>
      customer(context, parent.payment.userId),
    providerReference: (parent: { payment: PaymentRow }) => parent.payment.providerReference,
    transactions: async (parent: { payment: PaymentRow }, _: unknown, context: Ctx) =>
      (await context.loaders.paymentTransactions.load(parent.payment.id)) ?? [],
    refunds: async (parent: { payment: PaymentRow }, _: unknown, context: Ctx) => {
      requirePermission(context, 'refund:read');
      return (await context.loaders.paymentRefunds.load(parent.payment.id)) ?? [];
    },
    refundableAmount: async (parent: { payment: PaymentRow }, _: unknown, context: Ctx) =>
      asMoney(await context.services.refunds.refundable(parent.payment), parent.payment.currency),
    refundMethods: () => (REFUND_POLICY.allowRefundAsCredit ? ['PROVIDER', 'CREDIT'] : ['PROVIDER']),
  },

  PaymentTransaction: {
    amount: (parent: PaymentTransactionRow) => asMoney(parent.amount, parent.currency),
  },

  AdminDelivery: {
    returnNumber: async (parent: { delivery: DeliveryRow }, _: unknown, context: Ctx) =>
      parent.delivery.returnRequestId
        ? ((await context.loaders.returnRequest.load(parent.delivery.returnRequestId))?.returnNumber ?? null)
        : null,
    recipientName: (parent: { delivery: DeliveryRow }) => parent.delivery.address.recipientName,
    phone: (parent: { delivery: DeliveryRow }) => parent.delivery.phone,
  },

  AdminCustomer: {
    id: (parent: CustomerRow) => parent.user.id,
    email: (parent: CustomerRow) => parent.user.email,
    phone: (parent: CustomerRow) => parent.user.phone,
    firstName: (parent: CustomerRow) => parent.profile.firstName,
    lastName: (parent: CustomerRow) => parent.profile.lastName,
    status: (parent: CustomerRow) => parent.user.status,
    createdAt: (parent: CustomerRow) => parent.user.createdAt,
    exchangeCreditBalance: (parent: CustomerRow, _: unknown, context: Ctx) =>
      context.services.orders.creditBalanceOf(parent.user.id),
  },

  Promotion: {
    fixedAmount: (parent: PromotionRow) =>
      parent.fixedAmount === null ? null : asMoney(parent.fixedAmount, parent.currency),
    minSubtotal: (parent: PromotionRow) => asMoney(parent.minSubtotalAmount, parent.currency),
  },
};

async function productForStaff(context: Ctx, productId: string) {
  const [product] = await context.services.catalogue.productsByIds([productId]);
  if (!product) throw new AppError('NOT_FOUND', 'Product not found.');
  return product;
}

function currencyOf(context: Ctx): string {
  return context.services.marketCurrency;
}
