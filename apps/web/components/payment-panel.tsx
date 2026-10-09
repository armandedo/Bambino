'use client';

import {
  InitiatePaymentMutation,
  type Money,
  MyPaymentMethodsQuery,
  type Payment,
  type PaymentProvider,
  PaymentQuery,
} from '@bambino/api-client';
import { Alert, Button, MoneyText, RadioGroup, Spinner, TextField } from '@bambino/ui';
import { phoneSchema } from '@bambino/validation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api, newIdempotencyKey } from '@/lib/browser-api';
import { errorMessage, validationMessage } from '@/lib/messages';

const MOCK_ENABLED = process.env.NEXT_PUBLIC_MOCK_PAYMENTS === 'true';

/** Test wallets understood by the API's mock provider (apps/api/src/providers/payments.ts). */
const MOCK_WALLETS = [
  { msisdn: '+250780000001', label: 'Test wallet that approves' },
  { msisdn: '+250780000002', label: 'Test wallet that declines' },
  { msisdn: '+250780000003', label: 'Test wallet that never answers' },
];

const TERMINAL: readonly Payment['status'][] = ['SUCCEEDED', 'FAILED', 'CANCELLED', 'EXPIRED', 'REFUNDED'];

function usePaymentStatus(paymentId: string | null) {
  return useQuery({
    queryKey: ['payment', paymentId],
    queryFn: async () => (await api.request(PaymentQuery, { id: paymentId ?? '' })).payment,
    enabled: paymentId !== null,
    // Poll while the customer approves on their phone; stop once the provider has answered.
    refetchInterval: (query) =>
      query.state.data && TERMINAL.includes(query.state.data.status) ? false : 3000,
  });
}

