'use client';

import { type Address, DeliveryOptionsQuery, type Viewer } from '@bambino/api-client';
import { Alert, Button, MoneyText, RadioGroup, Skeleton } from '@bambino/ui';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/lib/browser-api';
import { errorMessage } from '@/lib/messages';
import { AddressForm } from './address-form';

export function formatAddress(address: Pick<Address, 'street' | 'sector' | 'district' | 'region'>): string {
  return [address.street, address.sector, address.district, address.region].filter(Boolean).join(', ');
}

/** Choose a saved address or add one. Calls `onChange` with the chosen id. */
export function AddressPicker({
  viewer,
  value,
  onChange,
  legend = 'Delivery address',
}: {
  viewer: Viewer;
  value: string | null;
  onChange: (id: string) => void;
  legend?: string;
}) {
  const [adding, setAdding] = useState(viewer.addresses.length === 0);

  return (
    <div className="flex flex-col gap-4">
      {viewer.addresses.length > 0 ? (
        <RadioGroup
          legend={legend}
          name="address"
          value={value ?? ''}
          onChange={onChange}
          options={viewer.addresses.map((address) => ({
            value: address.id,
            label: `${address.label ? `${address.label}: ` : ''}${address.recipientName}`,
            description: `${formatAddress(address)} · ${address.phone}`,
          }))}
        />
      ) : (
        <p className="text-sm font-semibold">{legend}</p>
      )}
      {adding ? (
        <div className="rounded-xl border border-border bg-background p-4">
          <AddressForm
            onSaved={(address) => {
              setAdding(false);
              onChange(address.id);
            }}
            {...(viewer.addresses.length > 0 ? { onCancel: () => setAdding(false) } : {})}
          />
        </div>
      ) : (
        <Button variant="outline" size="sm" className="w-fit" onClick={() => setAdding(true)}>
          Add a new address
        </Button>
      )}
    </div>
  );
}

export function useDeliveryOptions() {
  return useQuery({
    queryKey: ['delivery-options'],
    queryFn: async () => (await api.request(DeliveryOptionsQuery)).deliveryOptions,
    staleTime: 5 * 60_000,
  });
}

export function DeliveryPicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (code: string) => void;
}) {
  const options = useDeliveryOptions();
  if (options.isPending) return <Skeleton className="h-28" />;
  if (options.isError) {
    return (
      <Alert tone="danger" live>
        {errorMessage(options.error)}
      </Alert>
    );
  }
  return (
    <RadioGroup
      legend="Delivery"
      name="delivery"
      value={value ?? ''}
      onChange={onChange}
      options={options.data.map((option) => ({
        value: option.code,
        label: option.name,
        description: `${option.estimatedDaysMin === option.estimatedDaysMax ? option.estimatedDaysMin : `${option.estimatedDaysMin}–${option.estimatedDaysMax}`} working days · fee shown in the summary`,
      }))}
    />
  );
}

export function TotalsTable({
  totals,
}: {
  totals: {
    subtotal: { amount: number; currency: string };
    discount: { amount: number; currency: string };
    creditApplied: { amount: number; currency: string };
    shipping: { amount: number; currency: string };
    tax: { amount: number; currency: string };
    total: { amount: number; currency: string };
  };
}) {
  const row = (label: string, value: { amount: number; currency: string }, negative = false) => (
    <div className="flex justify-between gap-4">
      <dt>{label}</dt>
      <dd className="tabular-nums">
        {negative ? '− ' : ''}
        <MoneyText value={value} />
      </dd>
    </div>
  );
  return (
    <dl className="flex flex-col gap-2 text-sm">
      {row('Subtotal', totals.subtotal)}
      {totals.discount.amount > 0 ? row('Discount', totals.discount, true) : null}
      {totals.creditApplied.amount > 0 ? row('Exchange credit', totals.creditApplied, true) : null}
      {row('Delivery', totals.shipping)}
      {totals.tax.amount > 0 ? row('Tax', totals.tax) : null}
      <div className="mt-2 flex justify-between gap-4 border-t border-border pt-3 text-base font-bold">
        <dt>Total</dt>
        <dd>
          <MoneyText value={totals.total} />
        </dd>
      </div>
    </dl>
  );
}
