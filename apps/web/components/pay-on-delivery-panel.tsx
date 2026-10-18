'use client';

import {
  ConfirmPayOnDeliveryMutation,
  type DoorPayment,
  type Money,
  type OrderDetail,
  type PaymentProvider,
  PaymentQuery,
} from '@bambino/api-client';
import { Alert, Button, MoneyText, RadioGroup, TextField } from '@bambino/ui';
import { phoneSchema } from '@bambino/validation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api } from '@/lib/browser-api';
import { errorMessage, validationMessage } from '@/lib/messages';
import { keys } from '@/lib/queries';

/** Test wallets understood by the API's mock provider (apps/api/src/providers/payments.ts). */
const MOCK_WALLETS = [
  { msisdn: '+250780000001', label: 'Test wallet that approves' },
  { msisdn: '+250780000002', label: 'Test wallet that declines' },
];

const LABELS: Record<string, { label: string; description?: string }> = {
  MOCK: { label: 'Test wallet', description: 'Development only. No real money moves.' },
  MTN_MOMO: { label: 'MTN Mobile Money' },
  AIRTEL_MONEY: { label: 'Airtel Money' },
};

export const providerLabel = (provider: PaymentProvider) => LABELS[provider]?.label ?? provider;

/**
 * Pay on delivery, by mobile money. The customer picks the wallet now; nothing is charged. When the courier is at the
 * door we send a payment request to that wallet and the customer approves it with their PIN. There is no cash.
 */
export function PayOnDeliveryPanel({
  orderId,
  total,
  providers,
}: {
  orderId: string;
  total: Money;
  providers: PaymentProvider[];
}) {
  const queryClient = useQueryClient();
  const [provider, setProvider] = useState<PaymentProvider>(providers[0] ?? 'MOCK');
  const [msisdn, setMsisdn] = useState(provider === 'MOCK' ? (MOCK_WALLETS[0]?.msisdn ?? '') : '+250');
  const [phoneError, setPhoneError] = useState<string | undefined>();

  const confirm = useMutation({
    mutationFn: async () =>
      (await api.request(ConfirmPayOnDeliveryMutation, { input: { orderId, provider, msisdn } }))
        .confirmPayOnDelivery,
    onSuccess: (next) => {
      queryClient.setQueryData(keys.order(orderId), next);
      void queryClient.invalidateQueries({ queryKey: keys.orders });
    },
  });

  function submit() {
    const parsed = phoneSchema.safeParse(msisdn);
    if (!parsed.success) {
      setPhoneError(validationMessage(parsed.error.issues[0]?.message));
      return;
    }
    setPhoneError(undefined);
    setMsisdn(parsed.data);
    confirm.mutate();
  }

  if (providers.length === 0) return null;

  return (
    <div className="flex flex-col gap-3 border-t border-border pt-4">
      <div>
        <h3 className="font-display text-lg font-semibold">Or pay when it arrives</h3>
        <p className="text-sm text-foreground-muted">
          Pay <MoneyText value={total} className="font-semibold" /> from your mobile money wallet when your
          order reaches you. When the courier is at your door we send a payment request to the wallet you
          choose here, and you approve it on your phone with your PIN. No cash is taken. We prepare your order
          straight away.
        </p>
      </div>
      <RadioGroup
        legend="Wallet to pay from"
        name="door-provider"
        value={provider}
        onChange={(value) => {
          const next = value as PaymentProvider;
          setProvider(next);
          setMsisdn(next === 'MOCK' ? (MOCK_WALLETS[0]?.msisdn ?? '') : '+250');
        }}
        options={providers.map((code) => ({
          value: code,
          label: LABELS[code]?.label ?? code,
          ...(LABELS[code]?.description ? { description: LABELS[code]?.description } : {}),
        }))}
      />
      {provider === 'MOCK' ? (
        <RadioGroup
          legend="Test wallet number"
          name="door-mock-wallet"
          value={msisdn}
          onChange={setMsisdn}
          options={MOCK_WALLETS.map((wallet) => ({
            value: wallet.msisdn,
            label: wallet.msisdn,
            description: wallet.label,
          }))}
        />
      ) : (
        <TextField
          label="Wallet phone number"
          type="tel"
          value={msisdn}
          onChange={(event) => setMsisdn(event.target.value)}
          error={phoneError}
          hint="The number registered with your mobile money account. Keep your phone with you at delivery."
        />
      )}
      <Button variant="outline" className="w-fit" loading={confirm.isPending} onClick={submit}>
        Pay on delivery
      </Button>
      {confirm.isError ? (
        <Alert tone="danger" title="We could not confirm pay on delivery">
          {errorMessage(confirm.error)}
        </Alert>
      ) : null}
    </div>
  );
}

/**
 * What a customer sees once the order is confirmed for pay on delivery: which wallet will be asked, and, when the
 * courier has asked at the door, a prompt to approve. While a request waits it asks the provider for the outcome, so
 * the screen updates by itself when the customer approves.
 */
export function DoorPaymentNotice({ order }: { order: OrderDetail & { doorPayment: DoorPayment } }) {
  const queryClient = useQueryClient();
  const waiting = order.payments.find((p) => p.status === 'INITIATED' || p.status === 'PENDING');
  const status = useQuery({
    queryKey: ['payment', waiting?.id],
    queryFn: async () => (await api.request(PaymentQuery, { id: waiting?.id ?? '' })).payment,
    enabled: Boolean(waiting),
    refetchInterval: (query) => {
      const current = query.state.data?.status;
      return current && current !== 'PENDING' && current !== 'INITIATED' ? false : 4000;
    },
  });
  const outcome = status.data?.status;
  useEffect(() => {
    if (outcome && outcome !== 'PENDING' && outcome !== 'INITIATED') {
      void queryClient.invalidateQueries({ queryKey: keys.order(order.id) });
      void queryClient.invalidateQueries({ queryKey: keys.orders });
    }
  }, [outcome, queryClient, order.id]);

  const wallet = `${providerLabel(order.doorPayment.provider)} (${order.doorPayment.maskedMsisdn})`;

  if (order.doorPayment.paid) {
    return (
      <Alert tone="success" title="Paid at the door">
        Thank you. Your payment from {wallet} was approved.
      </Alert>
    );
  }
  if (waiting) {
    return (
      <Alert tone="warning" title="Approve the payment on your phone" live>
        The courier is at your door. We asked {wallet} for{' '}
        <MoneyText value={order.totals.total} className="font-semibold" />. Enter your PIN on the prompt to
        receive your order.
      </Alert>
    );
  }
  return (
    <Alert tone="info" title="Pay when it arrives">
      You will pay <MoneyText value={order.totals.total} className="font-semibold" /> from {wallet} when your
      order arrives. When the courier is at your door you will get a payment request on that number: approve it
      with your PIN to receive your order. No cash is taken.
    </Alert>
  );
}
