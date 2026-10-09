'use client';

import { CreateSubscriptionMutation, type Subscription } from '@bambino/api-client';
import { Alert, Button, Card, RadioGroup, buttonClasses } from '@bambino/ui';
import { formatMoney, isCurrencyCode } from '@bambino/utils';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import NextLink from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useState } from 'react';
import { AddressPicker, DeliveryPicker } from '@/components/checkout-parts';
import { ItemPicker } from '@/components/item-picker';
import { PaymentPanel } from '@/components/payment-panel';
import { QueryState } from '@/components/query-state';
import { api, newIdempotencyKey } from '@/lib/browser-api';
import { errorMessage } from '@/lib/messages';
import { keys, useBabies, usePlans } from '@/lib/queries';
import { useSession } from '@/lib/session';
import { PageTitle } from '../../account-nav';

type Stage = 'details' | 'items' | 'pay';

function priceText(price: { amount: number; currency: string }): string {
  return isCurrencyCode(price.currency)
    ? formatMoney({ amount: price.amount, currency: price.currency }, 'en-RW')
    : `${price.currency} ${price.amount}`;
}

export default function NewSubscriptionPage() {
  const params = useSearchParams();
  const router = useRouter();
  const { viewer } = useSession();
  const plans = usePlans();
  const babies = useBabies();
  const queryClient = useQueryClient();
  const [planId, setPlanId] = useState<string | null>(null);
  const [babyId, setBabyId] = useState<string | null>(params.get('baby'));
  const defaultAddress = viewer?.addresses.find((a) => a.isDefault) ?? viewer?.addresses[0];
  const [addressId, setAddressId] = useState<string | null>(defaultAddress?.id ?? null);
  const [deliveryCode, setDeliveryCode] = useState<string | null>(null);
  const [key] = useState(newIdempotencyKey);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [stage, setStage] = useState<Stage>('details');

  const create = useMutation({
    mutationFn: async () => {
      if (!selectedPlanId || !babyId || !addressId || !deliveryCode)
        throw new Error('Complete every step first.');
      return (
        await api.request(CreateSubscriptionMutation, {
          input: {
            idempotencyKey: key,
            planId: selectedPlanId,
            babyProfileId: babyId,
            shippingAddressId: addressId,
            deliveryOptionCode: deliveryCode,
          },
        })
      ).createSubscription;
    },
    onSuccess: (created) => {
      setSubscription(created);
      setStage('items');
      void queryClient.invalidateQueries({ queryKey: keys.subscriptions });
    },
  });

  const onPaid = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: keys.subscriptions });
    router.push('/dashboard/subscription?started=1');
  }, [queryClient, router]);

  const preferredPlan = params.get('plan');
  // The plan chosen on the plans page (or the first plan) is preselected until the parent picks another.
  const selectedPlanId =
    planId ??
    plans.data?.find((p) => p.code === preferredPlan || p.id === preferredPlan)?.id ??
    plans.data?.[0]?.id ??
    null;
  if (!viewer) return null;

  if (subscription && stage === 'items') {
    const baby = babies.data?.find((b) => b.id === subscription.babyProfile.id);
    return (
      <>
        <PageTitle
          title="Choose this month’s pieces"
          description={`Up to ${subscription.plan.itemsPerCycle} pieces for ${subscription.babyProfile.nickname}.`}
        />
        <ItemPicker
          subscription={subscription}
          initialSize={baby?.latestRecommendation?.recommendedSize.code ?? baby?.currentSize?.code ?? null}
          onSaved={(next) => {
            setSubscription(next);
            setStage('pay');
          }}
        />
      </>
    );
  }

  if (subscription && stage === 'pay') {
    const order = subscription.orderAwaitingPayment;
    return (
      <>
        <PageTitle
          title="Pay for your first period"
          description="Your subscription starts when the payment is confirmed."
        />
        <Card className="mx-auto flex w-full max-w-xl flex-col gap-4">
          {order ? (
            <PaymentPanel orderId={order.id} total={order.totals.total} onPaid={onPaid} />
          ) : (
            <Alert tone="info">Nothing is waiting for payment. Check your subscription page.</Alert>
          )}
          <Button variant="ghost" size="sm" className="w-fit" onClick={() => setStage('items')}>
            Change my pieces
          </Button>
        </Card>
      </>
    );
  }

  return (
    <>
      <PageTitle
        title="Start a subscription"
        description="One plan per baby. You can pause or cancel from your account."
      />
      <Card as="section" aria-labelledby="plan-step" className="flex flex-col gap-4">
        <h2 id="plan-step" className="font-display text-xl font-semibold">
          1. Plan
        </h2>
        <QueryState query={plans} what="plans">
          {(list) => (
            <RadioGroup
              legend="Choose a plan"
              name="plan"
              value={selectedPlanId ?? ''}
              onChange={setPlanId}
              options={list.map((plan) => ({
                value: plan.id,
                label: plan.name,
                description: `${plan.itemsPerCycle} pieces per cycle · ${priceText(plan.price)}`,
              }))}
            />
          )}
        </QueryState>
      </Card>

      <Card as="section" aria-labelledby="baby-step" className="flex flex-col gap-4">
        <h2 id="baby-step" className="font-display text-xl font-semibold">
          2. Baby
        </h2>
        <QueryState query={babies} what="your baby profiles">
          {(list) =>
            list.length === 0 ? (
              <Alert
                tone="info"
                title="Add your baby first"
                action={
                  <NextLink href="/fit" className={buttonClasses({ size: 'sm' })}>
                    Find my baby’s size
                  </NextLink>
                }
              >
                We use your baby’s size to choose the right pieces.
              </Alert>
            ) : (
              <RadioGroup
                legend="Who is this subscription for?"
                name="baby"
                value={babyId ?? ''}
                onChange={setBabyId}
                options={list.map((baby) => ({
                  value: baby.id,
                  label: baby.nickname,
                  description: baby.latestRecommendation
                    ? `Size ${baby.latestRecommendation.recommendedSize.label}`
                    : 'No size recommendation yet',
                }))}
              />
            )
          }
        </QueryState>
      </Card>

      <Card as="section" aria-labelledby="address-step" className="flex flex-col gap-4">
        <h2 id="address-step" className="font-display text-xl font-semibold">
          3. Delivery
        </h2>
        <AddressPicker viewer={viewer} value={addressId} onChange={setAddressId} />
        <DeliveryPicker value={deliveryCode} onChange={setDeliveryCode} />
      </Card>

      {create.isError ? (
        <Alert tone="danger" live>
          {errorMessage(create.error)}
        </Alert>
      ) : null}
      <div className="flex flex-wrap items-center gap-4">
        <Button
          size="lg"
          disabled={!selectedPlanId || !babyId || !addressId || !deliveryCode}
          loading={create.isPending}
          onClick={() => create.mutate()}
        >
          Continue to choose pieces
        </Button>
        <p className="text-sm text-foreground-muted">
          You review the total, including delivery, before paying.
        </p>
      </div>
    </>
  );
}
