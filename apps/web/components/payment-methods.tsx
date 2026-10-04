'use client';

import { AddPaymentMethodMutation, RemovePaymentMethodMutation } from '@bambino/api-client';
import { Alert, Badge, Button, Card, CardHeader, TextField, humanizeStatus } from '@bambino/ui';
import { phoneSchema } from '@bambino/validation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/lib/browser-api';
import { errorMessage, validationMessage } from '@/lib/messages';
import { keys, usePaymentMethods } from '@/lib/queries';
import { QueryState } from './query-state';

const MOCK_ENABLED = process.env.NEXT_PUBLIC_MOCK_PAYMENTS === 'true';

/** Saved mobile money wallets, used for renewal payments. Only masked numbers are ever shown. */
export function PaymentMethodsSection() {
  const methods = usePaymentMethods();
  const queryClient = useQueryClient();
  const [msisdn, setMsisdn] = useState(MOCK_ENABLED ? '+250780000001' : '+250');
  const [error, setError] = useState<string | undefined>();
  const refresh = () => queryClient.invalidateQueries({ queryKey: keys.paymentMethods });
  const add = useMutation({
    mutationFn: (number: string) =>
      api.request(AddPaymentMethodMutation, {
        input: { provider: MOCK_ENABLED ? 'MOCK' : 'MTN_MOMO', msisdn: number, isDefault: true },
      }),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.request(RemovePaymentMethodMutation, { id }),
    onSuccess: refresh,
  });
  return (
    <Card as="section" aria-labelledby="wallets" className="flex flex-col gap-4">
      <CardHeader
        title={<span id="wallets">Mobile money wallets</span>}
        description="Used for renewal payments. Only the last digits are shown."
        level={2}
      />
      <QueryState query={methods} what="your wallets">
        {(list) =>
          list.length === 0 ? (
            <p className="text-foreground-muted">No saved wallets.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {list.map((method) => (
                <li
                  key={method.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3 text-sm"
                >
                  <span>
                    {method.provider === 'MOCK' ? 'Test wallet' : humanizeStatus(method.provider)}{' '}
                    {method.maskedMsisdn} {method.isDefault ? <Badge tone="brand">Default</Badge> : null}
                  </span>
                  <Button size="sm" variant="ghost" onClick={() => remove.mutate(method.id)}>
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
          )
        }
      </QueryState>
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          const parsed = phoneSchema.safeParse(msisdn);
          if (!parsed.success) {
            setError(validationMessage('validation.phone.invalid'));
            return;
          }
          setError(undefined);
          add.mutate(parsed.data);
        }}
      >
        <TextField
          label={MOCK_ENABLED ? 'Test wallet number' : 'Wallet number'}
          type="tel"
          value={msisdn}
          onChange={(event) => setMsisdn(event.target.value)}
          error={error}
          hint={MOCK_ENABLED ? 'Development build: wallets are saved with the test provider.' : undefined}
        />
        <Button type="submit" variant="outline" loading={add.isPending}>
          Save wallet
        </Button>
      </form>
      {add.isError ? (
        <Alert tone="danger" live>
          {errorMessage(add.error)}
        </Alert>
      ) : null}
    </Card>
  );
}
