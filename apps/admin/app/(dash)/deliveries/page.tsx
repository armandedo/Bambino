'use client';

import { AdminDeliveriesQuery, type DeliveryStatus } from '@bambino/api-client';
import { DELIVERY_STATUSES } from '@bambino/types';
import { Badge, Card } from '@bambino/ui';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { DeliverySteps } from '@/components/delivery-steps';
import { Pager, QueryState, RequirePermission, StatusFilter, usePager } from '@/components/kit';
import { api } from '@/lib/session';

function Deliveries() {
  const [status, setStatus] = useState<DeliveryStatus | ''>('');
  const pager = usePager();
  const key = ['admin-deliveries', status, pager.after];
  const deliveries = useQuery({
    queryKey: key,
    queryFn: async () =>
      (
        await api.request(AdminDeliveriesQuery, {
          status: status || null,
          page: { first: 24, after: pager.after },
        })
      ).adminDeliveries,
  });
  return (
    <div className="flex flex-col gap-4">
      <StatusFilter
        values={DELIVERY_STATUSES}
        value={status}
        onChange={(value) => {
          setStatus(value);
          pager.reset();
        }}
      />
      <QueryState query={deliveries} what="deliveries">
        {(page) => (
          <>
            {page.items.length === 0 ? <p className="text-foreground-muted">No deliveries match.</p> : null}
            <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {page.items.map((row) => (
                <li key={row.delivery.id}>
                  <Card padding="sm" className="flex h-full flex-col gap-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-mono text-sm">{row.orderNumber ?? row.returnNumber ?? '—'}</span>
                      <Badge tone={row.delivery.direction === 'OUTBOUND' ? 'brand' : 'accent'}>
                        {row.delivery.direction === 'OUTBOUND' ? 'Delivery' : 'Return pickup'}
                      </Badge>
                    </div>
                    <p className="text-sm">
                      {row.recipientName} ·{' '}
                      <a
                        href={`tel:${row.phone}`}
                        className="text-link underline underline-offset-4 hover:decoration-2"
                      >
                        {row.phone}
                      </a>
                    </p>
                    <DeliverySteps
                      delivery={row.delivery}
                      invalidate={[['admin-deliveries']]}
                      {...(row.delivery.direction === 'RETURN_PICKUP'
                        ? { receivedLabel: 'Collected and received' }
                        : {})}
                    />
                  </Card>
                </li>
              ))}
            </ul>
            <Pager pager={pager} pageInfo={page.pageInfo} totalCount={page.totalCount} />
          </>
        )}
      </QueryState>
    </div>
  );
}

export default function DeliveriesPage() {
  return (
    <RequirePermission permission="delivery:read">
      <Deliveries />
    </RequirePermission>
  );
}
