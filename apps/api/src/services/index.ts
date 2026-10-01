import { getMarket } from '@bambino/config';
import type { Database } from '@bambino/database';
import type { CurrencyCode } from '@bambino/utils';
import type { PasswordHasher } from '../auth/passwords';
import { createAccessTokenIssuer } from '../auth/tokens';
import { RulesBasedSizingProvider, type SizingProvider } from '../domain/sizing';
import { schema } from '@bambino/database';
import { eq } from '@bambino/database/orm';
import type { Logger } from '../infra/logger';
import type { RateLimiter } from '../infra/rate-limiter';
import { type DeliveryProvider, InHouseDeliveryProvider } from '../providers/delivery';
import type { EmailProvider } from '../providers/email';
import type { PaymentProviderRegistry } from '../providers/payments';
import { LocalStorageProvider, type StorageProvider } from '../providers/storage';
import { AccessService } from './access-service';
import { AdminService } from './admin-service';
import { AccountService } from './account-service';
import { AuthService } from './auth-service';
import { CartService } from './cart-service';
import { CatalogueService } from './catalogue-service';
import { CreditLedger } from './credit-ledger';
import { DeliveryService } from './delivery-service';
import { BabyService } from './baby-service';
import { ExchangeService } from './exchange-service';
import { GarmentService } from './garment-service';
import { InventoryService } from './inventory-service';
import { ReturnService } from './return-service';
import { SizingService } from './sizing-service';
import { SubscriptionService } from './subscription-service';
import { MediaService } from './media-service';
import { NotificationService } from './notification-service';
import { OrderService } from './order-service';
import { PaymentService } from './payment-service';
import { PromotionService } from './promotion-service';

export interface ServiceDependencies {
  db: Database;
  hasher: PasswordHasher;
  email: EmailProvider;
  rateLimiter: RateLimiter;
  logger: Logger;
  now: () => Date;
  config: {
    jwtSecret: string;
    accessTokenTtlSeconds: number;
    refreshTokenTtlDays: number;
    webOrigin: string;
    marketCode: string;
  };
  /** Omitted by scripts that never take payments; no provider is then available. */
  payments?: { providers: PaymentProviderRegistry; allowMockProvider: boolean };
  storage?: StorageProvider;
  deliveryProvider?: DeliveryProvider;
  sizingProvider?: SizingProvider;
}

export interface Services {
  auth: AuthService;
  account: AccountService;
  access: AccessService;
  admin: AdminService;
  catalogue: CatalogueService;
  inventory: InventoryService;
  cart: CartService;
  promotions: PromotionService;
  orders: OrderService;
  payments: PaymentService;
  delivery: DeliveryService;
  notifications: NotificationService;
  credit: CreditLedger;
  storage: StorageProvider;
  media: MediaService;
  garments: GarmentService;
  babies: BabyService;
  sizing: SizingService;
  subscriptions: SubscriptionService;
  returns: ReturnService;
  exchanges: ExchangeService;
  marketCurrency: CurrencyCode;
}

/** Composition root for the service layer: the only place implementations are chosen. */
export function createServices(deps: ServiceDependencies): Services {
  const { db, now, logger } = deps;
  const { marketCode } = deps.config;
  const currency = getMarket(marketCode).currency;

  const accessTokens = createAccessTokenIssuer(deps.config.jwtSecret, deps.config.accessTokenTtlSeconds, now);
  const auth = new AuthService({
    db,
    hasher: deps.hasher,
    accessTokens,
    email: deps.email,
    rateLimiter: deps.rateLimiter,
    logger,
    now,
    config: deps.config,
  });

  const notifications = new NotificationService(db);
  const inventory = new InventoryService(db);
  const cart = new CartService(db, inventory, currency);
  const promotions = new PromotionService(db, currency);
  const credit = new CreditLedger(currency);
  const delivery = new DeliveryService(
    db,
    deps.deliveryProvider ?? new InHouseDeliveryProvider(),
    notifications,
    now,
  );
  const orders = new OrderService({
    db,
    cart,
    inventory,
    promotions,
    credit,
    delivery,
    notifications,
    marketCode,
    currency,
    now,
  });
  delivery.attachOrders(orders);
  const payments = new PaymentService({
    db,
    providers: deps.payments?.providers ?? new Map(),
    orders,
    notifications,
    rateLimiter: deps.rateLimiter,
    logger,
    marketCode,
    currency,
    allowMockProvider: deps.payments?.allowMockProvider ?? false,
    now,
  });

  const storage = deps.storage ?? new LocalStorageProvider('http://localhost:4000/media');
  const garments = new GarmentService(db, now);
  const babies = new BabyService(db, now);
  const sizing = new SizingService(db, deps.sizingProvider ?? new RulesBasedSizingProvider(), babies, now);
  const subscriptions = new SubscriptionService({
    db,
    orders,
    payments,
    promotions,
    garments,
    babies,
    notifications,
    logger,
    marketCode,
    currency,
    now,
  });
  const returns = new ReturnService({ db, garments, delivery, orders, notifications, currency, now });
  const exchanges = new ExchangeService({
    db,
    orders,
    garments,
    credit,
    notifications,
    marketCode,
    currency,
    now,
  });

  // Cross-service reactions, all inside the triggering transaction.
  const garmentLines = (tx: Parameters<typeof garments.lock>[0], orderId: string) =>
    tx
      .select({ garmentId: schema.orderItems.garmentId })
      .from(schema.orderItems)
      .where(eq(schema.orderItems.orderId, orderId));
  orders.on('paid', (tx, order) => subscriptions.onOrderPaid(tx, order));
  orders.on('paid', (tx, order) => exchanges.onOrderPaid(tx, order));
  orders.on('delivered', async (tx, order) => {
    for (const { garmentId } of await garmentLines(tx, order.id)) {
      if (garmentId) await garments.markDelivered(tx, garmentId, order.userId, order.id);
    }
  });
  orders.on('delivered', (tx, order) => subscriptions.onOrderDelivered(tx, order));
  orders.on('delivered', (tx, order) => exchanges.onOrderDelivered(tx, order));
  orders.on('cancelled', async (tx, order) => {
    for (const { garmentId } of await garmentLines(tx, order.id)) {
      if (garmentId) await garments.release(tx, garmentId, 'order cancelled');
    }
  });
  orders.on('cancelled', (tx, order) => subscriptions.onOrderCancelled(tx, order));
  orders.on('cancelled', (tx, order) => exchanges.onOrderCancelled(tx, order));
  delivery.onPickupStatus((tx, pickup, status, actorId) =>
    returns.onPickupStatus(tx, pickup, status, actorId),
  );

  return {
    auth,
    account: new AccountService(db, auth),
    access: new AccessService(db),
    admin: new AdminService(db, currency),
    catalogue: new CatalogueService(db, currency, marketCode),
    inventory,
    cart,
    promotions,
    orders,
    payments,
    delivery,
    notifications,
    credit,
    storage,
    media: new MediaService(db, storage),
    garments,
    babies,
    sizing,
    subscriptions,
    returns,
    exchanges,
    marketCurrency: currency,
  };
}
