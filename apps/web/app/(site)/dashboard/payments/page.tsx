'use client';

import { DataTable, EmptyState, MoneyText, StatusBadge } from '@bambino/ui';
import NextLink from 'next/link';
import { PaymentMethodsSection } from '@/components/payment-methods';
import { QueryState } from '@/components/query-state';
import { formatDate } from '@/lib/messages';
import { useOrders } from '@/lib/queries';
import { PageTitle } from '../account-nav';

/** Saved wallets and what each order cost and whether it is paid. Amounts are the server’s totals. */
export default function PaymentsPage() {
  const orders = useOrders();
  return (
    <>
      <PageTitle title="Payments" description="Mobile money wallets and the payment status of your orders." />
      <PaymentMethodsSection />
      <section aria-labelledby="history" className="flex flex-col gap-3">
        <h2 id="history" className="font-display text-xl font-semibold text-primary">
          Payment history
        </h2>
        <QueryState query={orders} what="your payment history">
          {(list) =>
            list.length === 0 ? (
              <EmptyState
                title="No payments yet"
                description="Orders and subscription payments appear here."
                level={3}
              />
            ) : (
              <DataTable
                caption="Payment history"
                captionHidden
                rows={list}
                rowKey={(order) => order.id}
                columns={[
                  {
                    key: 'date',
                    header: 'Date',
                    rowHeader: true,
                    cell: (order) => formatDate(order.placedAt),
                  },
                  {
                    key: 'order',
                    header: 'Order',
                    cell: (order) => (
                      <NextLink
                        href={`/dashboard/orders/${order.id}`}
                        className="font-mono text-link underline underline-offset-4 hover:decoration-2"
                      >
                        {order.orderNumber}
                      </NextLink>
                    ),
                  },
                  {
                    key: 'status',
                    header: 'Status',
                    cell: (order) =>
                      order.status === 'PENDING_PAYMENT' ? (
                        <StatusBadge status="PENDING_PAYMENT" label="Awaiting payment" />
                      ) : (
                        <StatusBadge status={order.status} />
                      ),
                  },
                  {
                    key: 'total',
                    header: 'Amount',
                    align: 'end',
                    cell: (order) => <MoneyText value={order.totals.total} />,
                  },
                ]}
              />
            )
          }
        </QueryState>
      </section>
    </>
  );
}
