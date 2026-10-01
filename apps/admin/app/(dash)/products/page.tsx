'use client';

import { AdminProductsQuery } from '@bambino/api-client';
import { Badge, DataTable, MoneyText, TextField, buttonClasses } from '@bambino/ui';
import { useQuery } from '@tanstack/react-query';
import NextLink from 'next/link';
import { useDeferredValue, useState } from 'react';
import { Pager, QueryState, RequirePermission, usePager } from '@/components/kit';
import { api, useStaff } from '@/lib/session';

function Products() {
  const { can } = useStaff();
  const [search, setSearch] = useState('');
  const deferred = useDeferredValue(search.trim());
  const pager = usePager();
  const products = useQuery({
    queryKey: ['admin-products', deferred, pager.after],
    queryFn: async () =>
      (
        await api.request(AdminProductsQuery, {
          search: deferred || null,
          page: { first: 25, after: pager.after },
        })
      ).adminProducts,
  });
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <TextField
          label="Search"
          type="search"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            pager.reset();
          }}
          className="max-w-md"
        />
        {can('product:write') ? (
          <NextLink href="/products/new" className={buttonClasses({ variant: 'outline' })}>
            New product
          </NextLink>
        ) : null}
      </div>
      <QueryState query={products} what="products">
        {(page) => (
          <>
            <DataTable
              caption="Products"
              captionHidden
              rows={page.edges.map((e) => e.node)}
              rowKey={(p) => p.id}
              empty="No products match."
              columns={[
                {
                  key: 'name',
                  header: 'Product',
                  rowHeader: true,
                  cell: (p) => (
                    <NextLink
                      href={`/products/${p.id}`}
                      className="text-link underline underline-offset-4 hover:decoration-2"
                    >
                      {p.name}
                    </NextLink>
                  ),
                },
                { key: 'category', header: 'Category', cell: (p) => p.category.name },
                { key: 'variants', header: 'Variants', align: 'end', cell: (p) => p.variants.length },
                { key: 'images', header: 'Photos', align: 'end', cell: (p) => p.images.length },
                {
                  key: 'channels',
                  header: 'Sold as',
                  cell: (p) => (
                    <span className="flex gap-1">
                      {p.subscriptionEligible ? <Badge tone="brand">Subscription</Badge> : null}
                      {p.oneTimeEligible ? <Badge>One-time</Badge> : null}
                    </span>
                  ),
                },
                {
                  key: 'from',
                  header: 'From',
                  align: 'end',
                  cell: (p) => {
                    const cheapest = [...p.variants].sort((a, b) => a.price.amount - b.price.amount)[0];
                    return cheapest ? <MoneyText value={cheapest.price} /> : '—';
                  },
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

export default function ProductsPage() {
  return (
    <RequirePermission permission="product:read">
      <Products />
    </RequirePermission>
  );
}
