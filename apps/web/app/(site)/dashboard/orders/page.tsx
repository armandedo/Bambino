'use client';

import { type OrderSummary } from '@bambino/api-client';
import { DataTable, EmptyState, MoneyText, StatusBadge, buttonClasses } from '@bambino/ui';
import NextLink from 'next/link';
import { QueryState } from '@/components/query-state';
import { formatDate } from '@/lib/messages';
import { useOrders } from '@/lib/queries';
import { PageTitle } from '../account-nav';

const TYPES: Record<OrderSummary['type'], string> = {
  ONE_TIME: 'Shop order',
  SUBSCRIPTION_CYCLE: 'Subscription',
  EXCHANGE_REPLACEMENT: 'Exchange',
};

export default function OrdersPage() {
  const orders = useOrders();
  return (
    <>
      <PageTitle title="Orders" description="Every order, its payment and its delivery." />
      <QueryState query={orders} what="your orders">
        {(list) =>
          list.length === 0 ? (
            <EmptyState
              title="No orders yet"
              description="When you buy something or a subscription cycle starts, it appears here."
              action={
                <NextLink href="/shop" className={buttonClasses()}>
                  Go to the shop
                </NextLink>
              }
            />
          ) : (
            <DataTable
              caption="Your orders"
              captionHidden
              rows={list}
              rowKey={(order) => order.id}
              columns={[
                {
                  key: 'number',
                  header: 'Order',
                  rowHeader: true,
                  cell: (order) => (
                    <NextLink
                      href={`/dashboard/orders/${order.id}`}
                      className="font-mono text-link underline underline-offset-4 hover:decoration-2"
                    >
                      {order.orderNumber}
                    </NextLink>
                  ),
                },
                { key: 'type', header: 'Type', cell: (order) => TYPES[order.type] },
                { key: 'date', header: 'Placed', cell: (order) => formatDate(order.placedAt) },
                { key: 'status', header: 'Status', cell: (order) => <StatusBadge status={order.status} /> },
                {
                  key: 'total',
                  header: 'Total',
                  align: 'end',
                  cell: (order) => <MoneyText value={order.totals.total} />,
                },
              ]}
            />
          )
        }
      </QueryState>
    </>
  );
}
