'use client';

import { AdminReturnsQuery, type ReturnStatus } from '@bambino/api-client';
import { RETURN_STATUSES } from '@bambino/types';
import { DataTable, StatusBadge, humanizeStatus } from '@bambino/ui';
import { useQuery } from '@tanstack/react-query';
import NextLink from 'next/link';
import { useState } from 'react';
import { Pager, QueryState, RequirePermission, StatusFilter, usePager } from '@/components/kit';
import { formatDate, fullName } from '@/lib/format';
import { api } from '@/lib/session';

function Returns() {
  const [status, setStatus] = useState<ReturnStatus | ''>('');
  const pager = usePager();
  const returns = useQuery({
    queryKey: ['admin-returns', status, pager.after],
    queryFn: async () =>
      (
        await api.request(AdminReturnsQuery, {
          status: status || null,
          page: { first: 25, after: pager.after },
        })
      ).adminReturns,
  });
  return (
    <div className="flex flex-col gap-4">
      <StatusFilter
        values={RETURN_STATUSES}
        value={status}
        onChange={(value) => {
          setStatus(value);
          pager.reset();
        }}
      />
      <QueryState query={returns} what="returns">
        {(page) => (
          <>
            <DataTable
              caption="Returns"
              captionHidden
              rows={page.items}
              rowKey={(row) => row.returnRequest.id}
              empty="No returns match."
              columns={[
                {
                  key: 'number',
                  header: 'Return',
                  rowHeader: true,
                  cell: (row) => (
                    <NextLink
                      href={`/returns/${row.returnRequest.id}`}
                      className="font-mono text-link underline underline-offset-4 hover:decoration-2"
                    >
                      {row.returnRequest.returnNumber}
                    </NextLink>
                  ),
                },
                { key: 'customer', header: 'Customer', cell: (row) => fullName(row.customer) },
                {
                  key: 'items',
                  header: 'Pieces',
                  align: 'end',
                  cell: (row) => row.returnRequest.items.length,
                },
                { key: 'reason', header: 'Reason', cell: (row) => humanizeStatus(row.returnRequest.reason) },
                { key: 'date', header: 'Requested', cell: (row) => formatDate(row.returnRequest.createdAt) },
                {
                  key: 'status',
                  header: 'Status',
                  cell: (row) => <StatusBadge status={row.returnRequest.status} />,
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

export default function ReturnsPage() {
  return (
    <RequirePermission permission="return:read">
      <Returns />
    </RequirePermission>
  );
}
