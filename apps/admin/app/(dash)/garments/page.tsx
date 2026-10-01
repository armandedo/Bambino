'use client';

import {
  AdminGarmentQuery,
  AdminGarmentsQuery,
  AdminProductsQuery,
  AdminRegisterGarmentsMutation,
  type GarmentStatus,
} from '@bambino/api-client';
import { GARMENT_STATUSES } from '@bambino/types';
import {
  Alert,
  Button,
  Card,
  DataTable,
  Modal,
  SelectField,
  StatusBadge,
  TextField,
  humanizeStatus,
} from '@bambino/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import NextLink from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { Pager, QueryState, RequirePermission, StatusFilter, useAction, usePager } from '@/components/kit';
import { errorMessage, formatDate, fullName } from '@/lib/format';
import { api, useStaff } from '@/lib/session';

function FindByTag() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const tagCode = String(new FormData(event.currentTarget).get('tag') ?? '').trim();
    if (!tagCode) return;
    setPending(true);
    setError(null);
    try {
      const { adminGarment } = await queryClient.fetchQuery({
        queryKey: ['admin-garment-tag', tagCode],
        queryFn: () => api.request(AdminGarmentQuery, { tagCode }),
      });
      if (adminGarment) router.push(`/garments/${adminGarment.id}`);
      else setError(`No garment has the tag ${tagCode}.`);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setPending(false);
    }
  }
  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-wrap items-end gap-3"
      role="search"
      aria-label="Find a garment by tag"
    >
      <TextField
        label="Tag code"
        name="tag"
        placeholder="Scan or type the tag"
        autoComplete="off"
        error={error ?? undefined}
      />
      <Button type="submit" loading={pending}>
        Find
      </Button>
    </form>
  );
}

function RegisterGarments({ onClose }: { onClose: () => void }) {
  const [search, setSearch] = useState('');
  const [variantId, setVariantId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const products = useQuery({
    queryKey: ['admin-products-picker', search],
    queryFn: async () =>
      (await api.request(AdminProductsQuery, { search: search || null, page: { first: 20 } })).adminProducts,
  });
  const register = useAction(
    () => api.request(AdminRegisterGarmentsMutation, { variantId, quantity: Number(quantity) }),
    {
      success: (r) =>
        `Registered ${r.adminRegisterGarments.length} garments: ${r.adminRegisterGarments.map((g) => g.tagCode).join(', ')}`,
      invalidate: [['admin-garments']],
    },
  );
  const variants = (products.data?.edges ?? []).flatMap(({ node }) =>
    node.variants.map((v) => ({
      value: v.id,
      label: `${node.name} · ${v.size.label} · ${v.color} (${v.sku})`,
    })),
  );
  const qty = Number(quantity);
  return (
    <div className="flex flex-col gap-4">
      <TextField label="Search products" value={search} onChange={(event) => setSearch(event.target.value)} />
      <SelectField
        label="Variant"
        value={variantId}
        onChange={(event) => setVariantId(event.target.value)}
        placeholder="Choose a variant"
        options={variants}
      />
      <TextField
        label="How many"
        type="number"
        min={1}
        max={100}
        value={quantity}
        onChange={(event) => setQuantity(event.target.value)}
        hint="Each gets a unique tag code and is checked in as available."
      />
      <div className="flex gap-2">
        <Button
          disabled={!variantId || !Number.isInteger(qty) || qty < 1 || qty > 100}
          loading={register.isPending}
          onClick={() => register.mutate(undefined, { onSuccess: onClose })}
        >
          Register
        </Button>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function Garments() {
  const { can } = useStaff();
  const [status, setStatus] = useState<GarmentStatus | ''>('');
  const [registering, setRegistering] = useState(false);
  const pager = usePager();
  const garments = useQuery({
    queryKey: ['admin-garments', status, pager.after],
    queryFn: async () =>
      (
        await api.request(AdminGarmentsQuery, {
          status: status || null,
          page: { first: 25, after: pager.after },
        })
      ).adminGarments,
  });
  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-wrap items-end justify-between gap-4">
        <FindByTag />
        {can('garment:write') ? (
          <Button variant="outline" onClick={() => setRegistering(true)}>
            Register garments
          </Button>
        ) : null}
      </Card>
      <StatusFilter
        values={GARMENT_STATUSES}
        value={status}
        onChange={(value) => {
          setStatus(value);
          pager.reset();
        }}
      />
      <QueryState query={garments} what="garments">
        {(page) => (
          <>
            <DataTable
              caption="Garments"
              captionHidden
              rows={page.items}
              rowKey={(g) => g.id}
              empty="No garments match."
              columns={[
                {
                  key: 'tag',
                  header: 'Tag',
                  rowHeader: true,
                  cell: (g) => (
                    <NextLink
                      href={`/garments/${g.id}`}
                      className="font-mono text-xs text-link underline underline-offset-4 hover:decoration-2"
                    >
                      {g.tagCode}
                    </NextLink>
                  ),
                },
                {
                  key: 'product',
                  header: 'Product',
                  cell: (g) => `${g.product.name} · ${g.variant.size.label}`,
                },
                { key: 'status', header: 'Status', cell: (g) => <StatusBadge status={g.status} /> },
                { key: 'condition', header: 'Condition', cell: (g) => humanizeStatus(g.condition) },
                { key: 'cycles', header: 'Cycles', align: 'end', cell: (g) => g.lifecycleCount },
                {
                  key: 'holder',
                  header: 'With',
                  cell: (g) => (g.currentCustomer ? fullName(g.currentCustomer) : '—'),
                },
                { key: 'inspected', header: 'Last inspected', cell: (g) => formatDate(g.lastInspectedAt) },
              ]}
            />
            <Pager pager={pager} pageInfo={page.pageInfo} totalCount={page.totalCount} />
          </>
        )}
      </QueryState>
      <Modal open={registering} onClose={() => setRegistering(false)} title="Register garments" size="lg">
        {registering ? <RegisterGarments onClose={() => setRegistering(false)} /> : null}
      </Modal>
      {!can('garment:write') ? (
        <Alert tone="info">Your role can view garments but not change them.</Alert>
      ) : null}
    </div>
  );
}

export default function GarmentsPage() {
  return (
    <RequirePermission permission="garment:read">
      <Garments />
    </RequirePermission>
  );
}
