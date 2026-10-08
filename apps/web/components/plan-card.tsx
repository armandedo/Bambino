import type { BillingInterval, PlanSummary } from '@bambino/api-client';
import { MoneyText, buttonClasses, cn } from '@bambino/ui';
import NextLink from 'next/link';

const PER: Record<BillingInterval, string> = { MONTHLY: 'month', QUARTERLY: '3 months', ANNUAL: 'year' };

/**
 * One plan, as a row of a ledger like the care label on a garment: name and what is included on the left, price
 * and the action on the right. Name, price, items and exchanges all come from the API; nothing is computed here.
 * Put rows in a list with `divide-y`; the featured one carries a mark hanging in the left margin.
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
  const exchanges =
    plan.exchangesPerCycle === null
      ? 'unlimited size exchanges'
      : `${plan.exchangesPerCycle} size ${plan.exchangesPerCycle === 1 ? 'exchange' : 'exchanges'} per cycle`;
  return (
    <article
      className={cn(
        'relative grid gap-5 py-8 md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:gap-12',
        featured && 'before:absolute before:inset-y-0 before:-left-4 before:w-1.5 before:rounded-full before:bg-accent',
      )}
    >
      <div className="flex flex-col gap-3">
        <Heading className="font-display text-2xl font-bold tracking-tight text-primary">
          {plan.name}
          {featured ? (
            <span className="ml-3 rounded-md bg-accent px-2 py-0.5 align-middle text-sm font-semibold text-accent-foreground">
              Most flexible
            </span>
          ) : null}
        </Heading>
        <p className="max-w-[56ch] text-foreground-muted">{plan.description}</p>
        <p className="text-foreground">
          {plan.itemsPerCycle} {plan.itemsPerCycle === 1 ? 'piece' : 'pieces'} each cycle in your baby&rsquo;s
          size, {exchanges}. Pause or cancel from your account.
        </p>
      </div>
      <div className="flex items-center justify-between gap-6 md:flex-col md:items-end md:gap-3">
        <p className="whitespace-nowrap">
          <MoneyText value={plan.price} className="font-display text-4xl font-bold tracking-tight" />
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
