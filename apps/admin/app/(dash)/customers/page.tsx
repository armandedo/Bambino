'use client';

import { AdminCustomersQuery } from '@bambino/api-client';
import { DataTable, MoneyText, StatusBadge, TextField } from '@bambino/ui';
import { useQuery } from '@tanstack/react-query';
import NextLink from 'next/link';
import { useDeferredValue, useState } from 'react';
import { Pager, QueryState, RequirePermission, usePager } from '@/components/kit';
import { formatDate } from '@/lib/format';
import { api } from '@/lib/session';

function Customers() {
  const [search, setSearch] = useState('');
  const deferred = useDeferredValue(search.trim());
  const pager = usePager();
  const customers = useQuery({
    queryKey: ['admin-customers', deferred, pager.after],
    queryFn: async () =>
      (
        await api.request(AdminCustomersQuery, {
          search: deferred || null,
          page: { first: 25, after: pager.after },
        })
      ).adminCustomers,
  });
  return (
    <div className="flex flex-col gap-4">
      <TextField
        label="Search"
        type="search"
        value={search}
        onChange={(event) => {
          setSearch(event.target.value);
          pager.reset();
        }}
        placeholder="Name, email or phone"
        className="max-w-md"
      />
      <QueryState query={customers} what="customers">
        {(page) => (
          <>
            <DataTable
              caption="Customers"
              captionHidden
              rows={page.items}
              rowKey={(c) => c.id}
              empty="No customers match."
              columns={[
                {
                  key: 'name',
                  header: 'Name',
                  rowHeader: true,
                  cell: (c) => (
                    <NextLink
                      href={`/customers/${c.id}`}
                      className="text-link underline underline-offset-4 hover:decoration-2"
                    >
                      {c.firstName} {c.lastName}
                    </NextLink>
                  ),
                },
                { key: 'email', header: 'Email', cell: (c) => c.email ?? '—' },
                { key: 'phone', header: 'Phone', cell: (c) => c.phone ?? '—' },
                { key: 'joined', header: 'Joined', cell: (c) => formatDate(c.createdAt) },
                {
                  key: 'status',
                  header: 'Account',
                  cell: (c) =>
                    c.status === 'ACTIVE' ? (
                      <StatusBadge status="ACTIVE" />
                    ) : (
                      <StatusBadge status="CANCELLED" label={c.status} />
                    ),
                },
                {
                  key: 'credit',
                  header: 'Credit',
                  align: 'end',
                  cell: (c) => <MoneyText value={c.exchangeCreditBalance} />,
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

export default function CustomersPage() {
  return (
    <RequirePermission permission="customer:read">
      <Customers />
    </RequirePermission>
  );
}
