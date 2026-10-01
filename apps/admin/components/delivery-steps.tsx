'use client';

import { AdminUpdateDeliveryMutation, type Delivery, type DeliveryStatus } from '@bambino/api-client';
import { Button, StatusBadge, humanizeStatus } from '@bambino/ui';
import type { QueryKey } from '@tanstack/react-query';
import { formatDate } from '@/lib/format';
import { api, useStaff } from '@/lib/session';
import { useAction } from './kit';

/** The forward steps of the delivery lifecycle (apps/api/src/domain/lifecycles.ts); the API re-checks each. */
export const NEXT_DELIVERY_STEPS: Record<DeliveryStatus, DeliveryStatus[]> = {
  PENDING: ['ASSIGNED', 'CANCELLED'],
  ASSIGNED: ['PICKED_UP', 'CANCELLED'],
  PICKED_UP: ['IN_TRANSIT'],
  IN_TRANSIT: ['DELIVERED', 'FAILED'],
  FAILED: ['ASSIGNED', 'CANCELLED'],
  DELIVERED: [],
  CANCELLED: [],
};

const LABELS: Partial<Record<DeliveryStatus, string>> = {
  ASSIGNED: 'Assign rider',
  PICKED_UP: 'Picked up',
  IN_TRANSIT: 'In transit',
  DELIVERED: 'Delivered',
  FAILED: 'Failed attempt',
  CANCELLED: 'Cancel',
};

/** Current delivery status, its timeline, and buttons for the next allowed steps. */
export function DeliverySteps({
  delivery,
  invalidate,
  receivedLabel,
}: {
  delivery: Delivery;
  invalidate: QueryKey[];
  receivedLabel?: string;
}) {
  const { can } = useStaff();
  const update = useAction(
    (status: DeliveryStatus) =>
      api.request(AdminUpdateDeliveryMutation, { input: { deliveryId: delivery.id, status } }),
    { success: (r) => `Delivery: ${humanizeStatus(r.adminUpdateDelivery.status).toLowerCase()}`, invalidate },
  );
  const next = NEXT_DELIVERY_STEPS[delivery.status];
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={delivery.status} />
        {delivery.estimatedDeliveryDate ? (
          <span className="text-sm text-foreground-muted">
            Expected {formatDate(delivery.estimatedDeliveryDate)}
          </span>
        ) : null}
      </div>
      {can('delivery:write') && next.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {next.map((status) => (
            <Button
              key={status}
              size="sm"
              variant={status === 'CANCELLED' || status === 'FAILED' ? 'ghost' : 'outline'}
              loading={update.isPending && update.variables === status}
              disabled={update.isPending}
              onClick={() => update.mutate(status)}
            >
              {status === 'DELIVERED' && receivedLabel
                ? receivedLabel
                : (LABELS[status] ?? humanizeStatus(status))}
            </Button>
          ))}
        </div>
      ) : null}
      {delivery.events.length > 0 ? (
        <ol className="flex flex-col gap-1 text-sm">
          {delivery.events.map((event, index) => (
            <li key={`${event.occurredAt}-${index}`} className="flex justify-between gap-3">
              <span>
                {humanizeStatus(event.status)}
                {event.note ? <span className="text-foreground-muted"> · {event.note}</span> : null}
              </span>
              <span className="text-foreground-muted">{formatDate(event.occurredAt, true)}</span>
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}
