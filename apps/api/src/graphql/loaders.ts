import type { Services } from '../services';

/**
 * Minimal per-request batching (the DataLoader pattern, without the dependency): every
 * `load` issued while GraphQL resolves one level of a response is collected and served
 * by a single batch call, so a list of 24 products costs one variants query, not 24.
 */
export class Loader<K, V> {
  private readonly cache = new Map<K, Promise<V | undefined>>();
  private queue: { key: K; resolve: (value: V | undefined) => void; reject: (error: unknown) => void }[] = [];

  constructor(private readonly batch: (keys: readonly K[]) => Promise<Map<K, V>>) {}

  load(key: K): Promise<V | undefined> {
    const cached = this.cache.get(key);
    if (cached) return cached;
    const promise = new Promise<V | undefined>((resolve, reject) => {
      this.queue.push({ key, resolve, reject });
      if (this.queue.length === 1) setImmediate(() => void this.flush());
    });
    this.cache.set(key, promise);
    return promise;
  }

  private async flush(): Promise<void> {
    const entries = this.queue;
    this.queue = [];
    try {
      const results = await this.batch([...new Set(entries.map((entry) => entry.key))]);
      for (const entry of entries) entry.resolve(results.get(entry.key));
    } catch (error) {
      for (const entry of entries) {
        this.cache.delete(entry.key);
        entry.reject(error);
      }
    }
  }
}

function byKey<V, K>(rows: readonly V[], key: (row: V) => K): Map<K, V> {
  return new Map(rows.map((row) => [key(row), row]));
}

function groupBy<V, K>(rows: readonly V[], key: (row: V) => K): Map<K, V[]> {
  const groups = new Map<K, V[]>();
  for (const row of rows) {
    const group = groups.get(key(row));
    if (group) group.push(row);
    else groups.set(key(row), [row]);
  }
  return groups;
}

