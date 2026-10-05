import { operation } from '../client';
import type { Money, SizeSummary } from './catalogue';

export interface CartLine {
  id: string;
  quantity: number;
  lineTotal: Money;
  variant: { id: string; sku: string; color: string; inStock: boolean; price: Money; size: SizeSummary };
  product: { id: string; slug: string; name: string; images: { url: string; altText: string }[] };
}

export interface Cart {
  id: string;
  itemCount: number;
  subtotal: Money;
  items: CartLine[];
}

const CART_FIELDS = `
  id itemCount subtotal { amount currency }
  items {
    id quantity lineTotal { amount currency }
    variant { id sku color inStock price { amount currency } size { code label sortOrder } }
    product { id slug name images { url altText } }
  }
`;

export const MyCartQuery = operation<{ myCart: Cart | null }>(
  'MyCart',
  `query MyCart { myCart { ${CART_FIELDS} } }`,
);

export const AddToCartMutation = operation<{ addToCart: Cart }, { variantId: string; quantity?: number }>(
  'AddToCart',
  `mutation AddToCart($variantId: ID!, $quantity: Int) { addToCart(variantId: $variantId, quantity: $quantity) { ${CART_FIELDS} } }`,
);

export const UpdateCartItemMutation = operation<
  { updateCartItem: Cart },
  { itemId: string; quantity: number }
>(
  'UpdateCartItem',
  `mutation UpdateCartItem($itemId: ID!, $quantity: Int!) { updateCartItem(itemId: $itemId, quantity: $quantity) { ${CART_FIELDS} } }`,
);

export const RemoveFromCartMutation = operation<{ removeFromCart: Cart }, { itemId: string }>(
  'RemoveFromCart',
  `mutation RemoveFromCart($itemId: ID!) { removeFromCart(itemId: $itemId) { ${CART_FIELDS} } }`,
);

export interface DeliveryOption {
  code: string;
  name: string;
  fee: Money;
  estimatedDaysMin: number;
  estimatedDaysMax: number;
}
const DELIVERY_OPTION_FIELDS = 'code name fee { amount currency } estimatedDaysMin estimatedDaysMax';

export const DeliveryOptionsQuery = operation<{ deliveryOptions: DeliveryOption[] }>(
  'DeliveryOptions',
  `query DeliveryOptions { deliveryOptions { ${DELIVERY_OPTION_FIELDS} } }`,
);

export interface OrderTotals {
  subtotal: Money;
  discount: Money;
  creditApplied: Money;
  shipping: Money;
  tax: Money;
  total: Money;
}
const MONEY = '{ amount currency }';
const TOTALS_FIELDS = `subtotal ${MONEY} discount ${MONEY} creditApplied ${MONEY} shipping ${MONEY} tax ${MONEY} total ${MONEY}`;

export interface CheckoutInput {
  shippingAddressId: string;
  deliveryOptionCode: string;
  promotionCode?: string | null;
  applyExchangeCredit?: boolean;
}

export const CheckoutPreviewQuery = operation<
  { checkoutPreview: { totals: OrderTotals; promotionError: string | null; availableCredit: Money } },
  { input: CheckoutInput }
>(
  'CheckoutPreview',
  `query CheckoutPreview($input: CheckoutInput!) {
    checkoutPreview(input: $input) { totals { ${TOTALS_FIELDS} } promotionError availableCredit ${MONEY} }
  }`,
);

export type OrderStatus =
  | 'PENDING_PAYMENT'
  | 'PAID'
  | 'PROCESSING'
  | 'PACKED'
  | 'READY_FOR_DISPATCH'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'CANCELLED'
  | 'RETURN_REQUESTED'
  | 'RETURNED';
export type PaymentStatus =
  'INITIATED' | 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED' | 'EXPIRED' | 'REFUNDED';
export type DeliveryStatus =
  'PENDING' | 'ASSIGNED' | 'PICKED_UP' | 'IN_TRANSIT' | 'DELIVERED' | 'FAILED' | 'CANCELLED';
export type PaymentProvider = 'MTN_MOMO' | 'AIRTEL_MONEY' | 'CARD' | 'MOCK';

export interface Payment {
  id: string;
  orderId: string | null;
  provider: PaymentProvider;
  status: PaymentStatus;
  amount: Money;
  failureMessage: string | null;
  initiatedAt: string;
  expiresAt: string | null;
  completedAt: string | null;
}
const PAYMENT_FIELDS = `id orderId provider status amount ${MONEY} failureMessage initiatedAt expiresAt completedAt`;

export type RefundStatus = 'REQUESTED' | 'APPROVED' | 'REJECTED' | 'PROCESSING' | 'SUCCEEDED' | 'FAILED';
export type RefundMethod = 'PROVIDER' | 'CREDIT';

/** Money given back for a payment, as the customer sees it. */
export interface Refund {
  id: string;
  status: RefundStatus;
  method: RefundMethod;
  amount: Money;
  requestedAt: string;
  completedAt: string | null;
}
export const REFUND_FIELDS = `id status method amount ${MONEY} requestedAt completedAt`;

export interface OrderSummary {
  id: string;
  orderNumber: string;
  type: 'ONE_TIME' | 'SUBSCRIPTION_CYCLE' | 'EXCHANGE_REPLACEMENT';
  status: OrderStatus;
  placedAt: string;
  totals: { total: Money };
  items: { id: string }[];
}