function Countdown({ until }: { until: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const seconds = Math.max(0, Math.round((new Date(until).getTime() - now) / 1000));
  return (
    <span className="tabular-nums">
      {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}
    </span>
  );
}

/**
 * Pays an order with mobile money. The amount is never sent: the server charges the order's own total.
 * The screen only ever shows "paid" when the API reports SUCCEEDED from the provider's confirmation.
 */
export function PaymentPanel({
  orderId,
  total,
  onPaid,
}: {
  orderId: string;
  total: Money;
  onPaid: (payment: Payment) => void;
}) {
  const methods = useQuery({
    queryKey: ['payment-methods'],
    queryFn: async () => (await api.request(MyPaymentMethodsQuery)).myPaymentMethods,
  });
  const [provider, setProvider] = useState<PaymentProvider>(MOCK_ENABLED ? 'MOCK' : 'MTN_MOMO');
  const [source, setSource] = useState<string>('new');
  const [msisdn, setMsisdn] = useState(MOCK_ENABLED ? (MOCK_WALLETS[0]?.msisdn ?? '') : '+250');
  const [phoneError, setPhoneError] = useState<string | undefined>();
  // One key per attempt: a double click or a network retry cannot charge twice.
  const [attemptKey, setAttemptKey] = useState(newIdempotencyKey);
  const [paymentId, setPaymentId] = useState<string | null>(null);

  const initiate = useMutation({
    mutationFn: async () => {
      const saved = methods.data?.find((m) => m.id === source);
      return (
        await api.request(InitiatePaymentMutation, {
          input: {
            idempotencyKey: attemptKey,
            orderId,
            provider: saved ? saved.provider : provider,
            ...(saved ? { paymentMethodId: saved.id } : { msisdn }),
          },
        })
      ).initiatePayment;
    },
    onSuccess: (payment) => setPaymentId(payment.id),
  });

  const status = usePaymentStatus(paymentId);
  const payment = status.data ?? initiate.data ?? null;

  useEffect(() => {
    if (payment?.status === 'SUCCEEDED') onPaid(payment);
  }, [payment, onPaid]);

  function start() {
    if (source === 'new') {
      const parsed = phoneSchema.safeParse(msisdn);
      if (!parsed.success) {
        setPhoneError(validationMessage(parsed.error.issues[0]?.message));
        return;
      }
      setMsisdn(parsed.data);
    }
    setPhoneError(undefined);
    initiate.mutate();
  }

  function tryAgain() {
    setPaymentId(null);
    initiate.reset();
    setAttemptKey(newIdempotencyKey());
  }

  if (payment && (payment.status === 'PENDING' || payment.status === 'INITIATED')) {
    return (
      <div
        className="flex flex-col items-center gap-4 rounded-xl border border-border bg-primary-soft p-6 text-center"
        aria-live="polite"
      >
        <Spinner label={null} size="lg" className="text-primary" />
        <h3 className="font-display text-xl font-semibold">Approve the payment on your phone</h3>
        <p className="text-primary-soft-foreground">
          We asked your wallet for <MoneyText value={payment.amount} className="font-semibold" />. Enter your
          PIN on the prompt to confirm.
        </p>
        {payment.expiresAt ? (
          <p className="text-sm text-primary-soft-foreground">
            The request expires in <Countdown until={payment.expiresAt} />.
          </p>
        ) : null}
        <p className="text-sm text-primary-soft-foreground">
          You can leave this page; we’ll update your order when the payment completes.
        </p>
      </div>
    );
  }

  if (payment && payment.status === 'SUCCEEDED') {
    return (
      <Alert tone="success" title="Payment received" live>
        Thank you. Your order is confirmed.
      </Alert>
    );
  }

  const failed = payment && TERMINAL.includes(payment.status) && payment.status !== 'SUCCEEDED';
  const savedMethods = methods.data ?? [];

  return (
    <div className="flex flex-col gap-4">
      {failed ? (
        <Alert
          tone="danger"
          title="The payment did not go through"
          live
          action={
            <Button size="sm" variant="outline" onClick={tryAgain}>
              Try again
            </Button>
          }
        >
          {payment.failureMessage ??
            (payment.status === 'EXPIRED'
              ? 'The request expired before it was approved.'
              : 'No money was taken.')}
        </Alert>
      ) : null}
      {initiate.isError ? (
        <Alert tone="danger" live>
          {errorMessage(initiate.error)}
        </Alert>
      ) : null}

      {!failed ? (
        <>
          {savedMethods.length > 0 ? (
            <RadioGroup
              legend="Pay with"
              name="payment-source"
              value={source}
              onChange={setSource}
              options={[
                ...savedMethods.map((m) => {
                  const label = m.label ?? (m.provider === 'MOCK' ? 'Test wallet' : m.provider);
                  return m.maskedMsisdn
                    ? { value: m.id, label, description: m.maskedMsisdn }
                    : { value: m.id, label };
                }),
                { value: 'new', label: 'Another number' },
              ]}
            />
          ) : null}

          {source === 'new' ? (
            <>
              <RadioGroup
                legend="Mobile money provider"
                name="provider"
                value={provider}
                onChange={(value) => setProvider(value as PaymentProvider)}
                options={[
                  ...(MOCK_ENABLED
                    ? [
                        {
                          value: 'MOCK',
                          label: 'Test wallet',
                          description: 'Development only. No real money moves.',
                        },
                      ]
                    : []),
                  {
                    value: 'MTN_MOMO',
                    label: 'MTN Mobile Money',
                    description: 'Not connected yet',
                    disabled: true,
                  },
                  {
                    value: 'AIRTEL_MONEY',
                    label: 'Airtel Money',
                    description: 'Not connected yet',
                    disabled: true,
                  },
                ]}
              />
              {provider === 'MOCK' ? (
                <RadioGroup
                  legend="Test wallet number"
                  name="mock-wallet"
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
                  hint="The number registered with your mobile money account."
                />
              )}
            </>
          ) : null}

          <Button size="lg" fullWidth loading={initiate.isPending} onClick={start}>
            Pay <MoneyText value={total} />
          </Button>
        </>
      ) : null}
    </div>
  );
}
