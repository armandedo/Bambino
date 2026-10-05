'use client';

import { AdminPaymentsQuery, AdminReconcilePaymentMutation, type PaymentStatus } from '@bambino/api-client';
import { PAYMENT_STATUSES } from '@bambino/types';
import { Button, Card, MoneyText, StatusBadge, humanizeStatus } from '@bambino/ui';
import { useQuery } from '@tanstack/react-query';
import NextLink from 'next/link';
import { useState } from 'react';
import { Pager, QueryState, RequirePermission, StatusFilter, useAction, usePager } from '@/components/kit';
import { RefundPanel } from '@/components/refund-panel';
import { formatDate, fullName } from '@/lib/format';
import { api, useStaff } from '@/lib/session';

function Payments() {
  const { can } = useStaff();
  const [status, setStatus] = useState<PaymentStatus | ''>('');
  const pager = usePager();
  const payments = useQuery({
    queryKey: ['admin-payments', status, pager.after],
    queryFn: async () =>
      (
        await api.request(AdminPaymentsQuery, {
          status: status || null,
          page: { first: 20, after: pager.after },
          withRefunds: can('refund:read'),
        })
      ).adminPayments,
  });
  const reconcile = useAction((id: string) => api.request(AdminReconcilePaymentMutation, { id }), {
    success: (r) => `Provider says: ${humanizeStatus(r.adminReconcilePayment.status).toLowerCase()}`,
    invalidate: [['admin-payments']],
  });
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-foreground-muted">
        Statuses come only from the payment provider. “Check with provider” asks it again; nobody can mark a
        payment as paid by hand.
      </p>
      <StatusFilter
        values={PAYMENT_STATUSES}
        value={status}
        onChange={(value) => {
          setStatus(value);
          pager.reset();
        }}
      />
      <QueryState query={payments} what="payments">
        {(page) => (
          <>
            {page.items.length === 0 ? <p className="text-foreground-muted">No payments match.</p> : null}
            <ul className="flex flex-col gap-3">
              {page.items.map((entry) => {
                const { payment, customer, providerReference, transactions } = entry;
                return (
                  <li key={payment.id}>
                    <Card padding="sm" className="flex flex-col gap-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="flex flex-wrap items-center gap-2">
                          <MoneyText value={payment.amount} className="font-semibold" />
                          <span className="text-sm text-foreground-muted">
                            {humanizeStatus(payment.provider)} · {fullName(customer)} ·{' '}
                            {formatDate(payment.initiatedAt, true)}
                          </span>
                        </span>
                        <StatusBadge status={payment.status} />
                      </div>
                      <p className="text-sm text-foreground-muted">
                        Reference <span className="font-mono">{providerReference ?? '—'}</span>
                        {payment.orderId ? (
                          <>
                            {' '}
                            ·{' '}
                            <NextLink
                              href={`/orders/${payment.orderId}`}
                              className="text-link underline underline-offset-4 hover:decoration-2"
                            >
                              order
                            </NextLink>
                          </>
                        ) : null}
                        {payment.failureMessage ? ` · ${payment.failureMessage}` : ''}
                      </p>
                      <details className="text-sm">
                        <summary className="cursor-pointer font-medium">
                          Transaction log ({transactions.length})
                        </summary>
                        <ol className="mt-2 flex flex-col gap-1">
                          {transactions.map((t) => (
                            <li key={t.id} className="flex flex-wrap justify-between gap-2">
                              <span>
                                {humanizeStatus(t.type)} → {humanizeStatus(t.resultingStatus)}
                              </span>
                              <span className="text-foreground-muted">{formatDate(t.createdAt, true)}</span>
                            </li>
                          ))}
                        </ol>
                      </details>
                      {can('payment:write') && ['INITIATED', 'PENDING'].includes(payment.status) ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-fit"
                          loading={reconcile.isPending && reconcile.variables === payment.id}
                          onClick={() => reconcile.mutate(payment.id)}
                        >
                          Check with provider
                        </Button>
                      ) : null}
                      {can('refund:read') &&
                      (payment.status === 'SUCCEEDED' || payment.status === 'REFUNDED') ? (
                        <RefundPanel payment={entry} invalidate={[['admin-payments']]} />
                      ) : null}
                    </Card>
                  </li>
                );
              })}
            </ul>
            <Pager pager={pager} pageInfo={page.pageInfo} totalCount={page.totalCount} />
          </>
        )}
      </QueryState>
    </div>
  );
}

export default function PaymentsPage() {
  return (
    <RequirePermission permission="payment:read">
      <Payments />
    </RequirePermission>
  );
}