export function createLoaders(services: Services) {
  const {
    catalogue,
    inventory,
    orders,
    delivery,
    payments,
    account,
    babies,
    sizing,
    subscriptions,
    garments,
    returns,
    exchanges,
  } = services;
  return {
    product: new Loader(async (ids: readonly string[]) =>
      byKey(await catalogue.productsByIds(ids), (row) => row.id),
    ),
    variant: new Loader(async (ids: readonly string[]) =>
      byKey(await catalogue.variantsByIds(ids), (row) => row.id),
    ),
    productVariants: new Loader(async (ids: readonly string[]) =>
      groupBy(await catalogue.activeVariantsForProducts(ids), (row) => row.productId),
    ),
    category: new Loader(async (ids: readonly string[]) =>
      byKey(await catalogue.categoriesByIds(ids), (row) => row.id),
    ),
    childCategories: new Loader(async (ids: readonly string[]) =>
      groupBy(await catalogue.childCategories(ids), (row) => row.parentId ?? ''),
    ),
    size: new Loader(async (codes: readonly string[]) =>
      byKey(await catalogue.sizesByCodes(codes), (row) => row.code),
    ),
    productImages: new Loader(async (ids: readonly string[]) =>
      groupBy(await catalogue.imagesForProducts(ids), (row) => row.image.productId),
    ),
    deliveryOption: new Loader(async (codes: readonly string[]) =>
      byKey(await catalogue.deliveryOptionsByCodes(codes), (row) => row.code),
    ),
    availability: new Loader((ids: readonly string[]) => inventory.availabilityOf(ids)),
    garmentAvailability: new Loader((ids: readonly string[]) => garments.reservableCounts(ids)),
    orderItems: new Loader(async (ids: readonly string[]) =>
      groupBy(await orders.itemsFor(ids), (row) => row.orderId),
    ),
    orderEvents: new Loader(async (ids: readonly string[]) =>
      groupBy(await orders.statusEventsFor(ids), (row) => row.orderId),
    ),
    orderDelivery: new Loader(async (ids: readonly string[]) => {
      // Rows come oldest first, so the last one written per order is the latest delivery.
      return byKey(await delivery.outboundForOrders(ids), (row) => row.orderId ?? '');
    }),
    deliveryEvents: new Loader(async (ids: readonly string[]) =>
      groupBy(await delivery.eventsFor(ids), (row) => row.deliveryId),
    ),
    orderPayments: new Loader(async (ids: readonly string[]) =>
      groupBy(await payments.forOrders(ids), (row) => row.orderId ?? ''),
    ),
    paymentTransactions: new Loader(async (ids: readonly string[]) =>
      groupBy(await payments.transactionsFor(ids), (row) => row.paymentId),
    ),
    paymentRefunds: new Loader(async (ids: readonly string[]) =>
      groupBy(await services.refunds.forPayments(ids), (row) => row.paymentId),
    ),
    orderRefunds: new Loader(async (ids: readonly string[]) =>
      groupBy(await services.refunds.forOrders(ids), (row) => row.orderId ?? ''),
    ),
    customer: new Loader(async (ids: readonly string[]) =>
      byKey(await account.customerSummaries(ids), (row) => row.user.id),
    ),
    order: new Loader(async (ids: readonly string[]) => byKey(await orders.byIds(ids), (row) => row.id)),
    baby: new Loader(async (ids: readonly string[]) => byKey(await babies.byIds(ids), (row) => row.id)),
    babyMeasurements: new Loader(async (ids: readonly string[]) =>
      groupBy(await babies.measurementsFor(ids), (row) => row.babyProfileId),
    ),
    sizingHistory: new Loader(async (ids: readonly string[]) =>
      groupBy(await sizing.history(ids), (row) => row.babyProfileId),
    ),
    plan: new Loader(async (ids: readonly string[]) =>
      byKey(await subscriptions.plansByIds(ids), (row) => row.id),
    ),
    planCategories: new Loader(async (ids: readonly string[]) => {
      const groups = groupBy(await subscriptions.categoriesForPlans(ids), (row) => row.planId);
      return new Map([...groups].map(([planId, rows]) => [planId, rows.map((row) => row.category)]));
    }),
    subscriptionEvents: new Loader(async (ids: readonly string[]) =>
      groupBy(await subscriptions.eventsFor(ids), (row) => row.subscriptionId),
    ),
    subscriptionItems: new Loader(async (ids: readonly string[]) =>
      groupBy(await subscriptions.currentItemsFor(ids), (row) => row.subscriptionId),
    ),
    subscriptionOrderAwaiting: new Loader(async (ids: readonly string[]) =>
      byKey(await subscriptions.ordersAwaitingPayment(ids), (row) => row.subscriptionId ?? ''),
    ),
    customerSubscriptions: new Loader(async (ids: readonly string[]) =>
      groupBy(await subscriptions.byIdsForUser(ids), (row) => row.userId),
    ),
    garment: new Loader(async (ids: readonly string[]) => byKey(await garments.byIds(ids), (row) => row.id)),
    garmentEvents: new Loader(async (ids: readonly string[]) =>
      groupBy(await garments.eventsFor(ids), (row) => row.garmentId),
    ),
    garmentDeliveredAt: new Loader((ids: readonly string[]) => garments.deliveredAt(ids)),
    returnRequest: new Loader(async (ids: readonly string[]) =>
      byKey(await returns.byIds(ids), (row) => row.id),
    ),
    returnItems: new Loader(async (ids: readonly string[]) =>
      groupBy(await returns.itemsFor(ids), (row) => row.returnRequestId),
    ),
    returnItem: new Loader(async (ids: readonly string[]) =>
      byKey(await returns.itemsByIds(ids), (row) => row.id),
    ),
    returnCredit: new Loader((ids: readonly string[]) => returns.creditEarnedFor(ids)),
    returnPickup: new Loader(async (ids: readonly string[]) =>
      byKey(await delivery.pickupsFor(ids), (row) => row.returnRequestId ?? ''),
    ),
    exchangeItems: new Loader(async (ids: readonly string[]) =>
      groupBy(await exchanges.itemsFor(ids), (row) => row.exchangeId),
    ),
  };
}

export type Loaders = ReturnType<typeof createLoaders>;
