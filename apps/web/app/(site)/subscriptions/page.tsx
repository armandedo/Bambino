import { SubscriptionPlansQuery } from '@bambino/api-client';
import { Alert, EmptyState } from '@bambino/ui';
import type { Metadata } from 'next';
import { ApiErrorState } from '@/components/api-error';
import { PlanCard } from '@/components/plan-card';
import { load } from '@/lib/api';

export const revalidate = 60;
export const metadata: Metadata = { title: 'Subscription plans' };

export default async function SubscriptionsPage() {
  const plans = await load(SubscriptionPlansQuery);
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-12">
      <div className="flex max-w-2xl flex-col gap-3">
        <h1 className="font-display text-4xl font-extrabold">Subscription plans</h1>
        <p className="text-lg text-foreground-muted">
          One plan per baby. Each cycle you choose pieces in your baby&apos;s size; when they outgrow them,
          send them back for the next size.
        </p>
      </div>
      <Alert tone="warning" title="Placeholder prices">
        These are seed prices for development. The real price list and the rules for changing plans are still
        to be decided.
      </Alert>
      {!plans.ok ? (
        <ApiErrorState error={plans.error} what="plans" />
      ) : plans.data.subscriptionPlans.length === 0 ? (
        <EmptyState title="No plans yet" description="Plans appear here once they are published." level={2} />
      ) : (
        <div className="grid gap-6 pt-3 md:grid-cols-3">
          {plans.data.subscriptionPlans.map((plan, index) => (
            <PlanCard key={plan.id} plan={plan} featured={index === 0} level={2} />
          ))}
        </div>
      )}
    </div>
  );
}
