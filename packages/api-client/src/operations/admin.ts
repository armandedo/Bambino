import { operation } from '../client';
import type { BabyProfile } from './baby';
import type { BillingInterval, Money, SizeSummary } from './catalogue';
import {
  type Delivery,
  type DeliveryStatus,
  type OrderDetail,
  type OrderStatus,
  type Payment,
  type PaymentStatus,
  REFUND_FIELDS,
  type Refund,
  type RefundMethod,
  type RefundStatus,
} from './commerce';
import type {
  Exchange,
  ExchangeStatus,
  GarmentCondition,
  GarmentStatus,
  ReturnRequest,
  ReturnStatus,
} from './returns';
import type { Subscription, SubscriptionStatus } from './subscriptions';

/** Staff operations used by the admin dashboard. Every one is guarded by a permission on the server. */

const MONEY = '{ amount currency }';
const SIZE = '{ code label sortOrder }';
const PAGE_INFO = 'pageInfo { hasNextPage endCursor }';

export interface PageInput {
  first?: number;
  after?: string | null;
}
export interface AdminPage<T> {
  items: T[];
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
  totalCount: number;
}

// --- Metrics ---------------------------------------------------------------------------------

export interface AdminMetrics {
  periodStart: string;
  periodEnd: string;
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

export const AdminMetricsQuery = operation<
  { adminMetrics: AdminMetrics },
  { periodStart: string; periodEnd: string }
>(
  'AdminMetrics',
  `query AdminMetrics($periodStart: DateTime!, $periodEnd: DateTime!) {
    adminMetrics(periodStart: $periodStart, periodEnd: $periodEnd) {
      periodStart periodEnd totalCustomers newCustomers activeSubscribers
      monthlyRecurringRevenue ${MONEY} subscriptionRevenue ${MONEY} oneTimeRevenue ${MONEY}
      averageRevenuePerSubscriber ${MONEY} paymentSuccessRate orders pendingOrders pendingReturns
      openExchangeRequests lowStockItems garmentsInCirculation garmentsReturned garmentsRefurbished
      garmentsReused garmentsRecycled averageGarmentLifecycleCount subscriptionChurnRate
      customerRetentionRate onTimeDeliveryRate
    }
  }`,
);

// --- Customers -------------------------------------------------------------------------------

export interface AdminCustomerSummary {
  id: string;
  email: string | null;
  phone: string | null;
  firstName: string;
  lastName: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'DELETED';
  createdAt: string;
  exchangeCreditBalance: Money;
}
const CUSTOMER_FIELDS = `id email phone firstName lastName status createdAt exchangeCreditBalance ${MONEY}`;

export const AdminCustomersQuery = operation<
  { adminCustomers: AdminPage<AdminCustomerSummary> },
  { search?: string | null; page?: PageInput }
>(
  'AdminCustomers',
  `query AdminCustomers($search: String, $page: PageInput) {
    adminCustomers(search: $search, page: $page) { totalCount ${PAGE_INFO} items { ${CUSTOMER_FIELDS} } }
  }`,
);

export const AdminCustomerQuery = operation<{ adminCustomer: AdminCustomerSummary | null }, { id: string }>(
  'AdminCustomer',
  `query AdminCustomer($id: ID!) { adminCustomer(id: $id) { ${CUSTOMER_FIELDS} } }`,
);

/** Separate request: a customer's subscriptions need `subscription:read`, which not every role has. */
export const AdminCustomerSubscriptionsQuery = operation<
  {
    adminCustomer: {
      id: string;
      subscriptions: { id: string; status: SubscriptionStatus; createdAt: string; plan: { name: string } }[];
    } | null;
  },
  { id: string }
>(
  'AdminCustomerSubscriptions',
  'query AdminCustomerSubscriptions($id: ID!) { adminCustomer(id: $id) { id subscriptions { id status createdAt plan { name } } } }',
);

/** Separate from the customer: child data needs `baby_profile:read`, and each view is audited. */
export const AdminBabyProfilesQuery = operation<
  {
    adminBabyProfiles: Pick<
      BabyProfile,
      | 'id'
      | 'nickname'
      | 'dateOfBirth'
      | 'ageInDays'
      | 'fitPreference'
      | 'latestRecommendation'
      | 'measurements'
    >[];
  },
  { customerId: string }
>(
  'AdminBabyProfiles',
  `query AdminBabyProfiles($customerId: ID!) {
    adminBabyProfiles(customerId: $customerId) {
      id nickname dateOfBirth ageInDays fitPreference
      latestRecommendation { id babyProfileId recommendedSize ${SIZE} nextSize ${SIZE} confidence explanation { key params { name value } } provider createdAt }
      measurements { id measuredAt heightMm weightG chestMm waistMm footLengthMm source }
    }
  }`,
);

export const AdminAdjustExchangeCreditMutation = operation<
  { adminAdjustExchangeCredit: { id: string } },
  { customerId: string; amount: number; note: string }
>(
  'AdminAdjustExchangeCredit',
  `mutation AdminAdjustExchangeCredit($customerId: ID!, $amount: MinorUnits!, $note: String!) {
    adminAdjustExchangeCredit(customerId: $customerId, amount: $amount, note: $note) { id }
  }`,
);

// --- Catalogue -------------------------------------------------------------------------------

export interface AdminProduct {
  id: string;
  slug: string;
  name: string;
  description: string;
  brand: string;
  material: string | null;
  sustainabilityInfo: string | null;
  careInstructions: string | null;
  subscriptionEligible: boolean;
  oneTimeEligible: boolean;
  isActive: boolean;
  category: { id: string; slug: string; name: string };
  images: { id: string; url: string; altText: string }[];
  variants: {
    id: string;
    sku: string;
    color: string;
    price: Money;
    inStock: boolean;
    availableForSubscription: boolean;
    size: SizeSummary;
  }[];
}
const PRODUCT_FIELDS = `
  id slug name description brand material sustainabilityInfo careInstructions subscriptionEligible oneTimeEligible isActive
  category { id slug name } images { id url altText }
  variants { id sku color price ${MONEY} inStock availableForSubscription size ${SIZE} }
`;

export const AdminProductsQuery = operation<
  {
    adminProducts: {
      totalCount: number;
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
      edges: { node: AdminProduct }[];
    };
  },
  { search?: string | null; page?: PageInput }
>(
  'AdminProducts',
  `query AdminProducts($search: String, $page: PageInput) {
    adminProducts(filter: { search: $search }, page: $page) { totalCount ${PAGE_INFO} edges { node { ${PRODUCT_FIELDS} } } }
  }`,
);

export const AdminProductQuery = operation<{ adminProduct: AdminProduct | null }, { id: string }>(
  'AdminProduct',
  `query AdminProduct($id: ID!) { adminProduct(id: $id) { ${PRODUCT_FIELDS} } }`,
);

export interface ProductInput {
  /** Leave out: a new product's web address is made from its name and an edit keeps the current one. */
  slug?: string | null;
  name: string;
  description: string;
  brand: string;
  categoryId: string;
  material?: string | null;
  sustainabilityInfo?: string | null;
  careInstructions?: string | null;
  subscriptionEligible: boolean;
  oneTimeEligible: boolean;
  isActive: boolean;
}

export const AdminCreateProductMutation = operation<
  { adminCreateProduct: AdminProduct },
  { input: ProductInput }
>(
  'AdminCreateProduct',
  `mutation AdminCreateProduct($input: ProductInput!) { adminCreateProduct(input: $input) { ${PRODUCT_FIELDS} } }`,
);

export const AdminUpdateProductMutation = operation<
  { adminUpdateProduct: AdminProduct },
  { id: string; input: ProductInput }
>(
  'AdminUpdateProduct',
  `mutation AdminUpdateProduct($id: ID!, $input: ProductInput!) { adminUpdateProduct(id: $id, input: $input) { ${PRODUCT_FIELDS} } }`,
);

export const AdminUpsertVariantMutation = operation<
  { adminUpsertVariant: { id: string } },
  {
    input: {
      id?: string | null;
      productId: string;
      sku: string;
      sizeCode: string;
      color: string;
      priceAmount: number;
      isActive?: boolean;
    };
  }
>(
  'AdminUpsertVariant',
  'mutation AdminUpsertVariant($input: VariantInput!) { adminUpsertVariant(input: $input) { id } }',
);

export const AdminCreateProductImageUploadMutation = operation<
  {
    adminCreateProductImageUpload: {
      mediaAssetId: string;
      uploadUrl: string;
      method: string;
      headers: { name: string; value: string }[];
      expiresAt: string;
    };
  },
  { productId: string; contentType: string; byteSize: number }
>(
  'AdminCreateProductImageUpload',
  `mutation AdminCreateProductImageUpload($productId: ID!, $contentType: String!, $byteSize: Int!) {
    adminCreateProductImageUpload(productId: $productId, contentType: $contentType, byteSize: $byteSize) {
      mediaAssetId uploadUrl method headers { name value } expiresAt
    }
  }`,
);

export const AdminAddProductImageMutation = operation<
  { adminAddProductImage: AdminProduct },
  { productId: string; mediaAssetId: string; altText: string }
>(
  'AdminAddProductImage',
  `mutation AdminAddProductImage($productId: ID!, $mediaAssetId: ID!, $altText: String!) {
    adminAddProductImage(productId: $productId, mediaAssetId: $mediaAssetId, altText: $altText) { ${PRODUCT_FIELDS} }
  }`,
);

export const AdminRemoveProductImageMutation = operation<
  { adminRemoveProductImage: AdminProduct },
  { imageId: string }
>(
  'AdminRemoveProductImage',
  `mutation AdminRemoveProductImage($imageId: ID!) { adminRemoveProductImage(imageId: $imageId) { ${PRODUCT_FIELDS} } }`,
);

export const AdminUpsertCategoryMutation = operation<
  { adminUpsertCategory: { id: string } },
  { input: { id?: string | null; slug: string; name: string; description?: string | null } }
>(
  'AdminUpsertCategory',
  'mutation AdminUpsertCategory($input: CategoryInput!) { adminUpsertCategory(input: $input) { id } }',
);

export interface InventoryRow {
  id: string;
  locationCode: string;
  quantityOnHand: number;
  quantityReserved: number;
  quantityAvailable: number;
  reorderThreshold: number;
  belowThreshold: boolean;
  variant: { id: string; sku: string; color: string; size: SizeSummary };
  product: { id: string; name: string };
}
const INVENTORY_FIELDS = `id locationCode quantityOnHand quantityReserved quantityAvailable reorderThreshold belowThreshold
  variant { id sku color size ${SIZE} } product { id name }`;

export const AdminInventoryQuery = operation<
  { adminInventory: AdminPage<InventoryRow> },
  { belowThresholdOnly?: boolean; page?: PageInput }
>(
  'AdminInventory',
  `query AdminInventory($belowThresholdOnly: Boolean, $page: PageInput) {
    adminInventory(belowThresholdOnly: $belowThresholdOnly, page: $page) { totalCount ${PAGE_INFO} items { ${INVENTORY_FIELDS} } }
  }`,
);

export const AdminAdjustInventoryMutation = operation<
  { adminAdjustInventory: InventoryRow },
  { input: { variantId: string; locationCode: string; onHandDelta: number; note: string } }
>(
  'AdminAdjustInventory',
  `mutation AdminAdjustInventory($input: InventoryAdjustmentInput!) { adminAdjustInventory(input: $input) { ${INVENTORY_FIELDS} } }`,
);

// --- Garments --------------------------------------------------------------------------------

export interface AdminGarment {
  id: string;
  tagCode: string;
  status: GarmentStatus;
  condition: GarmentCondition;
  lifecycleCount: number;
  procuredAt: string;
  lastInspectedAt: string | null;
  allowedNextStatuses: GarmentStatus[];
  variant: { id: string; sku: string; color: string; size: SizeSummary };
  product: { id: string; name: string };
  currentCustomer: { id: string; firstName: string; lastName: string } | null;
}
export interface GarmentEvent {
  id: string;
  eventType: string;
  previousStatus: GarmentStatus | null;
  newStatus: GarmentStatus;
  previousCondition: GarmentCondition | null;
  newCondition: GarmentCondition;
  actorName: string | null;
  occurredAt: string;
}
const GARMENT_FIELDS = `id tagCode status condition lifecycleCount procuredAt lastInspectedAt allowedNextStatuses
  variant { id sku color size ${SIZE} } product { id name } currentCustomer { id firstName lastName }`;
const GARMENT_EVENT_FIELDS =
  'id eventType previousStatus newStatus previousCondition newCondition actorName occurredAt';

export const AdminGarmentsQuery = operation<
  { adminGarments: AdminPage<AdminGarment> },
  { status?: GarmentStatus | null; variantId?: string | null; page?: PageInput }
>(
  'AdminGarments',
  `query AdminGarments($status: GarmentStatus, $variantId: ID, $page: PageInput) {
    adminGarments(status: $status, variantId: $variantId, page: $page) { totalCount ${PAGE_INFO} items { ${GARMENT_FIELDS} } }
  }`,
);

export const AdminGarmentQuery = operation<
  { adminGarment: (AdminGarment & { events: GarmentEvent[] }) | null },
  { id?: string | null; tagCode?: string | null }
>(
  'AdminGarment',
  `query AdminGarment($id: ID, $tagCode: String) {
    adminGarment(id: $id, tagCode: $tagCode) { ${GARMENT_FIELDS} events { ${GARMENT_EVENT_FIELDS} } }
  }`,
);

export const AdminRegisterGarmentsMutation = operation<
  { adminRegisterGarments: { id: string; tagCode: string }[] },
  { variantId: string; quantity: number }
>(
  'AdminRegisterGarments',
  `mutation AdminRegisterGarments($variantId: ID!, $quantity: Int!) {
    adminRegisterGarments(variantId: $variantId, quantity: $quantity) { id tagCode }
  }`,
);

export const AdminTransitionGarmentMutation = operation<
  { adminTransitionGarment: AdminGarment & { events: GarmentEvent[] } },
  {
    input: {
      garmentId: string;
      status: GarmentStatus;
      condition?: GarmentCondition | null;
      note?: string | null;
    };
  }
>(
  'AdminTransitionGarment',
  `mutation AdminTransitionGarment($input: GarmentTransitionInput!) {
    adminTransitionGarment(input: $input) { ${GARMENT_FIELDS} events { ${GARMENT_EVENT_FIELDS} } }
  }`,
);

// --- Orders, deliveries, payments --------------------------------------------------------------

const ORDER_FIELDS = `
  id orderNumber type status placedAt paidAt
  doorPayment { provider maskedMsisdn paid }
  totals { subtotal ${MONEY} discount ${MONEY} creditApplied ${MONEY} shipping ${MONEY} tax ${MONEY} total ${MONEY} }
  items { id productName sku sizeCode color unitPrice ${MONEY} quantity lineTotal ${MONEY} product { slug } }
  shippingAddress { recipientName phone countryCode region district sector street directions }
  deliveryOption { code name fee ${MONEY} estimatedDaysMin estimatedDaysMax }
  delivery { id direction status provider trackingNumber estimatedDeliveryDate deliveredAt events { status note occurredAt } }
  payments { id orderId provider status amount ${MONEY} failureMessage initiatedAt expiresAt completedAt }
  refunds { ${REFUND_FIELDS} }
  statusHistory { status occurredAt }
`;
const CUSTOMER_REF = 'customer { id firstName lastName email phone }';
export interface CustomerRef {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
}

export const AdminOrdersQuery = operation<
  { adminOrders: AdminPage<{ order: OrderDetail; customer: CustomerRef }> },
  { status?: OrderStatus | null; search?: string | null; page?: PageInput }
>(
  'AdminOrders',
  `query AdminOrders($status: OrderStatus, $search: String, $page: PageInput) {
    adminOrders(status: $status, search: $search, page: $page) { totalCount ${PAGE_INFO} items { order { ${ORDER_FIELDS} } ${CUSTOMER_REF} } }
  }`,
);

export const AdminUpdateOrderStatusMutation = operation<
  { adminUpdateOrderStatus: { id: string; status: OrderStatus } },
  { orderId: string; status: OrderStatus; note?: string | null }
>(
  'AdminUpdateOrderStatus',
  `mutation AdminUpdateOrderStatus($orderId: ID!, $status: OrderStatus!, $note: String) {
    adminUpdateOrderStatus(orderId: $orderId, status: $status, note: $note) { id status }
  }`,
);

export interface AdminDelivery {
  delivery: Delivery;
  orderNumber: string | null;
  returnNumber: string | null;
  recipientName: string;
  phone: string;
}

export const AdminDeliveriesQuery = operation<
  { adminDeliveries: AdminPage<AdminDelivery> },
  { status?: DeliveryStatus | null; page?: PageInput }
>(
  'AdminDeliveries',
  `query AdminDeliveries($status: DeliveryStatus, $page: PageInput) {
    adminDeliveries(status: $status, page: $page) {
      totalCount ${PAGE_INFO}
      items { orderNumber returnNumber recipientName phone
        delivery { id direction status provider trackingNumber estimatedDeliveryDate deliveredAt events { status note occurredAt } } }
    }
  }`,
);

export const AdminUpdateDeliveryMutation = operation<
  { adminUpdateDelivery: { id: string; status: DeliveryStatus } },
  {
    input: {
      deliveryId: string;
      status: DeliveryStatus;
      trackingNumber?: string | null;
      estimatedDeliveryDate?: string | null;
      note?: string | null;
    };
  }
>(
  'AdminUpdateDelivery',
  'mutation AdminUpdateDelivery($input: DeliveryUpdateInput!) { adminUpdateDelivery(input: $input) { id status } }',
);

export interface AdminRefund {
  refund: Refund;
  paymentId: string;
  orderId: string | null;
  orderNumber: string | null;
  customer: CustomerRef;
  reason: string;
  failureCode: string | null;
  providerReference: string | null;
  decidedAt: string | null;
}
const ADMIN_REFUND_FIELDS = `refund { ${REFUND_FIELDS} } paymentId orderId orderNumber ${CUSTOMER_REF} reason failureCode providerReference decidedAt`;

/** Payment fields for refunds. `refunds` needs refund:read, so it is only asked for with `$withRefunds`. */
const PAYMENT_REFUND_FIELDS = `refundableAmount ${MONEY} refundMethods refunds @include(if: $withRefunds) { ${ADMIN_REFUND_FIELDS} }`;

export interface AdminPayment {
  payment: Payment;
  customer: CustomerRef;
  providerReference: string | null;
  refundableAmount: Money;
  refundMethods: RefundMethod[];
  /** Present only when asked for with `withRefunds` (needs refund:read). */
  refunds?: AdminRefund[];
  transactions: {
    id: string;
    type: string;
    resultingStatus: PaymentStatus;
    amount: Money;
    createdAt: string;
  }[];
}

export const AdminPaymentsQuery = operation<
  { adminPayments: AdminPage<AdminPayment> },
  { status?: PaymentStatus | null; page?: PageInput; withRefunds: boolean }
>(
  'AdminPayments',
  `query AdminPayments($status: PaymentStatus, $page: PageInput, $withRefunds: Boolean!) {
    adminPayments(status: $status, page: $page) {
      totalCount ${PAGE_INFO}
      items { providerReference ${CUSTOMER_REF} ${PAYMENT_REFUND_FIELDS}
        payment { id orderId provider status amount ${MONEY} failureMessage initiatedAt expiresAt completedAt }
        transactions { id type resultingStatus amount ${MONEY} createdAt } }
    }
  }`,
);

export const AdminReconcilePaymentMutation = operation<
  { adminReconcilePayment: { id: string; status: PaymentStatus } },
  { id: string }
>(
  'AdminReconcilePayment',
  'mutation AdminReconcilePayment($id: ID!) { adminReconcilePayment(id: $id) { id status } }',
);

export const AdminRefundsQuery = operation<
  { adminRefunds: AdminPage<AdminRefund> },
  { status?: RefundStatus | null; page?: PageInput }
>(
  'AdminRefunds',
  `query AdminRefunds($status: RefundStatus, $page: PageInput) {
    adminRefunds(status: $status, page: $page) { totalCount ${PAGE_INFO} items { ${ADMIN_REFUND_FIELDS} } }
  }`,
);

export const AdminRequestRefundMutation = operation<
  { adminRequestRefund: AdminRefund },
  {
    input: {
      idempotencyKey: string;
      paymentId: string;
      amount: number;
      method: RefundMethod;
      reason: string;
    };
  }
>(
  'AdminRequestRefund',
  `mutation AdminRequestRefund($input: RefundInput!) { adminRequestRefund(input: $input) { ${ADMIN_REFUND_FIELDS} } }`,
);

export const AdminApproveRefundMutation = operation<{ adminApproveRefund: AdminRefund }, { id: string }>(
  'AdminApproveRefund',
  `mutation AdminApproveRefund($id: ID!) { adminApproveRefund(id: $id) { ${ADMIN_REFUND_FIELDS} } }`,
);

export const AdminRejectRefundMutation = operation<
  { adminRejectRefund: AdminRefund },
  { id: string; note?: string | null }
>(
  'AdminRejectRefund',
  `mutation AdminRejectRefund($id: ID!, $note: String) { adminRejectRefund(id: $id, note: $note) { ${ADMIN_REFUND_FIELDS} } }`,
);

// --- Subscriptions and plans --------------------------------------------------------------------

export const AdminSubscriptionsQuery = operation<
  {
    adminSubscriptions: AdminPage<{
      renewalAttempts: number;
      customer: CustomerRef;
      subscription: Pick<
        Subscription,
        | 'id'
        | 'status'
        | 'price'
        | 'currentPeriodEnd'
        | 'nextBillingAt'
        | 'cancelAtPeriodEnd'
        | 'createdAt'
        | 'exchangeAllowance'
      > & {
        plan: { name: string };
        babyProfile: { nickname: string };
      };
    }>;
  },
  { status?: SubscriptionStatus | null; page?: PageInput }
>(
  'AdminSubscriptions',
  `query AdminSubscriptions($status: SubscriptionStatus, $page: PageInput) {
    adminSubscriptions(status: $status, page: $page) {
      totalCount ${PAGE_INFO}
      items { renewalAttempts ${CUSTOMER_REF}
        subscription { id status price ${MONEY} currentPeriodEnd nextBillingAt cancelAtPeriodEnd createdAt exchangeAllowance { limit used remaining resetsAt } plan { name } babyProfile { nickname } } }
    }
  }`,
);

export interface AdminPlan {
  id: string;
  code: string;
  name: string;
  description: string;
  billingInterval: BillingInterval;
  price: Money;
  itemsPerCycle: number;
  exchangesPerCycle: number | null;
  allowedCategories: { id: string; name: string }[];
  isActive: boolean;
}

export const AdminSubscriptionPlansQuery = operation<{ adminSubscriptionPlans: AdminPlan[] }>(
  'AdminSubscriptionPlans',
  `query AdminSubscriptionPlans {
    adminSubscriptionPlans { id code name description billingInterval price ${MONEY} itemsPerCycle exchangesPerCycle isActive allowedCategories { id name } }
  }`,
);

export const AdminUpsertSubscriptionPlanMutation = operation<
  { adminUpsertSubscriptionPlan: { id: string } },
  {
    input: {
      id?: string | null;
      code: string;
      name: string;
      description: string;
      billingInterval: BillingInterval;
      priceAmount: number;
      itemsPerCycle: number;
      allowedCategoryIds: string[];
      exchangesPerCycle?: number | null;
      isActive: boolean;
    };
  }
>(
  'AdminUpsertSubscriptionPlan',
  'mutation AdminUpsertSubscriptionPlan($input: SubscriptionPlanInput!) { adminUpsertSubscriptionPlan(input: $input) { id } }',
);

export const AdminCancelSubscriptionMutation = operation<
  { adminCancelSubscription: { id: string; status: SubscriptionStatus } },
  { id: string; reason: string }
>(
  'AdminCancelSubscription',
  'mutation AdminCancelSubscription($id: ID!, $reason: String!) { adminCancelSubscription(id: $id, reason: $reason) { id status } }',
);

// --- Returns and exchanges ----------------------------------------------------------------------

const RETURN_FIELDS = `
  id returnNumber status reason customerNote rejectionReason createdAt completedAt
  pickup { id direction status provider trackingNumber estimatedDeliveryDate deliveredAt events { status note occurredAt } }
  items { id reportedFit inspectedCondition outcome creditEarned ${MONEY}
    garment { id tagCode status color receivedAt size ${SIZE} product { id slug name } } }
`;

export const AdminReturnsQuery = operation<
  { adminReturns: AdminPage<{ returnRequest: ReturnRequest; customer: CustomerRef }> },
  { status?: ReturnStatus | null; page?: PageInput }
>(
  'AdminReturns',
  `query AdminReturns($status: ReturnStatus, $page: PageInput) {
    adminReturns(status: $status, page: $page) { totalCount ${PAGE_INFO} items { returnRequest { ${RETURN_FIELDS} } ${CUSTOMER_REF} } }
  }`,
);

const returnMutation = <V>(name: string, signature: string, call: string) =>
  operation<Record<string, ReturnRequest>, V>(
    name,
    `mutation ${name}${signature} { ${call} { ${RETURN_FIELDS} } }`,
  );

export const AdminApproveReturnMutation = returnMutation<{ id: string }>(
  'AdminApproveReturn',
  '($id: ID!)',
  'adminApproveReturn(id: $id)',
);
export const AdminRejectReturnMutation = returnMutation<{ id: string; reason: string }>(
  'AdminRejectReturn',
  '($id: ID!, $reason: String!)',
  'adminRejectReturn(id: $id, reason: $reason)',
);
export const AdminMarkReturnReceivedMutation = returnMutation<{ id: string }>(
  'AdminMarkReturnReceived',
  '($id: ID!)',
  'adminMarkReturnReceived(id: $id)',
);
export const AdminCompleteReturnMutation = returnMutation<{ id: string }>(
  'AdminCompleteReturn',
  '($id: ID!)',
  'adminCompleteReturn(id: $id)',
);
export const AdminRecordInspectionMutation = returnMutation<{
  input: {
    returnItemId: string;
    condition: GarmentCondition;
    outcome: 'ACCEPTED' | 'REJECTED';
    notes?: string | null;
    garmentStatus: GarmentStatus;
  };
}>('AdminRecordInspection', '($input: InspectionInput!)', 'adminRecordInspection(input: $input)');

const EXCHANGE_FIELDS = `
  id exchangeNumber status createdAt completedAt returnRequest { id returnNumber }
  items { id requestedVariant { id color size ${SIZE} } product { name } }
  replacementOrder { id orderNumber status totals { total ${MONEY} } }
`;

export const AdminExchangesQuery = operation<
  { adminExchanges: AdminPage<{ exchange: Exchange; customer: CustomerRef }> },
  { status?: ExchangeStatus | null; page?: PageInput }
>(
  'AdminExchanges',
  `query AdminExchanges($status: ExchangeStatus, $page: PageInput) {
    adminExchanges(status: $status, page: $page) { totalCount ${PAGE_INFO} items { exchange { ${EXCHANGE_FIELDS} } ${CUSTOMER_REF} } }
  }`,
);

export const AdminApproveExchangeMutation = operation<
  { adminApproveExchange: { id: string; status: ExchangeStatus } },
  { id: string }
>(
  'AdminApproveExchange',
  'mutation AdminApproveExchange($id: ID!) { adminApproveExchange(id: $id) { id status } }',
);

export const AdminRejectExchangeMutation = operation<
  { adminRejectExchange: { id: string; status: ExchangeStatus } },
  { id: string; reason: string }
>(
  'AdminRejectExchange',
  'mutation AdminRejectExchange($id: ID!, $reason: String!) { adminRejectExchange(id: $id, reason: $reason) { id status } }',
);

// --- Promotions, staff, audit -------------------------------------------------------------------

export interface AdminPromotion {
  id: string;
  code: string | null;
  name: string;
  scope: 'ORDER' | 'SUBSCRIPTION';
  discountType: 'PERCENTAGE' | 'FIXED_AMOUNT' | 'FREE_SHIPPING';
  percentBasisPoints: number | null;
  fixedAmount: Money | null;
  minSubtotal: Money;
  maxRedemptions: number | null;
  maxRedemptionsPerUser: number;
  redemptionCount: number;
  startsAt: string;
  endsAt: string | null;
  isActive: boolean;
}
const PROMOTION_FIELDS = `id code name scope discountType percentBasisPoints fixedAmount ${MONEY} minSubtotal ${MONEY}
  maxRedemptions maxRedemptionsPerUser redemptionCount startsAt endsAt isActive`;

export const AdminPromotionsQuery = operation<{ adminPromotions: AdminPromotion[] }>(
  'AdminPromotions',
  `query AdminPromotions { adminPromotions { ${PROMOTION_FIELDS} } }`,
);

export const AdminUpsertPromotionMutation = operation<
  { adminUpsertPromotion: AdminPromotion },
  {
    input: {
      id?: string | null;
      code?: string | null;
      name: string;
      scope: 'ORDER' | 'SUBSCRIPTION';
      discountType: 'PERCENTAGE' | 'FIXED_AMOUNT' | 'FREE_SHIPPING';
      percentBasisPoints?: number | null;
      fixedAmount?: number | null;
      minSubtotalAmount?: number | null;
      maxRedemptions?: number | null;
      maxRedemptionsPerUser?: number | null;
      startsAt: string;
      endsAt?: string | null;
      isActive: boolean;
    };
  }
>(
  'AdminUpsertPromotion',
  `mutation AdminUpsertPromotion($input: PromotionInput!) { adminUpsertPromotion(input: $input) { ${PROMOTION_FIELDS} } }`,
);

export interface StaffRole {
  id: string;
  key: string;
  name: string;
  isSystem: boolean;
  permissions: string[];
}
export interface StaffUser {
  id: string;
  email: string | null;
  firstName: string;
  lastName: string;
  roles: { key: string; name: string }[];
}

export const AdminStaffQuery = operation<{ adminRoles: StaffRole[]; adminStaffUsers: StaffUser[] }>(
  'AdminStaff',
  `query AdminStaff {
    adminRoles { id key name isSystem permissions }
    adminStaffUsers { id email firstName lastName roles { key name } }
  }`,
);

export const AdminAssignRoleMutation = operation<
  { adminAssignRole: StaffUser },
  { userId: string; roleKey: string }
>(
  'AdminAssignRole',
  'mutation AdminAssignRole($userId: ID!, $roleKey: String!) { adminAssignRole(userId: $userId, roleKey: $roleKey) { id email firstName lastName roles { key name } } }',
);

export const AdminRevokeRoleMutation = operation<
  { adminRevokeRole: StaffUser },
  { userId: string; roleKey: string }
>(
  'AdminRevokeRole',
  'mutation AdminRevokeRole($userId: ID!, $roleKey: String!) { adminRevokeRole(userId: $userId, roleKey: $roleKey) { id email firstName lastName roles { key name } } }',
);

export interface AuditEntry {
  id: string;
  actorId: string | null;
  actorName: string | null;
  action: string;
  entityType: string;
  entityId: string;
  previousValue: string | null;
  newValue: string | null;
  ipAddress: string | null;
  createdAt: string;
}

export const AdminAuditLogsQuery = operation<
  { adminAuditLogs: { items: AuditEntry[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } } },
  { entityType?: string | null; entityId?: string | null; page?: PageInput }
>(
  'AdminAuditLogs',
  `query AdminAuditLogs($entityType: String, $entityId: String, $page: PageInput) {
    adminAuditLogs(entityType: $entityType, entityId: $entityId, page: $page) {
      ${PAGE_INFO} items { id actorId actorName action entityType entityId previousValue newValue ipAddress createdAt }
    }
  }`,
);

export const AdminReturnQuery = operation<
  { adminReturn: { returnRequest: ReturnRequest; customer: CustomerRef } | null },
  { id: string }
>(
  'AdminReturn',
  `query AdminReturn($id: ID!) { adminReturn(id: $id) { returnRequest { ${RETURN_FIELDS} } ${CUSTOMER_REF} } }`,
);

/** Pay on delivery: the courier is at the door, so ask the customer's chosen wallet for the order's total. */
export const AdminRequestDoorPaymentMutation = operation<
  { adminRequestDoorPayment: Pick<Payment, 'id' | 'status' | 'provider' | 'amount'> },
  { orderId: string }
>(
  'AdminRequestDoorPayment',
  `mutation AdminRequestDoorPayment($orderId: ID!) { adminRequestDoorPayment(orderId: $orderId) { id status provider amount ${MONEY} } }`,
);

export const AdminOrderQuery = operation<
  {
    adminOrder: {
      order: OrderDetail;
      customer: CustomerRef;
      payments: Pick<AdminPayment, 'payment' | 'refundableAmount' | 'refundMethods' | 'refunds'>[];
    } | null;
  },
  { id: string; withRefunds: boolean }
>(
  'AdminOrder',
  `query AdminOrder($id: ID!, $withRefunds: Boolean!) { adminOrder(id: $id) { order { ${ORDER_FIELDS} } ${CUSTOMER_REF}
    payments { payment { id orderId provider status amount ${MONEY} failureMessage initiatedAt expiresAt completedAt } ${PAYMENT_REFUND_FIELDS} } } }`,
);
