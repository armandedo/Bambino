import { ApiError } from '@bambino/api-client';
import type { NotificationType } from '@bambino/types';

/**
 * English text for the keys the API and the shared validation package return. Translations to Kinyarwanda
 * and French will be added as message files with the same keys (open question on launch languages).
 */
const VALIDATION: Record<string, string> = {
  'validation.email.invalid': 'Enter a valid email address.',
  'validation.email.too_long': 'That email address is too long.',
  'validation.password.too_short': 'Use at least 10 characters.',
  'validation.password.too_long': 'Use at most 128 characters.',
  'validation.password.too_common': 'That password is too common. Choose another.',
  'validation.phone.invalid': 'Enter the number with its country code, for example +250 78 000 0000.',
  'validation.name.required': 'This is required.',
  'validation.name.too_long': 'This is too long.',
  'validation.address.field_required': 'This is required.',
  'validation.address.unsupported_country': 'We do not deliver to this country yet.',
  'validation.consent.required.TERMS_OF_SERVICE': 'You need to accept the terms of service.',
  'validation.consent.required.PRIVACY_POLICY': 'You need to accept the privacy policy.',
  'validation.consent.required.CHILD_DATA_PROCESSING': 'You need to agree to how we use your baby’s details.',
  'validation.token.invalid': 'This link is not valid. Request a new one.',
};

export function validationMessage(key: string | undefined): string | undefined {
  if (!key) return undefined;
  return VALIDATION[key] ?? 'Check this value.';
}

/** A sentence to show for a failed request. API messages are written for customers; internal ones are not shown. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'NETWORK') return 'We could not reach Bambino. Check your connection and try again.';
    if (error.code === 'INTERNAL') return 'Something went wrong on our side. Please try again.';
    if (error.code === 'RATE_LIMITED') return 'Too many attempts. Please wait a minute and try again.';
    if (error.code === 'UNAUTHENTICATED') return 'Please sign in again.';
    return error.message;
  }
  return 'Something went wrong. Please try again.';
}

/** Field errors from the API, keyed by the field's last path segment. */
export function fieldErrors(error: unknown): Record<string, string> {
  const result: Record<string, string> = {};
  if (error instanceof ApiError) {
    for (const item of error.fieldErrors) {
      const field = item.path.split('.').at(-1) ?? item.path;
      result[field] = validationMessage(item.message) ?? item.message;
    }
  }
  return result;
}

const SIZING_REASONS: Record<string, (p: Record<string, string>) => string> = {
  'sizing.reason.height_and_weight_agree': (p) => `Height and weight both fit size ${p.size}.`,
  'sizing.reason.measurements_disagree': (p) =>
    `Height suggests ${p.byHeight} and weight suggests ${p.byWeight}, so we chose the larger one.`,
  'sizing.reason.height_in_range': (p) => `Height is within the range for ${p.size}.`,
  'sizing.reason.weight_in_range': (p) => `Weight is within the range for ${p.size}.`,
  'sizing.reason.age_in_range': (p) => `Age is within the range for ${p.size}.`,
  'sizing.reason.age_only': (p) =>
    `Based on age only (${p.size}). Adding height and weight makes this more accurate.`,
  'sizing.reason.measurement_stale': (p) =>
    `The latest measurement is ${p.days} days old. A new one would make this more accurate.`,
  'sizing.reason.fit_preference_roomy': (p) => `You prefer a roomy fit, so we moved up to ${p.size}.`,
  'sizing.reason.history_too_small': (p) =>
    `Earlier ${p.from} pieces came back too small, so we suggest ${p.size}.`,
  'sizing.reason.history_too_large': (p) =>
    `Earlier ${p.from} pieces came back too large, so we suggest ${p.size}.`,
  'sizing.reason.next_size': (p) => `Next size: ${p.size}.`,
  'sizing.reason.next_size_in_days': (p) => `Your baby will probably need ${p.size} in about ${p.days} days.`,
};

export function sizingReason(reason: { key: string; params: { name: string; value: string }[] }): string {
  const params = Object.fromEntries(reason.params.map((p) => [p.name, p.value]));
  return SIZING_REASONS[reason.key]?.(params) ?? reason.key;
}

/** Confidence is a number from the engine; customers see it in words. */
export function confidenceWords(confidence: number): string {
  if (confidence >= 0.8) return 'We’re confident';
  if (confidence >= 0.55) return 'We’re fairly sure';
  return 'This is a starting point';
}

const NOTIFICATIONS: Record<NotificationType, string> = {
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
  return (NOTIFICATIONS as Record<string, string>)[type] ?? type.toLowerCase().replaceAll('_', ' ');
}

export function formatDate(iso: string | null | undefined, withTime = false): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
    timeZone: 'Africa/Kigali',
  }).format(new Date(iso));
}
