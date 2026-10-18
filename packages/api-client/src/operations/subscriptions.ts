import { operation } from '../client';
import type { BillingInterval, Money, SizeSummary } from './catalogue';
import type { OrderStatus } from './commerce';

export type SubscriptionStatus = 'PENDING' | 'ACTIVE' | 'PAUSED' | 'PAST_DUE' | 'CANCELLED' | 'EXPIRED';

export interface Subscription {
  id: string;
  status: SubscriptionStatus;
  plan: {
    id: string;
    code: string;
    name: string;
    billingInterval: BillingInterval;
    itemsPerCycle: number;
    exchangesPerCycle: number | null;
    price: Money;
  };
  pendingPlan: { id: string; name: string } | null;
  babyProfile: { id: string; nickname: string };
  price: Money;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  nextBillingAt: string | null;
  cancelAtPeriodEnd: boolean;
  pausedAt: string | null;
  resumeAt: string | null;
  items: {
    id: string;
    cycleNumber: number;
    status: 'SELECTED' | 'SHIPPED' | 'WITH_CUSTOMER' | 'RETURNED';
    garmentTagCode: string | null;
    variant: { id: string; color: string; size: SizeSummary };
    product: { id: string; slug: string; name: string };
  }[];
  orderAwaitingPayment: {
    id: string;
    orderNumber: string;
    status: OrderStatus;
    totals: { total: Money };
  } | null;
  history: { type: string; status: SubscriptionStatus; occurredAt: string }[];
  canPause: boolean;
  canResume: boolean;
  canCancel: boolean;
  /** Swaps in the current billing period: one swap is one garment returned and one received. */
  exchangeAllowance: {
    /** Swaps the plan includes per period; null means unlimited. */
    limit: number | null;
    used: number;
    /** Null when unlimited. */
    remaining: number | null;
    /** When the count restarts: the end of the current period. */
    resetsAt: string | null;
  };
  createdAt: string;
}

const MONEY = '{ amount currency }';
const SUBSCRIPTION_FIELDS = `
  id status price ${MONEY} currentPeriodStart currentPeriodEnd nextBillingAt cancelAtPeriodEnd pausedAt resumeAt
  canPause canResume canCancel createdAt
  exchangeAllowance { limit used remaining resetsAt }
  plan { id code name billingInterval itemsPerCycle exchangesPerCycle price ${MONEY} }
  pendingPlan { id name }
  babyProfile { id nickname }
  items { id cycleNumber status garmentTagCode variant { id color size { code label sortOrder } } product { id slug name } }
  orderAwaitingPayment { id orderNumber status totals { total ${MONEY} } }
  history { type status occurredAt }
`;

export const MySubscriptionsQuery = operation<{ mySubscriptions: Subscription[] }>(
  'MySubscriptions',
  `query MySubscriptions { mySubscriptions { ${SUBSCRIPTION_FIELDS} } }`,
);

export const CreateSubscriptionMutation = operation<
  { createSubscription: Subscription },
  {
    input: {
      idempotencyKey: string;
      planId: string;
      babyProfileId: string;
      shippingAddressId: string;
      deliveryOptionCode: string;
      promotionCode?: string | null;
      paymentMethodId?: string | null;
    };
  }
>(
  'CreateSubscription',
  `mutation CreateSubscription($input: CreateSubscriptionInput!) { createSubscription(input: $input) { ${SUBSCRIPTION_FIELDS} } }`,
);

export const SelectSubscriptionItemsMutation = operation<
  { selectSubscriptionItems: Subscription },
  { id: string; variantIds: string[] }
>(
  'SelectSubscriptionItems',
  `mutation SelectSubscriptionItems($id: ID!, $variantIds: [ID!]!) {
    selectSubscriptionItems(id: $id, variantIds: $variantIds) { ${SUBSCRIPTION_FIELDS} }
  }`,
);

export const PauseSubscriptionMutation = operation<
  { pauseSubscription: Subscription },
  { id: string; resumeAt?: string | null }
>(
  'PauseSubscription',
  `mutation PauseSubscription($id: ID!, $resumeAt: DateTime) { pauseSubscription(id: $id, resumeAt: $resumeAt) { ${SUBSCRIPTION_FIELDS} } }`,
);

export const ResumeSubscriptionMutation = operation<{ resumeSubscription: Subscription }, { id: string }>(
  'ResumeSubscription',
  `mutation ResumeSubscription($id: ID!) { resumeSubscription(id: $id) { ${SUBSCRIPTION_FIELDS} } }`,
);

export const CancelSubscriptionMutation = operation<
  { cancelSubscription: Subscription },
  { id: string; reason?: string | null; immediately?: boolean }
>(
  'CancelSubscription',
  `mutation CancelSubscription($id: ID!, $reason: String, $immediately: Boolean) {
    cancelSubscription(id: $id, reason: $reason, immediately: $immediately) { ${SUBSCRIPTION_FIELDS} }
  }`,
);

export const ChangeSubscriptionPlanMutation = operation<
  { changeSubscriptionPlan: Subscription },
  { id: string; planId: string }
>(
  'ChangeSubscriptionPlan',
  `mutation ChangeSubscriptionPlan($id: ID!, $planId: ID!) { changeSubscriptionPlan(id: $id, planId: $planId) { ${SUBSCRIPTION_FIELDS} } }`,
);
