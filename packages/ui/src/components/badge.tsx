import type {
  DataRequestStatus,
  DeliveryStatus,
  ExchangeStatus,
  GarmentStatus,
  OrderStatus,
  PaymentStatus,
  ReturnStatus,
  SubscriptionStatus,
} from '@bambino/types';
import type { ReactNode } from 'react';
import { cn } from './cn';

export type Tone = 'neutral' | 'brand' | 'accent' | 'success' | 'warning' | 'danger' | 'info';

const TONES: Record<Tone, string> = {
  neutral: 'bg-surface-muted text-foreground border-border',
  brand: 'bg-primary-soft text-primary-soft-foreground border-brand-200',
  accent: 'bg-accent-soft text-accent-soft-foreground border-accent-200',
  success: 'bg-success-soft text-success-foreground border-success-border',
  warning: 'bg-warning-soft text-warning-foreground border-warning-border',
  danger: 'bg-danger-soft text-danger-foreground border-danger-border',
  info: 'bg-info-soft text-info-foreground border-info-border',
};

export interface BadgeProps {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}

export function Badge({ tone = 'neutral', children, className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[0.7rem] font-medium tracking-[0.08em] whitespace-nowrap uppercase',
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export type DomainStatus =
  | OrderStatus
  | PaymentStatus
  | SubscriptionStatus
  | DeliveryStatus
  | ReturnStatus
  | ExchangeStatus
  | GarmentStatus
  | DataRequestStatus;

/**
 * Tone for every status the platform shows. Typed as a full Record, so adding a status to
 * `@bambino/types` without choosing its tone here is a compile error.
 */
export const STATUS_TONES: Record<DomainStatus, Tone> = {
  // Waiting on someone
  PENDING: 'warning',
  PENDING_PAYMENT: 'warning',
  INITIATED: 'warning',
  REQUESTED: 'warning',
  PAST_DUE: 'warning',
  RETURN_REQUESTED: 'warning',
  INSPECTION: 'warning',
  INSPECTING: 'warning',
  // Moving along
  PROCESSING: 'info',
  PACKED: 'info',
  READY_FOR_DISPATCH: 'info',
  OUT_FOR_DELIVERY: 'info',
  ASSIGNED: 'info',
  PICKED_UP: 'info',
  IN_TRANSIT: 'info',
  FULFILLING: 'info',
  RESERVED: 'info',
  RECEIVED: 'info',
  RETURNED: 'info',
  REFURBISHING: 'info',
  WITH_CUSTOMER: 'brand',
  // Good outcomes
  ACTIVE: 'success',
  PAID: 'success',
  SUCCEEDED: 'success',
  DELIVERED: 'success',
  APPROVED: 'success',
  ACCEPTED: 'success',
  COMPLETED: 'success',
  AVAILABLE: 'success',
  AVAILABLE_FOR_REUSE: 'success',
  // Bad outcomes
  FAILED: 'danger',
  REJECTED: 'danger',
  EXPIRED: 'danger',
  // Stopped or out of circulation
  PAUSED: 'neutral',
  CANCELLED: 'neutral',
  REFUNDED: 'neutral',
  PROCURED: 'neutral',
  RESALE: 'accent',
  RECYCLE: 'neutral',
  RETIRED: 'neutral',
};

/** "OUT_FOR_DELIVERY" → "Out for delivery". Apps with translations pass their own label. */
export function humanizeStatus(status: string): string {
  const words = status.toLowerCase().replaceAll('_', ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export interface StatusBadgeProps {
  status: DomainStatus;
  label?: string;
  className?: string;
}

export function StatusBadge({ status, label, className }: StatusBadgeProps) {
  return (
    <Badge tone={STATUS_TONES[status]} {...(className ? { className } : {})}>
      <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
      {label ?? humanizeStatus(status)}
    </Badge>
  );
}
