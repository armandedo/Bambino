import { ApiError } from '@bambino/api-client';

/** A sentence for a failed request. API messages are written to be shown; internal failures are not. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'NETWORK') return 'Could not reach the Bambino API.';
    if (error.code === 'INTERNAL')
      return 'Something went wrong on the server. Try again, or give support the reference.';
    if (error.code === 'FORBIDDEN') return 'Your role does not allow this.';
    if (error.code === 'RATE_LIMITED') return 'Too many attempts. Wait a minute and try again.';
    return error.message;
  }
  return error instanceof Error ? error.message : 'Something went wrong.';
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

export function percent(value: number | null): string {
  return value === null ? '—' : `${(value * 100).toFixed(1)}%`;
}

export function fullName(person: { firstName: string; lastName: string } | null | undefined): string {
  return person ? `${person.firstName} ${person.lastName}` : '—';
}