export interface Delivery {
  id: string;
  direction: 'OUTBOUND' | 'RETURN_PICKUP';
  status: DeliveryStatus;
  provider: string;
  trackingNumber: string | null;
  estimatedDeliveryDate: string | null;
  deliveredAt: string | null;
  events: { status: DeliveryStatus; note: string | null; occurredAt: string }[];
}
const DELIVERY_FIELDS =
  'id direction status provider trackingNumber estimatedDeliveryDate deliveredAt events { status note occurredAt }';

export interface OrderDetail extends Omit<OrderSummary, 'totals' | 'items'> {
  paidAt: string | null;
  totals: OrderTotals;
  items: {
    id: string;
    productName: string;
    sku: string;
    sizeCode: string;
    color: string;
    unitPrice: Money;
    quantity: number;
    lineTotal: Money;
    product: { slug: string } | null;
  }[];
  shippingAddress: {
    recipientName: string;
    phone: string;
    countryCode: string;
    region: string | null;
    district: string | null;
    sector: string | null;
    street: string | null;
    directions: string | null;
  };
  deliveryOption: DeliveryOption | null;
  delivery: Delivery | null;
  payments: Payment[];
  refunds: Refund[];
  statusHistory: { status: OrderStatus; occurredAt: string }[];
}

const ORDER_DETAIL_FIELDS = `
  id orderNumber type status placedAt paidAt
  totals { ${TOTALS_FIELDS} }
  items { id productName sku sizeCode color unitPrice ${MONEY} quantity lineTotal ${MONEY} product { slug } }
  shippingAddress { recipientName phone countryCode region district sector street directions }
  deliveryOption { ${DELIVERY_OPTION_FIELDS} }
  delivery { ${DELIVERY_FIELDS} }
  payments { ${PAYMENT_FIELDS} }
  refunds { ${REFUND_FIELDS} }
  statusHistory { status occurredAt }
`;

export const CreateOrderMutation = operation<
  { createOrder: OrderDetail },
  { input: { idempotencyKey: string; checkout: CheckoutInput } }
>(
  'CreateOrder',
  `mutation CreateOrder($input: CreateOrderInput!) { createOrder(input: $input) { ${ORDER_DETAIL_FIELDS} } }`,
);

export const MyOrdersQuery = operation<
  {
    myOrders: {
      edges: { node: OrderSummary }[];
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
    };
  },
  { first?: number; after?: string }
>(
  'MyOrders',
  `query MyOrders($first: Int, $after: String) {
    myOrders(first: $first, after: $after) {
      edges { node { id orderNumber type status placedAt totals { total ${MONEY} } items { id } } }
      pageInfo { hasNextPage endCursor }
    }
  }`,
);

export const OrderQuery = operation<{ order: OrderDetail | null }, { id: string }>(
  'Order',
  `query Order($id: ID!) { order(id: $id) { ${ORDER_DETAIL_FIELDS} } }`,
);

export const CancelOrderMutation = operation<{ cancelOrder: OrderDetail }, { id: string }>(
  'CancelOrder',
  `mutation CancelOrder($id: ID!) { cancelOrder(id: $id) { ${ORDER_DETAIL_FIELDS} } }`,
);

export const InitiatePaymentMutation = operation<
  { initiatePayment: Payment },
  {
    input: {
      idempotencyKey: string;
      orderId: string;
      provider: PaymentProvider;
      msisdn?: string | null;
      paymentMethodId?: string | null;
    };
  }
>(
  'InitiatePayment',
  `mutation InitiatePayment($input: InitiatePaymentInput!) { initiatePayment(input: $input) { ${PAYMENT_FIELDS} } }`,
);

export const PaymentQuery = operation<{ payment: Payment | null }, { id: string }>(
  'Payment',
  `query Payment($id: ID!) { payment(id: $id) { ${PAYMENT_FIELDS} } }`,
);

export interface PaymentMethod {
  id: string;
  provider: PaymentProvider;
  maskedMsisdn: string | null;
  label: string | null;
  isDefault: boolean;
}
const PAYMENT_METHOD_FIELDS = 'id provider maskedMsisdn label isDefault';

export const MyPaymentMethodsQuery = operation<{ myPaymentMethods: PaymentMethod[] }>(
  'MyPaymentMethods',
  `query MyPaymentMethods { myPaymentMethods { ${PAYMENT_METHOD_FIELDS} } }`,
);

export const AddPaymentMethodMutation = operation<
  { addPaymentMethod: PaymentMethod },
  { input: { provider: PaymentProvider; msisdn: string; label?: string | null; isDefault?: boolean | null } }
>(
  'AddPaymentMethod',
  `mutation AddPaymentMethod($input: PaymentMethodInput!) { addPaymentMethod(input: $input) { ${PAYMENT_METHOD_FIELDS} } }`,
);

export const RemovePaymentMethodMutation = operation<{ removePaymentMethod: boolean }, { id: string }>(
  'RemovePaymentMethod',
  'mutation RemovePaymentMethod($id: ID!) { removePaymentMethod(id: $id) }',
);

export const ApplyExchangeCreditMutation = operation<
  { applyExchangeCredit: OrderDetail },
  { orderId: string }
>(
  'ApplyExchangeCredit',
  `mutation ApplyExchangeCredit($orderId: ID!) { applyExchangeCredit(orderId: $orderId) { ${ORDER_DETAIL_FIELDS} } }`,
);
