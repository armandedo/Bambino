'use client';

import { AdminOrdersQuery, type OrderStatus } from '@bambino/api-client';
import { ORDER_STATUSES } from '@bambino/types';
import { DataTable, MoneyText, StatusBadge, TextField, humanizeStatus } from '@bambino/ui';
import { useQuery } from '@tanstack/react-query';
import NextLink from 'next/link';
import { useState } from 'react';
import { Pager, QueryState, RequirePermission, StatusFilter, usePager } from '@/components/kit';
import { formatDate, fullName } from '@/lib/format';
import { api } from '@/lib/session';

function Orders() {
  const [status, setStatus] = useState<OrderStatus | ''>('');
  const [search, setSearch] = useState('');
  const pager = usePager();
  const orders = useQuery({
    queryKey: ['admin-orders', status, search, pager.after],
    queryFn: async () =>
      (
        await api.request(AdminOrdersQuery, {
          status: status || null,
          search: search.trim() || null,
          page: { first: 25, after: pager.after },
        })
      ).adminOrders,
  });
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <StatusFilter
          values={ORDER_STATUSES}
          value={status}
          onChange={(value) => {
            setStatus(value);
            pager.reset();
          }}
        />
        <TextField
          label="Order number"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            pager.reset();
          }}
          placeholder="BMB-…"
        />
      </div>
      <QueryState query={orders} what="orders">
        {(page) => (
          <>
            <DataTable
              caption="Orders"
              captionHidden
              rows={page.items}
              rowKey={(row) => row.order.id}
              empty="No orders match."
              columns={[
                {
                  key: 'number',
                  header: 'Order',
                  rowHeader: true,
                  cell: (row) => (
                    <NextLink
                      href={`/orders/${row.order.id}`}
                      className="font-mono text-link underline underline-offset-4 hover:decoration-2"
                    >
                      {row.order.orderNumber}
                    </NextLink>
                  ),
                },
                { key: 'type', header: 'Type', cell: (row) => humanizeStatus(row.order.type) },
                { key: 'customer', header: 'Customer', cell: (row) => fullName(row.customer) },
                { key: 'placed', header: 'Placed', cell: (row) => formatDate(row.order.placedAt, true) },
                { key: 'status', header: 'Status', cell: (row) => <StatusBadge status={row.order.status} /> },
                {
                  key: 'total',
                  header: 'Total',
                  align: 'end',
                  cell: (row) => <MoneyText value={row.order.totals.total} />,
                },
              ]}
            />
            <Pager pager={pager} pageInfo={page.pageInfo} totalCount={page.totalCount} />
          </>
        )}
      </QueryState>
    </div>
  );
}

export default function OrdersPage() {
  return (
    <RequirePermission permission="order:read">
      <Orders />
    </RequirePermission>
  );
}
