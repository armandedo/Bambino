'use client';

import {
  AdminApproveExchangeMutation,
  AdminExchangesQuery,
  AdminRejectExchangeMutation,
  type ExchangeStatus,
} from '@bambino/api-client';
import { EXCHANGE_STATUSES } from '@bambino/types';
import { Button, Card, Modal, MoneyText, StatusBadge, TextField } from '@bambino/ui';
import { useQuery } from '@tanstack/react-query';
import NextLink from 'next/link';
import { useState } from 'react';
import { Pager, QueryState, RequirePermission, StatusFilter, useAction, usePager } from '@/components/kit';
import { formatDate, fullName } from '@/lib/format';
import { api, useStaff } from '@/lib/session';

function Exchanges() {
  const { can } = useStaff();
  const [status, setStatus] = useState<ExchangeStatus | ''>('REQUESTED');
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const pager = usePager();
  const exchanges = useQuery({
    queryKey: ['admin-exchanges', status, pager.after],
    queryFn: async () =>
      (
        await api.request(AdminExchangesQuery, {
          status: status || null,
          page: { first: 25, after: pager.after },
        })
      ).adminExchanges,
  });
  const approve = useAction((id: string) => api.request(AdminApproveExchangeMutation, { id }), {
    success: 'Exchange approved; the parent can now pay any difference',
    invalidate: [['admin-exchanges']],
  });
  const reject = useAction((id: string) => api.request(AdminRejectExchangeMutation, { id, reason }), {
    success: 'Exchange rejected',
    invalidate: [['admin-exchanges']],
  });

  return (
    <div className="flex flex-col gap-4">
      <StatusFilter
        values={EXCHANGE_STATUSES}
        value={status}
        onChange={(value) => {
          setStatus(value);
          pager.reset();
        }}
      />
      <QueryState query={exchanges} what="exchanges">
        {(page) => (
          <>
            {page.items.length === 0 ? <p className="text-foreground-muted">No exchanges match.</p> : null}
            <ul className="flex flex-col gap-3">
              {page.items.map(({ exchange, customer }) => (
                <li key={exchange.id}>
                  <Card padding="sm" className="flex flex-col gap-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-mono">{exchange.exchangeNumber}</span>
                      <StatusBadge status={exchange.status} />
                    </div>
                    <p className="text-sm">
                      {fullName(customer)} · requested {formatDate(exchange.createdAt, true)}
                      {exchange.returnRequest ? (
                        <>
                          {' '}
                          · after return{' '}
                          <NextLink
                            href={`/returns/${exchange.returnRequest.id}`}
                            className="font-mono text-link underline underline-offset-4 hover:decoration-2"
                          >
                            {exchange.returnRequest.returnNumber}
                          </NextLink>
                        </>
                      ) : null}
                    </p>
                    <ul className="text-sm">
                      {exchange.items.map((item) => (
                        <li key={item.id}>
                          {item.product.name} in {item.requestedVariant.size.label} (
                          {item.requestedVariant.color})
                        </li>
                      ))}
                    </ul>
                    {exchange.replacementOrder ? (
                      <p className="text-sm">
                        Replacement order{' '}
                        <NextLink
                          href={`/orders/${exchange.replacementOrder.id}`}
                          className="font-mono text-link underline underline-offset-4 hover:decoration-2"
                        >
                          {exchange.replacementOrder.orderNumber}
                        </NextLink>{' '}
                        · <MoneyText value={exchange.replacementOrder.totals.total} /> to pay after credit ·{' '}
                        <StatusBadge status={exchange.replacementOrder.status} />
                      </p>
                    ) : null}
                    {exchange.status === 'REQUESTED' && can('exchange:write') ? (
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          loading={approve.isPending && approve.variables === exchange.id}
                          onClick={() => approve.mutate(exchange.id)}
                        >
                          Approve
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setRejecting(exchange.id)}>
                          Reject
                        </Button>
                      </div>
                    ) : null}
                  </Card>
                </li>
              ))}
            </ul>
            <Pager pager={pager} pageInfo={page.pageInfo} totalCount={page.totalCount} />
          </>
        )}
      </QueryState>
      <Modal
        open={rejecting !== null}
        onClose={() => setRejecting(null)}
        title="Reject this exchange?"
        description="The replacement order is cancelled and any credit applied to it is returned. The reason is shown to the parent."
        footer={
          <>
            <Button variant="outline" onClick={() => setRejecting(null)}>
              Keep it
            </Button>
            <Button
              variant="danger"
              disabled={reason.trim().length < 3}
              loading={reject.isPending}
              onClick={() => rejecting && reject.mutate(rejecting, { onSuccess: () => setRejecting(null) })}
            >
              Reject exchange
            </Button>
          </>
        }
      >
        <TextField label="Reason" value={reason} onChange={(event) => setReason(event.target.value)} />
      </Modal>
    </div>
  );
}

export default function ExchangesPage() {
  return (
    <RequirePermission permission="exchange:read">
      <Exchanges />
    </RequirePermission>
  );
}
