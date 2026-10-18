import { CASH_ON_DELIVERY_POLICY } from '@bambino/config';
import type { OrderType } from '@bambino/types';

export type CashOnDeliveryAvailability =
  | { available: true }
  | {
      available: false;
      code: 'DISABLED' | 'ORDER_TYPE' | 'NOTHING_TO_PAY' | 'OVER_LIMIT';
      message: string;
    };

/**
 * Whether an order of this type and total can be paid in cash on delivery. A pure rule over CASH_ON_DELIVERY_POLICY,
 * used both to quote it at checkout and to enforce it when the order is confirmed.
 */
export function cashOnDeliveryAvailability(
  order: { type: OrderType; totalAmount: number },
  policy: typeof CASH_ON_DELIVERY_POLICY = CASH_ON_DELIVERY_POLICY,
): CashOnDeliveryAvailability {
  if (!policy.enabled) {
    return { available: false, code: 'DISABLED', message: 'Pay on delivery is not available right now.' };
  }
  if (!policy.orderTypes.includes(order.type)) {
    return {
      available: false,
      code: 'ORDER_TYPE',
      message: 'Pay on delivery is available for shop orders only.',
    };
  }
  if (order.totalAmount <= 0) {
    return { available: false, code: 'NOTHING_TO_PAY', message: 'There is nothing to pay on delivery.' };
  }
  if (policy.maxOrderAmount !== null && order.totalAmount > policy.maxOrderAmount) {
    return {
      available: false,
      code: 'OVER_LIMIT',
      message: 'This order is above the pay on delivery limit. Please pay with mobile money.',
    };
  }
  return { available: true };
}
