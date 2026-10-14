/** Plain-language labels for statuses and notifications (same wording as the website). */

const NOTIFICATIONS: Record<string, string> = {
  ACCOUNT_CREATED: 'Welcome to Bambino.',
  PAYMENT_SUCCEEDED: 'Payment received.',
  PAYMENT_FAILED: 'A payment did not go through.',
  SUBSCRIPTION_STARTED: 'Your subscription has started.',
  SUBSCRIPTION_RENEWED: 'Your subscription renewed.',
  SUBSCRIPTION_RENEWAL_REMINDER: 'Your subscription renews soon.',
  ORDER_CONFIRMED: 'Your order is confirmed.',
  ORDER_SHIPPED: 'Your order is on its way.',
  ORDER_DELIVERED: 'Your order was delivered.',
  RETURN_APPROVED: 'Your return was approved.',
  RETURN_RECEIVED: 'We received your return.',
  EXCHANGE_APPROVED: 'Your exchange was approved.',
  EXCHANGE_COMPLETED: 'Your exchange is complete.',
  REFUND_SUCCEEDED: 'Your refund has been paid.',
  REFUND_REJECTED: 'We could not approve a refund. Please contact us.',
};

export function notificationText(type: string): string {
  return NOTIFICATIONS[type] ?? type.toLowerCase().replaceAll('_', ' ');
}

const SUBSCRIPTION_STATUS: Record<string, string> = {
  PENDING: 'Waiting for payment',
  ACTIVE: 'Active',
  PAUSED: 'Paused',
  PAST_DUE: 'Payment overdue',
  CANCELLED: 'Cancelled',
  EXPIRED: 'Expired',
};

export function subscriptionStatusLabel(status: string): string {
  return SUBSCRIPTION_STATUS[status] ?? status;
}

const RETURN_STATUS: Record<string, string> = {
  REQUESTED: 'Requested',
  APPROVED: 'Approved, pickup being arranged',
  IN_TRANSIT: 'On its way back to us',
  RECEIVED: 'Received',
  INSPECTING: 'Being checked',
  ACCEPTED: 'Accepted',
  REJECTED: 'Not accepted',
  REFURBISHING: 'Being refreshed',
  COMPLETED: 'Complete',
};

export function returnStatusLabel(status: string): string {
  return RETURN_STATUS[status] ?? status;
}

const EXCHANGE_STATUS: Record<string, string> = {
  REQUESTED: 'Requested',
  APPROVED: 'Approved',
  FULFILLING: 'Being prepared',
  COMPLETED: 'Complete',
  REJECTED: 'Not approved',
  CANCELLED: 'Cancelled',
};

export function exchangeStatusLabel(status: string): string {
  return EXCHANGE_STATUS[status] ?? status;
}

export const RETURN_REASONS = [
  { code: 'OUTGROWN', label: 'Outgrown' },
  { code: 'WRONG_SIZE', label: 'Wrong size' },
  { code: 'DEFECTIVE', label: 'Damaged or faulty' },
  { code: 'NOT_AS_EXPECTED', label: 'Not as expected' },
  { code: 'OTHER', label: 'Other' },
] as const;
