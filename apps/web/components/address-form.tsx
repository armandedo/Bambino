'use client';

import { type Address, CreateAddressMutation } from '@bambino/api-client';
import { DEFAULT_MARKET, MARKETS } from '@bambino/config';
import { Alert, Button, Checkbox, TextField, TextareaField } from '@bambino/ui';
import { addressSchema } from '@bambino/validation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { api } from '@/lib/browser-api';
import { errorMessage, fieldErrors, validationMessage } from '@/lib/messages';
import { ME_KEY } from '@/lib/session';

const LABELS: Record<string, string> = {
  'address.rw.province': 'Province',
  'address.rw.district': 'District',
  'address.rw.sector': 'Sector',
  'address.rw.street': 'Street or house number',
  'address.directions': 'Directions for the rider',
};

/** New address in the market's format. Required fields come from market config, as on the server. */
export function AddressForm({
  onSaved,
  onCancel,
}: {
  onSaved: (address: Address) => void;
  onCancel?: () => void;
}) {
  const market = MARKETS[DEFAULT_MARKET];
  const queryClient = useQueryClient();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const create = useMutation({
    mutationFn: async (input: ReturnType<typeof collect>) =>
      (await api.request(CreateAddressMutation, { input })).createAddress,
    onSuccess: async (address) => {
      await queryClient.invalidateQueries({ queryKey: ME_KEY });
      onSaved(address);
    },
    onError: (error) => setErrors(fieldErrors(error)),
  });

  function collect(form: FormData) {
    const text = (name: string) => {
      const value = String(form.get(name) ?? '').trim();
      return value === '' ? null : value;
    };
    return {
      label: text('label'),
      recipientName: String(form.get('recipientName') ?? ''),
      phone: String(form.get('phone') ?? ''),
      countryCode: market.code,
      region: text('region'),
      district: text('district'),
      sector: text('sector'),
      street: text('street'),
      directions: text('directions'),
      isDefault: form.get('isDefault') === 'on',
    };
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    event.stopPropagation();
    const input = collect(new FormData(event.currentTarget));
    const parsed = addressSchema.safeParse(input);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0]);
        next[key] ??= validationMessage(issue.message) ?? 'Check this value.';
      }
      setErrors(next);
      return;
    }
    setErrors({});
    create.mutate(input);
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate aria-label="New address">
      {create.isError ? (
        <Alert tone="danger" live>
          {errorMessage(create.error)}
        </Alert>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Recipient name"
          name="recipientName"
          autoComplete="name"
          required
          error={errors.recipientName}
        />
        <TextField
          label="Phone"
          name="phone"
          type="tel"
          autoComplete="tel"
          defaultValue={`+${market.phoneCountryCode}`}
          required
          error={errors.phone}
        />
        {market.addressFormat
          .filter((field) => field.key !== 'directions')
          .map((field) => (
            <TextField
              key={field.key}
              label={LABELS[field.labelKey] ?? field.key}
              name={field.key}
              required={field.required}
              error={errors[field.key]}
            />
          ))}
        <TextField label="Label (optional)" name="label" placeholder="Home, work…" error={errors.label} />
      </div>
      <TextareaField
        label={LABELS['address.directions']}
        name="directions"
        rows={2}
        hint="Landmarks, gate colour, which floor."
      />
      <Checkbox name="isDefault" label="Use as my default address" />
      <div className="flex flex-wrap gap-3">
        <Button type="submit" loading={create.isPending}>
          Save address
        </Button>
        {onCancel ? (
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}
