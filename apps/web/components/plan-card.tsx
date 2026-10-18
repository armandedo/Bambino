import type { BillingInterval, PlanSummary } from '@bambino/api-client';
import { MoneyText, buttonClasses, cn } from '@bambino/ui';
import NextLink from 'next/link';
import { PlanTermsList } from './plan-terms';

const PER: Record<BillingInterval, string> = { MONTHLY: 'month', QUARTERLY: '3 months', ANNUAL: 'year' };
const PERIOD: Record<BillingInterval, string> = {
  MONTHLY: 'month',
  QUARTERLY: '3-month period',
  ANNUAL: 'year',
};

/**
 * One plan, as a row of a wide card, like the care label on a garment: name and what is included on the left, price
 * and the action on the right. Name, price, items and exchanges all come from the API; nothing is computed here.
 * Stack them with a gap; the featured one is lifted and outlined in the accent colour.
 */
export function PlanCard({
  plan,
  featured = false,
  level = 3,
}: {
  plan: PlanSummary;
  featured?: boolean;
  level?: 2 | 3;
}) {
  const Heading = `h${level}` as const;
  // One swap is one garment sent back and one other garment sent to you; the allowance restarts at each renewal.
  const swaps =
    plan.exchangesPerCycle === null
      ? 'unlimited swaps'
      : `${plan.exchangesPerCycle} ${plan.exchangesPerCycle === 1 ? 'swap' : 'swaps'} per ${PERIOD[plan.billingInterval]}`;
  return (
    <article
      className={cn(
        'grid gap-5 rounded-[15px] border border-border bg-surface p-6 sm:p-8 md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:gap-12',
        featured && 'border-primary ring-1 ring-primary',
      )}
    >
      <div className="flex flex-col gap-3">
        <Heading className="font-display text-2xl font-semibold tracking-tight text-primary">
          {plan.name}
          {featured ? (
            <span className="ml-3 rounded-full bg-accent px-3 py-1 align-middle text-[0.7rem] font-medium tracking-[0.08em] uppercase text-accent-foreground">
              Most flexible
            </span>
          ) : null}
        </Heading>
        <p className="max-w-[56ch] text-foreground-muted">{plan.description}</p>
        <p className="text-foreground">
          Up to {plan.itemsPerCycle} {plan.itemsPerCycle === 1 ? 'garment' : 'garments'} at a time in your
          baby&rsquo;s size, with {swaps}. A swap is one garment sent back and one other sent to you.
        </p>
        <PlanTermsList plan={plan} />
      </div>
      <div className="flex items-center justify-between gap-6 md:flex-col md:items-end md:gap-3">
        <p className="whitespace-nowrap">
          <MoneyText value={plan.price} className="font-display text-4xl font-semibold tracking-tight" />
          <span className="text-foreground-muted"> / {PER[plan.billingInterval]}</span>
        </p>
        <NextLink
          href={`/dashboard/subscription/new?plan=${encodeURIComponent(plan.code)}`}
          className={buttonClasses({ variant: featured ? 'accent' : 'primary' })}
        >
          Choose this plan
          <span className="sr-only">: {plan.name}</span>
        </NextLink>
      </div>
    </article>
  );
}
