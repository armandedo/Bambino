import { SubscriptionPlansQuery } from '@bambino/api-client';
import { Alert, EmptyState } from '@bambino/ui';
import type { Metadata } from 'next';
import { ApiErrorState } from '@/components/api-error';
import { ExchangeSequence } from '@/components/exchange/exchange-sequence';
import { Stagger, StaggerItem } from '@/components/motion/primitives';
import { PageHero } from '@/components/page-hero';
import { PlanCard } from '@/components/plan-card';
import { SectionHeading } from '@/components/sections';
import { load } from '@/lib/api';

export const revalidate = 60;
export const metadata: Metadata = {
  title: 'Subscription plans',
  description:
    'Monthly, quarterly and annual babywear plans. Pieces in your baby’s size, swapped as they grow.',
};

const FAQ = [
  {
    q: 'Can I change plan later?',
    a: 'Yes. Choose a new plan from your dashboard; it starts at your next renewal.',
  },
  { q: 'Can I pause?', a: 'Yes, from your dashboard. Paused time is added back to your period.' },
  {
    q: 'What happens when my baby outgrows a piece?',
    a: 'Book a return from your dashboard. Pieces that pass inspection earn exchange credit towards the next size.',
  },
  { q: 'How do I pay?', a: 'With mobile money, approved on your phone. This preview uses test wallets.' },
];

export default async function PlansPage() {
  const plans = await load(SubscriptionPlansQuery);
  return (
    <>
      <PageHero
        eyebrow="Subscriptions"
        title="One plan per baby. Sized up as they grow."
        intro="Each cycle you choose pieces in your baby’s size. When they outgrow them, send them back for the next size."
      />
      <section
        aria-labelledby="choose"
        className="mx-auto flex max-w-7xl flex-col gap-8 px-4 py-14 sm:px-6 lg:py-20"
      >
        <h2 id="choose" className="sr-only">
          Choose a plan
        </h2>
        <Alert tone="warning" title="Placeholder prices">
          These are development prices. The real price list and the rules for changing plans are still being
          decided.
        </Alert>
        {!plans.ok ? (
          <ApiErrorState error={plans.error} what="plans" />
        ) : plans.data.subscriptionPlans.length === 0 ? (
          <EmptyState
            title="No plans yet"
            description="Plans appear here once they are published."
            level={2}
          />
        ) : (
          <Stagger className="grid gap-6 pt-3 md:grid-cols-3" gap={0.12}>
            {plans.data.subscriptionPlans.map((plan, index) => (
              <StaggerItem key={plan.id}>
                <PlanCard plan={plan} featured={index === 0} level={3} />
              </StaggerItem>
            ))}
          </Stagger>
        )}
      </section>
      <section aria-labelledby="included" className="bg-surface-muted">
        <div className="mx-auto flex max-w-7xl flex-col gap-10 px-4 py-14 sm:px-6 lg:py-20">
          <SectionHeading
            id="included"
            eyebrow="Included in every plan"
            title="Outgrown pieces become the next size."
          />
          <ExchangeSequence />
        </div>
      </section>
      <section
        aria-labelledby="faq"
        className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-14 sm:px-6 lg:py-20"
      >
        <h2 id="faq" className="font-display text-3xl font-extrabold text-primary">
          Questions
        </h2>
        <div className="flex flex-col divide-y divide-border rounded-2xl border border-border bg-surface">
          {FAQ.map((item) => (
            <details key={item.q} className="group px-5 py-4">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 font-semibold text-primary">
                {item.q}
                <span
                  aria-hidden="true"
                  className="text-xl transition-transform duration-300 ease-brand group-open:rotate-45"
                >
                  +
                </span>
              </summary>
              <p className="pt-2 text-foreground-muted">{item.a}</p>
            </details>
          ))}
        </div>
      </section>
    </>
  );
}
