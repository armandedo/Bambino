import { ApiError } from '@bambino/api-client';
import { randomUUID } from 'expo-crypto';

/** A sentence a person can act on, from whatever a request threw. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'NETWORK') return 'We could not reach Bambino. Check your connection and try again.';
    if (error.code === 'RATE_LIMITED') return 'Too many attempts. Please wait a moment and try again.';
    if (error.code === 'UNAUTHENTICATED') return 'Please sign in again.';
    return error.message;
  }
  return 'Something went wrong. Please try again.';
}

/** Per-field problems from the API keyed by field name, with the translation key made readable. */
export function fieldProblems(error: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (error instanceof ApiError) {
    for (const item of error.fieldErrors) {
      const last = item.message.split('.').slice(-1)[0] ?? 'invalid';
      out[item.path] = last.replace(/_/g, ' ');
    }
  }
  return out;
}

export function newIdempotencyKey(): string {
  return randomUUID();
}
