import type {
  DeliveryStatus,
  ExchangeStatus,
  GarmentStatus,
  OrderStatus,
  PaymentStatus,
  RefundStatus,
  ReturnStatus,
  SubscriptionStatus,
} from '@bambino/types';
import { defineStateMachine } from './state-machine';

/**
 * CANCELLED = ended by the customer or staff. EXPIRED = lapsed because payment never
 * arrived (first payment never completed, or renewal retries ran out).
 */
export const subscriptionLifecycle = defineStateMachine<SubscriptionStatus>('Subscription', 'PENDING', {
  PENDING: ['ACTIVE', 'CANCELLED', 'EXPIRED'],
  ACTIVE: ['PAUSED', 'PAST_DUE', 'CANCELLED'],
  PAUSED: ['ACTIVE', 'CANCELLED'],
  PAST_DUE: ['ACTIVE', 'CANCELLED', 'EXPIRED'],
  CANCELLED: [],
  EXPIRED: [],
});

export const orderLifecycle = defineStateMachine<OrderStatus>('Order', 'PENDING_PAYMENT', {
  // CONFIRMED = accepted with cash to be collected on delivery; it is prepared like a paid order.
  PENDING_PAYMENT: ['PAID', 'CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['PROCESSING', 'CANCELLED'],
  PAID: ['PROCESSING', 'CANCELLED'],
  PROCESSING: ['PACKED', 'CANCELLED'],
  PACKED: ['READY_FOR_DISPATCH', 'CANCELLED'],
  READY_FOR_DISPATCH: ['OUT_FOR_DELIVERY', 'CANCELLED'],
  // Back to READY_FOR_DISPATCH when a delivery attempt fails and must be rescheduled.
  OUT_FOR_DELIVERY: ['DELIVERED', 'READY_FOR_DISPATCH'],
  DELIVERED: ['RETURN_REQUESTED'],
  // Back to DELIVERED when the return is rejected.
  RETURN_REQUESTED: ['RETURNED', 'DELIVERED'],
  RETURNED: [],
  CANCELLED: [],
});

/**
 * Every payment passes through PENDING: success is only ever recorded from a provider
 * confirmation (webhook, status poll or reconciliation), never from the initiation call.
 */
export const paymentLifecycle = defineStateMachine<PaymentStatus>('Payment', 'INITIATED', {
  INITIATED: ['PENDING', 'FAILED', 'CANCELLED'],
  PENDING: ['SUCCEEDED', 'FAILED', 'CANCELLED', 'EXPIRED'],
  SUCCEEDED: ['REFUNDED'],
  FAILED: [],
  CANCELLED: [],
  EXPIRED: [],
  REFUNDED: [],
});

/**
 * A refund waits for staff approval, then the provider (or the credit ledger) pays it out. FAILED is final:
 * staff request a new refund for what is still refundable.
 */
export const refundLifecycle = defineStateMachine<RefundStatus>('Refund', 'REQUESTED', {
  REQUESTED: ['APPROVED', 'REJECTED'],
  APPROVED: ['PROCESSING'],
  PROCESSING: ['SUCCEEDED', 'FAILED'],
  REJECTED: [],
  SUCCEEDED: [],
  FAILED: [],
});

export const returnLifecycle = defineStateMachine<ReturnStatus>('Return', 'REQUESTED', {
  REQUESTED: ['APPROVED', 'REJECTED'],
  // Straight to RECEIVED when the customer hands the garments over in person.
  APPROVED: ['IN_TRANSIT', 'RECEIVED'],
  IN_TRANSIT: ['RECEIVED'],
  RECEIVED: ['INSPECTING'],
  INSPECTING: ['ACCEPTED', 'REJECTED'],
  ACCEPTED: ['REFURBISHING', 'COMPLETED'],
  REFURBISHING: ['COMPLETED'],
  REJECTED: [],
  COMPLETED: [],
});

/**
 * AVAILABLE = new, never worn. AVAILABLE_FOR_REUSE = passed inspection after at least
 * one customer. A released reservation returns to whichever of the two it came from.
 */
export const garmentLifecycle = defineStateMachine<GarmentStatus>('Garment', 'PROCURED', {
  PROCURED: ['AVAILABLE', 'RETIRED'],
  AVAILABLE: ['RESERVED', 'RESALE', 'RETIRED'],
  RESERVED: ['WITH_CUSTOMER', 'AVAILABLE', 'AVAILABLE_FOR_REUSE'],
  // RETIRED from here covers a garment that is lost or never comes back.
  WITH_CUSTOMER: ['RETURN_REQUESTED', 'RETIRED'],
  // Back to WITH_CUSTOMER when the return is rejected.
  RETURN_REQUESTED: ['RETURNED', 'WITH_CUSTOMER'],
  RETURNED: ['INSPECTION'],
  INSPECTION: ['AVAILABLE_FOR_REUSE', 'REFURBISHING', 'RESALE', 'RECYCLE'],
  REFURBISHING: ['AVAILABLE_FOR_REUSE', 'RESALE', 'RECYCLE'],
  AVAILABLE_FOR_REUSE: ['RESERVED', 'RESALE', 'RECYCLE'],
  RESALE: ['RETIRED'],
  RECYCLE: ['RETIRED'],
  RETIRED: [],
});

export const deliveryLifecycle = defineStateMachine<DeliveryStatus>('Delivery', 'PENDING', {
  PENDING: ['ASSIGNED', 'CANCELLED'],
  ASSIGNED: ['PICKED_UP', 'CANCELLED'],
  PICKED_UP: ['IN_TRANSIT'],
  IN_TRANSIT: ['DELIVERED', 'FAILED'],
  // A failed attempt can be reassigned for another try.
  FAILED: ['ASSIGNED', 'CANCELLED'],
  DELIVERED: [],
  CANCELLED: [],
});

export const exchangeLifecycle = defineStateMachine<ExchangeStatus>('Exchange', 'REQUESTED', {
  REQUESTED: ['APPROVED', 'REJECTED', 'CANCELLED'],
  APPROVED: ['FULFILLING', 'CANCELLED'],
  FULFILLING: ['COMPLETED'],
  COMPLETED: [],
  REJECTED: [],
  CANCELLED: [],
});
