'use client';

import {
  CancelSubscriptionMutation,
  ChangeSubscriptionPlanMutation,
  PauseSubscriptionMutation,
  ResumeSubscriptionMutation,
  type Subscription,
} from '@bambino/api-client';
import {
  Alert,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Modal,
  MoneyText,
  SelectField,
  StatusBadge,
  buttonClasses,
  humanizeStatus,
} from '@bambino/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import NextLink from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { ItemPicker } from '@/components/item-picker';
import { QueryState } from '@/components/query-state';
import { api } from '@/lib/browser-api';
import { errorMessage, formatDate } from '@/lib/messages';
import { keys, useBabies, usePlans, useSubscriptions } from '@/lib/queries';
import { PageTitle } from '../account-nav';

type Dialog = 'cancel' | 'plan' | 'items' | null;

function SubscriptionCard({ subscription }: { subscription: Subscription }) {
  const queryClient = useQueryClient();
  const plans = usePlans();
  const babies = useBabies();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [planChoice, setPlanChoice] = useState('');
  const refresh = () => void queryClient.invalidateQueries({ queryKey: keys.subscriptions });

  const action = useMutation({
    mutationFn: async (kind: 'pause' | 'resume' | 'cancel' | 'plan') => {
      const id = subscription.id;
      if (kind === 'pause') return (await api.request(PauseSubscriptionMutation, { id })).pauseSubscription;
      if (kind === 'resume')
        return (await api.request(ResumeSubscriptionMutation, { id })).resumeSubscription;
      if (kind === 'cancel')
        return (await api.request(CancelSubscriptionMutation, { id, immediately: false })).cancelSubscription;
      return (await api.request(ChangeSubscriptionPlanMutation, { id, planId: planChoice }))
        .changeSubscriptionPlan;
    },
    onSuccess: () => {
      setDialog(null);
      refresh();
    },
  });

  const cycleItems = subscription.items;
  const awaiting = subscription.orderAwaitingPayment;
  const baby = babies.data?.find((b) => b.id === subscription.babyProfile.id);
  const ended = subscription.status === 'CANCELLED' || subscription.status === 'EXPIRED';
  const canChooseItems = awaiting !== null || cycleItems.some((item) => item.status === 'SELECTED');

  return (
    <Card as="section" aria-labelledby={`sub-${subscription.id}`} className="flex flex-col gap-5">
      <CardHeader
        title={
          <span id={`sub-${subscription.id}`}>
            {subscription.plan.name} for {subscription.babyProfile.nickname}
          </span>
        }
        description={<MoneyText value={subscription.price} />}
        level={2}
        action={<StatusBadge status={subscription.status} />}
      />

      {subscription.status === 'PAST_DUE' ? (
        <Alert tone="warning" title="Renewal payment needed">
          Pay within the grace period to keep your plan.
        </Alert>
      ) : null}
      {subscription.cancelAtPeriodEnd && !ended ? (
        <Alert tone="info">
          Ends on {formatDate(subscription.currentPeriodEnd)}. Please return the pieces you still have by
          then.
        </Alert>
      ) : null}
      {subscription.pendingPlan ? (
        <Alert tone="info">Changes to {subscription.pendingPlan.name} at the next renewal.</Alert>
      ) : null}

      <dl className="grid gap-3 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-foreground-muted">Current period</dt>
          <dd className="font-medium">
            {subscription.currentPeriodStart
              ? `${formatDate(subscription.currentPeriodStart)} – ${formatDate(subscription.currentPeriodEnd)}`
              : 'Starts when paid'}
          </dd>
        </div>
        <div>
          <dt className="text-foreground-muted">Next payment</dt>
          <dd className="font-medium">{formatDate(subscription.nextBillingAt)}</dd>
        </div>
        <div>
          <dt className="text-foreground-muted">Pieces per cycle</dt>
          <dd className="font-medium">{subscription.plan.itemsPerCycle}</dd>
        </div>
      </dl>

      {awaiting ? (
        <Alert
          tone="warning"
          title={`Order ${awaiting.orderNumber} is waiting for payment`}
          action={
            <NextLink href={`/dashboard/orders/${awaiting.id}`} className={buttonClasses({ size: 'sm' })}>
              Pay <MoneyText value={awaiting.totals.total} />
            </NextLink>
          }
        >
          {subscription.status === 'PENDING'
            ? 'Your subscription starts when this is paid.'
            : 'This covers your next period.'}
        </Alert>
      ) : null}

      <div className="flex flex-col gap-2">
        <h3 className="font-display text-lg font-bold">This cycle’s pieces</h3>
        {cycleItems.length === 0 ? (
          <p className="text-sm text-foreground-muted">None chosen yet.</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {cycleItems.map((item) => (
              <li key={item.id} className="flex flex-wrap justify-between gap-2">
                <span>
                  {item.product.name} · {item.variant.size.label}
                  {item.garmentTagCode ? (
                    <span className="font-mono text-xs text-foreground-muted">
                      {' '}
                      · tag {item.garmentTagCode}
                    </span>
                  ) : null}
                </span>
                <span className="text-foreground-muted">{humanizeStatus(item.status)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {action.isError ? (
        <Alert tone="danger" live>
          {errorMessage(action.error)}
        </Alert>
      ) : null}

      {!ended ? (
        <div className="flex flex-wrap gap-2">
          {canChooseItems ? (
            <Button variant="secondary" size="sm" onClick={() => setDialog('items')}>
              Choose pieces
            </Button>
          ) : null}
          {subscription.canPause ? (
            <Button
              variant="outline"
              size="sm"
              loading={action.isPending && action.variables === 'pause'}
              onClick={() => action.mutate('pause')}
            >
              Pause
            </Button>
          ) : null}
          {subscription.canResume ? (
            <Button
              variant="outline"
              size="sm"
              loading={action.isPending && action.variables === 'resume'}
              onClick={() => action.mutate('resume')}
            >
              Resume
            </Button>
          ) : null}
          <Button variant="outline" size="sm" onClick={() => setDialog('plan')}>
            Change plan
          </Button>
          {subscription.canCancel && !subscription.cancelAtPeriodEnd ? (
            <Button variant="ghost" size="sm" onClick={() => setDialog('cancel')}>
              Cancel subscription
            </Button>
          ) : null}
        </div>
      ) : null}

      <details className="text-sm">
        <summary className="cursor-pointer font-medium">History</summary>
        <ol className="mt-2 flex flex-col gap-1">
          {subscription.history.map((event, index) => (
            <li key={`${event.occurredAt}-${index}`} className="flex justify-between gap-3">
              <span>{humanizeStatus(event.type)}</span>
              <span className="text-foreground-muted">{formatDate(event.occurredAt, true)}</span>
            </li>
          ))}
        </ol>
      </details>

      <Modal
        open={dialog === 'cancel'}
        onClose={() => setDialog(null)}
        title="Cancel your subscription?"
        description="You keep your plan until the end of the period you have paid for."
        footer={
          <>
            <Button variant="outline" onClick={() => setDialog(null)}>
              Keep my plan
            </Button>
            <Button variant="danger" loading={action.isPending} onClick={() => action.mutate('cancel')}>
              Cancel at period end
            </Button>
          </>
        }
      >
        <p className="text-sm">Pieces you still have should be returned by the end of the period.</p>
      </Modal>

      <Modal
        open={dialog === 'plan'}
        onClose={() => setDialog(null)}
        title="Change plan"
        description="The new plan and price start at your next renewal."
        footer={
          <>
            <Button variant="outline" onClick={() => setDialog(null)}>
              Close
            </Button>
            <Button disabled={!planChoice} loading={action.isPending} onClick={() => action.mutate('plan')}>
              Change plan
            </Button>
          </>
        }
      >
        <SelectField
          label="New plan"
          value={planChoice}
          onChange={(event) => setPlanChoice(event.target.value)}
          placeholder="Choose a plan"
          options={(plans.data ?? [])
            .filter((p) => p.id !== subscription.plan.id)
            .map((p) => ({ value: p.id, label: p.name }))}
        />
      </Modal>

      <Modal
        open={dialog === 'items'}
        onClose={() => setDialog(null)}
        title="Choose this cycle’s pieces"
        size="lg"
      >
        {dialog === 'items' ? (
          <ItemPicker
            subscription={subscription}
            initialSize={baby?.latestRecommendation?.recommendedSize.code ?? baby?.currentSize?.code ?? null}
            onSaved={() => setDialog(null)}
          />
        ) : null}
      </Modal>
    </Card>
  );
}

export default function SubscriptionPage() {
  const subscriptions = useSubscriptions();
  const started = useSearchParams().get('started') === '1';
  return (
    <>
      <PageTitle
        title="Subscription"
        action={
          <NextLink href="/dashboard/subscription/new" className={buttonClasses({ variant: 'outline' })}>
            Start another
          </NextLink>
        }
      />
      {started ? (
        <Alert tone="success" title="Your subscription has started" live>
          We’ll prepare your pieces and let you know when they are on the way.
        </Alert>
      ) : null}
      <QueryState query={subscriptions} what="your subscriptions">
        {(list) =>
          list.length === 0 ? (
            <EmptyState
              title="No subscription yet"
              description="Get pieces in your baby’s size every cycle, and swap them as your baby grows."
              action={
                <NextLink href="/dashboard/subscription/new" className={buttonClasses()}>
                  Start a subscription
                </NextLink>
              }
            />
          ) : (
            <div className="flex flex-col gap-6">
              {list.map((subscription) => (
                <SubscriptionCard key={subscription.id} subscription={subscription} />
              ))}
            </div>
          )
        }
      </QueryState>
    </>
  );
}
